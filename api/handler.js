// Re-export the database and core logic from server.js
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Load env variables
require('dotenv').config({ path: path.join(process.cwd(), 'api.env') });

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:orbit26@localhost:5432/orbit';
const pool = new Pool({ connectionString });

let initialized = false;

async function lazyInitialize() {
  if (initialized) return;
  try {
    // Import the initialization functions from server.js
    const serverModule = require('../server.js');
    await serverModule.initializeDatabase?.() || Promise.resolve();
    initialized = true;
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Initialization error:', err.message);
  }
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Initialize database on first request
  await lazyInitialize();

  // Import and use handleApi from server
  try {
    const serverModule = require('../server.js');
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    
    // Call the existing handleApi function
    await serverModule.handleApi(req, res, url);
  } catch (err) {
    console.error('Handler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
