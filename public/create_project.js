async function createContainer() {
  const button = document.getElementById("createContainerButton");
  const projectName = document.getElementById("projectName").value;
  const publicKey = document.getElementById("publicKey").value;
  const email = document.getElementById("email").value;

  if (!projectName || !publicKey || !email) {
    alert("Please enter a project name, public key, and email.");
    return;
  }

  const response = await fetch("/api/create-container", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectName, publicKey, email }),
  });

  const message = await response.text();
  alert(message);

  if (message.indexOf("Error") === -1) {
    button.style.backgroundColor = "green";
  }
}

async function uploadAudioFiles() {
  const button = document.getElementById("uploadAudioButton");
  const projectName = document.getElementById("projectName").value;
  const files = document.getElementById("audioFiles").files;

  if (!projectName || files.length === 0) {
    alert("Please enter a project name and select audio files.");
    return;
  }

  // Validate audio files before uploading
  try {
    button.disabled = true;
    button.textContent = "Validating audio files...";
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const validationResults = [];
    
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      validationResults.push({
        name: file.name,
        channels: audioBuffer.numberOfChannels,
        duration: audioBuffer.duration
      });
    }
    
    // Check if all files are mono
    const nonMonoFiles = validationResults.filter(f => f.channels !== 1);
    if (nonMonoFiles.length > 0) {
      const fileList = nonMonoFiles.map(f => `${f.name} (${f.channels} channels)`).join('\n');
      alert(`❌ Error: All audio files must be mono (1 channel).\n\nThe following files are not mono:\n${fileList}`);
      button.disabled = false;
      button.textContent = "Upload Audio Files";
      return;
    }
    
    // Check if all files have the same duration (allow 0.1 second tolerance)
    const durations = validationResults.map(f => f.duration);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    if (maxDuration - minDuration > 0.1) {
      const durationList = validationResults.map(f => `${f.name}: ${f.duration.toFixed(2)}s`).join('\n');
      alert(`❌ Error: All audio files must have the same length.\n\nFile durations:\n${durationList}\n\nDifference: ${(maxDuration - minDuration).toFixed(2)} seconds`);
      button.disabled = false;
      button.textContent = "Upload Audio Files";
      return;
    }
    
    // All validations passed
    button.textContent = "Uploading...";
    
  } catch (error) {
    alert(`❌ Error validating audio files: ${error.message}`);
    button.disabled = false;
    button.textContent = "Upload Audio Files";
    return;
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("audioFiles", file);
  }

  const response = await fetch(`/api/upload-audio/${projectName}`, {
    method: "POST",
    body: formData,
  });

  const message = await response.text();
  alert(message);

  if (message.indexOf("Error") === -1) {
    button.style.backgroundColor = "green";
  }
  
  button.disabled = false;
  button.textContent = "Upload Audio Files";
}

async function uploadLabelsFile() {
  const button = document.getElementById("uploadLabelsButton");
  const projectName = document.getElementById("projectName").value;
  const file = document.getElementById("labelsFile").files[0];

  if (!projectName || !file) {
    alert("Please enter a project name and select a labels.txt file.");
    return;
  }

  const formData = new FormData();
  formData.append("labelsFile", file);

  const response = await fetch(`/api/upload-labels/${projectName}`, {
    method: "POST",
    body: formData,
  });

  const message = await response.text();
  alert(message);

  if (message.indexOf("Error") === -1) {
    button.style.backgroundColor = "green";
  }
}

async function deleteContainer() {
  const deleteContainerName = document.getElementById(
    "deleteContainerName"
  ).value;

  if (!deleteContainerName) {
    alert("Please enter a container name to delete.");
    return;
  }

  // Ask for the public key of this container
  const publicKey = prompt("Please enter the public key of this container");
  if (!publicKey) {
    alert("Please enter the public key of this container.");
    return;
  }

  const response = await fetch(
    `/api/delete-container/${deleteContainerName}?publicKey=${encodeURIComponent(
      publicKey
    )}`,
    {
      method: "DELETE",
    }
  );

  const message = await response.text();
  alert(message);
}

