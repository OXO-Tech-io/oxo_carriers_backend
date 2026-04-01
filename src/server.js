// server.js - Entry point to run the server
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const path = require('path');

// Function to run the server
const run = () => {
  try {
    if (isProduction) {
      // In production, run the compiled JavaScript
      const appPath = path.join(__dirname, '..', 'dist', 'app.js');
      console.log('🚀 Starting server in production mode...');
      require(appPath);
    } else {
      // In development, use ts-node to run TypeScript directly
      console.log('🚀 Starting server in development mode...');
      require('ts-node').register();
      require('./app.ts');
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Run the server
run();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});
