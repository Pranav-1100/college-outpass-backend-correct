const router = require('express').Router();
const { verifyAuth, hasRole } = require('../middlewares/auth.middleware');
const { ROLES } = require('../config/roles.config');
const { sendResponse, sendError } = require('../utils/response.util');
const { db } = require('../config/firebase.config');
const studentService = require('../services/student.service');
const outpassService = require('../services/outpass.service');

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
      const newUserDoc = await db.collection('users').doc(req.user.uid).get();
      userData = newUserDoc.data();
    } else {
      userData = userDoc.data();
    }
    
    // If user already has student data, return it
    if (userData.studentData) {
      return sendResponse(res, 200, userData.studentData);
    }
    
    // Try to auto-link student data using the student service
    try {
      const linkResult = await studentService.autoLinkUserToStudent(req.user.uid, req.user.email);
      if (linkResult.success) {
        return sendResponse(res, 200, linkResult.studentData);
      }
    } catch (linkError) {
      console.error('Error auto-linking student:', linkError);
    }
    
    // If auto-linking failed, try the traditional approaches
    
    // Try to find student data by email domain
    if (req.user.email) {
      // Check for SITHYD domain
      if (req.user.email.includes('@sithyd.siu.edu.in')) {
        try {
          console.log(`Looking up SITHYD student data for email: ${req.user.email}`);
          
          // Try to extract PRN from email
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
              
              console.log(`Linked SITHYD student data for PRN ${prn} to user ${req.user.uid}`);
              return sendResponse(res, 200, studentData);
            }
          }
        } catch (err) {
          console.error('Error finding SITHYD student by email:', err);
        }
      }
      
      // Check for SCMS domain
      else if (req.user.email.includes('@scmshyd.siu.edu.in')) {
        try {
          console.log(`Looking up SCMS student data for email: ${req.user.email}`);
          
          // Try to extract PRN from email
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
              
              console.log(`Linked SCMS student data for PRN ${prn} to user ${req.user.uid}`);
              return sendResponse(res, 200, studentData);
            }
          }
        } catch (err) {
          console.error('Error finding SCMS student by email:', err);
        }
      }
    }
    
    // Fall back to the original complex lookup logic
    try {
      // Check email-to-PRN index
      if (req.user.email) {
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
        
        // Direct query on students collection
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
      }
    } catch (err) {
      console.error('Error in fallback student lookup:', err);
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
    
    // Check if user is a warden for this student's hostel
    let isWardenForStudent = false;
    
    if (req.user.role === ROLES.WARDEN) {
      const student = await studentService.getStudentByPRN(prn);
      if (student && student.hostel && student.hostel.wardenName === userData.name) {
        isWardenForStudent = true;
      }
    }
    
    // Check if user is OS for this student's school
    let isOsForStudent = false;
    
    if (req.user.role === ROLES.OS && userData.email) {
      const student = await studentService.getStudentByPRN(prn);
      if (student) {
        if (userData.email === 'ao@sithyd.siu.edu.in' && 
            student.school && student.school.includes('TECHNOLOGY')) {
          isOsForStudent = true;
        } else if (userData.email === 'os@scmshyd.siu.edu.in' && 
                 student.school && student.school.includes('MANAGEMENT')) {
          isOsForStudent = true;
        }
      }
    }
    
    // Only allow admin, campus admin, student's own data, their warden, or their OS
    if (!isAdmin && !isOwnPRN && req.user.role !== ROLES.CAMPUS_ADMIN && 
        !isWardenForStudent && !isOsForStudent) {
      return sendError(res, 403, 'Access denied');
    }
    
    // Use student service to get data
    const student = await studentService.getStudentByPRN(prn);
    
    if (!student) {
      return sendError(res, 404, 'Student not found');
    }
    
    return sendResponse(res, 200, student);
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
    
    const result = await studentService.linkStudentToUser(req.user.uid, prn);
    
    if (!result.success) {
      return sendError(res, 404, result.message || 'Failed to link student');
    }
    
    return sendResponse(res, 200, {
      message: result.message,
      studentData: result.studentData
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
    
    // Use student service to get by email
    const student = await studentService.getStudentByEmail(email);
    
    if (!student) {
      return sendError(res, 404, 'No student found with this email');
    }
    
    // For wardens, check if they are assigned to this student's hostel
    if (req.user.role === ROLES.WARDEN) {
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      
      if (student.hostel && student.hostel.wardenName !== userData.name) {
        return sendError(res, 403, 'You are not authorized to view this student');
      }
    }
    
    // For OS, check if they are assigned to this student's school
    if (req.user.role === ROLES.OS) {
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      
      let authorized = false;
      
      if (userData.email === 'ao@sithyd.siu.edu.in' && 
          student.school && student.school.includes('TECHNOLOGY')) {
        authorized = true;
      } else if (userData.email === 'os@scmshyd.siu.edu.in' && 
               student.school && student.school.includes('MANAGEMENT')) {
        authorized = true;
      } else if (req.user.role === ROLES.ADMIN || req.user.role === ROLES.CAMPUS_ADMIN) {
        authorized = true;
      }
      
      if (!authorized) {
        return sendError(res, 403, 'You are not authorized to view this student');
      }
    }
    
    return sendResponse(res, 200, student);
  } catch (error) {
    console.error('Error getting student by email:', error);
    return sendError(res, 500, error.message || 'Failed to get student data');
  }
});