// Load project details for editing
async function loadProjectDetails() {
  const projectName = document.getElementById("editProjectName").value;

  if (!projectName) {
    alert("Please select a project.");
    return;
  }

  try {
    const response = await fetch(`/api/project/${projectName}`);
    
    if (!response.ok) {
      alert("Project not found.");
      return;
    }

    const projectData = await response.json();

    // Show edit section
    document.getElementById("editProjectDetails").style.display = "block";

    // Populate current values
    document.getElementById("editNewPublicKey").placeholder = `Current: ${projectData.publicKey}`;
    document.getElementById("editNewEmail").placeholder = `Current: ${projectData.email}`;

    // Display files
    const fileList = document.getElementById("fileList");
    fileList.innerHTML = "";

    if (projectData.files.length === 0) {
      document.getElementById("noFilesMessage").style.display = "block";
    } else {
      document.getElementById("noFilesMessage").style.display = "none";
      projectData.files.forEach(file => {
        const fileItem = document.createElement("div");
        fileItem.className = "list-group-item d-flex justify-content-between align-items-center";
        
        // Securely create content
        const contentSpan = document.createElement("span");
        const icon = document.createElement("i");
        icon.className = "fas fa-file";
        contentSpan.appendChild(icon);
        contentSpan.appendChild(document.createTextNode(` ${file.name} (${formatFileSize(file.size)})`));
        
        // Securely create button with event listener
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-danger btn-sm";
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
        deleteBtn.addEventListener("click", () => deleteFile(projectName, file.name));

        fileItem.appendChild(contentSpan);
        fileItem.appendChild(deleteBtn);
        fileList.appendChild(fileItem);
      });
    }
  } catch (error) {
    console.error(error);
    alert("Error loading project details.");
  }
}

