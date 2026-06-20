const mongoose = require('mongoose');
const Booking = require('../models/booking-Model');
const Payment = require('../models/payment-Model');
const User = require('../models/userModel');

exports.getAdminReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};

    if (startDate) {
      const parsedStart = new Date(startDate);
      if (Number.isNaN(parsedStart.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid startDate' });
      }
      match.createdAt = { $gte: parsedStart };
    }

    if (endDate) {
      const parsedEnd = new Date(endDate);
      if (Number.isNaN(parsedEnd.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid endDate' });
      }
      match.createdAt = match.createdAt || {};
      match.createdAt.$lte = new Date(parsedEnd.setHours(23, 59, 59, 999));
    }

    const paymentsMatch = { status: 'paid' };
    if (Object.keys(match).length) {
      paymentsMatch.createdAt = match.createdAt;
    }

    const revenueAggregation = await Payment.aggregate([
      { $match: paymentsMatch },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          count: { $sum: 1 },
        }
      }
    ]);

    const statusAggregation = await Payment.aggregate([
      { $match: Object.keys(match).length ? { createdAt: match.createdAt } : {} },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const bookingStatusAggregation = await Booking.aggregate([
      { $match: Object.keys(match).length ? { createdAt: match.createdAt } : {} },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const topGuidesAggregation = await Booking.aggregate([
      { $match: { status: 'completed', ...(Object.keys(match).length ? { createdAt: match.createdAt } : {}) } },
      {
        $group: {
          _id: '$guide',
          completedBookings: { $sum: 1 }
        }
      },
      { $sort: { completedBookings: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'guide'
        }
      },
      { $unwind: { path: '$guide', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          guideId: '$_id',
          guideName: { $ifNull: ['$guide.name', 'Unknown'] },
          completedBookings: 1
        }
      }
    ]);

    const totalRevenue = revenueAggregation[0]?.totalRevenue || 0;
    const commission = Number((totalRevenue * 0.1).toFixed(2));

    const paymentStatusCounts = statusAggregation.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const bookingStatusCounts = bookingStatusAggregation.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      totalRevenue,
      commission,
      paymentCount: revenueAggregation[0]?.count || 0,
      paymentStatusCounts,
      bookingStatusCounts,
      topGuides: topGuidesAggregation,
    });
  } catch (error) {
    console.error('Admin Reports Error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
};
