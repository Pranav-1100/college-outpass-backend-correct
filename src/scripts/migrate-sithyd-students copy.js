// src/scripts/update-sithyd-by-gender.js
require('dotenv').config();
const { db, admin } = require('../config/firebase.config');

// Function to update SITHYD students based on their existing gender
function updateByGender() {
  console.log('Starting to update SITHYD students based on existing gender...');
  
  // Get all students
  db.collection('students').get()
    .then(studentsSnapshot => {
      if (studentsSnapshot.empty) {
        console.log('No student records found');
        return;
      }
      
      let batch = db.batch();
      let maleCount = 0;
      let femaleCount = 0;
      let count = 0;
      const batchSize = 500;
      const sithydStudentIds = [];
      
      // Process all students
      studentsSnapshot.forEach(doc => {
        const student = doc.data();
        
        // Only process SITHYD students
        if (student.email && student.email.includes('@sithyd.siu.edu.in')) {
          sithydStudentIds.push(doc.id);
          
          // Common updates for all students
          const updates = {
            school: "Symbiosis Institute of Technology(SIT), Hyderabad",
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          // Set hostel and warden information based on existing gender
          if (student.gender && (student.gender.toUpperCase() === 'FEMALE' || 
                                 student.gender === 'F' ||
                                 student.gender.toLowerCase() === 'female')) {
            // Female student
            updates.hostel = {
              name: "Plumeria Girls Hostel",
              location: "GH3, cwinggh.hyd@symbiosis.ac.in",
              wardenName: "Mrs. Linitha Sudesh",
              wardenContact: "8157056625",
              wardenEmail: "cwinggh.hyd@symbiosis.ac.in"
            };
            femaleCount++;
          } else {
            // Male student (default if gender is empty, male, or anything else)
            updates.hostel = {
              name: "Celosia Boys Hostel",
              location: "BH3, cwingbh.hyd@symbiosis.ac.in",
              wardenName: "Mr. Chipiri Shiva Prasad",
              wardenContact: "8247721220",
              wardenEmail: "cwingbh.hyd@symbiosis.ac.in"
            };
            maleCount++;
          }
          
          // Add programme and year of study if not present
          if (!student.programme) {
            // Check branch to determine programme
            const branch = student.branch || '';
            if (branch.includes('CSE')) {
              updates.programme = "Bachelor of Technology (B.Tech) in Computer Science and Engineering";
            } else if (branch.includes('AIML')) {
              updates.programme = "Bachelor of Technology (B.Tech) in Artificial Intelligence and Machine Learning";
            } else if (branch.includes('CST')) {
              updates.programme = "Bachelor of Technology (B.Tech) in Computer Science and Technology";
            } else {
              updates.programme = "Bachelor of Technology (B.Tech)";
            }
          }
          
          if (!student.yearOfStudy) {
            updates.yearOfStudy = "2024 - 2028";
          }
          
          // Update document
          batch.update(doc.ref, updates);
          count++;
          
          // Commit when batch size is reached
          if (count % batchSize === 0) {
            batch.commit()
              .then(() => {
                console.log(`Processed ${count} students...`);
                batch = db.batch();
              })
              .catch(error => {
                console.error('Error committing batch:', error);
                batch = db.batch(); // Reset batch on error
              });
          }
        }
      });
      
      // Commit remaining updates if any
      if (count % batchSize !== 0) {
        batch.commit()
          .then(() => {
            console.log(`Update complete:
              - Total updated: ${count}
              - Male students: ${maleCount}
              - Female students: ${femaleCount}
            `);
            
            // Update users in a separate step
            updateUsers(sithydStudentIds);
          })
          .catch(error => {
            console.error('Error committing final batch:', error);
          });
      } else {
        console.log(`Update complete:
          - Total updated: ${count}
          - Male students: ${maleCount}
          - Female students: ${femaleCount}
        `);
        
        // Update users in a separate step
        updateUsers(sithydStudentIds);
      }
    })
    .catch(error => {
      console.error('Error getting students:', error);
    });
}

// Separate function to update user records
function updateUsers(studentIds) {
  console.log('Updating user documents...');
  
  db.collection('users').get()
    .then(usersSnapshot => {
      let userUpdates = 0;
      let batch = db.batch();
      const batchSize = 500;
      const processedUsers = [];
      
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        
        // Only update users linked to migrated students
        if (userData.studentPRN && studentIds.includes(userData.studentPRN)) {
          processedUsers.push({
            userRef: doc.ref,
            prn: userData.studentPRN
          });
        }
      });
      
      console.log(`Found ${processedUsers.length} users to update`);
      
      // Process users in sequence to avoid any issues
      processUsersSequentially(processedUsers, 0);
    })
    .catch(error => {
      console.error('Error getting users:', error);
    });
}

// Process users one by one to avoid async issues
function processUsersSequentially(users, index) {
  if (index >= users.length) {
    console.log(`Completed updating ${users.length} users`);
    return;
  }
  
  const user = users[index];
  
  // Get the updated student data
  db.collection('students').doc(user.prn).get()
    .then(studentDoc => {
      if (studentDoc.exists) {
        // Update the user document
        return user.userRef.update({
          studentData: studentDoc.data(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    })
    .then(() => {
      console.log(`Updated user ${index + 1} of ${users.length}`);
      // Process next user
      processUsersSequentially(users, index + 1);
    })
    .catch(error => {
      console.error(`Error updating user ${index}:`, error);
      // Continue with next user despite error
      processUsersSequentially(users, index + 1);
    });
}

// Run the update
updateByGender();