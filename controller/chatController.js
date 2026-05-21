const Chat = require('../models/chat-Model');
const Message = require('../models/message-Model');
const User = require('../models/userModel');
const Notification = require('../models/notification');
const { sendNotification, NotificationTemplates } = require('../utils/notificationHelper');
const { getIo } = require('../socket/socket');

// GET OR CREATE CHAT BETWEEN TWO USERS
exports.getOrCreateChat = async (req, res) => {
    try {
        const { guideId } = req.params;
        const touristId = req.user._id;

        // Check if chat exists
        let chat = await Chat.findOne({
            participants: { $all: [touristId, guideId] }
        }).populate('participants', 'name email avatar role');

        if (!chat) {
            // Create new chat
            chat = await Chat.create({
                participants: [touristId, guideId]
            });
            chat = await chat.populate('participants', 'name email avatar role');
        }

        res.json({
            success: true,
            chat
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET ALL CHATS FOR CURRENT USER
exports.getMyChats = async (req, res) => {
    try {
        const chats = await Chat.find({
            participants: { $in: [req.user._id] }
        })
        .populate('participants', 'name email avatar role')
        .sort('-lastMessageTime');

        // Get unread count for each chat
        const chatsWithUnread = await Promise.all(chats.map(async (chat) => {
            const unreadCount = await Message.countDocuments({
                chat: chat._id,
                receiver: req.user._id,
                isRead: false
            });
            
            return {
                ...chat.toObject(),
                unreadCount
            };
        }));

        res.json({
            success: true,
            chats: chatsWithUnread
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET MESSAGES FOR A CHAT
exports.getMessages = async (req, res) => {
    try {
        const { chatId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        const messages = await Message.find({ chat: chatId })
            .populate('sender', 'name email avatar')
            .populate('receiver', 'name email avatar')
            .sort('-createdAt')
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        // Mark messages as read
        await Message.updateMany(
            {
                chat: chatId,
                receiver: req.user._id,
                isRead: false
            },
            {
                isRead: true,
                readAt: new Date()
            }
        );

        await Notification.updateMany(
            {
                recipient: req.user._id,
                type: 'new_message',
                relatedId: chatId,
                isRead: false
            },
            {
                isRead: true,
                readAt: new Date()
            }
        );

        res.json({
            success: true,
            messages: messages.reverse(),
            currentPage: page,
            total: messages.length
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// SEND MESSAGE (HTTP fallback)
exports.sendMessage = async (req, res) => {
    try {
        const { chatId, message, receiverId, messageType, fileUrl } = req.body;

        let chat;
        if (chatId) {
            chat = await Chat.findById(chatId);
        } else {
            // Create new chat
            chat = await Chat.create({
                participants: [req.user._id, receiverId]
            });
        }

        const newMessage = await Message.create({
            chat: chat._id,
            sender: req.user._id,
            receiver: receiverId,
            message,
            messageType: messageType || 'text',
            fileUrl: fileUrl || null
        });

        // Update chat last message
        chat.lastMessage = message;
        chat.lastMessageTime = new Date();
        await chat.save();

        const populatedMessage = await Message.findById(newMessage._id)
            .populate('sender', 'name email avatar')
            .populate('receiver', 'name email avatar');

        const io = getIo();
        if (io) {
            io.to(String(receiverId)).emit('receive-message', populatedMessage);
            io.to(String(req.user._id)).emit('receive-message', populatedMessage);
        }

        await sendNotification(
            receiverId,
            req.user._id,
            'new_message',
            NotificationTemplates.newMessage(req.user.name).title,
            NotificationTemplates.newMessage(req.user.name).message,
            chat._id,
            'Message'
        );

        res.status(201).json({
            success: true,
            message: populatedMessage
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET UNREAD MESSAGE COUNT
exports.getUnreadCount = async (req, res) => {
    try {
        const count = await Message.countDocuments({
            receiver: req.user._id,
            isRead: false
        });

        res.json({
            success: true,
            unreadCount: count
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};
