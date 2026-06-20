const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
    {
        guide: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Asset name is required'],
            trim: true,
            maxlength: [100, 'Asset name cannot exceed 100 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
            default: '',
        },
        pricePerDay: {
            type: Number,
            required: [true, 'Price per day is required'],
            min: [0, 'Price cannot be negative'],
        },
        quantityAvailable: {
            type: Number,
            required: [true, 'Available quantity is required'],
            min: [1, 'Quantity must be at least 1'],
            default: 1,
        },
        type: {
            type: String,
            enum: ['bike', 'car', 'hotel', 'camera', 'other'],
            default: 'other',
            index: true,
        },
        images: {
            type: [String], // Cloudinary URLs
            default: [],
            validate: {
                validator: function (arr) {
                    return arr.length <= 5; // Max 5 images per asset
                },
                message: 'Cannot have more than 5 images',
            },
        },
    },
    {
        timestamps: true, // Adds createdAt & updatedAt automatically
    }
);

// Compound index for fast guide-specific lookups with type filtering
assetSchema.index({ guide: 1, type: 1 });

module.exports = mongoose.model('Asset', assetSchema);
