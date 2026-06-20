const express = require('express');
const router = express.Router();
const { isAuthenticated, authorizeRoles } = require('../middlewares/auth');
const {
    createPaymentOrder,
    verifyPayment,
    refundPayment,
    getPaymentHistory,
    webhook
} = require('../controller/paymentController');

// Webhook (no auth, public)
router.post('/webhook', webhook);

// Authenticated routes
router.post('/create-order', isAuthenticated, createPaymentOrder);
router.post('/verify', isAuthenticated, verifyPayment);
router.post('/refund/:bookingId', isAuthenticated, authorizeRoles('guide', 'admin'), refundPayment);
router.get('/history', isAuthenticated, getPaymentHistory);

module.exports = router;