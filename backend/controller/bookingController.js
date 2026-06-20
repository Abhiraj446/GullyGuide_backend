
const mongoose = require("mongoose")
const Booking = require('../models/booking-Model');
const Post = require('../models/post');
const User = require('../models/userModel');
const GuideAvailability = require('../models/guideAvailability-Model');
const CustomPackage = require('../models/customPackage-Model'); 
const Asset = require('../models/asset-Model'); 
const sendEmail = require('../utils/sendEmail');
const { sendNotification, NotificationTemplates } = require('../utils/notificationHelper');

const BOOKING_BLOCKING_STATUSES = ['pending', 'confirmed'];
const DEFAULT_PACKAGES = [
    { name: 'Standard', multiplier: 1.0 },
    { name: 'Medium', multiplier: 1.5 },
    { name: 'Premium', multiplier: 3.0 },
];
const generateFourDigitOtp = () => Math.floor(1000 + Math.random() * 9000).toString();

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

// 🔹 Helper to calculate custom package total
const calculateCustomPackageTotal = (postPrice, packageData, numberOfPeople, durationDays) => {
    // packageData.selectedAssets: array of { assetId, quantity, pricePerDay }
    // base price = postPrice * people * days
    let baseTotal = postPrice * numberOfPeople * durationDays;

    // Asset total
    let assetTotal = 0;
    if (packageData.selectedAssets && packageData.selectedAssets.length) {
        assetTotal = packageData.selectedAssets.reduce((sum, asset) => {
            return sum + (asset.pricePerDay * asset.quantity * durationDays);
        }, 0);
    }

    // Group discount (apply to base price only, not assets)
    let discount = 0;
    if (numberOfPeople >= 5 && numberOfPeople < 8) discount = 0.10;
    else if (numberOfPeople >= 8 && numberOfPeople < 10) discount = 0.15;
    else if (numberOfPeople >= 10) discount = 0.20;

    const discountedBase = baseTotal * (1 - discount);
    return discountedBase + assetTotal;
};

// ===================== CREATE BOOKING (updated) =====================
// exports.createBooking = async (req, res) => {
//     try {
//         // Only tourists can book
//         if (req.user.role !== 'tourist') {
//             return res.status(403).json({ error: "Only tourists can create bookings" });
//         }

//         const { 
//             postId, 
//             customPackageId, 
//             tourDate, startDate, endDate, 
//             numberOfPeople, 
//             specialRequests, 
//             selectedPackage 
//         } = req.body;

//         // ----- CASE 1: Custom Package Booking -----
//         if (customPackageId) {
//             // Fetch custom package with assets populated
//             const customPackage = await CustomPackage.findById(customPackageId)
//                 .populate('post')          // post details
//                 .populate('guide')         // guide details
//                 .populate('selectedAssets.assetId'); // asset details (optional)

//             if (!customPackage) {
//                 return res.status(404).json({ error: "Custom package not found" });
//             }

//             // Validate ownership: package belongs to this tourist
//             if (customPackage.tourist.toString() !== req.user._id.toString()) {
//                 return res.status(403).json({ error: "You do not own this custom package" });
//             }

//             // Validate package status and expiry
//             if (customPackage.status === 'booked' || customPackage.status === 'expired') {
//                 return res.status(400).json({ error: "This custom package is no longer available" });
//             }
//             if (customPackage.expiresAt && new Date() > customPackage.expiresAt) {
//                 return res.status(400).json({ error: "Price lock has expired. Please re-estimate." });
//             }

//             // Use dates and people from the package (or allow override? We'll use package values)
//             const pkgStart = customPackage.startDate;
//             const pkgEnd = customPackage.endDate;
//             const pkgPeople = customPackage.numberOfPeople;

//             // Parse range (reuse function)
//             const parsedRange = parseBookingRange({ startDate: pkgStart, endDate: pkgEnd });
//             if (parsedRange.error) {
//                 return res.status(400).json({ error: parsedRange.error });
//             }

//             // Get post and guide from package
//             const post = customPackage.post;
//             if (!post) {
//                 return res.status(400).json({ error: "Custom package missing post reference" });
//             }
//             const guideId = customPackage.guide._id || customPackage.guide;

//             // Conflict check
//             const conflict = await findGuideDateConflict(guideId, parsedRange.startDate, parsedRange.endDate);
//             if (conflict) {
//                 return res.status(409).json({ error: conflict.message });
//             }

//             // Calculate total
//             const normalizedPrice = Number(post.price);
//             if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
//                 return res.status(400).json({ error: "Invalid base price in post" });
//             }