// Update project metadata
async function updateProject() {
  const projectName = document.getElementById("editProjectName").value;
  const newPublicKey = document.getElementById("editNewPublicKey").value;
  const newEmail = document.getElementById("editNewEmail").value;

  if (!newPublicKey && !newEmail) {
    alert("Please enter at least one value to update.");
    return;
  }

  try {
    const response = await fetch(`/api/project/${projectName}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newPublicKey: newPublicKey || undefined,
        newEmail: newEmail || undefined
      })
    });

    const message = await response.text();
    alert(message);

    if (response.ok) {
      // Clear the input fields
      document.getElementById("editNewPublicKey").value = "";
      document.getElementById("editNewEmail").value = "";
      // Reload project details
      loadProjectDetails();
    }
  } catch (error) {
    console.error(error);
    alert("Error updating project.");
  }
}

// Delete individual file
async function deleteFile(projectName, fileName) {
  if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
    return;
  }

  try {
    const response = await fetch(
      `/api/file/${projectName}/${encodeURIComponent(fileName)}`,
      { method: "DELETE" }
    );

    const message = await response.text();
    alert(message);

    if (response.ok) {
      // Reload project details to refresh file list
      loadProjectDetails();
    }
  } catch (error) {
    console.error(error);
    alert("Error deleting file.");
  }
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Check admin authentication on page load
function checkAdminAuth() {
  if (sessionStorage.getItem('isAdmin') !== 'true') {
    alert('Admin authentication required. Redirecting to home page...');
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// Load all projects into dropdown on page load
async function loadProjectsDropdown() {
  console.log('loadProjectsDropdown called');
  console.log('isAdmin:', sessionStorage.getItem('isAdmin'));
  
  if (!checkAdminAuth()) {
    console.log('Not authenticated, stopping');
    return;
  }
  
  console.log('Fetching projects...');
  
  try {
    const response = await fetch('/api/all-projects');
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      console.error('Failed to load projects:', response.status);
      alert('Failed to load projects. Status: ' + response.status);
      return;
    }
    
    const data = await response.json();
    console.log('Projects data:', data);
    
    const select = document.getElementById('editProjectName');
    if (!select) {
      console.error('editProjectName select element not found');
      alert('Error: Could not find project dropdown element');
      return;
    }
    
    console.log('Select element found:', select);
    
    // Clear existing options except the first one
    select.innerHTML = '<option value="">-- Select a project --</option>';
    
    // Add all projects
    if (data.containerNames && data.containerNames.length > 0) {
      data.containerNames.forEach(projectName => {
        const option = document.createElement('option');
        option.value = projectName;
        option.textContent = projectName;
        select.appendChild(option);
      });
      
      console.log(`Loaded ${data.containerNames.length} projects into dropdown`);
    } else {
      console.log('No projects found');
      select.innerHTML = '<option value="">-- No projects found --</option>';
    }
  } catch (error) {
    console.error('Error loading projects:', error);
    alert('Error loading projects: ' + error.message);
  }
}

// Upload audio files in edit mode
async function uploadEditAudioFiles(event) {
  const projectName = document.getElementById("editProjectName").value;
  const files = document.getElementById("editAudioFiles").files;

  if (!projectName) {
    alert("Please select a project first.");
    return;
  }

  if (files.length === 0) {
    alert("Please select audio files to upload.");
    return;
  }

  const button = event.target;

  // Validate audio files before uploading
  try {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validating audio files...';
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const validationResults = [];
    
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      validationResults.push({
        name: file.name,
        channels: audioBuffer.numberOfChannels,
        duration: audioBuffer.duration
      });
    }
    
    // Check if all files are mono
    const nonMonoFiles = validationResults.filter(f => f.channels !== 1);
    if (nonMonoFiles.length > 0) {
      const fileList = nonMonoFiles.map(f => `${f.name} (${f.channels} channels)`).join('\n');
      alert(`❌ Error: All audio files must be mono (1 channel).\n\nThe following files are not mono:\n${fileList}`);
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-upload"></i> Upload Audio Files';
      return;
    }
    
    // Check if all files have the same duration (allow 0.1 second tolerance)
    const durations = validationResults.map(f => f.duration);
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    
    if (maxDuration - minDuration > 0.1) {
      const durationList = validationResults.map(f => `${f.name}: ${f.duration.toFixed(2)}s`).join('\n');
      alert(`❌ Error: All audio files must have the same length.\n\nFile durations:\n${durationList}\n\nDifference: ${(maxDuration - minDuration).toFixed(2)} seconds`);
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-upload"></i> Upload Audio Files';
      return;
    }
    
    // All validations passed
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    
  } catch (error) {
    alert(`❌ Error validating audio files: ${error.message}`);
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-upload"></i> Upload Audio Files';
    return;
  }

  const formData = new FormData();
  for (const file of files) {
    formData.append("audioFiles", file);
  }

  try {
    const response = await fetch(`/api/upload-audio/${projectName}`, {
      method: "POST",
      body: formData,
    });

    const message = await response.text();
    alert(message);

    if (response.ok) {
      document.getElementById("editAudioFiles").value = "";
      loadProjectDetails(); // Refresh file list
    }
  } catch (error) {
    alert("Error uploading audio files.");
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-upload"></i> Upload Audio Files';
  }
}

// Upload labels file in edit mode
async function uploadEditLabelsFile() {
  const projectName = document.getElementById("editProjectName").value;
  const file = document.getElementById("editLabelsFile").files[0];

  if (!projectName) {
    alert("Please select a project first.");
    return;
  }

  if (!file) {
    alert("Please select a labels.txt file to upload.");
    return;
  }

  const button = event.target;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

  const formData = new FormData();
  formData.append("labelsFile", file);

  try {
    const response = await fetch(`/api/upload-labels/${projectName}`, {
      method: "POST",
      body: formData,
    });

    const message = await response.text();
    alert(message);

    if (response.ok) {
      document.getElementById("editLabelsFile").value = "";
      loadProjectDetails(); // Refresh file list
    }
  } catch (error) {
    alert("Error uploading labels file.");
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-upload"></i> Upload labels.txt';
  }
}

// Load projects dropdown when page loads
document.addEventListener('DOMContentLoaded', loadProjectsDropdown);
