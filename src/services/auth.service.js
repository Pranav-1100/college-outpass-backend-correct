const { db, auth, admin } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');
const { ALLOWED_DOMAINS } = require('../config/constants');


const authService = {

    // Email/Password Sign In
    async signInWithEmail(email, password) {
      try {
          // First verify credentials using Firebase Auth REST API
          const apiKey = process.env.FIREBASE_API_KEY; // Make sure this is set in your .env
          const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
          
          // Make the request to Firebase Auth
          const response = await fetch(signInUrl, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  email,
                  password,
                  returnSecureToken: true
              })
          });

          const data = await response.json();
          
          if (!response.ok) {
              throw new Error(data.error?.message || 'Invalid credentials');
          }

          // If we get here, credentials are valid
          const userRecord = await auth.getUserByEmail(email);
          const userDoc = await db.collection('users').doc(userRecord.uid).get();

          if (!userDoc.exists) {
              throw new Error('User data not found');
          }

          const userData = userDoc.data();

          // Set custom claims if not already set
          if (!userRecord.customClaims || userRecord.customClaims.role !== userData.role) {
              await auth.setCustomUserClaims(userRecord.uid, {
                  role: userData.role,
                  isAdmin: userData.role === ROLES.ADMIN
              });
          }

          // Create custom token
          const customToken = await auth.createCustomToken(userRecord.uid, {
              role: userData.role,
              isAdmin: userData.role === ROLES.ADMIN
          });

          return {
              customToken,
              user: {
                  uid: userRecord.uid,
                  email: userRecord.email,
                  role: userData.role,
                  name: userData.name
              }
          };
      } catch (error) {
          console.error('Sign in error:', error);
          throw new Error('Invalid credentials');
      }
  },
    

  
  // Verify Google sign-in token
  async verifyGoogleToken(idToken) {
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      console.error('Error verifying Google token:', error);
      throw error;
    }
  },

  // Helper to verify email domain
  isCollegeEmail(email) {
    return ALLOWED_DOMAINS.some(domain => email.toLowerCase().endsWith(domain));
  },


  // Process Google sign-in
  async processGoogleSignIn(decodedToken) {
    const { email, name, picture } = decodedToken;
    
    try {
      let userRecord;
      let isNewUser = false;
      
      // Try to get existing user
      try {
        userRecord = await auth.getUserByEmail(email);
      } catch (error) {
        if (error.code === 'auth/user-not-found') {
          isNewUser = true;
          
          // Check if it's a college email
          if (!this.isCollegeEmail(email)) {
            throw new Error('Only college email addresses are allowed');
          }
  
          // Create new user
          userRecord = await auth.createUser({
            email,
            displayName: name,
            photoURL: picture,
            emailVerified: true
          });
  
          // Default role is student for new users
          await auth.setCustomUserClaims(userRecord.uid, { role: ROLES.STUDENT });
          
          // Create user document
          await db.collection('users').doc(userRecord.uid).set({
            email,
            name,
            role: ROLES.STUDENT,
            photoURL: picture,
            isFirstLogin: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        } else {
          throw error;
        }
      }
  
      if (!isNewUser) {
        // Check if user is a staff member by querying Firestore
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          const role = userData.role;
          
          // Update custom claims if needed
          if (!userRecord.customClaims || userRecord.customClaims.role !== role) {
            await auth.setCustomUserClaims(userRecord.uid, { 
              role,
              isAdmin: role === ROLES.ADMIN
            });
          }
        }
      }
  
      // Get user's updated data
      const updatedUser = await auth.getUser(userRecord.uid);
      const userDoc = await db.collection('users').doc(userRecord.uid).get();
      
      return {
        user: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName,
          role: updatedUser.customClaims?.role || ROLES.STUDENT
        },
        userData: userDoc.data()
      };
    } catch (error) {
      console.error('Error in processGoogleSignIn:', error);
      throw error;
    }
  },


  // Update FCM token
  async updateFCMToken(userId, fcmToken) {
    try {
      await db.collection('users').doc(userId).update({
        fcmToken,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error updating FCM token:', error);
      throw error;
    }
  }
};

module.exports = authService;
