const express = require('express');
const {
    createReview,
    getGuideReviews,
    getMyReviews,
    updateReview,
    deleteReview,
    getReviewStats
} = require('../controller/reviewController');
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Tourist routes
router.post('/create', isAuthenticated, authorizeRoles('tourist'), createReview);
router.get('/my-reviews', isAuthenticated, authorizeRoles('tourist'), getMyReviews);
router.put('/update/:reviewId', isAuthenticated, authorizeRoles('tourist'), updateReview);
router.delete('/delete/:reviewId', isAuthenticated, authorizeRoles('tourist'), deleteReview);

// Public routes (anyone can see guide reviews)
router.get('/guide/:guideId', getGuideReviews);
router.get('/stats/:guideId', getReviewStats);

// Admin can delete any review
router.delete('/admin/:reviewId', isAuthenticated, authorizeRoles('admin'), deleteReview);

module.exports = router;