const mongoose = require('mongoose');

const packageTemplateSchema = new mongoose.Schema(
    {
        guide: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Template name is required'],
            trim: true,
            maxlength: [100, 'Template name cannot exceed 100 characters'],
        },
        description: {
            type: String,
            trim: true,
            maxlength: [1000, 'Description cannot exceed 1000 characters'],
            default: '',
        },
        assets: [{
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
            fixedPrice: {
                type: Number,
                min: 0,
            },
        }],
        basePrice: {
            type: Number,
            min: 0,
        },
        discount: {
            type: Number,
            min: 0,
            max: 100,
        },
    },
    { timestamps: true }
);

packageTemplateSchema.index({ guide: 1, createdAt: -1 });

module.exports = mongoose.model('PackageTemplate', packageTemplateSchema);
