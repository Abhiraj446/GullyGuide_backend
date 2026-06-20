const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true,
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    required: true,
    default: 'INR',
  },
  razorpayPaymentId: {
    type: String,
    required: true,
  },
  razorpayRefundId: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['created', 'processed', 'failed', 'refunded'],
    default: 'created',
  },
  reason: {
    type: String,
    trim: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
}, { timestamps: true });

refundSchema.index({ booking: 1, payment: 1, user: 1 });

module.exports = mongoose.model('Refund', refundSchema);
