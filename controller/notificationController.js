const Notification = require('../models/notification');

// GET USER'S NOTIFICATIONS
exports.getMyNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ recipient: req.user._id })
            .populate('sender', 'name email avatar')
            .sort('-createdAt')
            .skip(skip)
            .limit(parseInt(limit));

        const unreadCount = await Notification.countDocuments({
            recipient: req.user._id,
            isRead: false
        });

        res.json({
            success: true,
            unreadCount,
            total: notifications.length,
            notifications
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// MARK NOTIFICATION AS READ
exports.markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, recipient: req.user._id },
            { isRead: true, readAt: new Date() },
            { returnDocument: 'after' }
        );

        if (!notification) {
            return res.status(404).json({ error: "Notification not found" });
        }

        res.json({
            success: true,
            message: "Notification marked as read",
            notification
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// MARK ALL AS READ
exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { isRead: true, readAt: new Date() }
        );

        res.json({
            success: true,
            message: "All notifications marked as read"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// DELETE NOTIFICATION
exports.deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;

        const result = await Notification.findOneAndDelete({
            _id: notificationId,
            recipient: req.user._id
        });

        if (!result) {
            return res.status(404).json({ error: "Notification not found" });
        }

        res.json({
            success: true,
            message: "Notification deleted"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};
