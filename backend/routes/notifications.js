const express = require('express');
const Booking = require('../models/Booking');
const FoodOrder = require('../models/FoodOrder');
const Notification = require('../models/Notification');

const router = express.Router();


// Customer notification inbox (phone-scoped).
router.get('/customer', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').trim();

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Valid 10-digit mobile number required'
      });
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ phone })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Notification.countDocuments({ phone, read: false })
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    console.error('Customer notification inbox:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch notifications'
    });
  }
});

// Mark all notifications belonging to this phone as read.
router.patch('/read-all', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').trim();

    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Valid 10-digit mobile number required'
      });
    }

    await Notification.updateMany(
      { phone, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all customer notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to update notifications'
    });
  }
});

// Mark one notification as read, scoped to the supplied phone.
router.patch('/:id/read', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const phone = String(req.query.phone || '').trim();

    if (!/^[0-9]{10}$/.test(phone) ||
        !mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification details'
      });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, phone },
      { $set: { read: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({ success: true, notification });
  } catch (error) {
    console.error('Mark customer notification:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to update notification'
    });
  }
});

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
