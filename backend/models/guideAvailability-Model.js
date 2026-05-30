const mongoose = require('mongoose');

const guideAvailabilitySchema = new mongoose.Schema({
    guide: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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
    reason: {
        type: String,
        maxlength: 200,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

guideAvailabilitySchema.index({ guide: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('GuideAvailability', guideAvailabilitySchema);