//             const totalPrice = calculateCustomPackageTotal(
//                 normalizedPrice,
//                 customPackage,
//                 pkgPeople,
//                 parsedRange.durationDays
//             );

//             // Create booking with customPackageId
//             const booking = new Booking({
//                 tourist: req.user._id,
//                 guide: guideId,
//                 post: post._id,
//                 tourDate: parsedRange.startDate,
//                 startDate: parsedRange.startDate,
//                 endDate: parsedRange.endDate,
//                 durationDays: parsedRange.durationDays,
//                 numberOfPeople: pkgPeople,
//                 customPackageId: customPackage._id,
//                 // selectedPackage will default to Standard/1 (we can set to null if we want)
//                 selectedPackage: null, // or omit
//                 totalPrice,
//                 specialRequests,
//                 status: 'pending'
//             });

//             await booking.save();

//             // Update custom package status to 'booked' (so it can't be reused)
//             customPackage.status = 'booked';
//             await customPackage.save();

//             // Send notification to guide
//             const tourist = await User.findById(req.user._id).select('name');
//             const bookingRequestNotification = NotificationTemplates.bookingRequest(
//                 tourist?.name || req.user.name
//             );
//             await sendNotification(
//                 guideId,
//                 req.user._id,
//                 'booking_request',
//                 bookingRequestNotification.title,
//                 bookingRequestNotification.message,
//                 booking._id,
//                 'Booking'
//             );

//             const populatedBooking = await Booking.findById(booking._id)
//                 .populate('tourist', 'name email avatar')
//                 .populate('guide', 'name email avatar phone')
//                 .populate('post', 'title price location packages')
//                 .populate('customPackageId'); // populate custom package

//             return res.status(201).json({
//                 success: true,
//                 message: "Booking request sent successfully (custom package)",
//                 booking: populatedBooking
//             });
//         }

//         // ----- CASE 2: Traditional Fixed Package Booking (existing code) -----
//         if (!postId || !(tourDate || startDate) || numberOfPeople === undefined || numberOfPeople === null) {
//             return res.status(400).json({
//                 error: "Post, tour date range, and number of people are required"
//             });
//         }

//         const normalizedPeople = Number(numberOfPeople);
//         if (!Number.isFinite(normalizedPeople) || normalizedPeople < 1 || normalizedPeople > 20) {
//             return res.status(400).json({
//                 error: "Number of people must be between 1 and 20"
//             });
//         }

//         const parsedRange = parseBookingRange({ startDate, endDate, tourDate });
//         if (parsedRange.error) {
//             return res.status(400).json({ error: parsedRange.error });
//         }

//         const post = await Post.findById(postId);
//         if (!post) {
//             return res.status(404).json({ error: "Post not found" });
//         }

//         const normalizedPrice = Number(post.price);
//         if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
//             return res.status(400).json({
//                 error: "This guide post has an invalid price. Please ask the guide to update it before booking."
//             });
//         }

//         const requestedPackageName = typeof selectedPackage === 'string'
//             ? selectedPackage
//             : selectedPackage?.name;
//         const packageName = requestedPackageName || 'Standard';
//         const availablePackages = Array.isArray(post.packages) && post.packages.length
//             ? post.packages
//             : DEFAULT_PACKAGES;
//         const packageOption = availablePackages.find((pkg) => pkg.name === packageName);

//         if (!packageOption) {
//             return res.status(400).json({
//                 error: "Invalid package selected"
//             });
//         }

//         const packageMultiplier = Number(packageOption.multiplier);
//         if (!Number.isFinite(packageMultiplier) || packageMultiplier < 0) {
//             return res.status(400).json({
//                 error: "Selected package has an invalid price multiplier"
//             });
//         }

//         const guideId = post.postedBy;
//         if (!guideId) {
//             return res.status(400).json({
//                 error: "This guide post is missing owner information"
//             });
//         }

//         const conflict = await findGuideDateConflict(guideId, parsedRange.startDate, parsedRange.endDate);
//         if (conflict) {
//             return res.status(409).json({ error: conflict.message });
//         }

//         const totalPrice = normalizedPrice * packageMultiplier * normalizedPeople * parsedRange.durationDays;
//         if (!Number.isFinite(totalPrice)) {
//             return res.status(400).json({
//                 error: "Unable to calculate booking price for this trip"
//             });
//         }

//         const booking = new Booking({
//             tourist: req.user._id,
//             guide: guideId,
//             post: postId,
//             tourDate: parsedRange.startDate,
//             startDate: parsedRange.startDate,
//             endDate: parsedRange.endDate,
//             durationDays: parsedRange.durationDays,
//             numberOfPeople: normalizedPeople,
//             selectedPackage: {
//                 name: packageOption.name,
//                 multiplier: packageMultiplier
//             },
//             totalPrice,
//             specialRequests,
//             status: 'pending'
//         });

