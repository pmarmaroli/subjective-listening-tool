# Disaster-Recovery & Handover — subjective-listening-tool

This document is for the **client or any new operator**. It explains how to take ownership of the running platform, or rebuild it from scratch in a brand-new Azure subscription, **without data loss**, in roughly **2–3 days of work**.

It assumes you have:
- This Git repository (full history)
- Read access (at least temporarily) to the **current Azure subscription** so you can copy data out
- A new Azure subscription where you will recreate everything

If the current subscription is no longer accessible, skip Section 3 and rebuild empty. No code changes are required.

---

## Table of Contents

1. [What you are rebuilding](#1-what-you-are-rebuilding)
2. [One-time tools to install on your laptop](#2-one-time-tools-to-install-on-your-laptop)
3. [Snapshot the current platform (do this FIRST)](#3-snapshot-the-current-platform-do-this-first)
4. [Rebuild in a new Azure subscription](#4-rebuild-in-a-new-azure-subscription)
5. [Verify nothing was lost](#5-verify-nothing-was-lost)
6. [Ongoing operations](#6-ongoing-operations)
7. [Rollback](#7-rollback)

---

## 1. What you are rebuilding

### Application overview

A Node.js/Express web application for subjective audio listening tests. Listeners enter a public key, load audio tracks, and compare different audio versions side-by-side using waveform visualisation. Admins create projects and upload audio files through a separate admin interface.

**Runtime:** Node.js v20 (LTS)  
**Framework:** Express 4  
**Hosting:** Azure App Service (Linux)

### Azure resource inventory

| Resource | Type | Purpose |
|---|---|---|
| Azure App Service | Web App (Linux) | Runs `server.js` continuously; serves the UI and all `/api/*` endpoints |
| Azure App Service Plan | Linux plan (B1 or similar) | Compute for the Web App |
| Azure Storage Account | StorageV2 | Hosts Blob Storage (audio files) and Table Storage (project metadata) |
| Azure Blob Storage | Blob containers | One container per project; holds audio files + optional `labels.txt` |
| Azure Table Storage | Table `datasets` | Maps `PublicKey → ProjectName → Email` for access control |

### Finding the actual resource names

If you have access to the current subscription, run:

```powershell
# List all resource groups to find the project's group
az group list --output table

# Once you know the resource group name, list everything in it
az resource list --resource-group YOUR_RESOURCE_GROUP --output table
```

The Web App name and Storage Account name will appear in that output. Note them — you will need them in Section 3.

### What holds user data

There is **no SQL database**. All durable state is in Azure Storage:

- **Blob containers** — one per project, named after the project (e.g. `my-audio-project`). Contains MP3/WAV/FLAC/OGG/AAC/M4A audio files and an optional `labels.txt`.
- **Table `datasets`** — rows with `PartitionKey`, `RowKey`, `ProjectName`, `PublicKey`, `Email`. One row per project.

---

## 2. One-time tools to install on your laptop

| Tool | Download | Notes |
|---|---|---|
| Node.js v20 LTS | https://nodejs.org | Needed to run the app locally |
| Azure CLI | https://learn.microsoft.com/en-us/cli/azure/install-azure-cli | All cloud commands below use `az` |
| Git | https://git-scm.com | Already installed if you cloned this repo |

After installing the Azure CLI:

```powershell
az login
```

A browser window opens — sign in with the Azure account that owns the subscription.

---

## 3. Snapshot the current platform (do this FIRST)

Do this while you still have access to the current subscription. It produces a complete local copy of all project data.

### 3a. Set variables pointing at the current resources

Open a PowerShell window and set these variables to the real values found in Section 1:

```powershell
$CURRENT_RG       = "REPLACE_WITH_CURRENT_RESOURCE_GROUP"
$CURRENT_STORAGE  = "REPLACE_WITH_CURRENT_STORAGE_ACCOUNT_NAME"
$CURRENT_WEBAPP   = "REPLACE_WITH_CURRENT_WEB_APP_NAME"
```

Point the CLI at the current subscription:

```powershell
az account set --subscription (az webapp show --name $CURRENT_WEBAPP --resource-group $CURRENT_RG --query "id" --output tsv).Split("/")[2]
```

Or simply list subscriptions and set by ID:

```powershell
az account list --output table
az account set --subscription "SUBSCRIPTION_ID_HERE"
```

### 3b. Download all blob containers to a dated local folder

```powershell
# Create a timestamped backup folder
$DATE    = Get-Date -Format "yyyy-MM-dd"
$BACKUP  = "backups\$DATE"
New-Item -ItemType Directory -Path $BACKUP -Force

# Get the storage account key
$STORAGE_KEY = az storage account keys list `
  --account-name $CURRENT_STORAGE `
  --resource-group $CURRENT_RG `
  --query "[0].value" --output tsv

# List all blob containers
$CONTAINERS = az storage container list `
  --account-name $CURRENT_STORAGE `
  --account-key $STORAGE_KEY `
  --query "[].name" --output tsv

# Download each container into its own subfolder
foreach ($CONTAINER in $CONTAINERS) {
    Write-Host "Downloading container: $CONTAINER"
    $DEST = "$BACKUP\blobs\$CONTAINER"
    New-Item -ItemType Directory -Path $DEST -Force
    az storage blob download-batch `
      --source $CONTAINER `
      --destination $DEST `
      --account-name $CURRENT_STORAGE `
      --account-key $STORAGE_KEY
}

Write-Host "Blobs downloaded to $BACKUP\blobs\"
```

**Expected output:** A folder `backups\YYYY-MM-DD\blobs\` containing one subfolder per project, each with audio files and (if present) `labels.txt`.

### 3c. Export the Table Storage `datasets` table

```powershell
# Export all table entities to a JSON file
az storage entity query `
  --table-name datasets `
  --account-name $CURRENT_STORAGE `
  --account-key $STORAGE_KEY `
  --output json > "$BACKUP\datasets-table.json"

Write-Host "Table exported to $BACKUP\datasets-table.json"
```

**Verify the export is not empty:**

```powershell
$TABLE = Get-Content "$BACKUP\datasets-table.json" | ConvertFrom-Json
Write-Host "Projects in table: $($TABLE.items.Count)"
$TABLE.items | Select-Object ProjectName, PublicKey, Email | Format-Table
```

You should see one row per project. If the count is 0 and you expected projects, something is wrong — do not proceed until this is resolved.

### 3d. Note the current environment variables

In the Azure Portal:

1. **App Services** → **[your web app]** → **Settings** → **Environment variables**
2. Copy the values of:
   - `AZURE_STORAGE_CONNECTION_STRING`
   - `WEB_PAGE_PASSWORD`

Store these in a password manager. You will need the password in the new deployment.

### 3e. Verify the snapshot locally

```powershell
# Copy .env.example to .env
Copy-Item .env.example .env
# Edit .env and paste AZURE_STORAGE_CONNECTION_STRING and WEB_PAGE_PASSWORD from step 3d
notepad .env

npm install
npm start
```

Open `http://localhost:3000` and confirm:

- [ ] Homepage loads
- [ ] Entering a known PublicKey shows the correct project
- [ ] Audio files load and play
- [ ] Waveform renders

Store the `backups\YYYY-MM-DD\` folder on secure external storage (USB drive, personal cloud). It is the only protection against data loss.

---

## 4. Rebuild in a new Azure subscription

### 4a. Set variables for the new deployment

```powershell
# Choose names for the new resources (change these to your liking)
# Storage account: 3-24 chars, lowercase letters and numbers only, globally unique
$NEW_RG       = "subjective-listening-rg"
$NEW_STORAGE  = "subjectiveaudio01"     # Must be globally unique — add numbers if taken
$NEW_WEBAPP   = "subjective-listening"  # Must be globally unique
$NEW_PLAN     = "subjective-plan"
$LOCATION     = "westeurope"            # Choose the region closest to your users
```

### 4b. Create infrastructure

```powershell
# Set the target subscription
az account set --subscription "NEW_SUBSCRIPTION_ID_HERE"

# Resource group
az group create --name $NEW_RG --location $LOCATION

# Storage account
az storage account create `
  --name $NEW_STORAGE `
  --resource-group $NEW_RG `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2

# Get storage key and connection string
$NEW_STORAGE_KEY = az storage account keys list `
  --account-name $NEW_STORAGE `
  --resource-group $NEW_RG `
  --query "[0].value" --output tsv

$NEW_CONN_STR = az storage account show-connection-string `
  --name $NEW_STORAGE `
  --resource-group $NEW_RG `
  --output tsv

# Create Table Storage table
az storage table create `
  --name datasets `
  --account-name $NEW_STORAGE `
  --account-key $NEW_STORAGE_KEY

# App Service Plan (B1 Linux ~ $13/month; use F1 for free testing)
az appservice plan create `
  --name $NEW_PLAN `
  --resource-group $NEW_RG `
  --sku B1 `
  --is-linux

# Web App
az webapp create `
  --name $NEW_WEBAPP `
  --resource-group $NEW_RG `
  --plan $NEW_PLAN `
  --runtime "NODE:20-lts"

# Force HTTPS
az webapp update `
  --name $NEW_WEBAPP `
  --resource-group $NEW_RG `
  --https-only true
```

### 4c. Configure CORS on Blob Storage

The browser loads audio files directly from Blob Storage. Without CORS the browser blocks these requests.

```powershell
az storage cors add `
  --services b `
  --methods GET HEAD POST PUT DELETE OPTIONS `
  --origins "http://localhost:3000" "https://$NEW_WEBAPP.azurewebsites.net" `
  --allowed-headers "*" `
  --exposed-headers "*" `
  --max-age 3600 `
  --account-name $NEW_STORAGE `
  --account-key $NEW_STORAGE_KEY
```

### 4d. Set environment variables on the Web App

> **Known Azure CLI limitation:** Very long connection strings can silently fail when passed inline. Use the JSON file approach below.

Create `appsettings.json` in the repo root (this file is in `.gitignore` — do not commit it):

```json
[
  {
    "name": "AZURE_STORAGE_CONNECTION_STRING",
    "value": "PASTE_NEW_CONNECTION_STRING_HERE",
    "slotSetting": false
  },
  {
    "name": "WEB_PAGE_PASSWORD",
    "value": "PASTE_ADMIN_PASSWORD_HERE",
    "slotSetting": false
  }
]
```

Replace both values, then apply:

```powershell
az webapp config appsettings set `
  --name $NEW_WEBAPP `
  --resource-group $NEW_RG `
  --settings "@appsettings.json"
```

Verify the settings were accepted (values must not show as `null`):

```powershell
az webapp config appsettings list `
  --name $NEW_WEBAPP `
  --resource-group $NEW_RG `
  --output table
```

Delete `appsettings.json` once confirmed:

```powershell
Remove-Item appsettings.json
```

### 4e. Restore blob data

Upload each project's files back into its container. Run from the repo root after setting `$BACKUP`, `$NEW_STORAGE`, and `$NEW_STORAGE_KEY`.

```powershell
$BACKUP_BLOBS = "$BACKUP\blobs"

# Loop over each project folder in the backup
Get-ChildItem -Directory $BACKUP_BLOBS | ForEach-Object {
    $CONTAINER = $_.Name
    Write-Host "Restoring container: $CONTAINER"

    # Create the container
    az storage container create `
      --name $CONTAINER `
      --account-name $NEW_STORAGE `
      --account-key $NEW_STORAGE_KEY

    # Upload all files
    az storage blob upload-batch `
      --source "$BACKUP_BLOBS\$CONTAINER" `
      --destination $CONTAINER `
      --account-name $NEW_STORAGE `
      --account-key $NEW_STORAGE_KEY
}
```

**Verify blob counts match the original:**

```powershell
# Count blobs in each container in new storage
az storage container list `
  --account-name $NEW_STORAGE `
  --account-key $NEW_STORAGE_KEY `
  --query "[].name" --output tsv | ForEach-Object {
    $COUNT = az storage blob list `
      --container-name $_ `
      --account-name $NEW_STORAGE `
      --account-key $NEW_STORAGE_KEY `
      --query "length(@)" --output tsv
    Write-Host "$_`: $COUNT blobs"
}
```

Compare these counts against the original backup folder:

```powershell
Get-ChildItem -Directory $BACKUP_BLOBS | ForEach-Object {
    $COUNT = (Get-ChildItem "$BACKUP_BLOBS\$($_.Name)").Count
    Write-Host "$($_.Name): $COUNT files"
}
```

The counts must match.

### 4f. Restore Table Storage entries

The exported JSON from step 3c must be re-inserted row by row. Run this PowerShell script:

```powershell
$TABLE_DATA = Get-Content "$BACKUP\datasets-table.json" | ConvertFrom-Json

foreach ($ROW in $TABLE_DATA.items) {
    az storage entity insert `
      --table-name datasets `
      --account-name $NEW_STORAGE `
      --account-key $NEW_STORAGE_KEY `
      --entity `
        PartitionKey=$ROW.PartitionKey `
        RowKey=$ROW.RowKey `
        ProjectName=$ROW.ProjectName `
        PublicKey=$ROW.PublicKey `
        Email=$ROW.Email
    Write-Host "Inserted: $($ROW.ProjectName)"
}
```

**Verify the row count:**

```powershell
$RESTORED = az storage entity query `
  --table-name datasets `
  --account-name $NEW_STORAGE `
  --account-key $NEW_STORAGE_KEY `
  --query "items" --output json | ConvertFrom-Json

Write-Host "Rows in new table: $($RESTORED.Count)"
```

Must equal the count from step 3c.

### 4g. Wire up CI/CD

CI/CD is configured through the Azure Portal **Deployment Center** (not a YAML file in this repo).

1. Open [portal.azure.com](https://portal.azure.com)
2. Navigate to **App Services** → **[your new web app]** → **Deployment** → **Deployment Center**
3. **Settings** → **Configuration** → Enable **SCM Basic Auth Publishing Credentials**
4. Back in Deployment Center, select:
   - **Source:** GitHub (or Azure Repos, depending on where this repo lives)
   - **Repository:** `subjective-listening-tool`
   - **Branch:** `main`
5. Click **Save**

Azure generates a workflow and pushes it to the repo (or wires the webhook). From this point on, every push to `main` triggers an automatic redeploy.

**First deployment after wiring:**

```bash
git push origin main
```

Watch the build at: **Deployment Center** → **Logs**

### 4h. Confirm the app is live

```powershell
Invoke-WebRequest -Uri "https://$NEW_WEBAPP.azurewebsites.net/health"
```

Expected response body: `OK`  
Expected status code: `200`

---

## 5. Verify nothing was lost

Work through this checklist top-to-bottom after completing Section 4. If any item fails, jump to Section 7 (Rollback) and re-upload data from the backup.

- [ ] `https://[webapp].azurewebsites.net/health` returns `OK`
- [ ] Homepage loads without console errors (open browser DevTools → Console)
- [ ] Enter a known PublicKey → correct project name appears in the dropdown
- [ ] Select a project → audio track list loads (SAS URLs generated)
- [ ] Press Play on a track → audio plays without error
- [ ] Waveform renders in the zoomview and overview panels
- [ ] If labels were used: labelled regions appear on the waveform
- [ ] Admin login (`/create_project.html`) works with the `WEB_PAGE_PASSWORD`
- [ ] Admin project list shows all expected projects

---

## 6. Ongoing operations

### Daily backup (recommended)

Re-run steps 3b and 3c with today's date as `$DATE`. Keep the last 7 dated folders.

### View live logs

```powershell
az webapp log tail --name $NEW_WEBAPP --resource-group $NEW_RG
```

### Restart the web app

```powershell
az webapp restart --name $NEW_WEBAPP --resource-group $NEW_RG
```

> **Note:** The app holds no persistent in-process state. Restarting is safe and does not lose data. Active browser sessions lose their audio cache and must reload.

### Important runtime caveats

- **SAS URLs expire after 1 hour.** If a user leaves a session open for more than an hour, they must reload the page to get fresh URLs.
- **Sessions are not persisted.** Admin login state lives in the browser's `sessionStorage` only. Closing the tab or restarting the server clears it.
- **File upload limits:** 100 MB per file, 10 files per upload batch (enforced by the server). Larger uploads must be split.
- **Audio file requirements:** All files in a project must be **mono** and have the **same duration** (±0.1 s). The admin UI validates this client-side before upload.

### Where things are documented

| Document | Purpose |
|---|---|
| [README.md](README.md) | Application overview and architecture |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Detailed Azure setup walkthrough (~60 min) |
| [CLAUDE.md](CLAUDE.md) | Codebase conventions for developers |
| [.env.example](.env.example) | All environment variables with descriptions |

---

## 7. Rollback

### Code rollback

Every push to `main` triggers a redeploy. To revert a bad deployment:

```bash
# Find the last good commit
git log --oneline -10

# Revert and push (triggers redeploy)
git revert <bad-commit-sha>
git push origin main
```

Watch the redeploy at Deployment Center → Logs.

### Data rollback

To restore a previous state of the audio files or project table, re-run steps 4e and 4f pointing `$BACKUP` at an older dated folder:

```powershell
$BACKUP = "backups\2025-01-15"  # choose the dated folder to restore from
```

Then re-run the blob upload loop (4e) and table insert loop (4f).

Data rollback and code rollback are independent — you can roll back either without affecting the other.

### Emergency: repoint to the old subscription

If the new deployment has critical issues and the old subscription is still live, the fastest recovery is to update the DNS or Deployment Center source to point back at the original web app. No data changes are needed.
