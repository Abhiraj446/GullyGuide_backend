const Message = require('../models/message-Model');
const Chat = require('../models/chat-Model');
const User = require('../models/userModel');
const { sendNotification, NotificationTemplates } = require('../utils/notificationHelper');
const { setIo, getIo } = require('./ioStore');

let users = {}; // { userId: socketId }

const setupSocket = (server) => {
    const io = require('socket.io')(server, {
        cors: {
            origin: "http://localhost:3000",
            credentials: true
        }
    });
    setIo(io);

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        // Register user
        socket.on('register-user', (userId) => {
            users[userId] = socket.id;
            socket.join(userId); // Join personal room
            console.log(`User ${userId} registered`);
            io.emit('user-online', { userId, status: true });
        });

        // Send message with notification
        socket.on('send-message', async (data) => {
            try {
                const { chatId, senderId, receiverId, message, messageType, fileUrl } = data;

                const newMessage = await Message.create({
                    chat: chatId,
                    sender: senderId,
                    receiver: receiverId,
                    message,
                    messageType: messageType || 'text',
                    fileUrl: fileUrl || null
                });

                await Chat.findByIdAndUpdate(chatId, {
                    lastMessage: message,
                    lastMessageTime: new Date()
                });

                const populatedMessage = await Message.findById(newMessage._id)
                    .populate('sender', 'name email avatar');

                // Send to chat room
                io.to(chatId).emit('receive-message', populatedMessage);

                // Send notification with sound
                const sender = await User.findById(senderId);
                await sendNotification(
                    receiverId,
                    senderId,
                    'new_message',
                    NotificationTemplates.newMessage(sender.name).title,
                    NotificationTemplates.newMessage(sender.name).message,
                    chatId,
                    'Message'
                );

            } catch (error) {
                console.error(error);
            }
        });

        socket.on('disconnect', () => {
            const userId = Object.keys(users).find(key => users[key] === socket.id);
            if (userId) {
                delete users[userId];
                io.emit('user-offline', { userId, status: false });
            }
        });
    });

    return io;
};

module.exports = { setupSocket, getIo };
