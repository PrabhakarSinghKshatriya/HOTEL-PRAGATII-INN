const express = require('express');
const Booking = require('../models/Booking');
const FoodOrder = require('../models/FoodOrder');
const Notification = require('../models/Notification');

const router = express.Router();

// Customer: Track booking/order using reference and mobile number.
router.get('/:refNo', async (req, res) => {
  try {
    const refNo = String(req.params.refNo || '').trim();
    const phone = String(req.query.phone || '').trim();

    if (!refNo || !/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Valid reference number and 10-digit mobile number required'
      });
    }

    const booking = await Booking.findOne({
      refNo,
      phone
    }).lean();

    const order = booking ? null : await FoodOrder.findOne({
      refNo,
      customerPhone: phone
    }).lean();

    const record = booking || order;

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'No booking or order found with these details'
      });
    }

    const notifications = await Notification.find({
      refNo,
      phone
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      recordType: booking ? 'booking' : 'food',
      currentStatus: record.status,
      reference: record.refNo,
      notifications
    });

  } catch (error) {
    console.error('Customer notifications:', error);

    res.status(500).json({
      success: false,
      message: 'Unable to fetch notifications'
    });
  }
});

module.exports = router;
