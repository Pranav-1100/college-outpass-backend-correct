const admin = require('firebase-admin');

let firebaseApp;

const initializeFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  let serviceAccount;
  
  // Better error handling for environment variable parsing
  try {
    // Initialize with environment variable or local service account
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('Using Firebase service account from environment variable');
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (parseError) {
        console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT:', parseError.message);
        console.log('First 100 characters of environment variable:', process.env.FIREBASE_SERVICE_ACCOUNT?.substring(0, 100) + '...');
        throw new Error('Invalid JSON in FIREBASE_SERVICE_ACCOUNT environment variable');
      }
    } else {
      console.log('Using Firebase service account from local file');
      try {
        serviceAccount = require('../firebase-config.json');
      } catch (fileError) {
        console.error('❌ Error loading firebase-config.json:', fileError.message);
        throw new Error('Could not load firebase-config.json file');
      }
    }

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
  } catch (error) {
    console.error('🔥 Firebase initialization failed:', error);
    throw error;
  }
};

// Execute the function and export the result
try {
  const firebase = initializeFirebase();
  module.exports = firebase;
} catch (error) {
  console.error('Failed to initialize Firebase. Application may not function correctly.');
  // Provide a mock or limited firebase object to prevent complete app crash
  module.exports = {
    admin: null,
    db: null,
    auth: null,
    messaging: null,
    isError: true,
    error
  };
}