//         await booking.save();

//         const tourist = await User.findById(req.user._id).select('name');
//         const bookingRequestNotification = NotificationTemplates.bookingRequest(
//             tourist?.name || req.user.name
//         );

//         await sendNotification(
//             guideId,
//             req.user._id,
//             'booking_request',
//             bookingRequestNotification.title,
//             bookingRequestNotification.message,
//             booking._id,
//             'Booking'
//         );

//         const populatedBooking = await Booking.findById(booking._id)
//             .populate('tourist', 'name email avatar')
//             .populate('guide', 'name email avatar phone')
//             .populate('post', 'title price location packages');

//         res.status(201).json({
//             success: true,
//             message: "Booking request sent successfully",
//             booking: populatedBooking
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ error: "Server error" });
//     }
// };

// (Remaining functions – getMyBookings, getGuideBookings, etc. – unchanged)
// ... (keep all other exports as they are) ...


exports.getMyBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({ tourist: req.user._id })
            .populate('guide', 'name email avatar phone location')
            .populate('post', 'title photo price location')
            .populate('customPackageId')
            .sort('-createdAt');

        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getGuideBookings = async (req, res) => {
    try {
        if (!['guide', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: "Only guides can view booking requests" });
        }

        const query = req.user.role === 'admin' ? {} : { guide: req.user._id };
        const bookings = await Booking.find(query)
            .populate('tourist', 'name email avatar phone')
            .populate('guide', 'name email avatar phone')
            .populate('post', 'title photo price location')
            .populate('customPackageId')
            .sort('-createdAt');

        res.json({ success: true, count: bookings.length, bookings });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getAdminBookingStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only admins can view booking stats" });
        }

        const [total, pending, confirmed, completed, cancelled] = await Promise.all([
            Booking.countDocuments({}),
            Booking.countDocuments({ status: 'pending' }),
            Booking.countDocuments({ status: 'confirmed' }),
            Booking.countDocuments({ status: 'completed' }),
            Booking.countDocuments({ status: 'cancelled' })
        ]);

        res.json({
            success: true,
            stats: { total, pending, confirmed, completed, cancelled, tripsDone: completed }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getBookingDetails = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const booking = await Booking.findById(bookingId)
            .populate('tourist', 'name email avatar phone')
            .populate('guide', 'name email avatar phone location')
            .populate('post', 'title photo price location packages')
            .populate('customPackageId');

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        const isTourist = booking.tourist?._id?.toString() === req.user._id.toString();
        const isGuide = booking.guide?._id?.toString() === req.user._id.toString();
        if (!isTourist && !isGuide && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You are not allowed to view this booking" });
        }

        res.json({ success: true, booking });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.getGuideAvailability = async (req, res) => {
    try {
        const { guideId } = req.params;
        const { from, to } = req.query;
        const rangeStart = startOfDay(from || new Date());
        const defaultEnd = new Date(rangeStart);
        defaultEnd.setUTCMonth(defaultEnd.getUTCMonth() + 3);
        const rangeEnd = endOfDay(to || defaultEnd);

        if (!guideId) {
            return res.status(400).json({ error: "Guide is required" });
        }

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

        res.json({ success: true, availability: { from: rangeStart, to: rangeEnd, blockedRanges, bookings } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

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
        const conflict = await findGuideDateConflict(guideId, parsedRange.startDate, parsedRange.endDate);
        if (conflict) {
            return res.status(409).json({ error: conflict.message });
        }

        const blockedRange = new GuideAvailability({
            guide: guideId,
            startDate: parsedRange.startDate,
            endDate: parsedRange.endDate,
            reason
        });

        await blockedRange.save();
        res.status(201).json({ success: true, message: "Availability updated successfully", blockedRange });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

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
        res.json({ success: true, message: "Blocked dates removed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { cancellationReason } = req.body;
        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        if (booking.tourist.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "You can only cancel your own bookings" });
        }

        if (['cancelled', 'completed'].includes(booking.status)) {
            return res.status(400).json({ error: `Cannot cancel a ${booking.status} booking` });
        }

        const normalizedReason = String(cancellationReason || '').trim();
        if (normalizedReason.length > 300) {
            return res.status(400).json({ error: "Cancellation reason must be 300 characters or less" });
        }

        booking.status = 'cancelled';
        booking.cancellationReason = normalizedReason;
        booking.statusOtp = undefined;
        await booking.save();

        const updatedBooking = await Booking.findById(bookingId)
            .populate('tourist', 'name email avatar')
            .populate('guide', 'name email avatar')
            .populate('post', 'title price')
            .populate('customPackageId');

        const notification = NotificationTemplates.bookingCancelled(req.user.name, updatedBooking?.post?.title || 'your tour');
        await sendNotification(booking.guide, req.user._id, 'booking_cancelled', notification.title, notification.message, booking._id, 'Booking');

        res.json({ success: true, message: "Booking cancelled successfully", booking: updatedBooking });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

exports.requestBookingStatusOtp = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { status } = req.body;

        if (status !== 'confirmed') {
            return res.status(400).json({ error: "OTP is only required for confirming bookings" });
        }

        const booking = await Booking.findById(bookingId)
            .populate('tourist', 'name email')
            .populate('guide', 'name email')
            .populate('post', 'title');

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        if (booking.guide._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only the guide can request confirmation OTP" });
        }

        if (booking.status !== 'pending') {
            return res.status(400).json({ error: "Only pending bookings can be confirmed with OTP" });
        }

        if (!booking.tourist?.email) {
            return res.status(400).json({ error: "Tourist email is not available for OTP verification" });
        }

        const conflict = await findGuideDateConflict(
            booking.guide._id,
            booking.startDate || booking.tourDate,
            booking.endDate || booking.tourDate,
            booking._id
        );

        if (conflict) {
            return res.status(409).json({ error: conflict.message });
        }

        const otp = generateFourDigitOtp();
        booking.statusOtp = {
            code: otp,
            action: 'confirmed',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        };
        await booking.save();

        await sendEmail({
            email: booking.tourist.email,
            subject: "GullyGuide booking confirmation OTP",
            message: `Your 4-digit OTP to approve "${booking.post?.title || 'your tour'}" is ${otp}. Share it with your guide only if you approve this booking confirmation. This OTP is valid for 10 minutes.`
        });

        res.json({ success: true, message: `4-digit OTP sent to tourist email ${booking.tourist.email}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to send booking confirmation OTP" });
    }
};

exports.updateBookingStatus = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { status, otp, cancellationReason } = req.body;

        if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        const booking = await Booking.findById(bookingId).select('+statusOtp.code +statusOtp.action +statusOtp.expiresAt');
        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        if (booking.guide.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only the guide can update this booking" });
        }

        if (['cancelled', 'completed'].includes(booking.status)) {
            return res.status(400).json({ error: `Cannot update a ${booking.status} booking` });
        }

        if (status === 'confirmed') {
            const normalizedOtp = String(otp || '').trim();
            if (!/^\d{4}$/.test(normalizedOtp)) {
                return res.status(400).json({ error: "Enter the 4-digit OTP sent to the tourist email" });
            }

            if (!booking.statusOtp?.code || booking.statusOtp.action !== 'confirmed' || booking.statusOtp.expiresAt < new Date()) {
                return res.status(400).json({ error: "Confirmation OTP is missing or expired. Send a new OTP." });
            }

            if (booking.statusOtp.code !== normalizedOtp) {
                return res.status(400).json({ error: "Invalid OTP. Please enter the exact 4-digit code." });
            }

            const conflict = await findGuideDateConflict(
                booking.guide,
                booking.startDate || booking.tourDate,
                booking.endDate || booking.tourDate,
                booking._id
            );

            if (conflict) {
                return res.status(409).json({ error: conflict.message });
            }

            booking.statusOtp = undefined;
        }

        if (status === 'cancelled') {
            const normalizedReason = String(cancellationReason || '').trim();
            if (normalizedReason.length > 300) {
                return res.status(400).json({ error: "Cancellation reason must be 300 characters or less" });
            }
            booking.cancellationReason = normalizedReason;
        }

        booking.status = status;
        await booking.save();

        const updatedBooking = await Booking.findById(bookingId)
            .populate('tourist', 'name email avatar')
            .populate('guide', 'name email avatar')
            .populate('post', 'title price')
            .populate('customPackageId');

        if (status === 'confirmed') {
            const notification = NotificationTemplates.bookingConfirmed(req.user.name, updatedBooking?.post?.title || 'your tour');
            await sendNotification(booking.tourist, req.user._id, 'booking_confirmed', notification.title, notification.message, booking._id, 'Booking');
        }

        if (status === 'cancelled') {
            const notification = NotificationTemplates.bookingCancelled(req.user.name, updatedBooking?.post?.title || 'your tour');
            await sendNotification(booking.tourist, req.user._id, 'booking_cancelled', notification.title, notification.message, booking._id, 'Booking');
        }

        res.json({ success: true, message: `Booking ${status} successfully`, booking: updatedBooking });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};


// ===================== CREATE BOOKING (UPDATED with Inventory Lock) =====================
exports.createBooking = async (req, res) => {
    // Session start karo
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // Only tourists can book
        if (req.user.role !== 'tourist') {
            await session.abortTransaction();
            session.endSession();
            return res.status(403).json({ error: "Only tourists can create bookings" });
        }

        const { 
            postId, 
            customPackageId, 
            tourDate, startDate, endDate, 
            numberOfPeople, 
            specialRequests, 
            selectedPackage 
        } = req.body;

        // ----- CASE 1: Custom Package Booking -----
        if (customPackageId) {
            // Fetch custom package
            const customPackage = await CustomPackage.findById(customPackageId)
                .populate('post')
                .populate('guide')
                .session(session); // 🔹 Attach session

            if (!customPackage) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ error: "Custom package not found" });
            }

            // Validate ownership
            if (customPackage.tourist.toString() !== req.user._id.toString()) {
                await session.abortTransaction();
                session.endSession();
                return res.status(403).json({ error: "You do not own this custom package" });
            }

            // Validate status
            if (customPackage.status === 'booked' || customPackage.status === 'expired') {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: "This custom package is no longer available" });
            }
            if (customPackage.expiresAt && new Date() > customPackage.expiresAt) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: "Price lock has expired. Please re-estimate." });
            }

            // Use dates from package
            const parsedRange = parseBookingRange({ 
                startDate: customPackage.startDate, 
                endDate: customPackage.endDate 
            });
            if (parsedRange.error) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: parsedRange.error });
            }

            const post = customPackage.post;
            const guideId = customPackage.guide._id || customPackage.guide;

            // 🔹 INVENTORY LOCKING – Reduce asset quantities
            const selectedAssets = customPackage.selectedAssets || [];
            
            for (const item of selectedAssets) {
                const assetId = item.assetId;
                const requestedQty = item.quantity;

                // Atomic update: find asset with enough quantity and reduce it
                const updatedAsset = await Asset.findOneAndUpdate(
                    { 
                        _id: assetId, 
                        quantityAvailable: { $gte: requestedQty } 
                    },
                    { $inc: { quantityAvailable: -requestedQty } },
                    { session, new: true } // Return updated doc
                );

                if (!updatedAsset) {
                    // Insufficient quantity – abort transaction
                    await session.abortTransaction();
                    session.endSession();
                    return res.status(409).json({ 
                        error: `Not enough quantity available for asset: ${item.assetId}` 
                    });
                }
            }

            // Check guide date conflict (after locking inventory)
            const conflict = await findGuideDateConflict(
                guideId, 
                parsedRange.startDate, 
                parsedRange.endDate
            );
            if (conflict) {
                // Rollback inventory changes (automatic due to transaction abort)
                await session.abortTransaction();
                session.endSession();
                return res.status(409).json({ error: conflict.message });
            }

            // Calculate total using package's totalEstimate (already locked)
            const totalPrice = customPackage.totalEstimate;

            // Create booking
            const booking = new Booking({
                tourist: req.user._id,
                guide: guideId,
                post: post._id,
                tourDate: parsedRange.startDate,
                startDate: parsedRange.startDate,
                endDate: parsedRange.endDate,
                durationDays: parsedRange.durationDays,
                numberOfPeople: customPackage.numberOfPeople,
                customPackageId: customPackage._id,
                totalPrice,
                specialRequests: specialRequests || customPackage.specialRequests,
                status: 'pending'
            });

            await booking.save({ session });

            // Update custom package status to 'booked'
            customPackage.status = 'booked';
            await customPackage.save({ session });

            // 🔹 COMMIT TRANSACTION – Inventory changes saved permanently
            await session.commitTransaction();
            session.endSession();

            // Send notification (outside transaction – don't need to rollback if email fails)
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

            const populatedBooking = await Booking.findById(booking._id)
                .populate('tourist', 'name email avatar')
                .populate('guide', 'name email avatar phone')
                .populate('post', 'title price location packages')
                .populate('customPackageId');

            return res.status(201).json({
                success: true,
                message: "Booking request sent successfully (custom package with inventory locked)",
                booking: populatedBooking
            });
        }

        // ----- CASE 2: Traditional Fixed Package Booking (Existing Code) -----
        // (Yahan purana logic rahega – baad mein isme bhi inventory locking add karenge)
        // ...

    } catch (error) {
        // Agar koi bhi error aata hai, transaction rollback
        await session.abortTransaction();
        session.endSession();
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

