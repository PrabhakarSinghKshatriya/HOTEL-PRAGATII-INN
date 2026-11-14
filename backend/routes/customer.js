const express = require('express');
const rateLimit = require('express-rate-limit');
const Booking = require('../models/Booking');
const FoodOrder = require('../models/FoodOrder');
const CustomerFeedback = require('../models/CustomerFeedback');
const createNotification = require('../utils/createNotification');
const createAdminNotification = require('../utils/createAdminNotification');

const router = express.Router();

const customerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => req.method === 'GET' && req.path === '/feedback/public',
  message: { success: false, message: 'Too many attempts. Please try again later.' }
});

router.use(customerLimiter);

function validPhone(phone) {
  return /^[0-9]{10}$/.test(String(phone || ''));
}


// Public homepage reviews: aggregate all ratings, return latest three.
router.get('/feedback/public', async (req, res) => {
  try {
    const [summary, latest] = await Promise.all([
      CustomerFeedback.aggregate([
        { $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }}
      ]),
      CustomerFeedback.find()
        .select('customerName rating comment createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .limit(3)
        .lean()
    ]);

    const result = summary[0] || { totalReviews: 0, averageRating: 0 };

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      totalReviews: result.totalReviews,
      averageRating: Number(result.averageRating.toFixed(1)),
      latest
    });
  } catch (error) {
    console.error('Public reviews:', error);
    res.status(500).json({ success: false, message: 'Unable to load reviews.' });
  }
});

// Customer booking and food order history.
// Requires the registered 10-digit phone number.
router.get('/history', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').trim();
    if (!validPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number.' });
    }

    const [bookings, orders, feedback] = await Promise.all([
      Booking.find({ phone })
        .select('refNo name phone roomNumber roomName roomType checkin checkout nights total status paymentMethod paymentStatus createdAt cancellationRequest')
        .sort({ createdAt: -1 }).limit(30).lean(),
      FoodOrder.find({ customerPhone: phone })
        .select('refNo customerName customerPhone table items subtotal tax total status paymentMethod paymentStatus transactionId createdAt cancellationRequest')
        .sort({ createdAt: -1 }).limit(30).lean(),
      CustomerFeedback.find({ phone }).select('type refNo').lean()
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, bookings, orders, feedback });
  } catch (error) {
    console.error('Customer history:', error);
    res.status(500).json({ success: false, message: 'Unable to fetch customer history.' });
  }
});

// Request cancellation. Actual cancellation remains under admin control.
router.post('/cancel', async (req, res) => {
  try {
    const { type, refNo, phone, reason = '' } = req.body || {};

    if (!['booking', 'food'].includes(type) || !refNo || !validPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid cancellation details.' });
    }

    if (String(reason).trim().length > 500) {
      return res.status(400).json({ success: false, message: 'Reason must be under 500 characters.' });
    }

    const Model = type === 'booking' ? Booking : FoodOrder;
    const phoneField = type === 'booking' ? 'phone' : 'customerPhone';
    const record = await Model.findOne({ refNo: String(refNo).trim(), [phoneField]: phone });

    if (!record) {
      return res.status(404).json({ success: false, message: 'Booking or order not found.' });
    }

    const terminal = type === 'booking'
      ? ['Cancelled', 'Completed', 'Checked-in'].includes(record.status)
      : ['Cancelled', 'Served'].includes(record.status);

    if (terminal) {
      return res.status(400).json({ success: false, message: 'Cancellation is not available for this status. Please contact the hotel.' });
    }

    if (record.cancellationRequest?.requested) {
      return res.status(409).json({ success: false, message: 'A cancellation request has already been submitted.' });
    }

    record.cancellationRequest = {
      requested: true,
      reason: String(reason).trim(),
      requestedAt: new Date()
    };
    await record.save();

    await createNotification({
      refNo: record.refNo,
      phone,
      type,
      title: 'Cancellation Request Received',
      message: 'Your cancellation request has been sent to the hotel. The booking/order remains active until the hotel reviews it.',
      status: record.status
    });

    await createAdminNotification({
      type,
      refNo: record.refNo,
      recordId: record._id,
      customerName: type === 'booking' ? record.name : record.customerName,
      phone,
      title: 'Customer Cancellation Request',
      message: `Cancellation requested for ${record.refNo}. Reason: ${String(reason).trim() || 'Not provided'}`
    });

    res.json({ success: true, message: 'Cancellation request sent. The hotel will review it.' });
  } catch (error) {
    console.error('Customer cancellation:', error);
    res.status(500).json({ success: false, message: 'Unable to submit cancellation request.' });
  }
});

// Feedback allowed only after completed stay / served food order.
router.post('/feedback', async (req, res) => {
  try {
    const { type, refNo, phone, rating, comment = '' } = req.body || {};
    const score = Number(rating);

    if (!['booking', 'food'].includes(type) || !refNo || !validPhone(phone) ||
        !Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ success: false, message: 'Enter valid feedback details and a 1–5 star rating.' });
    }

    if (String(comment).trim().length > 1000) {
      return res.status(400).json({ success: false, message: 'Feedback must be under 1000 characters.' });
    }

    const Model = type === 'booking' ? Booking : FoodOrder;
    const phoneField = type === 'booking' ? 'phone' : 'customerPhone';
    const record = await Model.findOne({ refNo: String(refNo).trim(), [phoneField]: phone });

    if (!record) {
      return res.status(404).json({ success: false, message: 'Booking or order not found.' });
    }

    const eligible = type === 'booking'
      ? record.status === 'Completed'
      : record.status === 'Served';

    if (!eligible) {
      return res.status(400).json({ success: false, message: 'Feedback is available after your stay is completed or your food order is served.' });
    }

    const feedback = await CustomerFeedback.create({
      type,
      refNo: record.refNo,
      phone,
      customerName: type === 'booking' ? record.name : record.customerName,
      rating: score,
      comment: String(comment).trim()
    });

    await createAdminNotification({
      type,
      refNo: record.refNo,
      recordId: record._id,
      customerName: feedback.customerName,
      phone,
      title: 'New Customer Feedback',
      message: `${score}/5 stars received for ${record.refNo}.`
    });

    res.status(201).json({ success: true, message: 'Thank you for your feedback.' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Feedback has already been submitted for this booking/order.' });
    }
    console.error('Customer feedback:', error);
    res.status(500).json({ success: false, message: 'Unable to submit feedback.' });
  }
});

module.exports = router;
