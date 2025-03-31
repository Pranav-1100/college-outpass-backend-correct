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

  // Try to find student data by email
  async findStudentByEmail(email) {
    try {
      // First check the email-to-prn index
      const emailRef = db.collection('emailToPRN').doc(email);
      const emailDoc = await emailRef.get();
      
      if (emailDoc.exists) {
        const { prn } = emailDoc.data();
        
        // Now get the full student record
        const studentRef = db.collection('students').doc(prn);
        const studentDoc = await studentRef.get();
        
        if (studentDoc.exists) {
          return {
            ...studentDoc.data(),
            prn
          };
        }
      }
      
      // If not found by index, try direct query
      const studentsRef = db.collection('students');
      const snapshot = await studentsRef.where('email', '==', email).limit(1).get();
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return {
          ...doc.data(),
          prn: doc.id
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error finding student by email:', error);
      return null;
    }
  },

  // Process Google sign-in
  async processGoogleSignIn(decodedToken) {
    const { email, name, picture } = decodedToken;
    
    try {
      let userRecord;
      let isNewUser = false;
      let studentData = null;
      
      // Check for student data if it's a college email
      if (this.isCollegeEmail(email)) {
        studentData = await this.findStudentByEmail(email);
        console.log(`Student data for ${email}:`, studentData ? 'FOUND' : 'NOT FOUND');
      }
      
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
          
          // Create user document with student data if available
          const userData = {
            email,
            name: studentData ? studentData.name : name,
            role: ROLES.STUDENT,
            photoURL: picture,
            isFirstLogin: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          // Add student data if found
          if (studentData) {
            userData.studentPRN = studentData.prn;
            userData.studentData = studentData;
          }
          
          await db.collection('users').doc(userRecord.uid).set(userData);
        } else {
          throw error;
        }
      }
  
      if (!isNewUser) {
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          
          // If we found student data but the user doesn't have it linked yet, update the user
          if (studentData && !userData.studentPRN) {
            await db.collection('users').doc(userRecord.uid).update({
              studentPRN: studentData.prn,
              studentData: studentData,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`Linked student data to existing user ${userRecord.uid}`);
          }
          
          // Update custom claims if needed
          if (!userRecord.customClaims || userRecord.customClaims.role !== userData.role) {
            await auth.setCustomUserClaims(userRecord.uid, { 
              role: userData.role,
              isAdmin: userData.role === ROLES.ADMIN
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
