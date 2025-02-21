const { db, auth } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');

const adminService = {
  // Create initial admin user
  async createInitialAdmin(email, password) {
    try {
      // Check if admin exists
      const adminUsers = await db.collection('users')
        .where('role', '==', ROLES.ADMIN)
        .limit(1)
        .get();
  
      if (!adminUsers.empty) {
        console.log('Admin already exists, skipping initial admin creation');
        return null; // Return null instead of throwing error
      }
  
      // Rest of the function remains the same...
      const userRecord = await auth.createUser({
        email,
        password,
        emailVerified: true
      });
  
      await auth.setCustomUserClaims(userRecord.uid, {
        role: ROLES.ADMIN,
        isAdmin: true
      });
  
      await db.collection('users').doc(userRecord.uid).set({
        email,
        role: ROLES.ADMIN,
        name: 'System Admin',
        isFirstLogin: false,
        password: password,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
  
      return {
        uid: userRecord.uid,
        email: userRecord.email,
        role: ROLES.ADMIN
      };
    } catch (error) {
      console.error('Error creating initial admin:', error);
      throw error;
    }
  },

  // Create new user with role
  async createUser(userData, role) {
    try {
      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8);

      // Create user in Firebase Auth
      const userRecord = await auth.createUser({
        email: userData.email,
        password: tempPassword,
        displayName: userData.name,
        emailVerified: false
      });

      // Set role in custom claims
      await auth.setCustomUserClaims(userRecord.uid, { role });

      // Create user document
      await db.collection('users').doc(userRecord.uid).set({
        ...userData,
        role,
        isFirstLogin: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return {
        userRecord,
        tempPassword
      };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  },

  // Update user role
  async updateUserRole(uid, newRole) {
    try {
      // Update custom claims
      await auth.setCustomUserClaims(uid, { role: newRole });

      // Update Firestore document
      await db.collection('users').doc(uid).update({
        role: newRole,
        updatedAt: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
  },
  async getAllUsers() {
    try {
      const usersSnapshot = await db.collection('users').get();
      const users = [];
      
      usersSnapshot.forEach(doc => {
        users.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return users;
    } catch (error) {
      console.error('Error getting all users:', error);
      throw error;
    }
  }
  
};

module.exports = adminService;