// Get all students for a warden (their hostel only)
router.get('/my-hostel', verifyAuth, hasRole([ROLES.WARDEN]), async (req, res) => {
  try {
    // Get warden name
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    const wardenName = userData.name;
    
    if (!wardenName) {
      return sendError(res, 400, 'Warden name not found in your profile');
    }
    
    // Get students assigned to this warden
    const students = await studentService.getStudentsByWarden(wardenName);
    
    return sendResponse(res, 200, students);
  } catch (error) {
    console.error('Error getting hostel students:', error);
    return sendError(res, 500, error.message || 'Failed to get hostel students');
  }
});

// Get all students for a specific hostel (admin/campus admin only)
router.get('/hostel/:hostelName', verifyAuth, hasRole([ROLES.ADMIN, ROLES.CAMPUS_ADMIN]), async (req, res) => {
  try {
    const { hostelName } = req.params;
    
    // Get students for this hostel
    const students = await studentService.getStudentsByHostel(hostelName);
    
    return sendResponse(res, 200, students);
  } catch (error) {
    console.error('Error getting hostel students:', error);
    return sendError(res, 500, error.message || 'Failed to get hostel students');
  }
});

// Get all students for OS (their school only)
router.get('/my-school', verifyAuth, hasRole([ROLES.OS]), async (req, res) => {
  try {
    // Determine which school based on OS email
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    let schoolName;
    
    if (userData.email === 'ao@sithyd.siu.edu.in') {
      schoolName = 'Symbiosis Institute of Technology(SIT), Hyderabad';
    } else if (userData.email === 'os@scmshyd.siu.edu.in') {
      schoolName = 'SYMBIOSIS CENTRE FOR MANAGEMENT STUDIES, HYDERABAD';
    } else {
      return sendError(res, 400, 'School not identified for your account');
    }
    
    // Get students for this school
    const students = await studentService.getStudentsBySchool(schoolName);
    
    return sendResponse(res, 200, students);
  } catch (error) {
    console.error('Error getting school students:', error);
    return sendError(res, 500, error.message || 'Failed to get school students');
  }
});

// Get all students for a specific school (admin/campus admin only)
router.get('/school/:schoolName', verifyAuth, hasRole([ROLES.ADMIN, ROLES.CAMPUS_ADMIN]), async (req, res) => {
  try {
    const { schoolName } = req.params;
    
    // Get students for this school
    const students = await studentService.getStudentsBySchool(schoolName);
    
    return sendResponse(res, 200, students);
  } catch (error) {
    console.error('Error getting school students:', error);
    return sendError(res, 500, error.message || 'Failed to get school students');
  }
});

// Get pending outpasses for warden's hostel
router.get('/my-hostel/outpasses/pending', verifyAuth, hasRole([ROLES.WARDEN]), async (req, res) => {
  try {
    // Get warden name
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    const wardenName = userData.name;
    
    if (!wardenName) {
      return sendError(res, 400, 'Warden name not found in your profile');
    }
    
    // Get pending outpasses for this warden's hostel
    const outpasses = await outpassService.getPendingApprovals(ROLES.WARDEN, {name: wardenName});
    
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    console.error('Error getting hostel pending outpasses:', error);
    return sendError(res, 500, error.message || 'Failed to get hostel pending outpasses');
  }
});

