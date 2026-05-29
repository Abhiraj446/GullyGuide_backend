const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    tourist: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    guide: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    tourDate: {
        type: Date,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    durationDays: {
        type: Number,
        required: true,
        min: 1
    },
    numberOfPeople: {
        type: Number,
        required: true,
        min: 1,
        max: 20
    },
    selectedPackage: {
        name: {
            type: String,
            required: true,
            enum: ['Standard', 'Medium', 'Premium'],
            default: 'Standard'
        },
        multiplier: {
            type: Number,
            required: true,
            min: 0,
            default: 1
        }
    },
    totalPrice: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled', 'completed'],
        default: 'pending'
    },
    statusOtp: {
        code: {
            type: String,
            select: false
        },
        action: {
            type: String,
            enum: ['confirmed'],
            select: false
        },
        expiresAt: {
            type: Date,
            select: false
        }
    },
    specialRequests: {
        type: String,
        maxlength: 500
    },
    cancellationReason: {
        type: String,
        maxlength: 300
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

bookingSchema.index({ guide: 1, startDate: 1, endDate: 1, status: 1 });
bookingSchema.index({ tourist: 1, createdAt: -1 });

bookingSchema.pre('validate', function fillDateRange() {
    if (this.tourDate && !this.startDate) this.startDate = this.tourDate;
    if (this.startDate && !this.endDate) this.endDate = this.startDate;
    if (!this.durationDays && this.startDate && this.endDate) {
        const start = new Date(Date.UTC(
            this.startDate.getUTCFullYear(),
            this.startDate.getUTCMonth(),
            this.startDate.getUTCDate()
        ));
        const end = new Date(Date.UTC(
            this.endDate.getUTCFullYear(),
            this.endDate.getUTCMonth(),
            this.endDate.getUTCDate()
        ));
        this.durationDays = Math.max(1, Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1);
    }
});

module.exports = mongoose.model('Booking', bookingSchema);
