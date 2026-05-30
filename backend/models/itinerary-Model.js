const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
    },
    day: {
        type: Number,
        required: true,
        min: 1
    },
    time: {
        type: String,
        default: '10:00 AM'
    },
    notes: {
        type: String,
        maxlength: 500
    },
    order: {
        type: Number,
        default: 0
    }
});

const itinerarySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        default: 'My Trip Plan'
    },
    destination: {
        city: String,
        state: String
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    activities: [activitySchema],
    shareableLink: {
        type: String,
        unique: true,
        sparse: true
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-update updatedAt
itinerarySchema.pre('save', function() {
    this.updatedAt = new Date();
});

// Generate unique shareable link
itinerarySchema.methods.generateShareLink = function() {
    const crypto = require('crypto');
    this.shareableLink = crypto.randomBytes(16).toString('hex');
    return this.shareableLink;
};

module.exports = mongoose.model('Itinerary', itinerarySchema);
