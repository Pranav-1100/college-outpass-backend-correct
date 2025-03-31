// src/services/student-data-import.service.js
const { db, admin } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');
const fs = require('fs');
const csv = require('csv-parser');

const studentDataImportService = {
  /**
   * Import students from CSV file into Firestore
   * @param {string} filePath - Path to CSV file
   */
  async importStudentsFromCSV(filePath) {
    try {
      console.log(`Importing students from CSV file: ${filePath}`);
      
      const results = [];
      
      // Parse CSV file
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });
      
      console.log(`Parsed ${results.length} student records from CSV`);
      
      // Process in batches to avoid Firestore limits
      const batchSize = 500;
      let count = 0;
      let batch = db.batch();
      
      for (const student of results) {
        // Normalize data to handle inconsistent CSV headers
        const prn = student.PRN || student['S. No'] || student.prn;
        
        if (!prn) {
          console.warn('Skipping record without PRN:', student);
          continue;
        }
        
        const studentData = {
          prn,
          name: student.NAME || student['NAME OF THE STUDENT'] || student.name || '',
          branch: student.Branch || student.branch || '',
          email: student['Email ID'] || student.email || '',
          phone: student['MOBILE NUMBER'] || student.phone || '',
          fatherName: student['FATHER NAME'] || student.fatherName || '',
          fatherEmail: student['FATHER EMAIL ID'] || student.fatherEmail || '',
          fatherPhone: student['FATHER MOBILE NUMBER'] || student.fatherPhone || '',
          motherName: student['MOTHER NAME'] || student.motherName || '',
          motherEmail: student['MOTHER EMAIL ID'] || student.motherEmail || '',
          motherPhone: student['MOTHER MOBILE NUMBER'] || student.motherPhone || '',
          importedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Set the student document with PRN as ID
        const docRef = db.collection('students').doc(prn);
        batch.set(docRef, studentData);
        
        count++;
        
        // Commit batch when it reaches batch size
        if (count % batchSize === 0) {
          await batch.commit();
          console.log(`Imported ${count} student records...`);
          batch = db.batch();
        }
      }
      
      // Commit any remaining records
      if (count % batchSize !== 0) {
        await batch.commit();
      }
      
      console.log(`Successfully imported ${count} student records`);
      return count;
    } catch (error) {
      console.error('Error importing students from CSV:', error);
      throw error;
    }
  },
  
  /**
   * Create a database of student emails to PRNs for quick lookup
   */
  async createStudentEmailIndex() {
    try {
      const snapshot = await db.collection('students').get();
      
      if (snapshot.empty) {
        console.log('No student records found');
        return 0;
      }
      
      const batch = db.batch();
      let count = 0;
      
      snapshot.forEach(doc => {
        const student = doc.data();
        
        if (student.email) {
          // Create a document in the emailToPRN collection with email as ID
          const emailDocRef = db.collection('emailToPRN').doc(student.email);
          batch.set(emailDocRef, {
            prn: student.prn,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          count++;
        }
      });
      
      await batch.commit();
      console.log(`Created email index for ${count} students`);
      return count;
    } catch (error) {
      console.error('Error creating student email index:', error);
      throw error;
    }
  },
  
  /**
   * Get student data by email
   * @param {string} email - Student email
   */
  async getStudentByEmail(email) {
    try {
      // First check the email index
      const emailDoc = await db.collection('emailToPRN').doc(email).get();
      
      if (!emailDoc.exists) {
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
          ...studentDoc.data(),
          id: studentDoc.id
        };
      }
      
      // If email index exists, get the PRN and fetch the full student record
      const { prn } = emailDoc.data();
      const studentDoc = await db.collection('students').doc(prn).get();
      
      if (!studentDoc.exists) {
        return null;
      }
      
      return {
        ...studentDoc.data(),
        id: studentDoc.id
      };
    } catch (error) {
      console.error(`Error getting student by email ${email}:`, error);
      throw error;
    }
  },
  
  /**
   * Link a student record to a user account based on email
   * @param {string} userId - Firebase Auth User ID
   * @param {string} email - Student email
   */
  async linkStudentToUserByEmail(userId, email) {
    try {
      const studentData = await this.getStudentByEmail(email);
      
      if (!studentData) {
        console.log(`No student found with email: ${email}`);
        return { success: false, message: 'No student record found with this email' };
      }
      
      // Update user record with student data
      await db.collection('users').doc(userId).update({
        studentPRN: studentData.prn,
        studentData: studentData,
        name: studentData.name, // Set user display name to student name
        role: ROLES.STUDENT,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return { 
        success: true, 
        message: 'Student data linked successfully',
        studentData 
      };
    } catch (error) {
      console.error(`Error linking student email ${email} to user ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Import student data directly as a JavaScript object
   * Use this when importing from an in-memory data structure rather than a file
   * @param {Object[]} studentDataArray - Array of student data objects
   */
  async importStudentsFromArray(studentDataArray) {
    try {
      console.log(`Importing ${studentDataArray.length} student records from array`);
      
      // Process in batches to avoid Firestore limits
      const batchSize = 500;
      let count = 0;
      let batch = db.batch();
      
      for (const student of studentDataArray) {
        // Make sure the student has a PRN
        if (!student.prn) {
          console.warn('Skipping record without PRN:', student);
          continue;
        }
        
        // Set the student document with PRN as ID
        const docRef = db.collection('students').doc(student.prn);
        
        // Add timestamp fields
        const studentData = {
          ...student,
          importedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        batch.set(docRef, studentData);
        
        count++;
        
        // Commit batch when it reaches batch size
        if (count % batchSize === 0) {
          await batch.commit();
          console.log(`Imported ${count} student records...`);
          batch = db.batch();
        }
      }
      
      // Commit any remaining records
      if (count % batchSize !== 0) {
        await batch.commit();
      }
      
      console.log(`Successfully imported ${count} student records`);
      
      // Create email index after import
      await this.createStudentEmailIndex();
      
      return count;
    } catch (error) {
      console.error('Error importing students from array:', error);
      throw error;
    }
  },
  
  /**
   * Get student data by PRN
   * @param {string} prn - Student PRN
   */
  async getStudentByPRN(prn) {
    try {
      const studentDoc = await db.collection('students').doc(prn).get();
      
      if (!studentDoc.exists) {
        return null;
      }
      
      return {
        ...studentDoc.data(),
        id: studentDoc.id
      };
    } catch (error) {
      console.error(`Error getting student by PRN ${prn}:`, error);
      throw error;
    }
  }
};

module.exports = studentDataImportService;