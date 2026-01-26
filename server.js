const express = require("express");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const morgan = require("morgan");
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob");
const ffmpeg = require("fluent-ffmpeg");
const { TableServiceClient, TableClient } = require("@azure/data-tables");

require("dotenv").config();

// Environment variables from Azure Web App configuration
const port = process.env.PORT || 3000;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const webpagepwd = process.env.WEB_PAGE_PASSWORD;

if (!connectionString || !webpagepwd) {
  console.error(
    "Environment variables AZURE_STORAGE_CONNECTION_STRING and WEB_PAGE_PASSWORD must be set."
  );
  process.exit(1);
}

const tableClient = TableClient.fromConnectionString(
  connectionString,
  "datasets"
);

const blobServiceClient =
  BlobServiceClient.fromConnectionString(connectionString);

// Initialize Express app
const app = express();
app.use(express.static("public"));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
app.use(morgan("combined"));
app.use(bodyParser.json());

// Optional: Handle root "/" explicitly
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Endpoint to check password and return associated container names
app.post("/api/check-publicKey", async (req, res) => {
  const publicKey = req.body.publicKey;

  // Query the table for entries with the matching publicKey
  const filter = `PublicKey eq '${publicKey}'`;
  const entities = tableClient.listEntities({ queryOptions: { filter } });

  const containerNames = [];
  for await (const entity of entities) {
    containerNames.push(entity.ProjectName);
  }

  // Check if we found any matching entries
  if (containerNames.length > 0) {
    res.json({ containerNames });
  } else {
    res
      .status(404)
      .json({ message: "No containers associated to this public key." });
  }
});

// Endpoint to check admin password
app.post("/api/check-admin", async (req, res) => {
  const password = req.body.password;
  
  if (password === webpagepwd) {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ message: "Invalid admin password" });
  }
});

// Endpoint to get all projects (admin only)
app.get("/api/all-projects", async (req, res) => {
  try {
    const entities = tableClient.listEntities();
    const containerNames = [];
    
    for await (const entity of entities) {
      if (entity.ProjectName && !containerNames.includes(entity.ProjectName)) {
        containerNames.push(entity.ProjectName);
      }
    }
    
    res.json({ containerNames });
  } catch (error) {
    console.error("Error fetching all projects:", error);
    res.status(500).json({ message: "Error fetching projects" });
  }
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/api/tracks/:projectName", async (req, res) => {
  try {
    const projectName = req.params.projectName;
    const containerClient = blobServiceClient.getContainerClient(projectName);
    const blobs = containerClient.listBlobsFlat();

    const blobUrls = [];
    // Support multiple audio formats: MP3, WAV, OGG, FLAC, AAC, M4A
    const audioExtensions = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];
    
    for await (const blob of blobs) {
      const hasAudioExtension = audioExtensions.some(ext => 
        blob.name.toLowerCase().endsWith(ext)
      );
      
      if (hasAudioExtension) {
        const blobClient = containerClient.getBlobClient(blob.name);
        const blobUrl = await blobClient.generateSasUrl({
          permissions: "r",
          expiresOn: new Date(new Date().valueOf() + 3600 * 1000),
        });
        blobUrls.push(blobUrl);
      }
    }
    res.json(blobUrls);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving tracks.");
  }
});

app.get("/api/labels/:projectName", async (req, res) => {
  try {
    const projectName = req.params.projectName;
    const containerClient = blobServiceClient.getContainerClient(projectName);
    console.log("Container client: ", containerClient);
    const blobClient = containerClient.getBlobClient("labels.txt");
    console.log("Blob client: ", blobClient);

    // Check if labels.txt exists
    const exists = await blobClient.exists();
    if (!exists) {
      console.log("No labels.txt found - this is optional, returning empty response");
      return res.send(""); // Return empty string if no labels file
    }

    const downloadResponse = await blobClient.download();
    const labels = await streamToString(downloadResponse.readableStreamBody);
    console.log("Labels: ", labels);

    res.send(labels);
  } catch (error) {
    console.error("Error retrieving labels:", error);
    // Return empty response instead of error - labels are optional
    res.send("");
  }
});

