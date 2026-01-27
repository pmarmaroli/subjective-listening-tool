# Azure Deployment Guide - Subjective Listening Tool

Complete step-by-step guide to deploy the Subjective Listening Tool on Azure with your own subscription and resources. Estimated time: **60 minutes**.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Azure Resources Setup](#azure-resources-setup)
3. [Using Existing Azure Resources](#using-existing-azure-resources)
4. [Local Development Setup](#local-development-setup)
5. [Azure DevOps Pipeline Configuration](#azure-devops-pipeline-configuration)
6. [Deployment](#deployment)
7. [Post-Deployment Configuration](#post-deployment-configuration)
8. [Verification & Testing](#verification--testing)
9. [Cost Estimates](#cost-estimates)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

**Required:**
- ✅ **Azure Subscription** (Contributor or Owner access)
- ✅ **Azure CLI** installed ([Download](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
- ✅ **Node.js v20.x** or later ([Download](https://nodejs.org))
- ✅ **Git** installed

**Optional:**
- Azure DevOps account (for CI/CD pipeline)
- Code editor (VS Code recommended)

**Time Required:** ~60 minutes for complete setup

---

## Azure Resources Setup

### Important Naming Requirements

- **Storage Account:** 
  - **MUST be 3-24 characters** (not more, not less)
  - **Only lowercase letters and numbers** (no hyphens, no uppercase)
  - **Globally unique across all Azure**
  - ✅ Examples: `myapp123storage`, `subjective01`, `audiostore2024`
  - ❌ Invalid: `subjectivelisteningstorage` (27 chars, too long), `my-storage` (has hyphen), `MyStorage` (has uppercase)
- **Web App:** 2-60 characters, alphanumeric and hyphens, globally unique  
- **Resource Group:** Any valid name
- **Location:** Choose closest to your users (eastus, westeurope, southeastasia, etc.)

### Step 1: Login to Azure

**What this does:** Authenticates your Azure CLI with your Azure account, allowing you to create and manage resources.

**Why it's needed:** All subsequent commands require authentication to verify you have permission to access the subscription and create resources.

```bash
az login
```

### Step 2: Create or Use Resource Group

**What is a Resource Group?** A logical container that holds related Azure resources (storage, web apps, databases, etc.). Think of it as a folder for organizing your cloud infrastructure.

**Why it's needed:** 
- Groups all resources for this project in one place
- Makes it easy to manage permissions, costs, and lifecycle together
- Simplifies cleanup (delete the group = delete everything inside)
- Resources in the same group typically share the same region and lifecycle

**Option A: Create New Resource Group**
```bash
az group create --name YourResourceGroup --location eastus
```

**Option B: Use Existing Resource Group**
```bash
# List available resource groups
az group list --output table

# Note the name of the resource group you want to use
```

### Step 3: Create or Use Storage Account

**Create New Storage Account**

**⚠️ IMPORTANT: Storage account name MUST be:**
- **3-24 characters maximum** (e.g., `subjective01`, `audioapp24`, `listening123`)
- **Only lowercase letters and numbers** (no hyphens, underscores, or uppercase)
- **Globally unique** (if taken, add numbers: `yourapp01`, `yourapp02`, etc.)

```powershell
az storage account create `
  --name yourstorageaccountname `
  --resource-group YourResourceGroup `
  --location eastus `
  --sku Standard_LRS `
  --kind StorageV2
```

**Get Connection String (Required):**
```powershell
# Via CLI
az storage account show-connection-string `
  --name yourstorageaccountname `
  --resource-group YourResourceGroup `
  --output tsv
```

# OR via Azure Portal:
# Portal → Storage Account → Access keys → Connection string (copy)

**Note:** Save this connection string securely - you will need it later!

### Step 4: Configure CORS on Blob Storage

**What is CORS?** Cross-Origin Resource Sharing (CORS) allows your web application (running on `yourwebappname.azurewebsites.net`) to access files stored in Azure Blob Storage (which has a different domain like `yourstorageaccountname.blob.core.windows.net`). Without CORS, browsers block these cross-domain requests for security.

**Why is this needed?** The Subjective Listening Tool loads audio files directly in the browser using WaveSurfer.js. When users play audio, their browser makes requests to Blob Storage to fetch the audio files. CORS configuration tells Azure Storage to allow these requests.

**During Development:** Configure CORS to allow both localhost (for testing) and your Azure Web App:

```powershell
az storage cors add `
  --services b `
  --methods GET HEAD POST PUT DELETE OPTIONS `
  --origins "http://localhost:3000" "https://yourwebappname.azurewebsites.net" `
  --allowed-headers "*" `
  --exposed-headers "*" `
  --max-age 3600 `
  --account-name yourstorageaccountname
```

**Parameter Explanation:**
- `--services b` - Apply CORS to Blob storage only (not Tables or Queues)
- `--methods GET HEAD POST PUT DELETE OPTIONS` - Allow these HTTP methods
  - `GET` - Download/read audio files (main operation)
  - `HEAD` - Check file metadata
  - `POST/PUT` - Upload audio files from create_project page
  - `DELETE` - Remove files if needed
  - `OPTIONS` - Preflight requests (browser security check)
- `--origins "http://localhost:3000" "https://yourwebappname.azurewebsites.net"` - Allow requests from localhost (testing) and your Azure Web App
- `--allowed-headers "*"` - Accept any HTTP headers in requests
- `--exposed-headers "*"` - Allow browser to read any response headers
- `--max-age 3600` - Cache CORS preflight responses for 1 hour (reduces requests)

**⚠️ Important:** Replace `yourwebappname` with your actual Azure Web App name before running the command.

**For Production (Optional - Remove localhost):**
Once deployed and tested, you can remove localhost access:
```powershell
az storage cors clear --services b --account-name yourstorageaccountname
az storage cors add `
  --services b `
  --methods GET HEAD POST PUT DELETE OPTIONS `
  --origins "https://yourwebappname.azurewebsites.net" `
  --allowed-headers "*" `
  --exposed-headers "*" `
  --max-age 3600 `
  --account-name yourstorageaccountname
```

For multiple domains (production + custom domain):
```powershell
--origins "https://yourwebappname.azurewebsites.net https://yourdomain.com"
```

### Step 5: Create Table Storage

**What is Table Storage?** Azure Table Storage is a NoSQL database used to store project metadata and access control information. In this application, it acts as a simple database to map public keys to audio projects.

**Why is it needed?** When users want to access a listening test:
1. They enter a **PublicKey** on the homepage
2. The app queries this table to find which project matches that key
3. If found, the app loads the audio files from that project's blob container
4. This provides simple access control without complex authentication

**How it works:**
- Admin creates a project via `create_project.html` with a unique PublicKey
- Table stores: ProjectName → PublicKey → Email mapping
- Users share only the PublicKey (not the container name directly)
- App validates access through the table before serving audio

**Create New Table**

```powershell
az storage table create --name datasets --account-name yourstorageaccountname
```

**✅ You're done with this step!** The table is now ready to use.

**Table Schema (Informational - No Action Required):**

Azure Table Storage has a dynamic schema - you don't need to define columns upfront. The schema below shows what data the application will automatically store when you create projects via the web interface:

- **PartitionKey:** Sequential number (e.g., "1", "2", "3") - *Auto-generated by app*
- **RowKey:** Same as PartitionKey - *Auto-generated by app*
- **ProjectName:** Blob container name (e.g., "my-audio-project") - *From create_project.html form*
- **PublicKey:** Access key shared with users (e.g., "abc123xyz") - *From create_project.html form*
- **Email:** Project owner's email - *From create_project.html form*

**How it works:**
1. When you visit `create_project.html` and fill in the form, the app automatically inserts a row with these fields
2. No manual database setup is needed - the table structure is created on first insert
3. You can verify entries later using: 
   ```powershell
   az storage entity query --table-name datasets --account-name yourstorageaccountname
   ```

### Step 6: Create or Use App Service Plan

**What is an App Service Plan?** A hosting plan that defines the compute resources (CPU, RAM, storage) for running your web application. It's like renting a virtual server with specific hardware specs.

**Why it's needed:**
- Provides the infrastructure (Linux VM) to run your Node.js application
- Determines performance: how much CPU/memory your app gets
- Controls cost: different tiers have different prices and capabilities
- Multiple web apps can share the same plan (cost optimization)

**How it works:** The plan runs 24/7 hosting your app, handling HTTP requests, and executing your Node.js code.

**Option A: Create New App Service Plan**

**Choose a name for your App Service Plan** (e.g., `SubjectiveListeningPlan`, `MyAppPlan`, `audio-test-plan`):

```powershell
az appservice plan create --name YourAppServicePlan --resource-group YourResourceGroup --sku B1 --is-linux
```

**Pricing Options:**
- `F1` - Free (limited, good for testing) - $0/month
- `B1` - Basic (recommended for production) - ~$13/month
- `S1` - Standard (scaling, staging slots) - ~$70/month
- `P1V2` - Premium (high performance) - ~$75/month

**Option B: Use Existing App Service Plan**

```bash
# List available plans
az appservice plan list --resource-group YourResourceGroup --output table

# Verify it supports Linux and Node.js
```

### Step 7: Create or Use Web App

**What is a Web App?** The actual web application instance that runs your code. It's the container that hosts your Node.js application on the App Service Plan.

**Why it's needed:**
- Hosts your server.js and all application code
- Provides a public URL (https://yourwebappname.azurewebsites.net)
- Runs your Node.js application continuously
- Handles incoming HTTP requests from users
- Manages deployment, logging, and scaling

**How it works:** Azure deploys your code to this web app, starts the Node.js server, and routes traffic to it through the assigned URL.

**Option A: Create New Web App**

```powershell
az webapp create --name yourwebappname --resource-group YourResourceGroup --plan YourAppServicePlan --runtime "NODE:20-lts"
```

Your app will be available at: `https://yourwebappname.azurewebsites.net`

**Option B: Use Existing Web App**

```bash
# List web apps
az webapp list --resource-group YourResourceGroup --output table

# Verify runtime is Node.js 20
az webapp config show --name yourwebappname --resource-group YourResourceGroup
```

### Step 8: Configure Environment Variables

**What are Environment Variables?** Secure configuration values that your application reads at runtime (like passwords, API keys, connection strings). They're stored in Azure, not in your code.

**Why it's needed:**
- **Security:** Keeps sensitive data (connection strings, passwords) out of source code
- **Flexibility:** Different values for dev/test/production without code changes
- **Configuration:** Your server.js reads these to connect to Storage and validate admin access

**What this app needs:**
- `AZURE_STORAGE_CONNECTION_STRING` - Connects to Blob Storage and Table Storage
- `WEB_PAGE_PASSWORD` - Protects the create_project.html admin page. **Share this password with team members who need to create and manage projects.** End users only need the PublicKey to access listening tests.

**Required for the application to work:**

**Set variables one at a time (recommended):**
**⚠️ Known Issue:** Azure CLI has a bug with very long connection strings - they get set to `null` regardless of quoting. Use the Azure Portal instead:

**Option A: Azure Portal (Recommended)**

1. Go to: https://portal.azure.com
2. Navigate to: **App Services** → **[your-web-app-name]** → **Settings** → **Environment variables**
3. Click **Environment variables** under "Settings"
4. Add first setting:
   - **Name:** `AZURE_STORAGE_CONNECTION_STRING`
   - **Value:** Paste your connection string
   - Click **OK** or **Apply**
5. Add second setting:
   - **Name:** `WEB_PAGE_PASSWORD`
   - **Value:** `your_secure_admin_password_here`
   - Click **OK** or **Apply**
6. Click **Apply** at the bottom
7. Click **Confirm** when prompted about restart

**Option B: PowerShell with JSON file**

Create a file `appsettings.json`:
```json
[
  {
    "name": "AZURE_STORAGE_CONNECTION_STRING",
    "value": "paste_your_connection_string_here",
    "slotSetting": false
  },
  {
    "name": "WEB_PAGE_PASSWORD",
    "value": "your_secure_admin_password_here",
    "slotSetting": false
  }
]
```

Then apply:
```powershell
az webapp config appsettings set --name yourwebappname --resource-group YourResourceGroup --settings "@appsettings.json"
```

**Verify settings were applied:**
```powershell
az webapp config appsettings list --name yourwebappname --resource-group YourResourceGroup --output table
```
Check that both variables show actual values (not `null`).


### Step 9: Enable Security Features

**What this does:** Enforces security best practices by requiring encrypted connections and enabling managed identity for Azure resource access.

**Why it's needed:**
- **HTTPS Only:** Prevents unencrypted HTTP traffic, protecting user data and passwords in transit
- **Managed Identity:** Allows the web app to securely access Azure resources without storing credentials in code

**Benefits:**
- Prevents man-in-the-middle attacks
- Meets compliance requirements
- Improves SEO (Google favors HTTPS sites)
- Prepares for future Azure Key Vault integration

```powershell
# Enable HTTPS Only
az webapp update --name yourwebappname --resource-group YourResourceGroup --https-only true

# Enable Managed Identity (optional but recommended)
az webapp identity assign --name yourwebappname --resource-group YourResourceGroup
```

---

## Local Development Setup

### Step 1: Clone Repository

```bash
git clone <your-repository-url>
cd subjective_listening_tool
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Local Environment

1. Copy `.env.example` to `.env`:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` and add your values:
   ```
   AZURE_STORAGE_CONNECTION_STRING=your_connection_string_here
   WEB_PAGE_PASSWORD=your_password_here
   PORT=3000
   ```

### Step 4: Test Locally

```bash
npm start
```

Visit `http://localhost:3000` to verify the application runs correctly.

---

## Automatic Deployment

### Step 1: Enable Basic Auth Credentials

1. Go to your Web App in the [Azure Portal](https://portal.azure.com).
2. Navigate to **Settings** → **Configuration** (or **Configuration (preview)**).
3. Ensure **SCM Basic Auth Publishing Credentials** is enabled.
4. Click **Apply**.

### Step 2: Configure Deployment Center

1. Navigate to **Deployment** → **Deployment Center**.
2. Select **Source** → **Azure Repos** (or **GitHub**)
3. Fill in the required details:
   - **Organization**
   - **Project**
   - **Repository**
   - **Branch**
4. Click **Save**.

This will automatically configure the CI/CD pipeline for your application. Each new push in your branch will automatically update the web page.

---

## Post-Deployment Configuration

### Step 1: Verify Deployment

1. Visit `https://yourwebappname.azurewebsites.net/health`
2. Should return `OK`

### Step 2: Test Application Functionality

1. Navigate to `https://yourwebappname.azurewebsites.net/create_project.html`
2. Create a test project
3. Upload test audio files and labels


---

## Verification & Testing

After deployment, verify everything works:

### 1. Check Health Endpoint

```powershell
Invoke-WebRequest -Uri https://yourwebappname.azurewebsites.net/health
```

Should return: `OK`

### 2. Test Web Interface

1. Visit: `https://yourwebappname.azurewebsites.net`
2. Homepage should load without errors
3. Check browser console for any errors

### 3. Create Test Project

1. Navigate to: `https://yourwebappname.azurewebsites.net/create_project.html`
2. Enter your admin password
3. Fill in:
   - Project Name: `test-project-001`
   - Public Key: `test-key-123` (generate or use any string)
   - Email: your email
4. Click "Create Project"
5. Should see success message

### 4. Upload Test Files

1. On the same page, select your test project
2. Upload 2-3 MP3 files (they should be the same length)
3. Upload a `labels.txt` file in Audacity format:
   ```
   0.000000	2.500000	Segment 1
   2.500000	5.000000	Segment 2
   5.000000	7.500000	Segment 3
   ```
4. Verify upload success

### 5. Test Playback

1. Go back to homepage
2. Enter the public key: `test-key-123`
3. Select your test project
4. Verify:
   - Audio files load
   - Waveform displays
   - Labels/regions appear
   - Audio plays correctly
   - Can switch between different audio files

### 6. Check Azure Resources

```powershell
# Verify blob container was created
az storage container list --account-name yourstorageaccountname --output table

# Verify table entry was created
az storage entity query `
  --table-name datasets `
  --account-name yourstorageaccountname
```

### 7. View Logs

```powershell
# Stream logs in real-time
az webapp log tail `
  --name yourwebappname `
  --resource-group YourResourceGroup

# OR view in Azure Portal:
# Web App → Monitoring → Log stream
```

---

## Cost Estimates

### Monthly Cost Breakdown

**Basic Setup (Development/Testing):**
- App Service: F1 Free tier = **$0**
- Storage: Standard_LRS (<1GB) = **~$0.50-1**
- **Total: ~$0.50-1/month**

**Recommended Setup (Production):**
- App Service: B1 Basic tier = **~$13**
- Storage: Standard_LRS (<10GB) = **~$2-3**
- Data Transfer: First 5GB free, then ~$0.087/GB = **~$1-5**
- **Total: ~$16-21/month**

**Enterprise Setup (High Availability):**
- App Service: P1V2 Premium tier = **~$75**
- Storage: Standard_GRS (geo-redundant) = **~$5-10**
- Application Insights = **~$5-20** (based on usage)
- Backup Storage = **~$2-5**
- **Total: ~$87-110/month**

### Cost Optimization Tips

1. **Use Free Tier for Development:**
   ```powershell
   az appservice plan create --sku F1 --is-linux ...
   ```

2. **Delete Test Resources:**
   ```powershell
   az group delete --name YourTestResourceGroup --yes
   ```

3. **Set Budget Alerts:**
   - Azure Portal → Cost Management → Budgets
   - Set threshold alerts at 50%, 80%, 100%

4. **Monitor Storage Usage:**
   ```bash
   az storage account show-usage --name yourstorageaccountname
   ```

5. **Auto-scale Only When Needed:**
   - Start with single instance
   - Scale up only when traffic increases

### Storage Cost Factors

- **Blob Storage:** ~$0.018/GB/month (Standard_LRS)
- **Table Storage:** ~$0.045/GB/month
- **Transactions:** ~$0.004 per 10,000 operations
- **Data Egress:** First 5GB free, then ~$0.087/GB

**Typical Usage Example:**
- 50 projects × 100MB audio each = 5GB storage = ~$0.10/month
- 1000 plays/month = ~$0.01 in transactions
- 10GB data transfer = ~$0.50/month

---

## Troubleshooting

### Issue: Authorization/Permission Errors

**Error:** `AuthorizationFailed` or `does not have authorization to perform action`

**This means you don't have the necessary permissions on the Azure subscription.**

**Solutions:**

1. **Check if you have access to any subscriptions:**
   ```bash
   # List all subscriptions you can see
   az account list --output table
   ```
   
   If this returns subscriptions, try switching to one where you have access:
   ```bash
   az account set --subscription "SUBSCRIPTION_ID_OR_NAME"
   ```

2. **If the list is empty or you get errors:**
   - You have no role assignments on any Azure subscription
   - You need to contact your **Azure subscription administrator** to request access
   
   **What to ask for:**
   - **Contributor** role on a subscription or resource group (recommended)
   - **Owner** role if you need to manage access for others
   - Specify which subscription or resource group you need access to

3. **Verify your role after access is granted:**
   ```bash
   # This should now show your roles
   az role assignment list --assignee your-email@domain.com --output table
   ```
   
   Look for role **Contributor** or **Owner** in the output.

4. **After access is granted, refresh your login:**
   ```bash
   az logout
   az login
   # Try your command again
   ```

**Alternative: Use your own Azure subscription**
- Create a free Azure account at https://azure.microsoft.com/free/
- You'll automatically have Owner access to your own subscription
- Includes $200 credit for 30 days

### Issue: Application won't start

**Check logs:**
```powershell
az webapp log tail --name yourwebappname --resource-group YourResourceGroup
```

**Common causes:**
- Missing environment variables
- Incorrect connection string
- Node.js version mismatch

### Issue: Cannot access blob storage

**Verify:**
1. CORS is enabled on storage account
2. Connection string is correct
3. Table 'datasets' exists

### Issue: Pipeline fails

**Check:**
1. Service connection name matches `azureSubscription` in YAML
2. Web app name is correct
3. Service principal has permissions

### Issue: Files upload but can't be accessed

**Solution:**
1. Check container public access level:
   ```powershell
   az storage container set-permission `
     --name yourcontainer `
     --public-access blob `
     --account-name yourstorageaccountname
   ```

---

## Security Best Practices

1. **Never commit `.env` files** - Already in `.gitignore`
2. **Use Azure Key Vault** for sensitive credentials in production
3. **Enable HTTPS only** on the web app
4. **Restrict CORS** origins to your specific domain
5. **Regularly rotate passwords** and access keys
6. **Enable Azure AD authentication** for admin pages
7. **Use managed identities** instead of connection strings when possible

---

## Cost Optimization

1. **App Service Plan:** Start with B1 (~$13/month), scale as needed
2. **Storage Account:** Use Standard_LRS for cost-effectiveness
3. **Auto-shutdown:** Consider Functions App for intermittent use
4. **Monitoring:** Use Azure Monitor to track usage and optimize

---

## Support

For issues or questions:
1. Check Azure Portal → Web App → **Log stream**
2. Review Application Insights for errors
3. Verify all environment variables are set correctly

---

## Next Steps

After successful deployment:
1. ✅ Update DNS records if using custom domain
2. ✅ Configure SSL certificate
3. ✅ Set up monitoring and alerts
4. ✅ Create backup/disaster recovery plan
5. ✅ Document any customizations made
6. ✅ Share access with team members

**Congratulations!** Your Subjective Listening Tool is now deployed and ready to use.
