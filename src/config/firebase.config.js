// src/config/firebase.config.js
const admin = require('firebase-admin');

let firebaseApp;

const initializeFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  // Initialize with environment variable or local service account
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('../firebase-config.json');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: "outpass-system-9d988",
    storageBucket: "outpass-system-9d988.firebasestorage.app"
  });

  const db = admin.firestore();
  
  // Create initial collections with timeout
  const createInitialCollections = async () => {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: Collection creation took too long')), 10000);
    });

    try {
      await Promise.race([
        (async () => {
          const usersCollection = await db.collection('users').limit(1).get();
          if (usersCollection.empty) {
            console.log('Creating initial collections...');
            const batch = db.batch();
            
            // Initial admin document
            batch.set(db.collection('users').doc('initial'), {
              email: 'system@admin.com',
              role: 'admin',
              name: 'System Admin',
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              type: 'initial'
            });

            // Initial outpass document
            batch.set(db.collection('outpasses').doc('initial'), {
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              type: 'initial'
            });

            await batch.commit();
            console.log('Initial collections created successfully');
          } else {
            console.log('Collections already exist');
          }
        })(),
        timeout
      ]);
    } catch (error) {
      if (error.message.includes('Timeout')) {
        console.error('Collection creation timed out. Continuing with initialization...');
      } else {
        console.error('Error creating initial collections:', error);
      }
    }
  };

  createInitialCollections();

  firebaseApp = {
    admin,
    db,
    auth: admin.auth(),
    messaging: admin.messaging()
  };
  
  return firebaseApp;
};

// Execute the function and export the result
const firebase = initializeFirebase();
module.exports = firebase;