async function streamToString(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on("data", (data) => {
      chunks.push(data.toString());
    });
    readableStream.on("end", () => {
      resolve(chunks.join(""));
    });
    readableStream.on("error", reject);
  });
}

// app.get("/api/get-container-names", async (req, res) => {
//   try {
//     const containers = blobServiceClient.listContainers();
//     const containerNames = [];
//     for await (const container of containers) {
//       containerNames.push(container.name);
//     }
//     res.json(containerNames);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Error retrieving container names.");
//   }
// });

// Function to get the number of entities in the table
async function getEntityCount() {
  let count = 0;
  for await (const entity of tableClient.listEntities()) {
    count++;
  }
  return count;
}

// Create container
app.post("/api/create-container", async (req, res) => {
  try {
    const { projectName, publicKey, email } = req.body;
    const containerClient = blobServiceClient.getContainerClient(projectName);
    await containerClient.create();

    // Get the number of existing entities in the table
    const entityCount = await getEntityCount();
    const partitionKey = (entityCount + 1).toString();
    const rowKey = partitionKey;

    // Insert publicKey and email into the datasets table
    await tableClient.createEntity({
      partitionKey: partitionKey,
      rowKey: rowKey,
      ProjectName: projectName,
      PublicKey: publicKey,
      Email: email,
    });

    res.status(201).send(`Container "${projectName}" created successfully.`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error creating container: " + error.message);
  }
});

// Setup multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Upload audio files (overwrite if exist)
app.post(
  "/api/upload-audio/:projectName",
  upload.array("audioFiles"),
  async (req, res) => {
    try {
      const projectName = req.params.projectName;
      const containerClient = blobServiceClient.getContainerClient(projectName);
      for (const file of req.files) {
        const blockBlobClient = containerClient.getBlockBlobClient(
          file.originalname
        );
        await blockBlobClient.uploadData(file.buffer, { overwrite: true });
      }
      res.status(201).send("Audio files uploaded successfully.");
    } catch (error) {
      console.error(error);
      res.status(500).send("Error uploading audio files.");
    }
  }
);

// Note: Audio files are stored in their original format without conversion.
// Supported formats: MP3, WAV, OGG, FLAC, AAC, M4A
// All modern browsers support MP3 and WAV playback natively.

// Upload audio files (overwrite if exist)
// app.get("/api/tracks/:projectName", async (req, res) => {
//   try {
//     const projectName = req.params.projectName;
//     const containerClient = blobServiceClient.getContainerClient(projectName);
//     console.log("Container client: ", containerClient);

//     // Ensure the container exists
//     const containerExists = await containerClient.exists();
//     if (!containerExists) {
//       return res.status(404).send(`Container "${projectName}" not found.`);
//     }

//     const blobs = containerClient.listBlobsFlat();
//     const blobUrls = [];

//     for await (const blob of blobs) {
//       if (blob.name.endsWith(".mp3")) {
//         // const blobUrl = `https://${blobServiceClient.accountName}.blob.core.windows.net/${projectName}/${blob.name}`;
//         const blobUrl = `https://${
//           blobServiceClient.accountName
//         }.blob.core.windows.net/${encodeURIComponent(
//           projectName
//         )}/${encodeURIComponent(blob.name)}`;

//         blobUrls.push(blobUrl);
//       }
//     }

//     console.log("Blob URLs: ", blobUrls);

//     if (blobUrls.length === 0) {
//       return res.status(404).send("No audio files found.");
//     }

//     res.json(blobUrls);
//   } catch (error) {
//     console.error("Error retrieving tracks:", error);
//     res.status(500).send("Error retrieving tracks.");
//   }
// });

// Upload labels.txt (overwrite if exist)
app.post(
  "/api/upload-labels/:projectName",
  upload.single("labelsFile"),
  async (req, res) => {
    try {
      const projectName = req.params.projectName;
      const containerClient = blobServiceClient.getContainerClient(projectName);
      const blockBlobClient = containerClient.getBlockBlobClient("labels.txt");
      await blockBlobClient.uploadData(req.file.buffer, { overwrite: true });
      res.status(201).send("labels.txt uploaded successfully.");
    } catch (error) {
      console.error(error);
      res.status(500).send("Error uploading labels.txt.");
    }
  }
);

// Delete container
app.delete("/api/delete-container/:projectName", async (req, res) => {
  try {
    const projectName = req.params.projectName;
    const publicKey = req.query.publicKey; // Changed from req.body.publicKey to req.query.publicKey

    // Check if the publicKey is associated with the container
    const filter = `PublicKey eq '${publicKey}' and ProjectName eq '${projectName}'`;
    const entities = tableClient.listEntities({ queryOptions: { filter } });
    let found = false;
    let entityToDelete = null;

    for await (const entity of entities) {
      found = true;
      entityToDelete = entity;
    }

    if (!found) {
      res.status(403).send("Unauthorized to delete this container.");
      return;
    } else {
      const containerClient = blobServiceClient.getContainerClient(projectName);
      await containerClient.delete();

      // Delete the entity from Table Storage
      await tableClient.deleteEntity(
        entityToDelete.partitionKey,
        entityToDelete.rowKey
      );

      res.status(200).send(`Container "${projectName}" deleted successfully.`);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting container.");
  }
});

// Get project metadata and files
app.get("/api/project/:projectName", async (req, res) => {
  try {
    const projectName = req.params.projectName;
    
    // Get project metadata from table
    const filter = `ProjectName eq '${projectName}'`;
    const entities = tableClient.listEntities({ queryOptions: { filter } });
    let projectData = null;

    for await (const entity of entities) {
      projectData = {
        projectName: entity.ProjectName,
        publicKey: entity.PublicKey,
        email: entity.Email,
        partitionKey: entity.partitionKey,
        rowKey: entity.rowKey
      };
      break;
    }

    if (!projectData) {
      return res.status(404).send("Project not found.");
    }

    // List files in container
    const containerClient = blobServiceClient.getContainerClient(projectName);
    const files = [];
    
    for await (const blob of containerClient.listBlobsFlat()) {
      files.push({
        name: blob.name,
        size: blob.properties.contentLength,
        lastModified: blob.properties.lastModified
      });
    }

    res.status(200).json({
      ...projectData,
      files
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error retrieving project data.");
  }
});

// Update project metadata (PublicKey and Email)
app.put("/api/project/:projectName", async (req, res) => {
  try {
    const projectName = req.params.projectName;
    const { newPublicKey, newEmail } = req.body;

    // Find the project entity
    const filter = `ProjectName eq '${projectName}'`;
    const entities = tableClient.listEntities({ queryOptions: { filter } });
    let existingEntity = null;

    for await (const entity of entities) {
      existingEntity = entity;
      break;
    }

    if (!existingEntity) {
      return res.status(404).send("Project not found.");
    }

    // Update the entity
    const updatedEntity = {
      partitionKey: existingEntity.partitionKey,
      rowKey: existingEntity.rowKey,
      ProjectName: projectName,
      PublicKey: newPublicKey || existingEntity.PublicKey,
      Email: newEmail || existingEntity.Email
    };

    await tableClient.updateEntity(updatedEntity, "Replace");
    res.status(200).send("Project updated successfully.");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error updating project.");
  }
});

// Delete individual file from project
app.delete("/api/file/:projectName/:fileName", async (req, res) => {
  try {
    const { projectName, fileName } = req.params;

    // Delete the file
    const containerClient = blobServiceClient.getContainerClient(projectName);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    await blockBlobClient.delete();

    res.status(200).send(`File "${fileName}" deleted successfully.`);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting file.");
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
