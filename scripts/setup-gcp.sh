#!/bin/bash

# GCP Initial Setup Script for Cairo CDP
# This script sets up the initial GCP infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}
REGION=${GCP_REGION:-us-central1}
DB_INSTANCE_NAME="cairo-db"
DB_NAME="cairo_db"
DB_USER="cairo_app"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Cairo CDP - GCP Setup Script${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: PROJECT_ID is not set${NC}"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo -e "${GREEN}Project ID:${NC} $PROJECT_ID"
echo -e "${GREEN}Region:${NC} $REGION"
echo ""

# Step 1: Enable APIs
echo -e "${BLUE}Step 1: Enabling required APIs...${NC}"
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  cloudtasks.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  --project=$PROJECT_ID

echo -e "${GREEN}✓ APIs enabled${NC}"
echo ""

# Step 2: Create Cloud SQL instance
echo -e "${BLUE}Step 2: Creating Cloud SQL instance...${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"

# Check if instance already exists
if gcloud sql instances describe $DB_INSTANCE_NAME --project=$PROJECT_ID &>/dev/null; then
    echo -e "${YELLOW}Instance already exists, skipping creation${NC}"
else
    # Generate random password
    DB_PASSWORD=$(openssl rand -base64 32)
    echo -e "${YELLOW}Generated database password. Save it securely!${NC}"
    echo -e "${YELLOW}Password: $DB_PASSWORD${NC}"
    echo ""
    
    gcloud sql instances create $DB_INSTANCE_NAME \
      --database-version=POSTGRES_15 \
      --tier=db-f1-micro \
      --region=$REGION \
      --root-password="$DB_PASSWORD" \
      --storage-type=SSD \
      --storage-size=20GB \
      --backup-start-time=03:00 \
      --project=$PROJECT_ID
    
    echo -e "${GREEN}✓ Cloud SQL instance created${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: Save the root password: $DB_PASSWORD${NC}"
fi

echo ""

# Step 3: Create database
echo -e "${BLUE}Step 3: Creating database...${NC}"
if gcloud sql databases describe $DB_NAME --instance=$DB_INSTANCE_NAME --project=$PROJECT_ID &>/dev/null; then
    echo -e "${YELLOW}Database already exists, skipping creation${NC}"
else
    gcloud sql databases create $DB_NAME \
      --instance=$DB_INSTANCE_NAME \
      --project=$PROJECT_ID
    echo -e "${GREEN}✓ Database created${NC}"
fi
echo ""

# Step 4: Create database user
echo -e "${BLUE}Step 4: Creating database user...${NC}"
APP_PASSWORD=$(openssl rand -base64 32)
echo -e "${YELLOW}Generated app user password: $APP_PASSWORD${NC}"
echo ""

# Check if user exists
if gcloud sql users list --instance=$DB_INSTANCE_NAME --project=$PROJECT_ID | grep -q "$DB_USER"; then
    echo -e "${YELLOW}User already exists. To update password, run:${NC}"
    echo "gcloud sql users set-password $DB_USER --instance=$DB_INSTANCE_NAME --password='NEW_PASSWORD'"
else
    gcloud sql users create $DB_USER \
      --instance=$DB_INSTANCE_NAME \
      --password="$APP_PASSWORD" \
      --project=$PROJECT_ID
    echo -e "${GREEN}✓ Database user created${NC}"
fi
echo ""

# Step 5: Create secrets
echo -e "${BLUE}Step 5: Creating secrets in Secret Manager...${NC}"

# Function to create or update secret
create_secret() {
    local secret_name=$1
    local secret_value=$2
    
    if gcloud secrets describe $secret_name --project=$PROJECT_ID &>/dev/null; then
        echo -e "${YELLOW}Secret $secret_name already exists, adding new version...${NC}"
        echo -n "$secret_value" | gcloud secrets versions add $secret_name \
          --data-file=- \
          --project=$PROJECT_ID
    else
        echo -n "$secret_value" | gcloud secrets create $secret_name \
          --data-file=- \
          --project=$PROJECT_ID
    fi
}

# Create database password secret
create_secret "db-password" "$APP_PASSWORD"
echo -e "${GREEN}✓ Created db-password secret${NC}"

# Prompt for other secrets
echo ""
echo -e "${YELLOW}Enter your API keys (press Enter to skip):${NC}"
echo ""

# AI Enrichment (Required for AI features)
echo -e "${BLUE}AI Enrichment:${NC}"
read -p "Gemini API Key (required for AI features): " GEMINI_KEY
if [ -n "$GEMINI_KEY" ]; then
    create_secret "gemini-api-key" "$GEMINI_KEY"
    echo -e "${GREEN}✓ Created gemini-api-key secret${NC}"
fi

# Lead Enrichment APIs
echo ""
echo -e "${BLUE}Lead Enrichment APIs:${NC}"
read -p "Apollo API Key (optional, for lead enrichment): " APOLLO_KEY
if [ -n "$APOLLO_KEY" ]; then
    create_secret "apollo-api-key" "$APOLLO_KEY"
    echo -e "${GREEN}✓ Created apollo-api-key secret${NC}"
fi

read -p "Hunter API Key (optional, fallback enrichment): " HUNTER_KEY
if [ -n "$HUNTER_KEY" ]; then
    create_secret "hunter-api-key" "$HUNTER_KEY"
    echo -e "${GREEN}✓ Created hunter-api-key secret${NC}"
fi

# CRM Integration
echo ""
echo -e "${BLUE}CRM Integration:${NC}"
read -p "Attio API Key: " ATTIO_KEY
if [ -n "$ATTIO_KEY" ]; then
    create_secret "attio-api-key" "$ATTIO_KEY"
    echo -e "${GREEN}✓ Created attio-api-key secret${NC}"
fi

# Email Marketing & Analytics
echo ""
echo -e "${BLUE}Email Marketing & Analytics:${NC}"
read -p "Lemlist API Key: " LEMLIST_KEY
if [ -n "$LEMLIST_KEY" ]; then
    create_secret "lemlist-api-key" "$LEMLIST_KEY"
    echo -e "${GREEN}✓ Created lemlist-api-key secret${NC}"
fi

read -p "Smartlead API Key: " SMARTLEAD_KEY
if [ -n "$SMARTLEAD_KEY" ]; then
    create_secret "smartlead-api-key" "$SMARTLEAD_KEY"
    echo -e "${GREEN}✓ Created smartlead-api-key secret${NC}"
fi

read -p "Mixpanel Project Token: " MIXPANEL_TOKEN
if [ -n "$MIXPANEL_TOKEN" ]; then
    create_secret "mixpanel-token" "$MIXPANEL_TOKEN"
    echo -e "${GREEN}✓ Created mixpanel-token secret${NC}"
fi

# Monitoring
echo ""
echo -e "${BLUE}Monitoring:${NC}"
read -p "Sentry DSN: " SENTRY_DSN
if [ -n "$SENTRY_DSN" ]; then
    create_secret "sentry-dsn" "$SENTRY_DSN"
    echo -e "${GREEN}✓ Created sentry-dsn secret${NC}"
fi

# Notifications
echo ""
echo -e "${BLUE}Notifications:${NC}"
read -p "Slack Webhook URL (optional, for event alerts): " SLACK_WEBHOOK
if [ -n "$SLACK_WEBHOOK" ]; then
    create_secret "slack-webhook-url" "$SLACK_WEBHOOK"
    echo -e "${GREEN}✓ Created slack-webhook-url secret${NC}"
fi

read -p "Discord Webhook URL (optional, for event alerts): " DISCORD_WEBHOOK
if [ -n "$DISCORD_WEBHOOK" ]; then
    create_secret "discord-webhook-url" "$DISCORD_WEBHOOK"
    echo -e "${GREEN}✓ Created discord-webhook-url secret${NC}"
fi

# Mixpanel API Secret (optional, for advanced Mixpanel features)
read -p "Mixpanel API Secret (optional, for advanced features): " MIXPANEL_SECRET
if [ -n "$MIXPANEL_SECRET" ]; then
    create_secret "mixpanel-api-secret" "$MIXPANEL_SECRET"
    echo -e "${GREEN}✓ Created mixpanel-api-secret secret${NC}"
fi

echo ""

# Step 6: Grant service account access to secrets
echo -e "${BLUE}Step 6: Granting service account access to secrets...${NC}"

# Get Cloud Run service account
SERVICE_ACCOUNT=$(gcloud iam service-accounts list \
  --filter="displayName:Compute Engine default service account" \
  --format="value(email)" \
  --project=$PROJECT_ID)

if [ -z "$SERVICE_ACCOUNT" ]; then
    SERVICE_ACCOUNT="$PROJECT_ID-compute@developer.gserviceaccount.com"
fi

echo "Service account: $SERVICE_ACCOUNT"

# Grant access to all secrets
for secret in db-password gemini-api-key apollo-api-key hunter-api-key lemlist-api-key smartlead-api-key attio-api-key mixpanel-token mixpanel-api-secret sentry-dsn slack-webhook-url discord-webhook-url; do
    if gcloud secrets describe $secret --project=$PROJECT_ID &>/dev/null; then
        gcloud secrets add-iam-policy-binding $secret \
          --member="serviceAccount:$SERVICE_ACCOUNT" \
          --role="roles/secretmanager.secretAccessor" \
          --project=$PROJECT_ID &>/dev/null || true
        echo -e "${GREEN}✓ Granted access to $secret${NC}"
    fi
done

echo ""

# Step 7: Get connection information
echo -e "${BLUE}Step 7: Connection Information${NC}"
INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE_NAME \
  --format="value(connectionName)" \
  --project=$PROJECT_ID)

echo -e "${GREEN}Instance Connection Name:${NC} $INSTANCE_CONNECTION_NAME"
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Update cloudbuild.yaml with INSTANCE_CONNECTION_NAME: $INSTANCE_CONNECTION_NAME"
echo "2. Run: ./scripts/deploy-gcp.sh"
echo ""
echo -e "${YELLOW}Important credentials (save these securely):${NC}"
echo "Database App User Password: $APP_PASSWORD"
echo "Instance Connection: $INSTANCE_CONNECTION_NAME"
