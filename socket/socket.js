const Message = require('../models/message-Model');
const Chat = require('../models/chat-Model');
const User = require('../models/userModel');

let users = {}; // { userId: socketId }

const setupSocket = (io) => {
    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        // Register user with socket
        socket.on('register-user', (userId) => {
            users[userId] = socket.id;
            console.log(`User ${userId} registered with socket ${socket.id}`);
            
            // Broadcast online status
            io.emit('user-online', { userId, status: true });
        });

        // Join chat room
        socket.on('join-chat', (chatId) => {
            socket.join(chatId);
            console.log(`Socket ${socket.id} joined room ${chatId}`);
        });

        // Send message
        socket.on('send-message', async (data) => {
            try {
                const { chatId, senderId, receiverId, message, messageType, fileUrl } = data;

                // Save to database
                const newMessage = await Message.create({
                    chat: chatId,
                    sender: senderId,
                    receiver: receiverId,
                    message,
                    messageType: messageType || 'text',
                    fileUrl: fileUrl || null
                });

                // Update chat last message
                await Chat.findByIdAndUpdate(chatId, {
                    lastMessage: message,
                    lastMessageTime: new Date()
                });

                const populatedMessage = await Message.findById(newMessage._id)
                    .populate('sender', 'name email avatar')
                    .populate('receiver', 'name email avatar');

                // Emit to chat room
                io.to(chatId).emit('receive-message', populatedMessage);

                // Emit notification to receiver
                const receiverSocketId = users[receiverId];
                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('new-message-notification', {
                        chatId,
                        message: message,
                        sender: populatedMessage.sender
                    });
                }

            } catch (error) {
                console.error('Socket message error:', error);
                socket.emit('message-error', { error: error.message });
            }
        });

        // Typing indicator
        socket.on('typing', ({ chatId, userId, isTyping }) => {
            socket.to(chatId).emit('user-typing', { userId, isTyping });
        });

        // Mark messages as read
        socket.on('mark-read', async ({ chatId, userId }) => {
            try {
                await Message.updateMany(
                    {
                        chat: chatId,
                        receiver: userId,
                        isRead: false
                    },
                    {
                        isRead: true,
                        readAt: new Date()
                    }
                );
                io.to(chatId).emit('messages-read', { chatId, userId });
            } catch (error) {
                console.error(error);
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
            // Remove user from users object
            const userId = Object.keys(users).find(key => users[key] === socket.id);
            if (userId) {
                delete users[userId];
                io.emit('user-offline', { userId, status: false });
            }
        });
    });
};

module.exports = setupSocket;