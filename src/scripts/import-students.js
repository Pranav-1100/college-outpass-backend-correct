require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const { db, admin } = require('../config/firebase.config');
const path = require('path');

// Path to your CSV file - change this to match your file location
const CSV_FILE_PATH = path.join(__dirname, './students.csv');

// Function to import students from CSV
async function importStudentsFromCSV(filePath) {
  try {
    console.log(`Starting student import from: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return { success: false, error: 'CSV file not found' };
    }
    
    // Parse CSV
    const students = [];
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          // Normalize field names (handle different CSV formats)
          const student = {
            prn: data.PRN || data['S. No'] || data.prn,
            name: data['NAME OF THE STUDENT'] || data.NAME || data.name,
            branch: data.Branch || data.branch,
            email: data['Email ID'] || data.email,
            phone: data['MOBILE NUMBER'] || data.phone,
            fatherName: data['FATHER NAME'] || data.fatherName,
            fatherEmail: data['FATHER EMAIL ID'] || data.fatherEmail,
            fatherPhone: data['FATHER MOBILE NUMBER'] || data.fatherPhone,
            motherName: data['MOTHER NAME'] || data.motherName,
            motherEmail: data['MOTHER EMAIL ID'] || data.motherEmail,
            motherPhone: data['MOTHER MOBILE NUMBER'] || data.motherPhone
          };
          
          // Skip records without PRN
          if (!student.prn) {
            console.warn('Skipping record without PRN:', data);
            return;
          }
          
          students.push(student);
        })
        .on('end', () => {
          console.log(`Parsed ${students.length} students from CSV`);
          resolve();
        })
        .on('error', (error) => {
          console.error('Error parsing CSV:', error);
          reject(error);
        });
    });
    
    // Import to Firestore
    const batchSize = 500; // Firestore batch limit
    let count = 0;
    let batch = db.batch();
    
    for (const student of students) {
      const studentRef = db.collection('students').doc(student.prn);
      batch.set(studentRef, {
        ...student,
        importedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      count++;
      
      // Commit batch when it reaches batch size
      if (count % batchSize === 0) {
        await batch.commit();
        console.log(`Imported ${count} students...`);
        batch = db.batch();
      }
    }
    
    // Commit any remaining records
    if (count % batchSize !== 0) {
      await batch.commit();
    }
    
    console.log(`Successfully imported ${count} students`);
    
    // Create email-to-PRN index for quick lookups
    console.log('Creating email-to-PRN index...');
    let indexCount = 0;
    batch = db.batch();
    
    for (const student of students) {
      if (student.email) {
        const emailRef = db.collection('emailToPRN').doc(student.email);
        batch.set(emailRef, {
          prn: student.prn,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        indexCount++;
        
        if (indexCount % batchSize === 0) {
          await batch.commit();
          console.log(`Created ${indexCount} email-to-PRN mappings...`);
          batch = db.batch();
        }
      }
    }
    
    // Commit any remaining records
    if (indexCount % batchSize !== 0) {
      await batch.commit();
    }
    
    console.log(`Successfully created ${indexCount} email-to-PRN mappings`);
    
    return {
      success: true,
      studentsImported: count,
      indexEntriesCreated: indexCount
    };
  } catch (error) {
    console.error('Error importing students:', error);
    return { success: false, error: error.message };
  }
}

// Run the import if executed directly
if (require.main === module) {
  importStudentsFromCSV(CSV_FILE_PATH)
    .then(result => {
      console.log('Import result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Import failed:', error);
      process.exit(1);
    });
}

module.exports = importStudentsFromCSV;