// Get all outpasses for warden's hostel
router.get('/my-hostel/outpasses', verifyAuth, hasRole([ROLES.WARDEN]), async (req, res) => {
  try {
    // Get warden name
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    const wardenName = userData.name;
    
    if (!wardenName) {
      return sendError(res, 400, 'Warden name not found in your profile');
    }
    
    // Get all outpasses for this warden's hostel
    const outpasses = await outpassService.getWardenHostelOutpasses(wardenName);
    
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    console.error('Error getting all hostel outpasses:', error);
    return sendError(res, 500, error.message || 'Failed to get all hostel outpasses');
  }
});

// Get approval history for warden
router.get('/my-hostel/approval-history', verifyAuth, hasRole([ROLES.WARDEN]), async (req, res) => {
  try {
    // Get warden name
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    const wardenName = userData.name;
    
    if (!wardenName) {
      return sendError(res, 400, 'Warden name not found in your profile');
    }
    
    // Get approval history for this warden
    const outpasses = await outpassService.getApprovalHistory(ROLES.WARDEN, {name: wardenName});
    
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    console.error('Error getting warden approval history:', error);
    return sendError(res, 500, error.message || 'Failed to get warden approval history');
  }
});

// Get pending outpasses for OS's school
router.get('/my-school/outpasses/pending', verifyAuth, hasRole([ROLES.OS]), async (req, res) => {
  try {
    // Determine which school based on OS email
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    const email = userData.email;
    
    // Get pending outpasses for this OS's school
    const outpasses = await outpassService.getPendingApprovals(ROLES.OS, {email});
    
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    console.error('Error getting school pending outpasses:', error);
    return sendError(res, 500, error.message || 'Failed to get school pending outpasses');
  }
});

// Get all outpasses for OS's school
router.get('/my-school/outpasses', verifyAuth, hasRole([ROLES.OS]), async (req, res) => {
  try {
    // Determine which school based on OS email
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    let schoolName;
    
    if (userData.email === 'ao@sithyd.siu.edu.in') {
      schoolName = 'Symbiosis Institute of Technology(SIT), Hyderabad';
    } else if (userData.email === 'os@scmshyd.siu.edu.in') {
      schoolName = 'SYMBIOSIS CENTRE FOR MANAGEMENT STUDIES, HYDERABAD';
    } else {
      return sendError(res, 400, 'School not identified for your account');
    }
    
    // Get all outpasses for this school
    const outpasses = await outpassService.getSchoolOutpasses(schoolName);
    
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    console.error('Error getting all school outpasses:', error);
    return sendError(res, 500, error.message || 'Failed to get all school outpasses');
  }
});

// Get approval history for OS
router.get('/my-school/approval-history', verifyAuth, hasRole([ROLES.OS]), async (req, res) => {
  try {
    // Determine which school based on OS email
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    if (!userDoc.exists) {
      return sendError(res, 404, 'User profile not found');
    }
    
    const userData = userDoc.data();
    const email = userData.email;
    
    // Get approval history for this OS
    const outpasses = await outpassService.getApprovalHistory(ROLES.OS, {email});
    
    return sendResponse(res, 200, outpasses);
  } catch (error) {
    console.error('Error getting OS approval history:', error);
    return sendError(res, 500, error.message || 'Failed to get OS approval history');
  }
});

// Update student hostel information (admin only)
router.put('/hostel/:prn', verifyAuth, hasRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const { prn } = req.params;
    const hostelData = req.body;
    
    if (!prn) {
      return sendError(res, 400, 'PRN is required');
    }
    
    if (!hostelData || !hostelData.name) {
      return sendError(res, 400, 'Hostel information is required');
    }
    
    const result = await studentService.updateStudentHostel(prn, hostelData);
    
    if (!result.success) {
      return sendError(res, 404, result.message || 'Failed to update hostel information');
    }
    
    return sendResponse(res, 200, {
      message: result.message
    });
  } catch (error) {
    console.error('Error updating student hostel:', error);
    return sendError(res, 500, error.message || 'Failed to update hostel information');
  }
});

