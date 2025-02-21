const router = require('express').Router();
// const multer = require('multer');
const { verifyAuth, hasRole } = require('../middlewares/auth.middleware');
const { outpassValidation } = require('../middlewares/validator.middleware');
const outpassService = require('../services/outpass.service');
const { ROLES } = require('../config/roles.config');
const { sendResponse, sendError } = require('../utils/response.util');
const { validationResult } = require('express-validator');
const { db } = require('../config/firebase.config');
const notificationService = require('../services/notification.service');

// // Configure multer for file upload
// const upload = multer({
//   storage: multer.memoryStorage(),
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) {
//       cb(null, true);
//     } else {
//       cb(new Error('Invalid file type. Only PDF and images are allowed.'));
//     }
//   }
// });

// Validation middleware
const validate = (validations) => {
    return async (req, res, next) => {
      await Promise.all(validations.map(validation => validation.run(req)));
  
      const errors = validationResult(req);
      if (errors.isEmpty()) {
        return next();
      }
  
      return sendError(res, 400, {
        errors: errors.array()
      });
    };
  };

  // Get approval history for staff
router.get('/history', 
verifyAuth, 
hasRole([ROLES.WARDEN, ROLES.DIRECTOR, ROLES.AO]), 
async (req, res) => {
  try {
    console.log('Fetching history for role:', req.user.role);
    const outpasses = await outpassService.getApprovalHistory(req.user.role);
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    console.error('Error in history route:', error);
    return sendError(res, 400, error.message || 'Failed to fetch history');
  }
});

// Create outpass request (students only)
router.post('/', verifyAuth, hasRole([ROLES.STUDENT]), async (req, res) => {
    try {
      // Debug: check if user exists in Firestore
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      console.log(`Creating outpass for user ${req.user.uid}, exists in DB: ${userDoc.exists}`);
      
      if (!userDoc.exists) {
        console.log('User not found in DB, attempting to create...');
        // Try to create the user record if missing
        await db.collection('users').doc(req.user.uid).set({
          email: req.user.email,
          name: req.user.displayName || req.user.email.split('@')[0],
          role: ROLES.STUDENT,
          isFirstLogin: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      
      const outpass = await outpassService.createRequest(req.user.uid, req.body);
      return sendResponse(res, 201, outpass);
    } catch (error) {
      console.error('Error creating outpass:', error);
      return sendError(res, 400, error.message || 'Failed to create outpass');
    }
  });

  // Get pending approvals for staff
router.get('/pending', 
verifyAuth, 
hasRole([ROLES.WARDEN, ROLES.DIRECTOR, ROLES.AO]), 
async (req, res) => {
  try {
    const outpasses = await outpassService.getPendingApprovals(req.user.role);
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    return sendError(res, 400, error);
  }
});


// Process approval/rejection
router.post('/:outpassId/approve', 
  verifyAuth, 
  hasRole([ROLES.WARDEN, ROLES.DIRECTOR, ROLES.AO]), 
  async (req, res) => {
    try {
      const { outpassId } = req.params;
      const { decision, comments } = req.body;
      const result = await outpassService.processApproval(
        outpassId,
        req.user,
        decision,
        comments
      );
      return sendResponse(res, 200, result);
    } catch (error) {
      return sendError(res, 400, error);
    }
  }
);

// Get outpass details
router.get('/:outpassId', verifyAuth, async (req, res) => {
  try {
    const outpass = await outpassService.getOutpass(req.params.outpassId);
    return sendResponse(res, 200, outpass);
  } catch (error) {
    return sendError(res, 400, error);
  }
});

// Get student's outpasses
router.get('/student/:studentId', verifyAuth, async (req, res) => {
  try {
    const outpasses = await outpassService.getStudentOutpasses(req.params.studentId);
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    return sendError(res, 400, error);
  }
});

// Get pending approvals for role
router.get('/pending/:role', verifyAuth, async (req, res) => {
  try {
    const outpasses = await outpassService.getPendingApprovals(req.params.role);
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    return sendError(res, 400, error);
  }
});







router.get('/status/:outpassId', verifyAuth, async (req, res) => {
    try {
      const { outpassId } = req.params;
      const outpass = await outpassService.getOutpass(outpassId);
      
      // Check if user is authorized to view this outpass
      if (req.user.role === ROLES.STUDENT && outpass.studentId !== req.user.uid) {
        return sendError(res, 403, 'You are not authorized to view this outpass');
      }
      
      // Generate status history
      const statusHistory = [];
      const { approvals } = outpass;
      
      // Add warden approval info
      if (approvals.warden.timestamp) {
        statusHistory.push({
          role: 'Warden',
          status: approvals.warden.status,
          timestamp: approvals.warden.timestamp,
          approverName: approvals.warden.approverName,
          comments: approvals.warden.comments
        });
      }
      
      // Add director approval info
      if (approvals.director.timestamp) {
        statusHistory.push({
          role: 'Director',
          status: approvals.director.status, 
          timestamp: approvals.director.timestamp,
          approverName: approvals.director.approverName,
          comments: approvals.director.comments
        });
      }
      
      // Add AO approval info
      if (approvals.ao.timestamp) {
        statusHistory.push({
          role: 'Academic Officer',
          status: approvals.ao.status,
          timestamp: approvals.ao.timestamp,
          approverName: approvals.ao.approverName,
          comments: approvals.ao.comments
        });
      }
      
      // Determine current level in approval chain
      let currentLevel;
      switch(outpass.currentStatus) {
        case 'pending_warden':
          currentLevel = 'Warden';
          break;
        case 'pending_director':
          currentLevel = 'Director';
          break;
        case 'pending_ao':
          currentLevel = 'Academic Officer';
          break;
        case 'approved':
          currentLevel = 'Completed';
          break;
        case 'rejected':
          currentLevel = 'Rejected';
          break;
        default:
          currentLevel = 'Unknown';
      }
      
      return sendResponse(res, 200, {
        outpassId,
        currentStatus: outpass.currentStatus,
        currentLevel,
        isRejected: outpass.currentStatus === 'rejected',
        isApproved: outpass.currentStatus === 'approved',
        isPending: outpass.currentStatus.startsWith('pending_'),
        statusHistory,
        createdAt: outpass.createdAt,
        fromDate: outpass.fromDate,
        toDate: outpass.toDate
      });
    } catch (error) {
      console.error('Error getting outpass status:', error);
      return sendError(res, 400, error.message || 'Failed to get outpass status');
    }
  });

  // Gate staff can see all approved outpasses
  router.get('/gate/approved', 
  verifyAuth, 
  hasRole([ROLES.STAFF]), 
  async (req, res) => {
    try {
      const outpassesSnapshot = await db.collection('outpasses')
        .where('currentStatus', '==', 'approved')
        .where('isUsed', '==', false)
        .orderBy('fromDate', 'asc')
        .get();

      const outpasses = [];
      outpassesSnapshot.forEach(doc => {
        outpasses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return sendResponse(res, 200, outpasses);
    } catch (error) {
      console.error('Error getting approved outpasses:', error);
      return sendError(res, 400, error.message || 'Failed to get approved outpasses');
    }
});

// Gate staff can mark outpass as used
router.put('/gate/:outpassId/mark-used',
  verifyAuth,
  hasRole([ROLES.STAFF]),
  async (req, res) => {
    try {
      const { outpassId } = req.params;
      const { action } = req.body; // 'check_out' or 'check_in'
      
      if (!['check_out', 'check_in'].includes(action)) {
        return sendError(res, 400, 'Invalid action. Must be "check_out" or "check_in"');
      }
      
      const outpassRef = db.collection('outpasses').doc(outpassId);
      const outpass = await outpassRef.get();
      
      if (!outpass.exists) {
        return sendError(res, 404, 'Outpass not found');
      }
      
      if (outpass.data().currentStatus !== 'approved') {
        return sendError(res, 400, 'Outpass is not approved');
      }
      
      // Update based on action
      if (action === 'check_out') {
        await outpassRef.update({
          checkedOut: true,
          checkOutTime: new Date().toISOString(),
          checkOutBy: req.user.uid,
          checkOutStaffName: req.user.name
        });
      } else { // check_in
        await outpassRef.update({
          isUsed: true,
          checkInTime: new Date().toISOString(),
          checkInBy: req.user.uid,
          checkInStaffName: req.user.name
        });
        
        // Notify student
        await notificationService.notifyUser(
          outpass.data().studentId,
          'Check-in Complete',
          'You have been checked back in. Your outpass is now complete.'
        );
      }

      return sendResponse(res, 200, {
        message: action === 'check_out' ? 'Student checked out' : 'Student checked in',
        outpassId
      });
    } catch (error) {
      console.error('Error marking outpass as used:', error);
      return sendError(res, 400, error.message || 'Failed to mark outpass as used');
    }
});

router.get('/gate/completed', 
  verifyAuth, 
  hasRole([ROLES.STAFF]), 
  async (req, res) => {
    try {
      const outpassesSnapshot = await db.collection('outpasses')
        .where('currentStatus', '==', 'approved')
        .where('isUsed', '==', true)  // Only get completed ones
        .where('checkedOut', '==', true)  // Must have been checked out
        .orderBy('checkInTime', 'desc')  // Most recent check-ins first
        .get();

      const outpasses = [];
      outpassesSnapshot.forEach(doc => {
        const data = doc.data();
        outpasses.push({
          id: doc.id,
          studentName: data.studentName,
          studentPRN: data.studentPRN,
          leaveType: data.leaveType,
          fromDate: data.fromDate,
          toDate: data.toDate,
          destination: data.destination,
          // Check out details
          checkOutTime: data.checkOutTime,
          checkOutStaffName: data.checkOutStaffName,
          // Check in details
          checkInTime: data.checkInTime,
          checkInStaffName: data.checkInStaffName,
          // Include original approval chain
          approvals: data.approvals
        });
      });

      return sendResponse(res, 200, outpasses);
    } catch (error) {
      console.error('Error getting completed outpasses:', error);
      return sendError(res, 400, error.message || 'Failed to get completed outpasses');
    }
});




module.exports = router;
