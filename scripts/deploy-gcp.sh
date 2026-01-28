#!/bin/bash

# GCP Deployment Script for Cairo CDP
# This script helps deploy Cairo CDP to Google Cloud Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}
REGION=${GCP_REGION:-us-central1}
SERVICE_NAME="cairo-cdp"
DB_INSTANCE_NAME="cairo-db"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Cairo CDP - GCP Deployment Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: PROJECT_ID is not set${NC}"
    echo "Set it with: export GOOGLE_CLOUD_PROJECT=your-project-id"
    echo "Or run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo -e "${GREEN}Project ID:${NC} $PROJECT_ID"
echo -e "${GREEN}Region:${NC} $REGION"

# Get project number
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)" 2>/dev/null)
if [ -z "$PROJECT_NUMBER" ]; then
    echo -e "${RED}Error: Could not determine PROJECT_NUMBER${NC}"
    exit 1
fi
echo -e "${GREEN}Project Number:${NC} $PROJECT_NUMBER"
echo ""

# Get instance connection name
INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE_NAME \
  --format="value(connectionName)" 2>/dev/null || echo "")

if [ -z "$INSTANCE_CONNECTION_NAME" ]; then
    echo -e "${YELLOW}Warning: Could not find Cloud SQL instance: $DB_INSTANCE_NAME${NC}"
    echo "Please create it first or update DB_INSTANCE_NAME variable"
    INSTANCE_CONNECTION_NAME="$PROJECT_ID:$REGION:$DB_INSTANCE_NAME"
    echo "Using: $INSTANCE_CONNECTION_NAME"
fi

# Get service URL if it exists
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format="value(status.url)" 2>/dev/null || echo "")

# Build environment variables (PORT is automatically set by Cloud Run, don't include it)
ENV_VARS="NODE_ENV=production,USE_PERIODIC_SYNC=false,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GCP_REGION=$REGION,INSTANCE_CONNECTION_NAME=$INSTANCE_CONNECTION_NAME"

if [ -n "$SERVICE_URL" ]; then
    ENV_VARS="$ENV_VARS,BASE_URL=$SERVICE_URL"
fi
if [ -n "$DISCORD_USERNAME" ]; then
    ENV_VARS="$ENV_VARS,DISCORD_USERNAME=$DISCORD_USERNAME"
fi
if [ -n "$DISCORD_AVATAR_URL" ]; then
    ENV_VARS="$ENV_VARS,DISCORD_AVATAR_URL=$DISCORD_AVATAR_URL"
fi

# Build secrets string (POSTGRES_URL is the database connection string)
SECRETS="POSTGRES_URL=postgres-url:latest,DB_PASSWORD=db-password:latest,GEMINI_API_KEY=gemini-api-key:latest,APOLLO_API_KEY=apollo-api-key:latest,HUNTER_API_KEY=hunter-api-key:latest,LEMLIST_API_KEY=lemlist-api-key:latest,SMARTLEAD_API_KEY=smartlead-api-key:latest,ATTIO_API_KEY=attio-api-key:latest,MIXPANEL_PROJECT_TOKEN=mixpanel-token:latest,MIXPANEL_API_SECRET=mixpanel-api-secret:latest,SENTRY_DSN=sentry-dsn:latest,SLACK_WEBHOOK_URL=slack-webhook-url:latest,DISCORD_WEBHOOK_URL=discord-webhook-url:latest"

echo -e "${GREEN}Building and deploying...${NC}"
echo ""

# Base64 encode to prevent Cloud Build from parsing variable names inside the strings
ENV_VARS_B64=$(echo -n "$ENV_VARS" | base64 | tr -d '\n')
SECRETS_B64=$(echo -n "$SECRETS" | base64 | tr -d '\n')

# Submit build with base64-encoded values
# Note: _PROJECT_ID will use Cloud Build's built-in $PROJECT_ID variable
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_INSTANCE_CONNECTION_NAME="$INSTANCE_CONNECTION_NAME",_ENV_VARS_B64="$ENV_VARS_B64",_SECRETS_B64="$SECRETS_B64",_PROJECT_NUMBER="$PROJECT_NUMBER"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get final service URL
FINAL_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format="value(status.url)" 2>/dev/null || echo "")

if [ -n "$FINAL_URL" ]; then
    echo -e "${GREEN}Service URL:${NC} $FINAL_URL"
    echo -e "${GREEN}Health Check:${NC} $FINAL_URL/health"
    echo ""
    echo "Test the deployment:"
    echo "  curl $FINAL_URL/health"
fi