// Get all hostel wardens (admin/campus admin only)
router.get('/wardens', verifyAuth, hasRole([ROLES.ADMIN, ROLES.CAMPUS_ADMIN]), async (req, res) => {
  try {
    // Find all users with warden role
    const wardenSnapshot = await db.collection('users')
      .where('role', '==', ROLES.WARDEN)
      .get();
    
    const wardens = [];
    wardenSnapshot.forEach(doc => {
      const userData = doc.data();
      wardens.push({
        id: doc.id,
        name: userData.name,
        email: userData.email
      });
    });
    
    return sendResponse(res, 200, wardens);
  } catch (error) {
    console.error('Error getting wardens:', error);
    return sendError(res, 500, error.message || 'Failed to get wardens');
  }
});

// Get all hostels with student counts (admin/campus admin only)
router.get('/hostels/summary', verifyAuth, hasRole([ROLES.ADMIN, ROLES.CAMPUS_ADMIN]), async (req, res) => {
  try {
    // Get all students
    const studentsSnapshot = await db.collection('students').get();
    
    // Group by hostel
    const hostelMap = {};
    const wardenMap = {};
    
    studentsSnapshot.forEach(doc => {
      const student = doc.data();
      if (student.hostel && student.hostel.name) {
        const hostelName = student.hostel.name;
        
        if (!hostelMap[hostelName]) {
          hostelMap[hostelName] = {
            name: hostelName,
            count: 0,
            maleCount: 0,
            femaleCount: 0,
            wardenName: student.hostel.wardenName || 'Not Assigned',
            wardenContact: student.hostel.wardenContact || ''
          };
          
          // Track wardens
          if (student.hostel.wardenName) {
            wardenMap[student.hostel.wardenName] = {
              name: student.hostel.wardenName,
              contact: student.hostel.wardenContact || '',
              hostelName: hostelName,
              studentCount: 0
            };
          }
        }
        
        hostelMap[hostelName].count++;
        
        if (student.gender && student.gender.toUpperCase() === 'FEMALE') {
          hostelMap[hostelName].femaleCount++;
        } else {
          hostelMap[hostelName].maleCount++;
        }
        
        // Update warden student count
        if (student.hostel.wardenName && wardenMap[student.hostel.wardenName]) {
          wardenMap[student.hostel.wardenName].studentCount++;
        }
      }
    });
    
    // Convert to arrays
    const hostels = Object.values(hostelMap);
    const wardens = Object.values(wardenMap);
    
    return sendResponse(res, 200, {
      hostels,
      wardens,
      totalStudents: studentsSnapshot.size
    });
  } catch (error) {
    console.error('Error getting hostel summary:', error);
    return sendError(res, 500, error.message || 'Failed to get hostel summary');
  }
});

// Get all schools with student counts (admin/campus admin only)
router.get('/schools/summary', verifyAuth, hasRole([ROLES.ADMIN, ROLES.CAMPUS_ADMIN]), async (req, res) => {
  try {
    // Get all students
    const studentsSnapshot = await db.collection('students').get();
    
    // Group by school
    const schoolMap = {};
    
    studentsSnapshot.forEach(doc => {
      const student = doc.data();
      if (student.school) {
        const schoolName = student.school;
        
        if (!schoolMap[schoolName]) {
          schoolMap[schoolName] = {
            name: schoolName,
            count: 0,
            maleCount: 0,
            femaleCount: 0
          };
        }
        
        schoolMap[schoolName].count++;
        
        if (student.gender && student.gender.toUpperCase() === 'FEMALE') {
          schoolMap[schoolName].femaleCount++;
        } else {
          schoolMap[schoolName].maleCount++;
        }
      }
    });
    
    // Convert to array
    const schools = Object.values(schoolMap);
    
    return sendResponse(res, 200, {
      schools,
      totalStudents: studentsSnapshot.size
    });
  } catch (error) {
    console.error('Error getting school summary:', error);
    return sendError(res, 500, error.message || 'Failed to get school summary');
  }
});

module.exports = router;
