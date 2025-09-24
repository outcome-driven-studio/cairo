#!/usr/bin/env node

/**
 * Build UI for production deployment
 * This script builds the UI and copies it to be served by the backend
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔨 Building Cairo CDP UI for production...\n');

const uiDir = path.join(__dirname, 'ui');
const distSource = path.join(uiDir, 'dist');
const distTarget = path.join(__dirname, 'public');

// Check if UI directory exists
if (!fs.existsSync(uiDir)) {
  console.error('❌ UI directory not found!');
  console.log('   The UI source should be in ./ui');
  process.exit(1);
}

// Navigate to UI directory
process.chdir(uiDir);

// Install dependencies if needed
if (!fs.existsSync('node_modules')) {
  console.log('📦 Installing UI dependencies...');
  execSync('npm install', { stdio: 'inherit' });
}

// Build the UI
console.log('🏗️  Building UI...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('✅ UI build completed successfully!\n');
} catch (error) {
  console.error('❌ UI build failed:', error.message);
  process.exit(1);
}

// Create public directory if it doesn't exist
if (!fs.existsSync(distTarget)) {
  fs.mkdirSync(distTarget, { recursive: true });
}

// Copy built files to public directory
console.log('📁 Copying built files to public directory...');
try {
  // Remove old files
  if (fs.existsSync(distTarget)) {
    fs.rmSync(distTarget, { recursive: true, force: true });
  }

  // Copy new build
  fs.cpSync(distSource, distTarget, { recursive: true });
  console.log('✅ Files copied successfully!\n');
} catch (error) {
  console.error('❌ Failed to copy files:', error.message);
  process.exit(1);
}

console.log('🎉 UI build complete!');
console.log('   The UI will be served at the root path (/) when the backend starts.');
console.log('   Access it at your Railway URL once deployed.');