const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let firebaseApp;

try {
  // Try to get service account from environment variable first
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('📦 Initializing Firebase Admin from environment variable...');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    // Validate required fields
    if (!serviceAccount.project_id) {
      throw new Error('Service account JSON missing "project_id" property');
    }
    if (!serviceAccount.private_key) {
      throw new Error('Service account JSON missing "private_key" property');
    }
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    
  } 
  // Try from file
  else if (fs.existsSync(path.join(__dirname, '../serviceAccountKey.json'))) {
    console.log('📄 Initializing Firebase Admin from serviceAccountKey.json...');
    const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));
    
    // Validate required fields
    if (!serviceAccount.project_id) {
      throw new Error('serviceAccountKey.json missing "project_id" property');
    }
    
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    
  } 
  // Try from Google Cloud default credentials (for production)
  else {
    console.log('☁️  Initializing Firebase Admin using Google Cloud default credentials...');
    firebaseApp = admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  }
  
  console.log('✅ Firebase Admin SDK initialized successfully');
  
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
  console.error('💡 Solution:');
  console.error('   1. Download serviceAccountKey.json from Firebase Console');
  console.error('   2. Go to: Project Settings > Service Accounts > Generate New Private Key');
  console.error('   3. Save as serviceAccountKey.json in your backend root folder');
  process.exit(1);
}

module.exports = admin;