#!/bin/bash
set -e

# Configuration
RG_NAME="sf-company-research"
APP_NAME="sf-company-research-app"

echo "🔐 Azure Container Apps Secret Updater"
echo "======================================"

# Check if user wants to update all secrets or specific ones
echo ""
echo "Available secrets to update:"
echo "1. tavily-key (Tavily API Key)"
echo "2. azure-openai-key (Azure OpenAI Key)"
echo "3. azure-openai-endpoint (Azure OpenAI Endpoint)"
echo "4. Update all secrets"
echo "5. List current secrets (without values)"
echo ""

read -p "Select option (1-5): " choice

case $choice in
    1)
        read -p "Enter new Tavily API key: " tavily_key
        echo "Updating Tavily API key..."
        az containerapp secret set \
            --name $APP_NAME \
            --resource-group $RG_NAME \
            --secrets tavily-key="$tavily_key"
        echo "✅ Tavily API key updated"
        ;;
    2)
        read -p "Enter new Azure OpenAI key: " openai_key
        echo "Updating Azure OpenAI key..."
        az containerapp secret set \
            --name $APP_NAME \
            --resource-group $RG_NAME \
            --secrets azure-openai-key="$openai_key"
        echo "✅ Azure OpenAI key updated"
        ;;
    3)
        read -p "Enter new Azure OpenAI endpoint: " openai_endpoint
        echo "Updating Azure OpenAI endpoint..."
        az containerapp secret set \
            --name $APP_NAME \
            --resource-group $RG_NAME \
            --secrets azure-openai-endpoint="$openai_endpoint"
        echo "✅ Azure OpenAI endpoint updated"
        ;;
    4)
        echo "Updating all secrets..."
        read -p "Enter new Tavily API key: " tavily_key
        read -p "Enter new Azure OpenAI key: " openai_key
        read -p "Enter new Azure OpenAI endpoint: " openai_endpoint
        
        az containerapp secret set \
            --name $APP_NAME \
            --resource-group $RG_NAME \
            --secrets \
                tavily-key="$tavily_key" \
                azure-openai-key="$openai_key" \
                azure-openai-endpoint="$openai_endpoint"
        echo "✅ All secrets updated"
        ;;
    5)
        echo "Current secrets:"
        az containerapp secret list \
            --name $APP_NAME \
            --resource-group $RG_NAME \
            --query "[].name" -o table
        exit 0
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

echo ""
echo "🔄 Attempting to restart the container app..."

# Try multiple restart approaches
echo "Trying revision restart..."
if az containerapp revision restart \
    --name $APP_NAME \
    --resource-group $RG_NAME 2>/dev/null; then
    echo "✅ Restart successful via revision restart"
else
    echo "⚠️  Revision restart failed, trying update approach..."
    if az containerapp update \
        --name $APP_NAME \
        --resource-group $RG_NAME 2>/dev/null; then
        echo "✅ Restart successful via update"
    else
        echo "⚠️  Automatic restart failed. The app will restart automatically when Azure detects the secret change."
        echo "   You can also restart manually through the Azure Portal."
    fi
fi

echo ""
echo "🎉 Secret update completed!"
echo ""
echo "To verify the update:"
echo "1. Check app logs: az containerapp logs show --name $APP_NAME --resource-group $RG_NAME"
echo "2. Visit your app: https://sf-company-research-app.delightfulflower-a493bfd9.eastus.azurecontainerapps.io/"