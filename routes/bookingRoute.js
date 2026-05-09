const express = require('express');
const {
    createBooking,
    getMyBookings,
    getGuideBookings,
    updateBookingStatus,
    cancelBooking,
    getBookingDetails
} = require('../controller/bookingController');
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');

const router = express.Router();

// Tourist routes
router.post('/create', isAuthenticated, authorizeRoles('tourist'), createBooking);
router.get('/my-bookings', isAuthenticated, authorizeRoles('tourist'), getMyBookings);
router.put('/cancel/:bookingId', isAuthenticated, authorizeRoles('tourist'), cancelBooking);

// Guide routes
router.get('/guide-bookings', isAuthenticated, authorizeRoles('guide', 'admin'), getGuideBookings);
router.put('/status/:bookingId', isAuthenticated, authorizeRoles('guide', 'admin'), updateBookingStatus);

// Both can view details
router.get('/:bookingId', isAuthenticated, getBookingDetails);

module.exports = router;