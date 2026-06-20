const mongoose = require('mongoose');

const customPackageSchema = new mongoose.Schema(
    {
        tourist: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        guide: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        post: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Post',
            required: true, // Package always linked to a guide's post
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        numberOfPeople: {
            type: Number,
            required: true,
            min: 1,
            max: 20,
        },
        // 🔹 Selected Assets from Guide's inventory (Snapshot)
        selectedAssets: {
            type: [
                {
                    assetId: {
                        type: mongoose.Schema.Types.ObjectId,
                        ref: 'Asset',
                        required: true,
                    },
                    quantity: {
                        type: Number,
                        required: true,
                        min: 1,
                    },
                    // Snapshot of asset price at the time of estimation
                    pricePerDay: {
                        type: Number,
                        required: true,
                        min: 0,
                    },
                    // Calculated total for this asset line (pricePerDay * quantity * days)
                    totalPrice: {
                        type: Number,
                        required: true,
                        min: 0,
                    },
                },
            ],
            default: [],
        },
        // 🔹 Base price snapshot (post.price at estimate time)
        basePrice: {
            type: Number,
            required: true,
            min: 0,
        },
        // 🔹 Discount applied (e.g., 10 for 10%)
        groupDiscount: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        // 🔹 Final total estimate (base after discount + all asset totals)
        totalEstimate: {
            type: Number,
            required: true,
            min: 0,
        },
        // 🔹 Price Lock – Expiry time (1 hour from save)
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 }, // TTL index – MongoDB auto-delete after expiry (optional)
        },
        // 🔹 Status of the package
        status: {
            type: String,
            enum: ['draft', 'locked', 'booked', 'expired'],
            default: 'draft',
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for fast tourist queries
customPackageSchema.index({ tourist: 1, createdAt: -1 });
// Index for guide queries
customPackageSchema.index({ guide: 1, status: 1 });

module.exports = mongoose.model('CustomPackage', customPackageSchema);