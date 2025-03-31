const router = require('express').Router();
const { verifyAuth, hasRole } = require('../middlewares/auth.middleware');
const { ROLES } = require('../config/roles.config');
const { sendResponse, sendError } = require('../utils/response.util');
const { db } = require('../config/firebase.config');

// Get student data for currently logged-in user
router.get('/my-data', verifyAuth, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    
    if (!userDoc.exists) {
      return sendError(res, 404, 'User not found');
    }
    
    const userData = userDoc.data();
    
    // If user has student data, return it
    if (userData.studentData) {
      return sendResponse(res, 200, userData.studentData);
    }
    
    // If user doesn't have student data but has an institutional email,
    // try to find the student data by email
    if (req.user.email && req.user.email.endsWith('@sithyd.siu.edu.in')) {
      try {
        // Check email-to-PRN index first
        const emailRef = db.collection('emailToPRN').doc(req.user.email);
        const emailDoc = await emailRef.get();
        
        if (emailDoc.exists) {
          const { prn } = emailDoc.data();
          
          // Get student data by PRN
          const studentRef = db.collection('students').doc(prn);
          const studentDoc = await studentRef.get();
          
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            
            // Link the student data to the user
            await db.collection('users').doc(req.user.uid).update({
              studentPRN: prn,
              studentData,
              updatedAt: new Date().toISOString()
            });
            
            return sendResponse(res, 200, studentData);
          }
        }
        
        // If not found in index, try direct query
        const studentsSnapshot = await db.collection('students')
          .where('email', '==', req.user.email)
          .limit(1)
          .get();
          
        if (!studentsSnapshot.empty) {
          const studentDoc = studentsSnapshot.docs[0];
          const studentData = studentDoc.data();
          
          // Link the student data to the user
          await db.collection('users').doc(req.user.uid).update({
            studentPRN: studentDoc.id,
            studentData,
            updatedAt: new Date().toISOString()
          });
          
          return sendResponse(res, 200, studentData);
        }
      } catch (err) {
        console.error('Error finding student by email:', err);
      }
    }
    
    return sendError(res, 404, 'No student data available for this user');
  } catch (error) {
    console.error('Error getting user student data:', error);
    return sendError(res, 500, error.message || 'Failed to get student data');
  }
});

// Get student data by PRN
router.get('/prn/:prn', verifyAuth, async (req, res) => {
  try {
    const { prn } = req.params;
    
    // Check if user is admin or has the PRN being requested
    const isAdmin = req.user.role === ROLES.ADMIN;
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const isOwnPRN = userData.studentPRN === prn;
    
    // Only allow admin or student to access their own data
    if (!isAdmin && !isOwnPRN) {
      return sendError(res, 403, 'Access denied');
    }
    
    const studentDoc = await db.collection('students').doc(prn).get();
    
    if (!studentDoc.exists) {
      return sendError(res, 404, 'Student not found');
    }
    
    return sendResponse(res, 200, {
      prn,
      ...studentDoc.data()
    });
  } catch (error) {
    console.error('Error getting student by PRN:', error);
    return sendError(res, 500, error.message || 'Failed to get student data');
  }
});

// Link current user to a PRN (for students)
router.post('/link', verifyAuth, async (req, res) => {
  try {
    const { prn } = req.body;
    
    if (!prn) {
      return sendError(res, 400, 'PRN is required');
    }
    
    const studentDoc = await db.collection('students').doc(prn).get();
    
    if (!studentDoc.exists) {
      return sendError(res, 404, 'Student not found with this PRN');
    }
    
    const studentData = studentDoc.data();
    
    // Link the student data to the user
    await db.collection('users').doc(req.user.uid).update({
      studentPRN: prn,
      studentData,
      role: ROLES.STUDENT,
      updatedAt: new Date().toISOString()
    });
    
    return sendResponse(res, 200, {
      message: 'Student data linked successfully',
      studentData
    });
  } catch (error) {
    console.error('Error linking PRN:', error);
    return sendError(res, 500, error.message || 'Failed to link PRN');
  }
});

// Get student by email (for staff/admin use)
router.get('/email/:email', verifyAuth, hasRole([ROLES.ADMIN, ROLES.WARDEN, ROLES.CAMPUS_ADMIN, ROLES.OS, ROLES.STAFF]), async (req, res) => {
  try {
    const { email } = req.params;
    
    // Check emailToPRN index first
    const emailRef = db.collection('emailToPRN').doc(email);
    const emailDoc = await emailRef.get();
    
    if (emailDoc.exists) {
      const { prn } = emailDoc.data();
      
      // Get student data by PRN
      const studentRef = db.collection('students').doc(prn);
      const studentDoc = await studentRef.get();
      
      if (studentDoc.exists) {
        return sendResponse(res, 200, {
          prn,
          ...studentDoc.data()
        });
      }
    }
    
    // If not found in index, try direct query
    const studentsSnapshot = await db.collection('students')
      .where('email', '==', email)
      .limit(1)
      .get();
      
    if (studentsSnapshot.empty) {
      return sendError(res, 404, 'No student found with this email');
    }
    
    const studentDoc = studentsSnapshot.docs[0];
    return sendResponse(res, 200, {
      prn: studentDoc.id,
      ...studentDoc.data()
    });
  } catch (error) {
    console.error('Error getting student by email:', error);
    return sendError(res, 500, error.message || 'Failed to get student data');
  }
});

module.exports = router;