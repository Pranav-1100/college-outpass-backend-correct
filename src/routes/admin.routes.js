const router = require('express').Router();
const { verifyAuth, isAdmin } = require('../middlewares/auth.middleware');
const adminService = require('../services/admin.service');
const { validate, userValidation } = require('../middlewares/validator.middleware');
const { sendResponse, sendError } = require('../utils/response.util');

// Get all users
router.get('/users', verifyAuth, isAdmin, async (req, res) => {
  try {
    const users = await adminService.getAllUsers();
    return sendResponse(res, 200, users);
  } catch (error) {
    return sendError(res, 400, error);
  }
});

// Create new staff user
router.post('/users', 
  verifyAuth, 
  isAdmin, 
  validate(userValidation),
  async (req, res) => {
    try {
      const result = await adminService.createUser(req.body);
      return sendResponse(res, 201, result);
    } catch (error) {
      return sendError(res, 400, error);
    }
});

// Update user role
router.put('/users/:userId/role',
  verifyAuth,
  isAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      await adminService.updateUserRole(userId, role);
      return sendResponse(res, 200, null, 'Role updated successfully');
    } catch (error) {
      return sendError(res, 400, error);
    }
});

router.post('/setup-admin', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Check if admin already exists
      const adminUsers = await db.collection('users')
        .where('role', '==', ROLES.ADMIN)
        .limit(1)
        .get();
  
      if (!adminUsers.empty) {
        return sendError(res, 400, 'Admin already exists');
      }
  
      const result = await adminService.createInitialAdmin(email, password);
      return sendResponse(res, 201, {
        message: 'Admin created successfully',
        user: result
      });
    } catch (error) {
      return sendError(res, 400, error);
    }
  });
  

module.exports = router;
