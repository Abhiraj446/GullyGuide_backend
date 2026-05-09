const Review = require('../models/reviewModel');
const Booking = require('../models/booking-Model');
const User = require('../models/userModel');

// CREATE REVIEW (Tourist only - after completed booking)
exports.createReview = async (req, res) => {
    try {
        // Only tourists can review
        if (req.user.role !== 'tourist') {
            return res.status(403).json({ error: "Only tourists can create reviews" });
        }

        const { bookingId, rating, comment } = req.body;

        if (!bookingId || !rating || !comment) {
            return res.status(400).json({ error: "Booking ID, rating, and comment are required" });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: "Rating must be between 1 and 5" });
        }

        // Find the booking
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        // Check if tourist owns this booking
        if (booking.tourist.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "You can only review your own bookings" });
        }

        // Check if booking is completed
        if (booking.status !== 'completed') {
            return res.status(400).json({ error: "You can only review completed tours" });
        }

        // Check if review already exists
        const existingReview = await Review.findOne({ booking: bookingId });
        if (existingReview) {
            return res.status(400).json({ error: "You already reviewed this tour" });
        }

        // Create review
        const review = new Review({
            booking: bookingId,
            tourist: req.user._id,
            guide: booking.guide,
            post: booking.post,
            rating,
            comment
        });

        await review.save();

        // Update guide's average rating
        const guideReviews = await Review.find({ guide: booking.guide });
        const totalRating = guideReviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = totalRating / guideReviews.length;

        await User.findByIdAndUpdate(booking.guide, {
            averageRating: averageRating.toFixed(1),
            totalReviews: guideReviews.length
        });

        // Populate review details
        const populatedReview = await Review.findById(review._id)
            .populate('tourist', 'name avatar')
            .populate('guide', 'name avatar averageRating totalReviews')
            .populate('post', 'title photo');

        res.status(201).json({
            success: true,
            message: "Review submitted successfully",
            review: populatedReview
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET REVIEWS FOR A GUIDE
exports.getGuideReviews = async (req, res) => {
    try {
        const { guideId } = req.params;

        const reviews = await Review.find({ guide: guideId })
            .populate('tourist', 'name avatar')
            .populate('post', 'title photo')
            .sort('-createdAt');

        const guide = await User.findById(guideId).select('name avatar averageRating totalReviews location');

        res.json({
            success: true,
            guide: guide,
            averageRating: guide?.averageRating || 0,
            totalReviews: reviews.length,
            reviews: reviews
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET MY REVIEWS (Tourist)
exports.getMyReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ tourist: req.user._id })
            .populate('guide', 'name avatar averageRating')
            .populate('post', 'title photo location')
            .sort('-createdAt');

        res.json({
            success: true,
            count: reviews.length,
            reviews: reviews
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UPDATE REVIEW (Tourist - within 7 days)
exports.updateReview = async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { rating, comment } = req.body;

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ error: "Review not found" });
        }

        // Check ownership
        if (review.tourist.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: "You can only update your own reviews" });
        }

        // Check if within 7 days
        const daysSince = (Date.now() - review.createdAt) / (1000 * 60 * 60 * 24);
        if (daysSince > 7) {
            return res.status(400).json({ error: "Reviews can only be edited within 7 days" });
        }

        if (rating) review.rating = rating;
        if (comment) review.comment = comment;
        await review.save();

        // Update guide's average rating
        const guideReviews = await Review.find({ guide: review.guide });
        const totalRating = guideReviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = totalRating / guideReviews.length;

        await User.findByIdAndUpdate(review.guide, {
            averageRating: averageRating.toFixed(1)
        });

        res.json({
            success: true,
            message: "Review updated successfully",
            review: review
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// DELETE REVIEW (Tourist or Admin)
exports.deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;

        const review = await Review.findById(reviewId);
        if (!review) {
            return res.status(404).json({ error: "Review not found" });
        }

        // Check authorization
        if (review.tourist.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ error: "Not authorized" });
        }

        await review.deleteOne();

        // Update guide's average rating
        const guideReviews = await Review.find({ guide: review.guide });
        if (guideReviews.length > 0) {
            const totalRating = guideReviews.reduce((sum, r) => sum + r.rating, 0);
            const averageRating = totalRating / guideReviews.length;
            await User.findByIdAndUpdate(review.guide, {
                averageRating: averageRating.toFixed(1),
                totalReviews: guideReviews.length
            });
        } else {
            await User.findByIdAndUpdate(review.guide, {
                averageRating: 0,
                totalReviews: 0
            });
        }

        res.json({
            success: true,
            message: "Review deleted successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET REVIEW STATS FOR A GUIDE
exports.getReviewStats = async (req, res) => {
    try {
        const { guideId } = req.params;

        const reviews = await Review.find({ guide: guideId });
        
        const ratingCounts = {
            1: 0, 2: 0, 3: 0, 4: 0, 5: 0
        };
        
        reviews.forEach(review => {
            ratingCounts[review.rating]++;
        });

        res.json({
            success: true,
            totalReviews: reviews.length,
            averageRating: reviews.length > 0 
                ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
                : 0,
            ratingDistribution: ratingCounts
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};