# Azure Container Apps Deployment Guide

## Project Overview

This document provides a complete guide for deploying the Company Research Agent (a multi-agent AI research platform) to Azure Container Apps. The application consists of a FastAPI backend with React TypeScript frontend, leveraging LangGraph for orchestrating specialized research agents.

## Architecture

- **Backend**: FastAPI (Python 3.11) serving both API endpoints and React frontend static files
- **Frontend**: React TypeScript with Vite build system (served as static files by FastAPI)
- **AI Integration**: Azure OpenAI, Tavily API
- **Maps Integration**: Google Maps JavaScript API
- **Real-time Communication**: WebSockets
- **Deployment**: Single Docker container on Azure Container Apps

## Prerequisites

### Required Tools
- Docker Desktop
- Azure CLI (`az` command)
- Azure subscription with contributor access

### Required API Keys
- **Tavily API Key**: For web research functionality
- **Azure OpenAI Key & Endpoint**: For AI processing  
- **Google Maps API Key**: For location autocomplete

### Azure Services Used
- **Azure Container Apps**: Application hosting
- **Azure Container Registry**: Private Docker registry
- **Log Analytics Workspace**: Monitoring and logging

## Step-by-Step Deployment Process

### Step 1: Prepare the Dockerfile

The original Dockerfile needed modification to accept build-time environment variables for the React frontend.

**Challenge**: Vite environment variables are build-time, not runtime. They must be available during `npm run build`.

**Solution**: Modified the Dockerfile to accept build arguments:

```dockerfile
# Stage 1: Build Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/ui

# Accept build arguments for Vite environment variables
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_GOOGLE_MAPS_API_KEY

# Set as environment variables for Vite build process
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

COPY ui/package*.json ./
RUN npm install
COPY ui/ ./
RUN npm run build

# ... rest of Dockerfile remains the same
```

### Step 1.5: Configure FastAPI to Serve Frontend Static Files

**Critical Step**: The FastAPI application must be configured to serve the React frontend static files. Without this configuration, the frontend will not be accessible.

**Challenge**: By default, FastAPI only serves API endpoints. The React frontend files built by Vite need to be served as static files.

**Solution**: Modify `application.py` to serve static files and handle client-side routing:

```python
from fastapi.staticfiles import StaticFiles

# Mount static files for React assets (CSS, JS)
app.mount("/assets", StaticFiles(directory="ui/dist/assets"), name="assets")

# Serve React app at root
@app.get("/")
async def serve_frontend():
    """Serve the React frontend."""
    return FileResponse("ui/dist/index.html")

# Catch-all route for React Router (client-side routing)
# This must be the last route defined
@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    """Serve React app for any unmatched routes (client-side routing)."""
    return FileResponse("ui/dist/index.html")
```

**Important Notes**:
- Static files mount must come after all API routes are defined
- The catch-all route must be the very last route to avoid conflicts
- `/assets` path matches the Vite build output structure

### Step 2: Create Azure Infrastructure

```bash
# Create resource group
az group create --name sf-company-research --location eastus

# Create container registry
az acr create --name sfcompanyresearchacr --resource-group sf-company-research --sku Basic

# Enable admin user on registry (for authentication)
az acr update --name sfcompanyresearchacr --admin-enabled true

# Create Container Apps environment
az containerapp env create --name sf-company-research-env --resource-group sf-company-research --location eastus
```

**Challenge**: The Container Apps environment creation took longer than expected (~3-5 minutes) and created duplicate Log Analytics workspaces due to retry.

**Solution**: Used longer timeout and cleaned up duplicate workspaces:
```bash
az monitor log-analytics workspace delete --resource-group sf-company-research --workspace-name workspace-sfcompanyresearchSxiG --yes
```

### Step 3: Two-Phase Deployment Approach

**Challenge**: We faced a "chicken-and-egg" problem - we needed the Container App URL to build the frontend, but needed the container image to create the Container App.

**Solution**: Implemented a two-phase deployment:

#### Phase 1: Deploy with Placeholder URLs

