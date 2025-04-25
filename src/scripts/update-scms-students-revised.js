// src/scripts/update-scms-students-revised.js
require('dotenv').config();
const { db, admin } = require('../config/firebase.config');

// Sample SCMS students data from the image
const scmsStudents = [
  {
    prn: "24022022029",
    name: "LAVANYA DUTT",
    gender: "FEMALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "GH1",
    parentInfo: "Archana Sharma",
    contactDetails: "8886090128"
  },
  {
    prn: "24022022003",
    name: "ADITYA JHA",
    gender: "MALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "BH1",
    parentInfo: "Ajay Jha",
    contactDetails: "6205494985"
  },
  {
    prn: "24022022050",
    name: "SHASHANK KRISHNA RAO KAMTAM",
    gender: "MALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "BH1",
    parentInfo: "Radha Kishan Rao Kamtam",
    contactDetails: "9290600727"
  },
  {
    prn: "24022022035",
    name: "MEKA VENKATA DEEPIKA",
    gender: "FEMALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "GH1",
    parentInfo: "Meka Venkata Suresh",
    contactDetails: "8105948855"
  },
  {
    prn: "24022022019",
    name: "G VENKAT PAVAN TEJA",
    gender: "MALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "BH1",
    parentInfo: "G Sridevi",
    contactDetails: "7032526060"
  },
  {
    prn: "24022022055",
    name: "SWAPNA DASH",
    gender: "FEMALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "GH1",
    parentInfo: "Madhaba Chandra Dash",
    contactDetails: "7604046020"
  },
  {
    prn: "24022022024",
    name: "JALASUTRAM SREETEJA SHARMA",
    gender: "MALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "BH1",
    parentInfo: "Jalasutram Venugopal Sharma",
    contactDetails: "8181833333"
  },
  {
    prn: "24022022016",
    name: "DIVAKARLA SUPRAJ NAGA SAI AMRIT",
    gender: "FEMALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "GH1",
    parentInfo: "Divakarla Srinivas",
    contactDetails: "9566673508"
  },
  {
    prn: "24022022001",
    name: "AASTHA SAXENA",
    gender: "FEMALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "GH1",
    parentInfo: "Anjali Saxena",
    contactDetails: "9849317984"
  },
  {
    prn: "24022022066",
    name: "JAGILANKA PRANAV",
    gender: "MALE",
    programme: "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: "2024 - 2028",
    hostelName: "BH1",
    parentInfo: "Pradeep Kumar Jagilanka",
    contactDetails: "9542942365"
  }
];

// Function to update SCMS students based on the provided data
function updateScmsStudents() {
  console.log('Starting to update SCMS students...');
  
  // Process each student in the array
  let processedCount = 0;
  
  // Process students sequentially
  processNextStudent(0);
  
  function processNextStudent(index) {
    if (index >= scmsStudents.length) {
      console.log(`SCMS students update complete. Total: ${processedCount}`);
      return;
    }
    
    const studentData = scmsStudents[index];
    
    // First check if this student already exists
    db.collection('students').doc(studentData.prn).get()
      .then(docSnapshot => {
        let batch = db.batch();
        
        if (docSnapshot.exists) {
          console.log(`Updating existing student: ${studentData.name} (${studentData.prn})`);
          
          // Update existing student
          const updates = createStudentObject(studentData, docSnapshot.data());
          batch.update(db.collection('students').doc(studentData.prn), updates);
        } else {
          console.log(`Creating new student: ${studentData.name} (${studentData.prn})`);
          
          // Create new student
          const newStudent = createStudentObject(studentData);
          batch.set(db.collection('students').doc(studentData.prn), newStudent);
          
          // Also create email-to-PRN mapping
          if (newStudent.email) {
            batch.set(db.collection('emailToPRN').doc(newStudent.email), {
              prn: studentData.prn,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
        
        // Commit the batch
        return batch.commit();
      })
      .then(() => {
        processedCount++;
        console.log(`Processed ${processedCount} of ${scmsStudents.length}`);
        
        // Update any users with this student PRN
        return updateUserWithStudentData(studentData.prn);
      })
      .then(() => {
        // Process next student
        processNextStudent(index + 1);
      })
      .catch(error => {
        console.error(`Error processing student ${studentData.prn}:`, error);
        // Continue with next student despite error
        processNextStudent(index + 1);
      });
  }
}

// Helper function to create the student object with all required fields
function createStudentObject(studentData, existingData = {}) {
  // Generate email if not present (using PRN@scmshyd.siu.edu.in format)
  const email = `${studentData.prn}@scmshyd.siu.edu.in`;
  
  // Set hostel and warden information based on hostel name and gender
  let hostel = {};
  
  if (studentData.hostelName === "GH1") {
    hostel = {
      name: "Viola Girls Hostel",
      location: "GH1, awinggh.hyd@symbiosis.ac.in",
      wardenName: "Mrs. Padmaja Kulkarni",
      wardenContact: "9573454080",
      wardenEmail: "awinggh.hyd@symbiosis.ac.in"
    };
  } else if (studentData.hostelName === "BH1") {
    hostel = {
      name: "Lily Boys Hostel",
      location: "BH1, awingbh.hyd@symbiosis.ac.in",
      wardenName: "Mr. Chintakuntla Prashant Reddy",
      wardenContact: "9573728090",
      wardenEmail: "awingbh.hyd@symbiosis.ac.in"
    };
  }
  
  // Combine with existing data if available
  return {
    ...existingData,
    prn: studentData.prn,
    name: studentData.name,
    gender: studentData.gender,
    email: email,
    phone: studentData.contactDetails || "",
    programme: studentData.programme || "Bachelor of Business Administration (BBA) Honours/ Honours with Research",
    yearOfStudy: studentData.yearOfStudy || "2024 - 2028",
    school: "SYMBIOSIS CENTRE FOR MANAGEMENT STUDIES, HYDERABAD",
    branch: "BBA",
    // Put all parent info in father's details
    fatherName: studentData.parentInfo || "",
    fatherEmail: "",
    fatherPhone: studentData.contactDetails || "",
    // Leave mother details empty
    motherName: "",
    motherEmail: "",
    motherPhone: "",
    hostel: hostel,
    // No residential address as requested
    importedAt: existingData.importedAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

// Function to update user documents with student data
function updateUserWithStudentData(prn) {
  return new Promise((resolve, reject) => {
    db.collection('users').where('studentPRN', '==', prn).get()
      .then(usersSnapshot => {
        if (usersSnapshot.empty) {
          console.log(`No users found with PRN: ${prn}`);
          resolve();
          return;
        }
        
        // Get the latest student data
        return db.collection('students').doc(prn).get()
          .then(studentDoc => {
            if (!studentDoc.exists) {
              console.log(`Student document not found for PRN: ${prn}`);
              resolve();
              return;
            }
            
            const studentData = studentDoc.data();
            const batch = db.batch();
            
            usersSnapshot.forEach(userDoc => {
              batch.update(userDoc.ref, {
                studentData: studentData,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              });
            });
            
            return batch.commit();
          })
          .then(() => {
            console.log(`Updated ${usersSnapshot.size} user(s) with PRN: ${prn}`);
            resolve();
          });
      })
      .catch(error => {
        console.error(`Error updating users for PRN ${prn}:`, error);
        reject(error);
      });
  });
}

// Execute the function
updateScmsStudents();