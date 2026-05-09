const Booking = require('../models/booking-Model');
const Post = require('../models/post');
const User = require('../models/userModel');

// CREATE BOOKING (Tourist only)
exports.createBooking = async (req, res) => {
    try {
        // Only tourists can book
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ error: "Only tourists can create bookings" });
        }

        const { postId, tourDate, numberOfPeople, specialRequests } = req.body;

        // Find the post
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Get guide from post
        const guideId = post.postedBy;

        // Calculate total price (assuming post has price per person)
        const totalPrice = post.price * numberOfPeople;

        // Create booking
        const booking = new Booking({
            tourist: req.user._id,
            guide: guideId,
            post: postId,
            tourDate,
            numberOfPeople,
            totalPrice,
            specialRequests,
            status: 'pending'
        });

        await booking.save();

        // Populate booking details
        const populatedBooking = await Booking.findById(booking._id)
            .populate('tourist', 'name email avatar')
            .populate('guide', 'name email avatar phone')
            .populate('post', 'title price location');

        res.status(201).json({
            success: true,
            message: "Booking request sent successfully",
            booking: populatedBooking
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET MY BOOKINGS (Tourist view)
exports.getMyBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({ tourist: req.user._id })
            .populate('guide', 'name email avatar phone location')
            .populate('post', 'title photo price location')
            .sort('-createdAt');

        res.json({
            success: true,
            count: bookings.length,
            bookings
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET GUIDE BOOKINGS (Guide view - all requests to this guide)
exports.getGuideBookings = async (req, res) => {
    try {
        // Only guides/admins can see
        if (!['guide', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: "Only guides can view booking requests" });
        }

        const bookings = await Booking.find({ guide: req.user._id })
            .populate('tourist', 'name email avatar phone')
            .populate('post', 'title photo price location')
            .sort('-createdAt');

        res.json({
            success: true,
            count: bookings.length,
            bookings
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UPDATE BOOKING STATUS (Guide only)
exports.updateBookingStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { bookingId } = req.params;

        const validStatuses = ['confirmed', 'cancelled', 'completed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        // Check if user is the guide or admin
        if (booking.guide.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only the guide can update this booking" });
        }

        // Can't change if already cancelled or completed
        if (booking.status === 'cancelled' || booking.status === 'completed') {
            return res.status(400).json({ error: `Cannot update a ${booking.status} booking` });
        }

        booking.status = status;
        await booking.save();

        const updatedBooking = await Booking.findById(bookingId)
            .populate('tourist', 'name email avatar')
            .populate('guide', 'name email avatar')
            .populate('post', 'title price');

        res.json({
            success: true,
            message: `Booking ${status} successfully`,
            booking: updatedBooking
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// CANCEL BOOKING (Tourist can cancel pending/confirmed bookings)
exports.cancelBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        // Check if user is the tourist or admin
        if (booking.tourist.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only the tourist can cancel this booking" });
        }

        // Can't cancel if already completed
        if (booking.status === 'completed') {
            return res.status(400).json({ error: "Cannot cancel a completed booking" });
        }

        booking.status = 'cancelled';
        await booking.save();

        res.json({
            success: true,
            message: "Booking cancelled successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET SINGLE BOOKING DETAILS
exports.getBookingDetails = async (req, res) => {
    try {
        const { bookingId } = req.params;

        const booking = await Booking.findById(bookingId)
            .populate('tourist', 'name email avatar phone')
            .populate('guide', 'name email avatar phone location')
            .populate('post', 'title body photo price location');

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        // Check authorization (tourist, guide, or admin)
        const isAuthorized = (
            booking.tourist._id.toString() === req.user._id.toString() ||
            booking.guide._id.toString() === req.user._id.toString() ||
            req.user.role === 'admin'
        );

        if (!isAuthorized) {
            return res.status(403).json({ error: "Not authorized" });
        }

        res.json({
            success: true,
            booking
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};