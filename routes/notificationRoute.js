const express = require('express');
const {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
} = require('../controller/notificationController');
const { isAuthenticated } = require('../middlewares/auth');

const router = express.Router();

router.get('/', isAuthenticated, getMyNotifications);
router.put('/:notificationId/read', isAuthenticated, markAsRead);
router.put('/read-all', isAuthenticated, markAllAsRead);
router.delete('/:notificationId', isAuthenticated, deleteNotification);

module.exports = router; 
