const Notification = require('../models/notification');
const { getIo } = require('../socket/ioStore');

// Helper function to create and emit notification
const sendNotification = async (recipientId, senderId, type, title, message, relatedId = null, relatedModel = null) => {
    try {
        // Don't send notification to yourself
        if (recipientId.toString() === senderId.toString()) {
            return null;
        }

        // Create notification in database
        const notification = await Notification.create({
            recipient: recipientId,
            sender: senderId,
            type,
            title,
            message,
            relatedId,
            relatedModel
        });

        // Populate sender info
        const populatedNotification = await Notification.findById(notification._id)
            .populate('sender', 'name email avatar');

        // Emit via Socket.io
        const io = getIo();
        if (io) {
            io.to(recipientId.toString()).emit('new-notification', {
                notification: populatedNotification,
                sound: true
            });
        }

        return populatedNotification;

    } catch (error) {
        console.error('Notification error:', error);
        return null;
    }
};

// Pre-defined notification templates
const NotificationTemplates = {
    // Post related
    postLiked: (userName) => ({
        title: 'New Like',
        message: `${userName} liked your post`
    }),
    postCommented: (userName) => ({
        title: 'New Comment',
        message: `${userName} commented on your post`
    }),
    
    // Booking related
    bookingRequest: (userName) => ({
        title: 'New Booking Request',
        message: `${userName} wants to book your tour`
    }),
    bookingConfirmed: (userName, tourName) => ({
        title: 'Booking Confirmed',
        message: `${userName} confirmed your booking for ${tourName}`
    }),
    bookingCancelled: (userName, tourName) => ({
        title: 'Booking Cancelled',
        message: `${userName} cancelled the booking for ${tourName}`
    }),
    bookingCompleted: (userName, tourName) => ({
        title: 'Tour Completed',
        message: `Your tour "${tourName}" with ${userName} is completed`
    }),
    
    // Message related
    newMessage: (userName) => ({
        title: 'New Message',
        message: `${userName} sent you a message`
    }),
    
    // Review related
    reviewReceived: (userName, rating) => ({
        title: 'New Review',
        message: `${userName} rated you ${rating} stars`
    })
};

module.exports = { sendNotification, NotificationTemplates };
