# Subjective Listening Tool

A web application for comparing multiple audio files of the same recording in different conditions or quality levels. Users can play synchronized audio tracks, view waveforms, and navigate through labeled segments to perform subjective listening tests.

> **📘 All setup and deployment instructions are in [DEPLOYMENT.md](DEPLOYMENT.md)**

## What It Does

- **Compare Audio:** Play and switch between different versions of the same audio recording
- **Visualize:** Display audio waveforms and labeled regions using WaveSurfer.js
- **Navigate:** Jump between labeled segments for focused listening comparisons
- **Manage Projects:** Admin interface to create listening test projects and upload audio files
- **Secure Access:** Simple key-based access control for sharing listening tests

## Architecture

**Backend:** Node.js/Express server that:
- Serves the web interface
- Manages audio uploads and project metadata
- Generates secure access URLs (SAS tokens) for Azure Blob Storage
- Stores project info in Azure Table Storage

**Frontend:** Vanilla JavaScript application that:
- Loads audio files from Azure Blob Storage
- Renders waveforms with WaveSurfer.js
- Allows users to compare and switch between audio versions

**Storage:**
- **Blob Storage:** Stores audio files (MP3, WAV, FLAC, etc.) organized by project
- **Table Storage:** Maps public access keys to projects (simple access control)

## Project Structure

```
├── server.js               # Express server (API endpoints, Azure integration)
├── package.json            # Dependencies and npm scripts
├── public/
│   ├── index.html          # Main listening interface
│   ├── create_project.html # Admin interface for project creation
│   ├── app.js              # Client-side application logic
│   └── css/style.css       # Styles
├── azure-pipeline.yaml     # Azure DevOps CI/CD pipeline
├── .env.example            # Environment variables template
└── DEPLOYMENT.md           # Complete deployment guide
```

## Technology Stack

- **Node.js v20.x** - Server runtime
- **Express** - Web framework
- **WaveSurfer.js** - Audio waveform visualization
- **Azure Blob Storage** - Audio file storage (MP3, WAV, FLAC, OGG, AAC, M4A)
- **Azure Table Storage** - Project metadata
- **Azure App Service** - Hosting platform

## Getting Started

**For complete setup instructions including:**
- Azure resources setup (Storage, Web App, etc.)
- Local development environment
- Deployment to Azure
- Verification and testing

**See [DEPLOYMENT.md](DEPLOYMENT.md)** (~60 min setup time)

## Usage

**End Users:** Visit deployed URL → Enter public key → Select project → Compare audio files

**Admins:** Navigate to `/create_project.html` → Create projects and upload audio files

Detailed usage instructions are in [DEPLOYMENT.md](DEPLOYMENT.md#verification--testing).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Storage connection string |
| `WEB_PAGE_PASSWORD` | Admin password for project creation |
| `PORT` | Server port (default: 3000) |

Configuration details in [DEPLOYMENT.md](DEPLOYMENT.md#step-8-configure-environment-variables).

## License

ISC

