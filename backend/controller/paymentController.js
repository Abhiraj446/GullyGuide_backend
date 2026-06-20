const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Booking = require('../models/booking-Model');
const FinalBill = require('../models/finalBill-Model');
const Payment = require('../models/payment-Model');
const Refund = require('../models/refund-Model');
const User = require('../models/userModel');
const { sendNotification, NotificationTemplates } = require('../utils/notificationHelper');
const sendEmail = require('../utils/sendEmail');

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ============================
// 1. CREATE ORDER (Deposit or Final)
// ============================
exports.createPaymentOrder = async (req, res) => {
    try {
        const { bookingId, type } = req.body; // type: 'deposit' or 'final'
        const booking = await Booking.findById(bookingId)
            .populate('tourist', 'name email')
            .populate('guide', 'name email')
            .populate('post', 'title');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        // Authorization: only tourist or guide? Usually tourist initiates payment.
        // We'll allow the tourist (who is the payer) and admin.
        if (req.user.role !== 'admin' && booking.tourist._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to pay for this booking' });
        }

        // Determine amount
        let amount = 0;
        let receipt = `booking_${bookingId}`;
        let notes = {};

        if (type === 'deposit') {
            // Deposit is 20% of total price
            amount = Math.round(booking.totalPrice * 0.2 * 100); // in paise
            notes.purpose = 'Deposit for booking';
            booking.depositAmount = amount / 100;
            booking.paymentStatus = 'deposit_pending';
        } else if (type === 'final') {
            // Final payment is remaining amount (from FinalBill)
            const finalBill = await FinalBill.findOne({ booking: bookingId });
            if (!finalBill) {
                return res.status(404).json({ success: false, message: 'Final bill not generated yet' });
            }
            const totalPaid = booking.depositAmount || 0;
            const remaining = finalBill.totalAmount - totalPaid;
            if (remaining <= 0) {
                return res.status(400).json({ success: false, message: 'No remaining amount to pay' });
            }
            amount = Math.round(remaining * 100);
            notes.purpose = 'Final balance for booking';
            booking.finalAmount = remaining;
            booking.paymentStatus = 'final_pending';
        } else {
            return res.status(400).json({ success: false, message: 'Invalid payment type' });
        }

        if (amount <= 0) {
            return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
        }

        // Create Razorpay Order
        const orderOptions = {
            amount: amount,
            currency: 'INR',
            receipt: receipt,
            notes: {
                bookingId: booking._id.toString(),
                touristEmail: booking.tourist.email,
                guideName: booking.guide.name,
                postTitle: booking.post.title,
                type: type,
            },
        };

        const order = await razorpay.orders.create(orderOptions);

        // Save order ID in booking
        booking.razorpayOrderId = order.id;
        await booking.save();

        // Save payment record for audit
        await Payment.create({
            booking: booking._id,
            type,
            amount: amount / 100,
            currency: 'INR',
            razorpayOrderId: order.id,
            status: 'created',
            metadata: {
                bookingId: booking._id.toString(),
                type,
            }
        });

        // Return order details to frontend
        res.status(200).json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID,
            bookingId: booking._id,
            type: type,
        });
    } catch (error) {
        console.error('Create Order Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

// ============================
// 2. VERIFY PAYMENT (frontend callback)
// ============================
exports.verifyPayment = async (req, res) => {
    try {
        const { orderId, paymentId, signature, bookingId } = req.body;

        // Generate signature to verify
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');

        if (generatedSignature !== signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // Update booking
        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (booking.razorpayOrderId !== orderId) {
            return res.status(400).json({ success: false, message: 'Order ID does not match booking' });
        }

        let updateFields = {
            razorpayPaymentId: paymentId,
            paymentCompletedAt: new Date(),
        };

        let paymentType = 'Deposit';
        if (booking.paymentStatus === 'deposit_pending') {
            updateFields.paymentStatus = 'deposit_paid';
            paymentType = 'Deposit';
        } else if (booking.paymentStatus === 'final_pending') {
            updateFields.paymentStatus = 'fully_paid';
            paymentType = 'Final';
            await FinalBill.findOneAndUpdate({ booking: bookingId }, { status: 'paid' });
        } else {
            return res.status(400).json({ success: false, message: 'Booking is not awaiting payment' });
        }

        const updatedBooking = await Booking.findByIdAndUpdate(bookingId, updateFields, { new: true });

        await Payment.findOneAndUpdate(
            { razorpayOrderId: orderId },
            {
                razorpayPaymentId: paymentId,
                status: 'paid',
                paidAt: new Date(),
                paymentMethod: req.body.method || null,
            },
            { new: true }
        );

        const tourist = await User.findById(booking.tourist).select('name email');
        const amountPaid = paymentType === 'Deposit' ? updatedBooking.depositAmount : updatedBooking.finalAmount;

        await sendEmail({
            email: tourist.email,
            subject: `GullyGuide - ${paymentType} Payment Successful`,
            message: `Hi ${tourist.name},\n\nYour ${paymentType} payment of ₹${amountPaid} for booking ${booking._id} has been received.\n\nThank you for using GullyGuide.`,
        });

        await sendNotification(
            booking.guide,
            booking.tourist,
            'payment_received',
            'Payment Received',
            `${paymentType} payment of ₹${amountPaid} received from tourist.`,
            booking._id,
            'Booking'
        );

        res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            bookingId: bookingId,
            paymentStatus: updatedBooking.paymentStatus,
        });
    } catch (error) {
        console.error('Verify Payment Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

// ============================
// 3. REFUND PAYMENT
// ============================
exports.refundPayment = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { amount, reason } = req.body;

        const booking = await Booking.findById(bookingId)
            .populate('tourist', 'name email')
            .populate('guide', 'name email');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (req.user.role === 'guide' && booking.guide._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to refund this booking' });
        }

        if (booking.paymentStatus === 'pending' || booking.paymentStatus === 'deposit_pending' || booking.paymentStatus === 'final_pending') {
            return res.status(400).json({ success: false, message: 'Booking payment is not completed yet' });
        }

        if (booking.paymentStatus === 'refunded') {
            return res.status(400).json({ success: false, message: 'Booking has already been refunded' });
        }

        const paymentRecord = await Payment.findOne({ booking: bookingId, status: 'paid' }).sort({ createdAt: -1 });
        if (!paymentRecord || !paymentRecord.razorpayPaymentId) {
            return res.status(400).json({ success: false, message: 'No paid payment record available to refund' });
        }

        const refundAmount = amount === undefined || amount === null ? paymentRecord.amount : Number(amount);
        if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Refund amount must be a positive number' });
        }

        if (refundAmount > paymentRecord.amount) {
            return res.status(400).json({ success: false, message: 'Refund amount cannot exceed paid amount' });
        }

        const refundResponse = await razorpay.payments.refund(paymentRecord.razorpayPaymentId, {
            amount: Math.round(refundAmount * 100),
        });

        const refundRecord = await Refund.create({
            booking: booking._id,
            payment: paymentRecord._id,
            user: req.user._id,
            amount: refundAmount,
            currency: 'INR',
            razorpayPaymentId: paymentRecord.razorpayPaymentId,
            razorpayRefundId: refundResponse.id,
            status: refundResponse.status,
            reason: reason || 'Refund processed by guide/admin',
            metadata: refundResponse,
        });

        paymentRecord.status = 'refunded';
        await paymentRecord.save();

        booking.paymentStatus = 'refunded';
        await booking.save();

        res.status(200).json({ success: true, message: 'Refund processed successfully', refund: refundRecord });
    } catch (error) {
        console.error('Refund Payment Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

// ============================
// 4. PAYMENT HISTORY
// ============================
exports.getPaymentHistory = async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const userId = new mongoose.Types.ObjectId(req.user._id);
        const match = {};

        if (req.user.role === 'tourist') {
            match['booking.tourist'] = userId;
        } else if (req.user.role === 'guide') {
            match['booking.guide'] = userId;
        }

        const pipeline = [
            {
                $lookup: {
                    from: 'bookings',
                    localField: 'booking',
                    foreignField: '_id',
                    as: 'booking'
                }
            },
            { $unwind: '$booking' },
            {
                $lookup: {
                    from: 'posts',
                    localField: 'booking.post',
                    foreignField: '_id',
                    as: 'post'
                }
            },
            { $unwind: { path: '$post', preserveNullAndEmptyArrays: true } },
        ];

        if (Object.keys(match).length) {
            pipeline.push({ $match: match });
        }

        pipeline.push(
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $project: {
                                _id: 1,
                                bookingId: '$booking._id',
                                bookingTitle: { $ifNull: ['$post.title', 'Unknown'] },
                                amount: '$amount',
                                paymentType: '$type',
                                status: '$status',
                                date: '$createdAt'
                            }
                        }
                    ]
                }
            }
        );

        const result = await Payment.aggregate(pipeline);
        const total = result[0].metadata[0] ? result[0].metadata[0].total : 0;
        const history = result[0].data;

        res.status(200).json({
            success: true,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            history,
        });
    } catch (error) {
        console.error('Get Payment History Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

// ============================
// 5. WEBHOOK HANDLER
// ============================
exports.webhook = async (req, res) => {
    try {
        // Verify webhook signature (if you have secret)
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers['x-razorpay-signature'];
        const webhookBody = req.rawBody || JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(webhookBody)
            .digest('hex');

        if (!webhookSecret) {
            return res.status(500).json({ success: false, message: 'Webhook secret is not configured' });
        }

        if (signature !== expectedSignature) {
            return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
        }

        const event = req.body;
        // Handle payment.captured event
        if (event.event === 'payment.captured') {
            const payment = event.payload.payment.entity;
            const orderId = payment.order_id;
            const paymentId = payment.id;

            // Find booking by orderId
            const booking = await Booking.findOne({ razorpayOrderId: orderId });
            if (!booking) {
                console.log('Booking not found for orderId:', orderId);
                return res.status(200).json({ success: true }); // Still return 200 to avoid retry
            }

            const paymentRecord = await Payment.findOne({ razorpayOrderId: orderId });
            if (paymentRecord && paymentRecord.status === 'paid') {
                return res.status(200).json({ success: true });
            }

            // Update booking
            let updateFields = {
                razorpayPaymentId: paymentId,
                paymentCompletedAt: new Date(),
            };

            if (booking.paymentStatus === 'deposit_pending') {
                updateFields.paymentStatus = 'deposit_paid';
            } else if (booking.paymentStatus === 'final_pending') {
                updateFields.paymentStatus = 'fully_paid';
                await FinalBill.findOneAndUpdate(
                    { booking: booking._id },
                    { status: 'paid' }
                );
            } else {
                return res.status(200).json({ success: true });
            }

            await Booking.findByIdAndUpdate(booking._id, updateFields);

            if (paymentRecord) {
                await Payment.findByIdAndUpdate(paymentRecord._id, {
                    razorpayPaymentId: paymentId,
                    status: 'paid',
                    paidAt: new Date(),
                });
            }

            console.log(`Webhook: Payment ${paymentId} for booking ${booking._id} updated.`);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Webhook Error:', error);
        // Always return 200 to avoid retries from Razorpay
        res.status(200).json({ success: false, message: error.message });
    }
};