const express = require('express');
const {
    createBooking,
    getMyBookings,
    getGuideBookings,
    getAdminBookingStats,
    requestBookingStatusOtp,
    updateBookingStatus,
    cancelBooking,
    getBookingDetails,
    getGuideAvailability,
    blockGuideAvailability,
    deleteGuideAvailability
} = require('../controller/bookingController');
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Tourist routes
router.post('/create', isAuthenticated, authorizeRoles('tourist'), createBooking);
router.get('/my-bookings', isAuthenticated, authorizeRoles('tourist'), getMyBookings);
router.put('/cancel/:bookingId', isAuthenticated, authorizeRoles('tourist'), cancelBooking);

// Availability calendar
router.get('/availability/:guideId', getGuideAvailability);
router.post('/availability/block', isAuthenticated, authorizeRoles('guide', 'admin'), blockGuideAvailability);
router.delete('/availability/:availabilityId', isAuthenticated, authorizeRoles('guide', 'admin'), deleteGuideAvailability);

// Guide routes
router.get('/guide-bookings', isAuthenticated, authorizeRoles('guide', 'admin'), getGuideBookings);
router.post('/status/:bookingId/otp', isAuthenticated, authorizeRoles('guide', 'admin'), requestBookingStatusOtp);
router.put('/status/:bookingId', isAuthenticated, authorizeRoles('guide', 'admin'), updateBookingStatus);

// Admin routes
router.get('/admin/stats', isAuthenticated, authorizeRoles('admin'), getAdminBookingStats);

// Both can view details
router.get('/:bookingId', isAuthenticated, getBookingDetails);

module.exports = router;
