const express = require('express');
const {
    getOrCreateChat,
    getMyChats,
    getMessages,
    sendMessage,
    getUnreadCount
} = require('../controller/chatController');
const { isAuthenticated } = require('../middlewares/auth');

const router = express.Router();

router.get('/chats', isAuthenticated, getMyChats);
router.get('/chat/:chatId/messages', isAuthenticated, getMessages);
router.get('/chat/guide/:guideId', isAuthenticated, getOrCreateChat);
router.post('/message', isAuthenticated, sendMessage);
router.get('/unread-count', isAuthenticated, getUnreadCount);

module.exports = router;