#!/bin/bash
#
# Azure Container Registry Cleanup Script
# 
# Purpose: Clean up old container images while maintaining rollback capability
# Usage: ./cleanup-registry.sh
# 
# What this script does:
# - Shows current storage usage
# - Removes image versions older than 7 days (keeps recent versions for rollbacks)
# - Cleans up untagged manifests (frees actual storage space)
# - Shows storage usage after cleanup
#
# Safety: Keeps last 7 days of images for emergency rollbacks
#

set -e  # Exit on any error

# Configuration
RG_NAME="sf-company-research"
ACR_NAME="sfcompanyresearchacr"
REPOSITORY="company-research"
RETENTION_DAYS="7d"

echo "========================================"
echo "Azure Container Registry Cleanup Script"
echo "========================================"
echo "Registry: ${ACR_NAME}"
echo "Repository: ${REPOSITORY}"
echo "Retention: ${RETENTION_DAYS}"
echo "========================================"

echo
echo "📊 Current storage usage:"
az acr show-usage --resource-group "$RG_NAME" --name "$ACR_NAME" --output table

echo
echo "📋 Current tags in repository:"
TAGS_EXIST=$(az acr repository list --name "$ACR_NAME" --query "contains(@, '$REPOSITORY')" -o tsv 2>/dev/null || echo "false")

if [ "$TAGS_EXIST" = "true" ]; then
    az acr repository show-tags --name "$ACR_NAME" --repository "$REPOSITORY" --output table
else
    echo "No repository '$REPOSITORY' found or repository is empty."
fi

echo
echo "🧹 Phase 1: Removing versioned images older than ${RETENTION_DAYS}..."
az acr run --registry "$ACR_NAME" \
    --cmd "acr purge --filter \"${REPOSITORY}:v*\" --ago ${RETENTION_DAYS}" \
    /dev/null

echo
echo "🧹 Phase 2: Cleaning up untagged manifests (frees storage space)..."
az acr run --registry "$ACR_NAME" \
    --cmd "acr purge --filter \"${REPOSITORY}:.*\" --untagged --ago ${RETENTION_DAYS}" \
    /dev/null

echo
echo "✅ Cleanup completed!"
echo
echo "📊 Storage usage after cleanup:"
az acr show-usage --resource-group "$RG_NAME" --name "$ACR_NAME" --output table

echo
echo "📋 Remaining tags:"
TAGS_EXIST_AFTER=$(az acr repository list --name "$ACR_NAME" --query "contains(@, '$REPOSITORY')" -o tsv 2>/dev/null || echo "false")

if [ "$TAGS_EXIST_AFTER" = "true" ]; then
    az acr repository show-tags --name "$ACR_NAME" --repository "$REPOSITORY" --output table
else
    echo "Repository is now empty or doesn't exist."
fi

echo
echo "========================================"
echo "Cleanup Summary:"
echo "- Kept images from last ${RETENTION_DAYS} for rollbacks"
echo "- Removed untagged manifests to free storage"
echo "- Registry is ready for new deployments"
echo "========================================"