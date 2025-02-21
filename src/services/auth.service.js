const { db, auth, admin } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');
const { ALLOWED_DOMAINS } = require('../config/constants');


const authService = {

    // Email/Password Sign In
    async signInWithEmail(email, password) {
      try {
        // First get the user by email
        let userRecord = null;
        try {
          userRecord = await auth.getUserByEmail(email);
        } catch (error) {
          console.error('Error getting user:', error);
          throw new Error('Invalid credentials');
        }
  
        // Get user's Firestore data
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        
        if (!userDoc.exists) {
          throw new Error('User data not found');
        }
  
        const userData = userDoc.data();
  
        // For admin users, verify password stored in Firestore
        if (userData.role === ROLES.ADMIN) {
          if (userData.password !== password) {
            throw new Error('Invalid admin credentials');
          }
        }
  
        // Set custom claims
        await auth.setCustomUserClaims(userRecord.uid, {
          role: userData.role,
          isAdmin: userData.role === ROLES.ADMIN
        });
  
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
