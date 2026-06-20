const PDFDocument = require('pdfkit');
const cloudinary = require('../config/cloudinary');
const FinalBill = require('../models/finalBill-Model');
const Booking = require('../models/booking-Model');

const streamUpload = (buffer, publicId) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
        {
            resource_type: 'raw',
            folder: 'gullyguide/final-bills',
            public_id: publicId,
            format: 'pdf',
        },
        (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
});

const buildPdf = (booking, adjustments, totalAmount) => new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(20).text('GullyGuide Final Bill', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Booking ID: ${booking._id}`);
    doc.text(`Tourist: ${booking.tourist?.name || booking.tourist}`);
    doc.text(`Guide: ${booking.guide?.name || booking.guide}`);
    doc.text(`Trip Dates: ${new Date(booking.startDate).toDateString()} - ${new Date(booking.endDate).toDateString()}`);
    doc.text(`People: ${booking.numberOfPeople}`);
    doc.moveDown();
    doc.fontSize(14).text('Charges');
    doc.fontSize(11).text(`Booking Total: ${Number(booking.totalPrice).toFixed(2)}`);

    adjustments.forEach((item) => {
        doc.text(`${item.description}: ${Number(item.amount).toFixed(2)}`);
    });

    doc.moveDown();
    doc.fontSize(14).text(`Final Total: ${Number(totalAmount).toFixed(2)}`);
    doc.moveDown();
    doc.fontSize(9).text(`Generated at: ${new Date().toISOString()}`);
    doc.end();
});

const normalizeAdjustments = (adjustments = []) => {
    if (!Array.isArray(adjustments)) throw new Error('adjustments must be an array');

    return adjustments.map((item) => {
        const description = String(item.description || '').trim();
        const amount = Number(item.amount);

        if (!description) throw new Error('Adjustment description is required');
        if (!Number.isFinite(amount)) throw new Error('Adjustment amount must be a number');

        return { description, amount };
    });
};

exports.generateFinalBill = async (req, res) => {
    try {
        if (req.user.role !== 'guide') return res.status(403).json({ success: false, message: 'Only guides can generate final bills' });

        const booking = await Booking.findById(req.params.bookingId)
            .populate('tourist', 'name email')
            .populate('guide', 'name email')
            .populate('post', 'title');

        if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
        if (booking.guide._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'You can only generate bills for your bookings' });
        }

        const adjustments = normalizeAdjustments(req.body.adjustments || []);
        const adjustmentTotal = adjustments.reduce((sum, item) => sum + item.amount, 0);
        const totalAmount = Number(booking.totalPrice) + adjustmentTotal;

        if (totalAmount < 0) return res.status(400).json({ success: false, message: 'Final total cannot be negative' });

        const pdfBuffer = await buildPdf(booking, adjustments, totalAmount);
        const uploadResult = await streamUpload(pdfBuffer, `final-bill-${booking._id}-${Date.now()}`);

        const bill = await FinalBill.findOneAndUpdate(
            { booking: booking._id },
            {
                booking: booking._id,
                adjustments,
                totalAmount,
                pdfUrl: uploadResult.secure_url,
                generatedAt: new Date(),
            },
            { new: true, upsert: true, runValidators: true }
        ).populate({
            path: 'booking',
            populate: [
                { path: 'tourist', select: 'name email' },
                { path: 'guide', select: 'name email' },
                { path: 'post', select: 'title' },
            ],
        });

        res.status(201).json({ success: true, message: 'Final bill generated successfully', bill });
    } catch (error) {
        console.error('Generate Final Bill Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
};

exports.getBill = async (req, res) => {
    try {
        const bill = await FinalBill.findById(req.params.id).populate({
            path: 'booking',
            populate: [
                { path: 'tourist', select: 'name email' },
                { path: 'guide', select: 'name email' },
                { path: 'post', select: 'title' },
            ],
        });

        if (!bill) return res.status(404).json({ success: false, message: 'Bill not found' });

        const booking = bill.booking;
        const isAllowed =
            booking.tourist._id.toString() === req.user._id.toString() ||
            booking.guide._id.toString() === req.user._id.toString() ||
            req.user.role === 'admin';

        if (!isAllowed) return res.status(403).json({ success: false, message: 'Not authorized to view this bill' });

        res.status(200).json({ success: true, bill });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.listBills = async (req, res) => {
    try {
        if (req.user.role !== 'guide') return res.status(403).json({ success: false, message: 'Only guides can list bills' });

        const bookings = await Booking.find({ guide: req.user._id }).select('_id');
        const bookingIds = bookings.map((booking) => booking._id);
        const bills = await FinalBill.find({ booking: { $in: bookingIds } }).populate({
            path: 'booking',
            populate: [
                { path: 'tourist', select: 'name email' },
                { path: 'guide', select: 'name email' },
                { path: 'post', select: 'title' },
            ],
        }).sort('-generatedAt');

        res.status(200).json({ success: true, count: bills.length, bills });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


