#!/bin/bash
set -e

# Configuration from deployment guide
RG_NAME="sf-company-research"
APP_NAME="sf-company-research-app"
ACR_NAME="sfcompanyresearchacr"
IMAGE_NAME="company-research"

echo "🚀 Starting deployment process..."

# Get Container App URL
echo "📍 Getting Container App URL..."
APP_URL=$(az containerapp show --name $APP_NAME --resource-group $RG_NAME --query properties.configuration.ingress.fqdn -o tsv)
echo "✅ Found Container App URL: https://$APP_URL"

# Read Google Maps API key from ui/.env
GOOGLE_MAPS_KEY=$(grep VITE_GOOGLE_MAPS_API_KEY ui/.env | cut -d'=' -f2)
echo "✅ Found Google Maps API key from ui/.env"

# Authenticate with Azure Container Registry
echo "🔐 Authenticating with Azure Container Registry..."
az acr login --name $ACR_NAME
echo "✅ ACR authentication successful"

# Create unique tag to force rebuild and avoid Docker cache issues
UNIQUE_TAG="v$(date +%s)"
echo "📦 Building image with unique tag: $UNIQUE_TAG"

# Build image with correct URLs and unique tag to force update
echo "🏗️  Building Docker image..."
docker build --platform linux/amd64 --no-cache --pull \
  --build-arg VITE_API_URL=https://$APP_URL \
  --build-arg VITE_WS_URL=wss://$APP_URL \
  --build-arg VITE_GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_KEY \
  -t $ACR_NAME.azurecr.io/$IMAGE_NAME:$UNIQUE_TAG .

echo "⬆️  Pushing image to Azure Container Registry..."
docker push $ACR_NAME.azurecr.io/$IMAGE_NAME:$UNIQUE_TAG

echo "🔄 Updating Container App with new image..."
az containerapp update \
  --name $APP_NAME \
  --resource-group $RG_NAME \
  --image $ACR_NAME.azurecr.io/$IMAGE_NAME:$UNIQUE_TAG

echo "✅ Deployment complete!"
echo "🌐 Application URL: https://$APP_URL"
echo "🔍 Verifying deployment..."

# Wait a moment for deployment to complete
sleep 10

# Verify deployment
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$APP_URL)
if [ "$STATUS_CODE" = "200" ]; then
    echo "✅ Deployment verification successful (HTTP $STATUS_CODE)"
else
    echo "⚠️  Deployment verification returned HTTP $STATUS_CODE"
fi

echo "📋 Deployment Summary:"
echo "   Resource Group: $RG_NAME"
echo "   Container App: $APP_NAME"
echo "   Image: $ACR_NAME.azurecr.io/$IMAGE_NAME:$UNIQUE_TAG"
echo "   URL: https://$APP_URL"