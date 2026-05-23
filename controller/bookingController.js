const Booking = require('../models/booking-Model');
const Post = require('../models/post');
const User = require('../models/userModel');
const GuideAvailability = require('../models/guideAvailability-Model');
const { sendNotification, NotificationTemplates } = require('../utils/notificationHelper');

const BOOKING_BLOCKING_STATUSES = ['pending', 'confirmed'];

const startOfDay = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const endOfDay = (value) => {
    const start = startOfDay(value);
    if (!start) return null;
    return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
};

const getInclusiveDays = (startDate, endDate) => {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((startOfDay(endDate) - startOfDay(startDate)) / msPerDay) + 1;
};

const parseBookingRange = ({ startDate, endDate, tourDate }) => {
    const requestedStart = startOfDay(startDate || tourDate);
    const requestedEnd = endOfDay(endDate || startDate || tourDate);

    if (!requestedStart || !requestedEnd) {
        return { error: "Invalid tour date range" };
    }

    if (requestedEnd < requestedStart) {
        return { error: "End date cannot be before start date" };
    }

    const today = startOfDay(new Date());
    if (requestedStart < today) {
        return { error: "Booking date must be today or later" };
    }

    return {
        startDate: requestedStart,
        endDate: requestedEnd,
        durationDays: getInclusiveDays(requestedStart, requestedEnd)
    };
};

const findGuideDateConflict = async (guideId, startDate, endDate, ignoreBookingId = null) => {
    const bookingQuery = {
        guide: guideId,
        status: { $in: BOOKING_BLOCKING_STATUSES },
        $or: [
            { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
            { startDate: { $exists: false }, tourDate: { $gte: startDate, $lte: endDate } }
        ]
    };

    if (ignoreBookingId) {
        bookingQuery._id = { $ne: ignoreBookingId };
    }

    const [bookingConflict, blockedRange] = await Promise.all([
        Booking.findOne(bookingQuery).select('_id status startDate endDate'),
        GuideAvailability.findOne({
            guide: guideId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate }
        }).select('_id reason startDate endDate')
    ]);

    if (bookingConflict) {
        return {
            type: 'booking',
            message: "Guide already has a booking request for the selected dates"
        };
    }

    if (blockedRange) {
        return {
            type: 'blocked',
            message: blockedRange.reason
                ? `Guide is unavailable for the selected dates: ${blockedRange.reason}`
                : "Guide is unavailable for the selected dates"
        };
    }

    return null;
};

// CREATE BOOKING (Tourist only)
exports.createBooking = async (req, res) => {
    try {
        // Only tourists can book
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ error: "Only tourists can create bookings" });
        }

        const { postId, tourDate, startDate, endDate, numberOfPeople, specialRequests } = req.body;

        if (!postId || !(tourDate || startDate) || numberOfPeople === undefined || numberOfPeople === null) {
            return res.status(400).json({
                error: "Post, tour date range, and number of people are required"
            });
        }

        const normalizedPeople = Number(numberOfPeople);
        if (!Number.isFinite(normalizedPeople) || normalizedPeople < 1 || normalizedPeople > 20) {
            return res.status(400).json({
                error: "Number of people must be between 1 and 20"
            });
        }

        const parsedRange = parseBookingRange({ startDate, endDate, tourDate });
        if (parsedRange.error) {
            return res.status(400).json({ error: parsedRange.error });
        }

        // Find the post
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const normalizedPrice = Number(post.price);
        if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
            return res.status(400).json({
                error: "This guide post has an invalid price. Please ask the guide to update it before booking."
            });
        }

        // Get guide from post
        const guideId = post.postedBy;
        if (!guideId) {
            return res.status(400).json({
                error: "This guide post is missing owner information"
            });
        }

        const conflict = await findGuideDateConflict(guideId, parsedRange.startDate, parsedRange.endDate);
        if (conflict) {
            return res.status(409).json({ error: conflict.message });
        }

        // Calculate total price (price per person * people count * booked days)
        const totalPrice = normalizedPrice * normalizedPeople * parsedRange.durationDays;
        if (!Number.isFinite(totalPrice)) {
            return res.status(400).json({
                error: "Unable to calculate booking price for this trip"
            });
        }

        // Create booking
        const booking = new Booking({
            tourist: req.user._id,
            guide: guideId,
            post: postId,
            tourDate: parsedRange.startDate,
            startDate: parsedRange.startDate,
            endDate: parsedRange.endDate,
            durationDays: parsedRange.durationDays,
            numberOfPeople: normalizedPeople,
            totalPrice,
            specialRequests,
            status: 'pending'
        });

        await booking.save();

        const tourist = await User.findById(req.user._id).select('name');
        const bookingRequestNotification = NotificationTemplates.bookingRequest(
            tourist?.name || req.user.name
        );

        await sendNotification(
            guideId,
            req.user._id,
            'booking_request',
            bookingRequestNotification.title,
            bookingRequestNotification.message,
            booking._id,
            'Booking'
        );

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

