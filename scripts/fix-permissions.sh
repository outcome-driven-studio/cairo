#!/bin/bash

# Fix GCP permissions for deployment
set -e

PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}
SERVICE_ACCOUNT="$PROJECT_ID-compute@developer.gserviceaccount.com"

echo "Fixing permissions for project: $PROJECT_ID"
echo "Service account: $SERVICE_ACCOUNT"
echo ""

# Grant Secret Manager access
echo "Granting Secret Manager access..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor" \
  --condition=None \
  --quiet || echo "Note: May already have access"

echo ""
echo "✅ Permissions updated!"
echo ""
echo "Now run: ./scripts/deploy-gcp.sh"
