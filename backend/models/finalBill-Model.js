const mongoose = require('mongoose');

const finalBillSchema = new mongoose.Schema({
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: true,
        unique: true,
        index: true,
    },
    adjustments: [{
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 300,
        },
        amount: {
            type: Number,
            required: true,
        },
    }],
    totalAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    pdfUrl: {
        type: String,
        required: true,
    },
    generatedAt: {
        type: Date,
        default: Date.now,
    },
});

finalBillSchema.index({ generatedAt: -1 });

module.exports = mongoose.model('FinalBill', finalBillSchema);
