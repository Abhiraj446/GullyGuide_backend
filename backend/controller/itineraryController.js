const Itinerary = require('../models/itinerary-Model');
const Post = require('../models/post');
const PDFDocument = require('pdfkit');

// CREATE NEW ITINERARY
exports.createItinerary = async (req, res) => {
    try {
        const { title, destination, startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: "Start date and end date are required" });
        }

        const itinerary = new Itinerary({
            user: req.user._id,
            title: title || 'My Trip Plan',
            destination: destination || {},
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            activities: []
        });

        await itinerary.save();

        res.status(201).json({
            success: true,
            message: "Itinerary created successfully",
            itinerary
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// ADD POST TO ITINERARY
exports.addToItinerary = async (req, res) => {
    try {
        const { itineraryId } = req.params;
        const { postId, day, time, notes } = req.body;

        // Find itinerary
        const itinerary = await Itinerary.findOne({
            _id: itineraryId,
            user: req.user._id
        });

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        // Check if already added
        const existing = itinerary.activities.find(a => a.post.toString() === postId);
        if (existing) {
            return res.status(400).json({ error: "This post is already in your itinerary" });
        }

        // Add activity
        const activityCount = itinerary.activities.filter(a => a.day === day).length;
        itinerary.activities.push({
            post: postId,
            day: day || 1,
            time: time || '10:00 AM',
            notes: notes || '',
            order: activityCount
        });

        await itinerary.save();

        // Populate post details
        const populatedItinerary = await Itinerary.findById(itineraryId)
            .populate('activities.post', 'title photo price location');

        res.json({
            success: true,
            message: "Added to itinerary",
            itinerary: populatedItinerary
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET MY ITINERARIES
exports.getMyItineraries = async (req, res) => {
    try {
        const itineraries = await Itinerary.find({ user: req.user._id })
            .populate('activities.post', 'title photo price location')
            .sort('-createdAt');

        res.json({
            success: true,
            count: itineraries.length,
            itineraries
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// GET SINGLE ITINERARY
exports.getItinerary = async (req, res) => {
    try {
        const { itineraryId } = req.params;

        const itinerary = await Itinerary.findOne({
            _id: itineraryId,
            user: req.user._id
        }).populate('activities.post', 'title photo price location body');

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        // Group activities by day
        const groupedByDay = {};
        itinerary.activities.forEach(activity => {
            if (!groupedByDay[activity.day]) {
                groupedByDay[activity.day] = [];
            }
            groupedByDay[activity.day].push(activity);
        });

        res.json({
            success: true,
            itinerary,
            groupedByDay
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// UPDATE ACTIVITY
exports.updateActivity = async (req, res) => {
    try {
        const { itineraryId, activityId } = req.params;
        const { day, time, notes } = req.body;

        const itinerary = await Itinerary.findOne({
            _id: itineraryId,
            user: req.user._id
        });

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        const activity = itinerary.activities.id(activityId);
        if (!activity) {
            return res.status(404).json({ error: "Activity not found" });
        }

        if (day) activity.day = day;
        if (time) activity.time = time;
        if (notes !== undefined) activity.notes = notes;

        await itinerary.save();

        res.json({
            success: true,
            message: "Activity updated",
            itinerary
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// REMOVE ACTIVITY FROM ITINERARY
exports.removeActivity = async (req, res) => {
    try {
        const { itineraryId, activityId } = req.params;

        const itinerary = await Itinerary.findOne({
            _id: itineraryId,
            user: req.user._id
        });

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        itinerary.activities.pull(activityId);
        await itinerary.save();

        res.json({
            success: true,
            message: "Activity removed from itinerary"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// REORDER ACTIVITIES
exports.reorderActivities = async (req, res) => {
    try {
        const { itineraryId } = req.params;
        const { activities } = req.body; // Array of { activityId, order }

        const itinerary = await Itinerary.findOne({
            _id: itineraryId,
            user: req.user._id
        });

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        activities.forEach(({ activityId, order }) => {
            const activity = itinerary.activities.id(activityId);
            if (activity) {
                activity.order = order;
            }
        });

        // Sort activities by order
        itinerary.activities.sort((a, b) => a.order - b.order);
        await itinerary.save();

        res.json({
            success: true,
            message: "Activities reordered",
            itinerary
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// DELETE ITINERARY
exports.deleteItinerary = async (req, res) => {
    try {
        const { itineraryId } = req.params;

        const result = await Itinerary.findOneAndDelete({
            _id: itineraryId,
            user: req.user._id
        });

        if (!result) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        res.json({
            success: true,
            message: "Itinerary deleted successfully"
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// SHARE ITINERARY (Generate public link)
exports.shareItinerary = async (req, res) => {
    try {
        const { itineraryId } = req.params;

        const itinerary = await Itinerary.findOne({
            _id: itineraryId,
            user: req.user._id
        });

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        // Generate shareable link
        const shareLink = itinerary.generateShareLink();
        itinerary.isPublic = true;
        await itinerary.save();

        const fullUrl = `${req.protocol}://${req.get('host')}/api/itinerary/shared/${shareLink}`;

        res.json({
            success: true,
            shareableLink: fullUrl,
            shareCode: shareLink
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// VIEW SHARED ITINERARY (Public - no auth)
exports.getSharedItinerary = async (req, res) => {
    try {
        const { shareCode } = req.params;

        const itinerary = await Itinerary.findOne({
            shareableLink: shareCode,
            isPublic: true
        }).populate('activities.post', 'title photo price location body')
          .populate('user', 'name avatar');

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found or private" });
        }

        res.json({
            success: true,
            itinerary
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};

// EXPORT AS PDF
exports.exportAsPDF = async (req, res) => {
    try {
        const { itineraryId } = req.params;

        const itinerary = await Itinerary.findOne({
            _id: itineraryId,
            user: req.user._id
        }).populate('activities.post', 'title photo price location body');

        if (!itinerary) {
            return res.status(404).json({ error: "Itinerary not found" });
        }

        // Create PDF
        const doc = new PDFDocument();
        const filename = `${itinerary.title.replace(/\s/g, '_')}_itinerary.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        doc.pipe(res);

        // Header
        doc.fontSize(25).text(itinerary.title, { align: 'center' });
        doc.moveDown();
        
        // Dates
        doc.fontSize(12).text(`Start Date: ${new Date(itinerary.startDate).toLocaleDateString()}`);
        doc.text(`End Date: ${new Date(itinerary.endDate).toLocaleDateString()}`);
        
        if (itinerary.destination.city) {
            doc.text(`Destination: ${itinerary.destination.city}, ${itinerary.destination.state}`);
        }
        
        doc.moveDown();

        // Group by day
        const days = [...new Set(itinerary.activities.map(a => a.day))].sort();

        days.forEach(day => {
            const dayActivities = itinerary.activities.filter(a => a.day === day);
            
            doc.fontSize(18).text(`Day ${day}`, { underline: true });
            doc.moveDown(0.5);
            
            dayActivities.forEach((activity, index) => {
                doc.fontSize(12).text(`${index + 1}. ${activity.post.title}`);
                doc.fontSize(10).text(`   Time: ${activity.time}`);
                doc.text(`   Location: ${activity.post.location.city}, ${activity.post.location.state}`);
                if (activity.notes) {
                    doc.text(`   Notes: ${activity.notes}`);
                }
                doc.moveDown(0.5);
            });
            
            doc.moveDown();
        });

        doc.end();

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
};