const router = require('express').Router();
const { verifyAuth } = require('../middlewares/auth.middleware');
const notificationService = require('../services/notification.service');
const { sendResponse, sendError } = require('../utils/response.util');

// Get user's notifications
router.get('/', verifyAuth, async (req, res) => {
  try {
    const notifications = await notificationService.getUserNotifications(req.user.uid);
    return sendResponse(res, 200, notifications);
  } catch (error) {
    return sendError(res, 400, error);
  }
});

// Mark notification as read
router.put('/:notificationId/read', verifyAuth, async (req, res) => {
  try {
    await notificationService.markAsRead(req.params.notificationId, req.user.uid);
    return sendResponse(res, 200, null, 'Notification marked as read');
  } catch (error) {
    return sendError(res, 400, error);
  }
});

module.exports = router;
