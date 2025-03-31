const router = require('express').Router();
const { verifyAuth, hasRole } = require('../middlewares/auth.middleware');
const { ROLES } = require('../config/roles.config');
const { sendResponse, sendError } = require('../utils/response.util');
const { db } = require('../config/firebase.config');

// Get student data for currently logged-in user
router.get('/my-data', verifyAuth, async (req, res) => {
  try {
    // Check if user exists in Firestore
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    
    // If user doesn't exist in Firestore, create a new record
    if (!userDoc.exists) {
      console.log(`User ${req.user.uid} not found in Firestore, creating new record...`);
      
      // Create basic user record
      await db.collection('users').doc(req.user.uid).set({
        email: req.user.email,
        name: req.user.name || req.user.email.split('@')[0],
        role: ROLES.STUDENT,
        isFirstLogin: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      console.log(`Created new user record for ${req.user.uid}`);
      
      // Refetch user after creation
      userDoc = await db.collection('users').doc(req.user.uid).get();
    }
    
    const userData = userDoc.data();
    
    // If user already has student data, return it
    if (userData.studentData) {
      return sendResponse(res, 200, userData.studentData);
    }
    
    // If user doesn't have student data but has an institutional email,
    // try to find the student data by email
    if (req.user.email && req.user.email.includes('@sithyd.siu.edu.in')) {
      try {
        console.log(`Looking up student data for email: ${req.user.email}`);
        
        // First try: Look for PRN in the email (assuming format like 24070721032@sithyd.siu.edu.in)
        const emailParts = req.user.email.split('@')[0];
        if (emailParts && /^\d+$/.test(emailParts)) {
          const prn = emailParts;
          console.log(`Extracted PRN from email: ${prn}`);
          
          // Try to get student by PRN
          const studentDoc = await db.collection('students').doc(prn).get();
          
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            
            // Link the student data to the user
            await db.collection('users').doc(req.user.uid).update({
              studentPRN: prn,
              studentData,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`Linked student data for PRN ${prn} to user ${req.user.uid}`);
            return sendResponse(res, 200, studentData);
          }
        }
        
        // Second try: Check email-to-PRN index
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
            
            console.log(`Linked student data from email index for ${req.user.email}`);
            return sendResponse(res, 200, studentData);
          }
        }
        
        // Third try: Direct query on students collection
        const studentsSnapshot = await db.collection('students')
          .where('email', '==', req.user.email)
          .limit(1)
          .get();
          
        if (!studentsSnapshot.empty) {
          const studentDoc = studentsSnapshot.docs[0];
          const studentData = studentDoc.data();
          const prn = studentDoc.id;
          
          // Link the student data to the user
          await db.collection('users').doc(req.user.uid).update({
            studentPRN: prn,
            studentData,
            updatedAt: new Date().toISOString()
          });
          
          console.log(`Linked student data from direct query for ${req.user.email}`);
          return sendResponse(res, 200, studentData);
        }
        
        // Fourth try: Scan all students and compare with a normalized email pattern
        const normalizedEmail = req.user.email.toLowerCase().trim();
        const allStudentsSnapshot = await db.collection('students').get();
        
        for (const doc of allStudentsSnapshot.docs) {
          const student = doc.data();
          if (student.email && student.email.toLowerCase().trim() === normalizedEmail) {
            const studentData = student;
            const prn = doc.id;
            
            // Link the student data to the user
            await db.collection('users').doc(req.user.uid).update({
              studentPRN: prn,
              studentData,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`Linked student data after normalization for ${req.user.email}`);
            return sendResponse(res, 200, studentData);
          }
        }
      } catch (err) {
        console.error('Error finding student by email:', err);
      }
      
      // If we got here, no student data was found for this email
      // As a fallback, let's check if the email contains a PRN (like 24070721032) and look it up directly
      const prn = req.user.email.match(/\d+/);
      if (prn && prn[0]) {
        try {
          const possiblePRN = prn[0];
          console.log(`Trying possible PRN extracted from email: ${possiblePRN}`);
          
          const studentDoc = await db.collection('students').doc(possiblePRN).get();
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            
            // Link the student data to the user
            await db.collection('users').doc(req.user.uid).update({
              studentPRN: possiblePRN,
              studentData,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`Linked student data using PRN extracted from email: ${possiblePRN}`);
            return sendResponse(res, 200, studentData);
          }
        } catch (err) {
          console.error(`Error looking up possible PRN ${prn[0]}:`, err);
        }
      }
    }
    
    // If we have email that seems like a PRN@domain
    if (req.user.email) {
      const emailPrefix = req.user.email.split('@')[0];
      // If email prefix looks like a PRN (all digits)
      if (/^\d+$/.test(emailPrefix)) {
        console.log(`Email prefix ${emailPrefix} looks like a PRN, checking...`);
        
        try {
          // Look up this PRN directly in students collection
          const studentDoc = await db.collection('students').doc(emailPrefix).get();
          
          if (studentDoc.exists) {
            const studentData = studentDoc.data();
            
            // Link the student data to the user
            await db.collection('users').doc(req.user.uid).update({
              studentPRN: emailPrefix,
              studentData,
              updatedAt: new Date().toISOString()
            });
            
            console.log(`Linked student data for PRN ${emailPrefix} (from email prefix)`);
            return sendResponse(res, 200, studentData);
          }
        } catch (err) {
          console.error(`Error looking up PRN ${emailPrefix}:`, err);
        }
      }
    }
    
    return sendError(res, 404, 'No student data available for this user');
  } catch (error) {
    console.error('Error getting user student data:', error);
    return sendError(res, 500, error.message || 'Failed to get student data');
  }
});

// Rest of the routes remain the same...
// Get student data by PRN, Link current user to a PRN, Get student by email, etc.

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