// GET ADMIN BOOKING STATS
exports.getAdminBookingStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only admins can view booking stats" });
        }

        const [total, pending, processing, completed, cancelled] = await Promise.all([
            Booking.countDocuments({}),
            Booking.countDocuments({ status: 'pending' }),
            Booking.countDocuments({ status: 'confirmed' }),
            Booking.countDocuments({ status: 'completed' }),
            Booking.countDocuments({ status: 'cancelled' }),
        ]);

        res.json({
            success: true,
            stats: {
                total,
                pending,
                processing,
                completed,
                cancelled,
                tripsDone: completed,
            },
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

        if (status === 'confirmed') {
            const conflict = await findGuideDateConflict(
                booking.guide,
                booking.startDate || booking.tourDate,
                booking.endDate || booking.tourDate,
                booking._id
            );

            if (conflict) {
                return res.status(409).json({ error: conflict.message });
            }
        }

        booking.status = status;
        await booking.save();

        const updatedBooking = await Booking.findById(bookingId)
            .populate('tourist', 'name email avatar')
            .populate('guide', 'name email avatar')
            .populate('post', 'title price');

        if (status === 'confirmed') {
            const bookingConfirmedNotification = NotificationTemplates.bookingConfirmed(
                req.user.name,
                updatedBooking?.post?.title || 'your tour'
            );

            await sendNotification(
                booking.tourist,
                req.user._id,
                'booking_confirmed',
                bookingConfirmedNotification.title,
                bookingConfirmedNotification.message,
                booking._id,
                'Booking'
            );
        }

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

// GET GUIDE AVAILABILITY CALENDAR
exports.getGuideAvailability = async (req, res) => {
    try {
        const { guideId } = req.params;
        const { from, to } = req.query;

        if (!guideId) {
            return res.status(400).json({ error: "Guide is required" });
        }

        const rangeStart = startOfDay(from || new Date());
        const defaultEnd = new Date(rangeStart);
        defaultEnd.setUTCMonth(defaultEnd.getUTCMonth() + 3);
        const rangeEnd = endOfDay(to || defaultEnd);

        if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) {
            return res.status(400).json({ error: "Invalid calendar range" });
        }

        const [blockedRanges, bookings] = await Promise.all([
            GuideAvailability.find({
                guide: guideId,
                startDate: { $lte: rangeEnd },
                endDate: { $gte: rangeStart }
            }).sort('startDate'),
            Booking.find({
                guide: guideId,
                status: { $in: BOOKING_BLOCKING_STATUSES },
                $or: [
                    { startDate: { $lte: rangeEnd }, endDate: { $gte: rangeStart } },
                    { startDate: { $exists: false }, tourDate: { $gte: rangeStart, $lte: rangeEnd } }
                ]
            }).select('tourDate startDate endDate durationDays status post').populate('post', 'title').sort('startDate')
        ]);

        res.json({
            success: true,
            availability: {
                from: rangeStart,
                to: rangeEnd,
                blockedRanges,
                bookings
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// BLOCK GUIDE DATES
exports.blockGuideAvailability = async (req, res) => {
    try {
        if (!['guide', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: "Only guides can manage availability" });
        }

        const { startDate, endDate, reason } = req.body;
        const parsedRange = parseBookingRange({ startDate, endDate });

        if (parsedRange.error) {
            return res.status(400).json({ error: parsedRange.error });
        }

        const guideId = req.user.role === 'admin' && req.body.guideId ? req.body.guideId : req.user._id;

        const bookingConflict = await Booking.findOne({
            guide: guideId,
            status: { $in: BOOKING_BLOCKING_STATUSES },
            $or: [
                { startDate: { $lte: parsedRange.endDate }, endDate: { $gte: parsedRange.startDate } },
                { startDate: { $exists: false }, tourDate: { $gte: parsedRange.startDate, $lte: parsedRange.endDate } }
            ]
        }).select('_id');

        if (bookingConflict) {
            return res.status(409).json({
                error: "You already have a booking request on those dates. Cancel it before blocking the dates."
            });
        }

        const existingBlockedRange = await GuideAvailability.findOne({
            guide: guideId,
            startDate: { $lte: parsedRange.endDate },
            endDate: { $gte: parsedRange.startDate }
        }).select('_id');

        if (existingBlockedRange) {
            return res.status(409).json({ error: "Those dates are already blocked on your calendar." });
        }

        const blockedRange = new GuideAvailability({
            guide: guideId,
            startDate: parsedRange.startDate,
            endDate: parsedRange.endDate,
            reason
        });

        await blockedRange.save();

        res.status(201).json({
            success: true,
            message: "Availability updated successfully",
            blockedRange
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UNBLOCK GUIDE DATES
exports.deleteGuideAvailability = async (req, res) => {
    try {
        if (!['guide', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: "Only guides can manage availability" });
        }

        const { availabilityId } = req.params;
        const blockedRange = await GuideAvailability.findById(availabilityId);

        if (!blockedRange) {
            return res.status(404).json({ error: "Blocked date range not found" });
        }

        if (blockedRange.guide.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You can only remove your own blocked dates" });
        }

        await blockedRange.deleteOne();

        res.json({
            success: true,
            message: "Blocked dates removed successfully"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};