```bash
# Build with placeholder URLs
docker build --platform linux/amd64 \
  --build-arg VITE_API_URL=https://placeholder.com \
  --build-arg VITE_WS_URL=wss://placeholder.com \
  --build-arg VITE_GOOGLE_MAPS_API_KEY=AIzaSyDubyV1hsyGuGfxvcLgUvNBA3Jcx1InZ_0 \
  -t sfcompanyresearchacr.azurecr.io/company-research:temp-amd64 .

# Push to registry
docker push sfcompanyresearchacr.azurecr.io/company-research:temp-amd64

# Deploy Container App
az containerapp create \
  --name sf-company-research-app \
  --resource-group sf-company-research \
  --environment sf-company-research-env \
  --image sfcompanyresearchacr.azurecr.io/company-research:temp-amd64 \
  --target-port 8000 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 5 \
  --registry-server sfcompanyresearchacr.azurecr.io \
  --registry-username sfcompanyresearchacr \
  --registry-password "$(az acr credential show --name sfcompanyresearchacr --query passwords[0].value -o tsv)" \
  --secrets \
    tavily-key="your-tavily-api-key" \
    azure-openai-key="your-azure-openai-key" \
    azure-openai-endpoint="your-azure-openai-endpoint" \
  --env-vars \
    TAVILY_API_KEY=secretref:tavily-key \
    AZURE_OPENAI_KEY=secretref:azure-openai-key \
    AZURE_OPENAI_ENDPOINT=secretref:azure-openai-endpoint
```

#### Phase 2: Update with Correct URLs

```bash
# Get the real Container App URL
APP_URL=$(az containerapp show \
  --name sf-company-research-app \
  --resource-group sf-company-research \
  --query properties.configuration.ingress.fqdn -o tsv)

# Rebuild with correct URLs
docker build --platform linux/amd64 \
  --build-arg VITE_API_URL=https://$APP_URL \
  --build-arg VITE_WS_URL=wss://$APP_URL \
  --build-arg VITE_GOOGLE_MAPS_API_KEY=AIzaSyDubyV1hsyGuGfxvcLgUvNBA3Jcx1InZ_0 \
  -t sfcompanyresearchacr.azurecr.io/company-research:latest .

# Push final image
docker push sfcompanyresearchacr.azurecr.io/company-research:latest

# Update Container App
az containerapp update \
  --name sf-company-research-app \
  --resource-group sf-company-research \
  --image sfcompanyresearchacr.azurecr.io/company-research:latest
```

## Major Challenges and Solutions

### 1. Docker Platform Architecture Issue

**Problem**: Initial deployment failed with error:
```
no child with platform linux/amd64 in index
```

**Root Cause**: Azure Container Apps requires Linux AMD64 architecture, but our Docker build was creating multi-platform manifests that weren't compatible.

**Solution**: 
- Used explicit `--platform linux/amd64` flag in docker build
- This ensures the image is built specifically for the required architecture

### 2. Container Registry Authentication

**Problem**: Container Apps couldn't pull from Azure Container Registry due to authentication issues.

**Solution**:
- Enabled admin user on ACR: `az acr update --name sfcompanyresearchacr --admin-enabled true`
- Retrieved admin credentials and provided them explicitly in Container App creation
- Alternative: Use managed identity for production deployments

### 3. FastAPI Frontend Serving Configuration

**Problem**: After deployment, accessing the root URL returned `{"message":"Alive"}` instead of the React frontend UI.

**Root Cause**: FastAPI was not configured to serve the React frontend static files. The built React files were copied to the container but FastAPI only served API endpoints.

**Solution**:
- Added `StaticFiles` import and mount for `/assets` route
- Modified root endpoint `@app.get("/")` to serve `index.html` 
- Added catch-all route `@app.get("/{full_path:path}")` for React Router client-side routing
- Ensured correct route order: API routes → static files mount → catch-all route

**Key Learning**: Single-container deployments require explicit configuration for serving frontend static files.

### 4. Frontend Environment Variables

**Problem**: Vite requires environment variables at build time, not runtime.

**Solution**:
- Modified Dockerfile to accept build arguments
- Used Docker ARG and ENV instructions to pass variables to Vite
- Built separate images for placeholder and final URLs

### 4. Multi-Stage Build Complexity

**Problem**: The application uses a complex multi-stage Dockerfile with frontend and backend stages.

**Solution**:
- Ensured build arguments are available in the correct stage (frontend-builder)
- Maintained proper layer caching for faster rebuilds
- Used explicit platform specification for all stages

## Security Considerations

### API Key Management
- Used Azure Container Apps secrets for sensitive information
- API keys are stored as `secretref:` rather than plain text
- Registry credentials are automatically managed as secrets

