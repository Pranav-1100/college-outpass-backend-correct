const { db, auth, admin } = require('../config/firebase.config');
const { ROLES, APPROVAL_FLOW } = require('../config/roles.config');
const notificationService = require('./notification.service');

// Initialize Firebase Storage
// const bucket = admin.storage().bucket();

const outpassService = {
  // Create new outpass request
  async createRequest(studentId, requestData) {
    try {
      console.log(`Attempting to create outpass for student ID: ${studentId}`);
      
      // Get student details
      const studentDoc = await db.collection('users').doc(studentId).get();
      console.log(`Student document exists: ${studentDoc.exists}`);
      
      if (!studentDoc.exists) {
        console.error(`Student with ID ${studentId} not found in Firestore`);
        throw new Error('Student not found');
      }

      // Determine leave type based on duration
      const fromDate = new Date(requestData.fromDate);
      const toDate = new Date(requestData.toDate);
      const daysDiff = (toDate - fromDate) / (1000 * 60 * 60 * 24);
      
      let leaveType;
      if (daysDiff <= 1) {
        leaveType = 'short_leave';
      } else if (daysDiff > 1 && daysDiff < 7) {
        leaveType = 'long_leave';
      } else {
        leaveType = 'vacation';
      }

      const outpassData = {
        studentId,
        studentName: studentDoc.data().name,
        studentPRN: requestData.prn,
        parentDetails: {
          father: {
            name: requestData.fatherName,
            email: requestData.fatherEmail,
            phone: requestData.fatherPhone
          },
          mother: {
            name: requestData.motherName,
            email: requestData.motherEmail,
            phone: requestData.motherPhone
          }
        },
        studentContact: {
          email: requestData.studentEmail,
          phone: requestData.studentPhone
        },
        leaveType,
        purpose: requestData.purpose,
        fromDate: requestData.fromDate,
        toDate: requestData.toDate,
        outTime: requestData.outTime,
        inTime: requestData.inTime,
        destination: requestData.destination,
        currentStatus: 'pending', // Changed from pending_warden
        approvalStatus: {
          warden: false,
          director: false,
          ao: false
        },
        approvals: {
          warden: { status: 'pending' },
          director: { status: 'pending' },
          ao: { status: 'pending' }
        },
        isUsed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log('Creating outpass document with data:', JSON.stringify(outpassData, null, 2));
      const outpassRef = await db.collection('outpasses').add(outpassData);
      console.log(`Outpass created with ID: ${outpassRef.id}`);

       // Notify all approvers simultaneously
       try {
        await Promise.all([
          notificationService.notifyRole(
            ROLES.WARDEN,
            'New Outpass Request',
            `New ${leaveType} request from ${studentDoc.data().name}`
          ),
          notificationService.notifyRole(
            ROLES.DIRECTOR,
            'New Outpass Request',
            `New ${leaveType} request from ${studentDoc.data().name}`
          ),
          notificationService.notifyRole(
            ROLES.AO,
            'New Outpass Request',
            `New ${leaveType} request from ${studentDoc.data().name}`
          )
        ]);
      } catch (notifyError) {
        console.error('Error sending notifications:', notifyError);
      }

      return {
        id: outpassRef.id,
        ...outpassData
      };
    } catch (error) {
      console.error('Error creating outpass request:', error);
      throw error;
    }
  },



  // Process approval/rejection - Modified for parallel approval
  async processApproval(outpassId, approverData, decision, comments) {
    try {
      const outpassRef = db.collection('outpasses').doc(outpassId);
      const outpassDoc = await outpassRef.get();

      if (!outpassDoc.exists) {
        throw new Error('Outpass not found');
      }

      const outpassData = outpassDoc.data();
      const approverRole = approverData.role.toLowerCase();


      // Update approval status
      const approval = {
        status: decision,
        timestamp: new Date().toISOString(),
        approverId: approverData.uid,
        approverName: approverData.name || approverData.email || 'Unknown User',
        comments
      };

      // Update specific role's approval
      const updates = {
        [`approvals.${approverRole}`]: approval,
        [`approvalStatus.${approverRole}`]: decision === 'approved',
        updatedAt: new Date().toISOString()
      };

      // If rejected, update overall status
      if (decision === 'rejected') {
        updates.currentStatus = 'rejected';
      } else {
        // Check if all have approved
        const newApprovalStatus = {
          ...outpassData.approvalStatus,
          [approverRole]: true
        };
        
        const allApproved = Object.values(newApprovalStatus).every(status => status);
        
        if (allApproved) {
          updates.currentStatus = 'approved';
        }
      }

      // Update outpass document
      await outpassRef.update(updates);

      // Send notifications based on new status
      if (updates.currentStatus === 'approved') {
        await notificationService.notifyUser(
          outpassData.studentId,
          'Outpass Approved',
          'Your outpass has been approved by all approvers!'
        );
      } else if (updates.currentStatus === 'rejected') {
        await notificationService.notifyUser(
          outpassData.studentId,
          'Outpass Rejected',
          `Your outpass was rejected by ${approverRole.toUpperCase()}`
        );
      } else {
        // Notify student of individual approval
        await notificationService.notifyUser(
          outpassData.studentId,
          'Outpass Update',
          `Your outpass has been approved by ${approverRole.toUpperCase()}`
        );
      }

      return {
        id: outpassId,
        status: updates.currentStatus || 'pending'
      };
    } catch (error) {
      console.error('Error processing approval:', error);
      throw error;
    }
  },

  // Get outpass details
  async getOutpass(outpassId) {
    try {
      const outpassDoc = await db.collection('outpasses').doc(outpassId).get();
      if (!outpassDoc.exists) {
        throw new Error('Outpass not found');
      }

      return {
        id: outpassDoc.id,
        ...outpassDoc.data()
      };
    } catch (error) {
      console.error('Error getting outpass:', error);
      throw error;
    }
  },

  // Get outpasses by student
  async getStudentOutpasses(studentId) {
    try {
      const outpassesSnapshot = await db.collection('outpasses')
        .where('studentId', '==', studentId)
        .orderBy('createdAt', 'desc')
        .get();

      const outpasses = [];
      outpassesSnapshot.forEach(doc => {
        outpasses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return outpasses;
    } catch (error) {
      console.error('Error getting student outpasses:', error);
      throw error;
    }
  },

  // Get pending approvals for role - Modified for parallel approval
  async getPendingApprovals(role) {
    try {
      const roleKey = role.toLowerCase();
      const outpassesSnapshot = await db.collection('outpasses')
        .where(`approvals.${roleKey}.status`, '==', 'pending')
        .where('currentStatus', '!=', 'rejected')
        .orderBy('currentStatus')
        .orderBy('createdAt', 'desc')
        .get();

      const outpasses = [];
      outpassesSnapshot.forEach(doc => {
        outpasses.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return outpasses;
    } catch (error) {
      console.error('Error getting pending approvals:', error);
      throw error;
    }
  },

//   // Get pending approvals for staff (warden/director/AO)
//   async getPendingApprovals(role) {
//     try {
//       const status = `pending_${role.toLowerCase()}`;
//       const outpassesSnapshot = await db.collection('outpasses')
//         .where('currentStatus', '==', status)
//         .orderBy('createdAt', 'desc')
//         .get();

//       const outpasses = [];
//       outpassesSnapshot.forEach(doc => {
//         outpasses.push({
//           id: doc.id,
//           ...doc.data()
//         });
//       });

//       return outpasses;
//     } catch (error) {
//       console.error('Error getting pending approvals:', error);
//       throw error;
//     }
//   },

  // Get approval history for staff
  // Get approval history for staff
async getApprovalHistory(role) {
  try {
    console.log('Getting approval history for role:', role);
    const roleKey = role.toLowerCase();

    // Query outpasses where this role has made any decision
    const outpassesSnapshot = await db.collection('outpasses')
      .where(`approvals.${roleKey}.status`, 'in', ['approved', 'rejected'])
      .orderBy('createdAt', 'desc')
      .get();

    console.log(`Found ${outpassesSnapshot.size} outpasses for ${roleKey}`);

    const outpasses = [];
    outpassesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.approvals[roleKey] && data.approvals[roleKey].timestamp) {
        outpasses.push({
          id: doc.id,
          studentDetails: {
            name: data.studentName,
            prn: data.studentPRN,
            contact: data.studentContact
          },
          leaveDetails: {
            type: data.leaveType,
            purpose: data.purpose,
            destination: data.destination,
            fromDate: data.fromDate,
            toDate: data.toDate,
            outTime: data.outTime,
            inTime: data.inTime
          },
          approvalDetails: {
            // Your role's approval
            myDecision: {
              status: data.approvals[roleKey].status,
              timestamp: data.approvals[roleKey].timestamp,
              comments: data.approvals[roleKey].comments || ''
            },
            // Current status in workflow
            currentStatus: data.currentStatus,
            currentLevel: getCurrentLevel(data.currentStatus),
            // Full approval chain status
            chain: {
              warden: {
                status: data.approvals.warden.status,
                timestamp: data.approvals.warden.timestamp || null,
                comments: data.approvals.warden.comments || ''
              },
              director: {
                status: data.approvals.director.status,
                timestamp: data.approvals.director.timestamp || null,
                comments: data.approvals.director.comments || ''
              },
              ao: {
                status: data.approvals.ao.status,
                timestamp: data.approvals.ao.timestamp || null,
                comments: data.approvals.ao.comments || ''
              }
            }
          },
          dates: {
            created: data.createdAt,
            updated: data.updatedAt
          },
          isCompleted: data.currentStatus === 'approved' || data.currentStatus === 'rejected',
          finalStatus: getFinalStatus(data.currentStatus)
        });
      }
    });

    // Sort by your approval timestamp, most recent first
    outpasses.sort((a, b) => {
      return new Date(b.approvalDetails.myDecision.timestamp) - 
             new Date(a.approvalDetails.myDecision.timestamp);
    });

    console.log(`Returning ${outpasses.length} processed outpasses`);
    return outpasses;
  } catch (error) {
    console.error('Error in getApprovalHistory:', error);
    throw new Error(`Failed to get approval history: ${error.message}`);
  }
},

  // Add a method to set up real-time listeners
async setupRealTimeListeners() {
    try {
      // Listen for new outpass requests
      db.collection('outpasses')
        .where('currentStatus', '==', 'pending_warden')
        .onSnapshot(async (snapshot) => {
          const changes = snapshot.docChanges();
          
          for (const change of changes) {
            if (change.type === 'added') {
              const outpass = change.doc.data();
              
              // Notify all wardens
              await notificationService.notifyRole(
                ROLES.WARDEN,
                'New Outpass Request',
                `New ${outpass.leaveType} request from ${outpass.studentName}`
              );
            }
          }
        });
  
      // Listen for status changes
      db.collection('outpasses')
        .onSnapshot(async (snapshot) => {
          const changes = snapshot.docChanges();
          
          for (const change of changes) {
            if (change.type === 'modified') {
              const outpassData = change.doc.data();
              const outpassId = change.doc.id;
              
              // Notify student of status change
              if (outpassData.studentId) {
                switch (outpassData.currentStatus) {
                  case 'approved':
                    await notificationService.notifyUser(
                      outpassData.studentId,
                      'Outpass Approved',
                      'Your outpass request has been fully approved!'
                    );
                    break;
                  case 'rejected':
                    // Find who rejected it
                    let rejecter = 'A staff member';
                    if (outpassData.approvals.warden.status === 'rejected') {
                      rejecter = 'Warden';
                    } else if (outpassData.approvals.director.status === 'rejected') {
                      rejecter = 'Director';
                    } else if (outpassData.approvals.ao.status === 'rejected') {
                      rejecter = 'Academic Officer';
                    }
                    
                    await notificationService.notifyUser(
                      outpassData.studentId,
                      'Outpass Rejected',
                      `Your outpass request was rejected by ${rejecter}`
                    );
                    break;
                  case 'pending_director':
                    await notificationService.notifyUser(
                      outpassData.studentId,
                      'Outpass Update',
                      'Warden has approved your outpass. Now awaiting Director approval.'
                    );
                    
                    // Also notify directors
                    await notificationService.notifyRole(
                      ROLES.DIRECTOR,
                      'Outpass Pending Approval',
                      `New outpass approval pending from ${outpassData.studentName}`
                    );
                    break;
                  case 'pending_ao':
                    await notificationService.notifyUser(
                      outpassData.studentId,
                      'Outpass Update',
                      'Director has approved your outpass. Now awaiting Academic Officer approval.'
                    );
                    
                    // Also notify AOs
                    await notificationService.notifyRole(
                      ROLES.AO,
                      'Outpass Pending Approval',
                      `New outpass approval pending from ${outpassData.studentName}`
                    );
                    break;
                }
              }
            }
          }
        });
  
      console.log('Real-time notifications initialized successfully');
    } catch (error) {
      console.error('Error setting up real-time listeners:', error);
    }
  }
};

// Helper functions - add these BEFORE the module.exports
function getCurrentLevel(status) {
  switch(status) {
    case 'pending_warden': return 'Warden';
    case 'pending_director': return 'Director';
    case 'pending_ao': return 'Academic Officer';
    case 'approved': return 'Completed';
    case 'rejected': return 'Rejected';
    default: return 'Unknown';
  }
}

function getFinalStatus(currentStatus) {
  if (currentStatus === 'approved') return 'Approved';
  if (currentStatus === 'rejected') return 'Rejected';
  if (currentStatus.startsWith('pending_')) return 'In Progress';
  return 'Unknown';
}

module.exports = outpassService;
