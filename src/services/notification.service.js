// src/services/notification.service.js
const { db, admin } = require('../config/firebase.config');
const { ROLES } = require('../config/roles.config');

const notificationService = {
  // Send notification to a specific user
  async notifyUser(userId, title, body) {
    try {
      // Create notification in database
      const notificationRef = await db.collection('notifications').add({
        userId,
        title,
        body,
        isRead: false,
        createdAt: new Date().toISOString()
      });

      // Get user's FCM token
      const userDoc = await db.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        console.log(`User ${userId} not found, notification saved to DB only`);
        return notificationRef.id;
      }

      const userData = userDoc.data();
      if (!userData.fcmToken) {
        console.log(`No FCM token found for user ${userId}, notification saved to DB only`);
        return notificationRef.id;
      }

      // Send FCM notification
      try {
        await admin.messaging().send({
          token: userData.fcmToken,
          notification: {
            title,
            body
          },
          data: {
            notificationId: notificationRef.id,
            click_action: 'OPEN_NOTIFICATION'
          }
        });
        console.log(`FCM notification sent to user ${userId}`);
      } catch (fcmError) {
        console.error(`Failed to send FCM notification to user ${userId}:`, fcmError);
        // If FCM fails, we still have the notification in the database
      }

      return notificationRef.id;
    } catch (error) {
      console.error('Error in notifyUser:', error);
      throw error;
    }
  },

  // Notify all users with a specific role
  async notifyRole(role, title, body) {
    try {
      // Get all users with the specified role
      const usersSnapshot = await db.collection('users')
        .where('role', '==', role)
        .get();

      const notificationIds = [];
      const promises = [];

      usersSnapshot.forEach(userDoc => {
        const promise = this.notifyUser(userDoc.id, title, body)
          .then(notificationId => {
            notificationIds.push(notificationId);
          })
          .catch(error => {
            console.error(`Failed to notify user ${userDoc.id}:`, error);
          });

        promises.push(promise);
      });

      await Promise.all(promises);
      return notificationIds;
    } catch (error) {
      console.error('Error in notifyRole:', error);
      throw error;
    }
  },

  // Get user's notifications
  async getUserNotifications(userId) {
    try {
      const notificationsSnapshot = await db.collection('notifications')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const notifications = [];
      notificationsSnapshot.forEach(doc => {
        notifications.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return notifications;
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  },

  // Mark notification as read
  async markAsRead(notificationId, userId) {
    try {
      const notificationRef = db.collection('notifications').doc(notificationId);
      const notificationDoc = await notificationRef.get();

      if (!notificationDoc.exists) {
        throw new Error('Notification not found');
      }

      // Verify the notification belongs to the user
      if (notificationDoc.data().userId !== userId) {
        throw new Error('Unauthorized to modify this notification');
      }

      await notificationRef.update({
        isRead: true,
        updatedAt: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },

  // Mark all notifications as read
  async markAllAsRead(userId) {
    try {
      const batch = db.batch();
      const notificationsSnapshot = await db.collection('notifications')
        .where('userId', '==', userId)
        .where('isRead', '==', false)
        .get();

      if (notificationsSnapshot.empty) {
        return 0;
      }

      notificationsSnapshot.forEach(doc => {
        batch.update(doc.ref, {
          isRead: true,
          updatedAt: new Date().toISOString()
        });
      });

      await batch.commit();
      return notificationsSnapshot.size;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  },

  // Setup real-time notification listeners
  setupNotificationListeners() {
    // Listen for new notifications
    db.collection('notifications')
      .where('isRead', '==', false)
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
          if (change.type === 'added') {
            const notification = change.doc.data();
            try {
              // Get user FCM token
              const userDoc = await db.collection('users').doc(notification.userId).get();
              if (userDoc.exists && userDoc.data().fcmToken) {
                await admin.messaging().send({
                  token: userDoc.data().fcmToken,
                  notification: {
                    title: notification.title,
                    body: notification.body
                  },
                  data: {
                    notificationId: change.doc.id,
                    click_action: 'OPEN_NOTIFICATION'
                  }
                });
              }
            } catch (error) {
              console.error('Error in notification listener:', error);
            }
          }
        });
      }, error => {
        console.error('Notification listener error:', error);
      });
  }
};

module.exports = notificationService;