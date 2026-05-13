# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # Install dependencies
npm start          # Start server (node server.js)
npm run dev        # Start with auto-reload (nodemon)
```

No test framework is configured. Verify manually at `http://localhost:3000` and `http://localhost:3000/health`.

## Local Development Setup

Copy `.env.example` to `.env` and populate:
```
AZURE_STORAGE_CONNECTION_STRING=your_connection_string_here
WEB_PAGE_PASSWORD=your_admin_password_here
PORT=3000
```

The server will refuse to start without both `AZURE_STORAGE_CONNECTION_STRING` and `WEB_PAGE_PASSWORD` set.

## Architecture

### Backend (`server.js`)

Express server with two Azure integrations:
- **Azure Blob Storage** (`@azure/storage-blob`): Stores audio files per project in containers. Generates time-limited SAS URLs (1-hour expiry) for client-side audio access.
- **Azure Table Storage** (`@azure/data-tables`): Uses a single `datasets` table to map `PublicKey → ProjectName → Email` for access control.

Key API surface:
- `POST /api/check-publicKey` — listener authentication (validates PublicKey against table)
- `POST /api/check-admin` — admin authentication (validates against `WEB_PAGE_PASSWORD`)
- `GET /api/all-projects` — admin-only; lists all project names
- `GET /api/tracks/:projectName` — returns SAS URLs for all audio files in a container
- `GET /api/labels/:projectName` — returns content of `labels.txt` from container (optional, returns empty string if not present)
- `POST /api/create-container` — creates Blob container + Table Storage entry
- `POST /api/upload-audio/:projectName` — uploads audio files to a container
- `POST /api/upload-labels/:projectName` — uploads `labels.txt` to a container
- `DELETE /api/delete-container/:projectName` — deletes container + Table entry (requires matching PublicKey)
- `GET /api/project/:projectName`, `PUT /api/project/:projectName` — admin project management
- `DELETE /api/file/:projectName/:fileName` — deletes a single file from a container

### Frontend (`public/`)

Vanilla JavaScript, no build step. Modules loaded via CDN/`node_modules` script tags.

**`public/app.js`** — Main listening interface logic:
- Authentication flow: Two modes (Admin via `WEB_PAGE_PASSWORD`, Listener via PublicKey). Admin state persisted in `sessionStorage.isAdmin`.
- Audio preloading: All tracks fetched and decoded into `audioCache` (AudioBuffer objects) and `blobCache` (Blob URLs) for instant track switching without re-downloading.
- Waveform visualization: Uses **Peaks.js** (not WaveSurfer.js) with `zoomview-container` and `overview-container` DOM elements. Peaks requires a decoded `AudioBuffer` for initialization.
- Spectrum analyzer: Canvas-based FFT visualization with logarithmic frequency scale (20 Hz–20 kHz), driven by the Web Audio API `AnalyserNode`.
- Track switching: Changing tracks updates `audioElement.src` to a cached Blob URL and calls `peaksInstance.setSource()` with the cached `AudioBuffer` — no network request needed after initial preload.

**`public/create_project.js`** — Admin project management:
- Requires admin session (`sessionStorage.isAdmin === 'true'`) to load; redirects to `index.html` otherwise.
- Client-side validation before upload: all audio files must be **mono (1 channel)** and have the **same duration** (within 0.1s tolerance).

### Audio File Requirements

- Formats supported: MP3, WAV, OGG, FLAC, AAC, M4A
- Files must be **mono** (1 channel) — enforced on upload
- All files in a project must have the **same duration** (±0.1s) — enforced on upload
- Labels file format: Audacity-compatible tab-separated (`startTime\tendTime\tlabel` per line)

### Azure Storage Schema

**Blob Storage:** One container per project, named by `projectName`. Audio files and optional `labels.txt` stored flat.

**Table Storage (`datasets` table):**
| Field | Description |
|-------|-------------|
| PartitionKey / RowKey | Auto-incremented integer (sequential count) |
| ProjectName | Blob container name |
| PublicKey | Access key shared with listeners |
| Email | Project owner email |

## Deployment

See `DEPLOYMENT.md` for full Azure setup. CI/CD via Azure DevOps Deployment Center (configured through the portal, not a YAML pipeline file in this repo).

Set environment variables via Azure Portal → App Service → Settings → Environment variables (Azure CLI has a known bug with long connection strings).
