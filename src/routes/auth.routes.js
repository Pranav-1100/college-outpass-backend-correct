// src/routes/auth.routes.js
const router = require('express').Router();
const { verifyAuth, isAdmin } = require('../middlewares/auth.middleware');
const authService = require('../services/auth.service');
const adminService = require('../services/admin.service');
const { sendResponse, sendError } = require('../utils/response.util');
const { db, auth } = require('../config/firebase.config');

// Test route
router.get('/test', (req, res) => {
    return sendResponse(res, 200, { message: 'Auth route working' });
  });
  
  router.get('/test-auth', verifyAuth, (req, res) => {
    return sendResponse(res, 200, { 
      message: 'Auth working',
      user: req.user
    });
  });
  

router.get('/verify-token', verifyAuth, (req, res) => {
    return sendResponse(res, 200, {
      message: 'Token is valid',
      user: req.user
    });
  });
  

// Setup initial admin
router.post('/setup-admin', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    const result = await adminService.createInitialAdmin(email, password);
    return sendResponse(res, 201, {
      message: 'Admin created successfully',
      user: result
    });
  } catch (error) {
    console.error('Setup admin error:', error);
    return sendError(res, 400, error.message || 'Failed to create admin');
  }
});

// Email/Password sign in
router.post('/signin', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return sendError(res, 400, 'Email and password are required');
      }
  
      const result = await authService.signInWithEmail(email, password);
      
      return sendResponse(res, 200, {
        customToken: result.customToken, // Frontend should exchange this for an ID token
        user: result.user
      });
    } catch (error) {
      console.error('Signin error:', error);
      return sendError(res, 400, 'Invalid credentials');
    }
  });
  
  
// Google Sign-in
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return sendError(res, 400, 'ID token is required');
    }

    const decodedToken = await authService.verifyGoogleToken(idToken);
    const result = await authService.processGoogleSignIn(decodedToken);
    return sendResponse(res, 200, result);
  } catch (error) {
    console.error('Google signin error:', error);
    return sendError(res, 400, error.message || 'Failed to process Google sign-in');
  }
});

// Create new staff/admin user (admin only)
router.post('/create-user', 
  (req, res, next) => {
    console.log('Headers:', req.headers); // Log headers
    next();
  },
  verifyAuth, 
  (req, res, next) => {
    console.log('User after auth:', req.user); // Log user after auth
    next();
  },
  isAdmin,
  async (req, res) => {
    try {
      const { email, role, name, department } = req.body;
      console.log('Creating user with data:', { email, role, name, department });
      const result = await adminService.createUser({ email, name, department }, role);
      return sendResponse(res, 201, result);
    } catch (error) {
      console.error('Create user error:', error);
      return sendError(res, 400, error.message || 'Failed to create user');
    }
});


// Update user role (admin only)
router.put('/role/:uid', verifyAuth, isAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const { role } = req.body;

    if (!role) {
      return sendError(res, 400, 'Role is required');
    }

    await adminService.updateUserRole(uid, role);
    return sendResponse(res, 200, null, 'Role updated successfully');
  } catch (error) {
    console.error('Update role error:', error);
    return sendError(res, 400, error.message || 'Failed to update role');
  }
});

// Update FCM token
router.post('/fcm-token', verifyAuth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return sendError(res, 400, 'FCM token is required');
    }

    await authService.updateFCMToken(req.user.uid, fcmToken);
    return sendResponse(res, 200, null, 'FCM token updated');
  } catch (error) {
    console.error('Update FCM token error:', error);
    return sendError(res, 400, error.message || 'Failed to update FCM token');
  }
});

module.exports = router;