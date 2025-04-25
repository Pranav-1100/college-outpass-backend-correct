// src/services/student.service.js
const { db, admin } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');

/**
 * Enhanced student service with support for hostel, warden, and school information
 */
const studentService = {
  /**
   * Get student by PRN
   */
  async getStudentByPRN(prn) {
    try {
      const studentDoc = await db.collection('students').doc(prn).get();
      
      if (!studentDoc.exists) {
        return null;
      }
      
      return {
        id: studentDoc.id,
        ...studentDoc.data()
      };
    } catch (error) {
      console.error(`Error getting student by PRN ${prn}:`, error);
      throw error;
    }
  },
  
  /**
   * Get student by email
   */
  async getStudentByEmail(email) {
    try {
      // First check the email index
      const emailDoc = await db.collection('emailToPRN').doc(email).get();
      
      if (emailDoc.exists) {
        const { prn } = emailDoc.data();
        return this.getStudentByPRN(prn);
      }
      
      // Try direct query if index doesn't exist
      const studentsQuery = await db.collection('students')
        .where('email', '==', email)
        .limit(1)
        .get();
        
      if (studentsQuery.empty) {
        return null;
      }
      
      // Return the student data
      const studentDoc = studentsQuery.docs[0];
      return {
        id: studentDoc.id,
        ...studentDoc.data()
      };
    } catch (error) {
      console.error(`Error getting student by email ${email}:`, error);
      throw error;
    }
  },
  
  /**
   * Link a student record to a user profile
   */
  async linkStudentToUser(userId, prn) {
    try {
      const student = await this.getStudentByPRN(prn);
      
      if (!student) {
        return {
          success: false,
          message: 'Student not found with this PRN'
        };
      }
      
      // Update user document with student information
      await db.collection('users').doc(userId).update({
        studentPRN: prn,
        studentData: student,
        name: student.name || '',
        role: ROLES.STUDENT,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return {
        success: true,
        message: 'Student data linked successfully',
        studentData: student
      };
    } catch (error) {
      console.error(`Error linking student ${prn} to user ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Auto-link a user to student record based on email
   */
  async autoLinkUserToStudent(userId, email) {
    try {
      console.log(`Attempting to auto-link user ${userId} with email ${email}`);
      
      // Get user profile
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return {
          success: false,
          message: 'User not found'
        };
      }
      
      // If already linked, do nothing
      const userData = userDoc.data();
      if (userData.studentPRN) {
        return {
          success: true,
          message: 'User already linked to a student record',
          studentPRN: userData.studentPRN
        };
      }
      
      // Try to find student by email
      const student = await this.getStudentByEmail(email);
      
      if (!student) {
        // Try the naive approach of extracting PRN from email
        if (email && email.includes('@')) {
          const emailPrefix = email.split('@')[0];
          
          // If email prefix looks like a PRN (all digits)
          if (/^\d+$/.test(emailPrefix)) {
            const studentByPRN = await this.getStudentByPRN(emailPrefix);
            
            if (studentByPRN) {
              // Link student to user
              return this.linkStudentToUser(userId, emailPrefix);
            }
          }
        }
        
        return {
          success: false,
          message: 'No matching student record found for this email'
        };
      }
      
      // Link student to user
      return this.linkStudentToUser(userId, student.id);
    } catch (error) {
      console.error(`Error auto-linking user ${userId} with email ${email}:`, error);
      throw error;
    }
  },
  
  /**
   * Get all students by school
   */
  async getStudentsBySchool(school) {
    try {
      const studentsSnapshot = await db.collection('students')
        .where('school', '==', school)
        .get();
      
      const students = [];
      studentsSnapshot.forEach(doc => {
        students.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return students;
    } catch (error) {
      console.error(`Error getting students by school ${school}:`, error);
      throw error;
    }
  },
  
  /**
   * Get all students by hostel
   */
  async getStudentsByHostel(hostelName) {
    try {
      const studentsSnapshot = await db.collection('students')
        .where('hostel.name', '==', hostelName)
        .get();
      
      const students = [];
      studentsSnapshot.forEach(doc => {
        students.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return students;
    } catch (error) {
      console.error(`Error getting students by hostel ${hostelName}:`, error);
      throw error;
    }
  },
  
  /**
   * Get all students by warden
   */
  async getStudentsByWarden(wardenName) {
    try {
      const studentsSnapshot = await db.collection('students')
        .where('hostel.wardenName', '==', wardenName)
        .get();
      
      const students = [];
      studentsSnapshot.forEach(doc => {
        students.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return students;
    } catch (error) {
      console.error(`Error getting students by warden ${wardenName}:`, error);
      throw error;
    }
  },
  
  /**
   * Update student hostel information
   */
  async updateStudentHostel(prn, hostelData) {
    try {
      const studentRef = db.collection('students').doc(prn);
      const studentDoc = await studentRef.get();
      
      if (!studentDoc.exists) {
        return {
          success: false,
          message: 'Student not found'
        };
      }
      
      await studentRef.update({
        hostel: hostelData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Also update any linked user records
      const usersSnapshot = await db.collection('users')
        .where('studentPRN', '==', prn)
        .get();
      
      if (!usersSnapshot.empty) {
        const batch = db.batch();
        
        usersSnapshot.forEach(doc => {
          // Get the full current student data
          const updatedStudentDoc = studentRef.get();
          
          // Update the user's studentData field
          batch.update(doc.ref, {
            'studentData.hostel': hostelData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        });
        
        await batch.commit();
      }
      
      return {
        success: true,
        message: 'Student hostel information updated successfully'
      };
    } catch (error) {
      console.error(`Error updating hostel for student ${prn}:`, error);
      throw error;
    }
  }
};

module.exports = studentService;