### Network Security
- Container Apps provides automatic HTTPS termination
- Ingress is configured as `external` for public access
- WebSocket connections are automatically upgraded to WSS

## Performance and Scaling

### Auto-scaling Configuration
- **Min replicas**: 1 (always running)
- **Max replicas**: 5 (scales based on demand)
- **Resources per container**: 0.5 CPU, 1GB RAM

### Cost Optimization
- Uses Consumption workload profile (pay-per-use)
- Scales to zero when idle (with min replicas = 1, it doesn't scale to zero)
- Consider reducing min replicas to 0 for development environments

## Monitoring and Troubleshooting

### Log Analytics
- Automatic integration with Azure Log Analytics
- View logs in Azure portal under Container Apps > Monitoring
- Query logs using KQL (Kusto Query Language)

### Common Issues and Solutions

1. **Container won't start**:
   ```bash
   az containerapp logs show --name sf-company-research-app --resource-group sf-company-research
   ```

2. **Image pull failures**:
   - Verify registry credentials
   - Check image exists: `az acr repository show --name sfcompanyresearchacr --repository company-research`

3. **Frontend not loading**:
   - Verify build arguments were passed correctly
   - Check browser network tab for API endpoint URLs

## Environment Variables Reference

### Build Arguments (Docker)
- `VITE_API_URL`: Backend API endpoint URL
- `VITE_WS_URL`: WebSocket endpoint URL  
- `VITE_GOOGLE_MAPS_API_KEY`: Google Maps JavaScript API key

### Runtime Environment Variables (Container App)
- `TAVILY_API_KEY`: Tavily research API key
- `AZURE_OPENAI_KEY`: Azure OpenAI service key
- `AZURE_OPENAI_ENDPOINT`: Azure OpenAI service endpoint

## Deployment Automation

### Recommended Script
Create `deploy.sh` for automated deployment:

```bash
#!/bin/bash
set -e

# Configuration
RG_NAME="sf-company-research"
APP_NAME="sf-company-research-app"
ACR_NAME="sfcompanyresearchacr"
IMAGE_NAME="company-research"

# Get Container App URL
APP_URL=$(az containerapp show --name $APP_NAME --resource-group $RG_NAME --query properties.configuration.ingress.fqdn -o tsv)

# Build and push image
docker build --platform linux/amd64 \
  --build-arg VITE_API_URL=https://$APP_URL \
  --build-arg VITE_WS_URL=wss://$APP_URL \
  --build-arg VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_KEY \
  -t $ACR_NAME.azurecr.io/$IMAGE_NAME:latest .

docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:latest

# Update Container App
az containerapp update \
  --name $APP_NAME \
  --resource-group $RG_NAME \
  --image $ACR_NAME.azurecr.io/$IMAGE_NAME:latest

echo "Deployment complete! Visit: https://$APP_URL"
```

## Final Deployment Results

### Created Resources
- **Resource Group**: `sf-company-research`
- **Container Registry**: `sfcompanyresearchacr.azurecr.io`
- **Container Apps Environment**: `sf-company-research-env`
- **Container App**: `sf-company-research-app`
- **Application URL**: `https://sf-company-research-app.delightfulflower-a493bfd9.eastus.azurecontainerapps.io/`

### Verification
- HTTP status code: 200 ✅
- HTTPS termination: Automatic ✅
- WebSocket support: Configured ✅
- Auto-scaling: 1-5 replicas ✅

## Lessons Learned

1. **Always specify Docker platform** for Azure Container Apps deployments
2. **Use two-phase deployment** for applications that need their own URL at build time
3. **Enable ACR admin user** for simpler authentication (or use managed identity for production)
4. **Build arguments vs environment variables** - understand when each is needed
5. **Monitor resource creation** - some Azure services take time to provision
6. **Clean up duplicate resources** created during retries

## Cost Estimation

**Monthly costs (approximate)**:
- Container Apps: $15-30 (consumption-based)
- Container Registry: $5 (Basic tier)
- Log Analytics: $2-5 (based on ingestion)
- **Total**: ~$22-40/month

## Next Steps

1. **Set up CI/CD pipeline** using GitHub Actions or Azure DevOps
2. **Configure custom domain** and SSL certificates
3. **Implement health checks** and alerting
4. **Consider managed identity** instead of admin credentials
5. **Set up staging environment** for testing deployments

---

**Deployment Date**: September 6, 2025  
**Deployment Duration**: ~30 minutes  
**Status**: ✅ Successful