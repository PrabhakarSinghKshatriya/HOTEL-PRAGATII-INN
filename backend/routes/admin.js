const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const Booking = require('../models/Booking');
const FoodOrder = require('../models/FoodOrder');
const FoodItem = require('../models/FoodItem');
const Room = require('../models/Room');
const Offer = require('../models/Offer');
const AdminNotification = require('../models/AdminNotification');
const CustomerFeedback = require('../models/CustomerFeedback');

const router = express.Router();

router.use(adminAuth);

function getISTRange(date, startDate, endDate) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata'
  });

  const from = startDate || date || today;
  const to = endDate || from;

  if (!valid(from) || !valid(to) || to < from) {
    throw new Error('Invalid report date range');
  }

  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(`${to}T00:00:00+05:30`);
  end.setTime(end.getTime() + 86400000);

  return { start, end, day: from, startDay: from, endDay: to };
}

// Complete dashboard data and date-wise report
router.get('/data', async (req, res) => {
  try {
    const { start, end, day, startDay, endDay } =
      getISTRange(req.query.date, req.query.startDate, req.query.endDate);

    const [
      bookings,
      orders,
      rooms,
      menu,
      allBookings,
      allOrders
    ] = await Promise.all([
      Booking.find().sort({ createdAt: -1 }).lean(),
      FoodOrder.find().sort({ createdAt: -1 }).lean(),
      Room.find().sort({ roomNumber: 1 }).lean(),
      FoodItem.find().sort({ category: 1, name: 1 }).lean(),
      Booking.find({
        createdAt: { $gte: start, $lt: end }
      }).lean(),
      FoodOrder.find({
        createdAt: { $gte: start, $lt: end }
      }).lean()
    ]);

    const paid = [...allBookings, ...allOrders]
      .filter(x => x.paymentStatus === 'Paid')
      .reduce((sum, x) => sum + Number(x.total || 0), 0);

    const bookingRevenue = allBookings
      .filter(x => x.paymentStatus === 'Paid')
      .reduce((sum, x) => sum + Number(x.total || 0), 0);

    const foodRevenue = allOrders
      .filter(x => x.paymentStatus === 'Paid')
      .reduce((sum, x) => sum + Number(x.total || 0), 0);

    // Payment-method collections include only successfully paid records.
    const onlineCollection = [...allBookings, ...allOrders]
      .filter(x => x.paymentStatus === 'Paid' && x.paymentMethod === 'UPI')
      .reduce((sum, x) => sum + Number(x.total || 0), 0);

    const cashCollection = [...allBookings, ...allOrders]
      .filter(x => x.paymentStatus === 'Paid' && x.paymentMethod === 'Cash')
      .reduce((sum, x) => sum + Number(x.total || 0), 0);

    const todayCheckins = allBookings.filter(b => {
      const value = new Date(b.checkin);
      return value >= start && value < end;
    }).length;

    const todayCheckouts = allBookings.filter(b => {
      const value = new Date(b.checkout);
      return value >= start && value < end;
    }).length;

    const customers = new Map();

    bookings.forEach(b => {
      const key = b.phone;
      if (key) {
        const old = customers.get(key) || {
          name: b.name,
          phone: key,
          bookings: 0,
          bookingAmount: 0,
          lastActivity: b.createdAt
        };
        old.bookings++;
        old.bookingAmount += Number(b.total || 0);
        if (new Date(b.createdAt) > new Date(old.lastActivity)) {
          old.lastActivity = b.createdAt;
        }
        customers.set(key, old);
      }
    });

    orders.forEach(o => {
      const key = o.customerPhone;
      if (key) {
        const old = customers.get(key) || {
          name: o.customerName,
          phone: key,
          bookings: 0,
          bookingAmount: 0,
          lastActivity: o.createdAt
        };
        old.foodOrders = (old.foodOrders || 0) + 1;
        old.foodAmount = (old.foodAmount || 0) + Number(o.total || 0);
        customers.set(key, old);
      }
    });

    res.json({
      success: true,
      reportDate: day,
      reportStartDate: startDay,
      reportEndDate: endDay,
      reportBookings: allBookings,
      reportOrders: allOrders,
      bookings,
      orders,
      rooms,
      menu,
      customers: [...customers.values()],
      summary: {
        totalBookings: bookings.length,
        todayBookings: allBookings.length,
        pendingBookings: bookings.filter(b => b.status === 'Pending').length,
        confirmedBookings: bookings.filter(b => b.status === 'Confirmed').length,
        checkedInBookings: bookings.filter(b => b.status === 'Checked-in').length,
        completedBookings: bookings.filter(b => b.status === 'Completed').length,
        todayCheckins,
        todayCheckouts,
        totalOrders: orders.length,
        todayOrders: allOrders.length,
        pendingOrders: orders.filter(o =>
          ['Received', 'Preparing'].includes(o.status)
        ).length,
        completedOrders: orders.filter(o => o.status === 'Served').length,
        totalRooms: rooms.length,
        availableRooms: rooms.filter(r => r.isActive && r.status === 'Available').length,
        occupiedRooms: rooms.filter(r => r.status === 'Occupied').length,
        maintenanceRooms: rooms.filter(r => r.status === 'Maintenance').length,
        todayCollection: paid,
        roomCollection: bookingRevenue,
        foodCollection: foodRevenue,
        onlineCollection,
        cashCollection,
        unpaidBookings: bookings.filter(b => b.paymentStatus === 'Unpaid').length,
        unpaidOrders: orders.filter(o => o.paymentStatus === 'Unpaid').length
      }
    });
  } catch (error) {
    console.error('Admin dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load dashboard data'
    });
  }
});


// Add a new room without modifying existing room records.
router.post('/rooms', async (req, res) => {
  try {
    const roomNumber = Number(req.body.roomNumber);
    const roomType = req.body.roomType;
    const price = Number(req.body.price);

    if (!Number.isInteger(roomNumber) || roomNumber < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid room number is required'
      });
    }

    if (!['AC', 'Non-AC'].includes(roomType)) {
      return res.status(400).json({
        success: false,
        message: 'Room type must be AC or Non-AC'
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid room price is required'
      });
    }

    const existing = await Room.findOne({ roomNumber });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'This room number already exists'
      });
    }

    const room = await Room.create({
      roomNumber,
      roomType,
      price,
      name: String(req.body.name || roomType).trim(),
      description: String(req.body.description || '').trim(),
      amenities: Array.isArray(req.body.amenities)
        ? req.body.amenities.map(x => String(x).trim()).filter(Boolean)
        : [],
      image: String(req.body.image || '').trim(),
      status: 'Available',
      isActive: true
    });

    res.status(201).json({ success: true, room });
  } catch (error) {
    console.error('Add room:', error);

    res.status(400).json({
      success: false,
      message: error.code === 11000
        ? 'This room number already exists'
        : 'Unable to add room'
    });
  }
});

// Safely deactivate a room; preserve booking history.
router.delete('/rooms/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    if (room.status === 'Occupied') {
      return res.status(409).json({
        success: false,
        message: 'Occupied room cannot be deactivated'
      });
    }

    const activeBooking = await Booking.findOne({
      roomId: room._id,
      status: { $in: ['Pending', 'Confirmed', 'Checked-in'] },
      checkout: { $gt: new Date() }
    }).lean();

    if (activeBooking) {
      return res.status(409).json({
        success: false,
        message: 'Room has an active or upcoming booking'
      });
    }

    room.isActive = false;
    await room.save();

    res.json({
      success: true,
      message: 'Room deactivated successfully',
      room
    });
  } catch (error) {
    console.error('Deactivate room:', error);

    res.status(400).json({
      success: false,
      message: 'Unable to deactivate room'
    });
  }
});

// Update room details
router.patch('/rooms/:id', async (req, res) => {
  try {
    const allowed = ['price', 'status', 'isActive', 'name', 'description', 'amenities', 'image'];
    const updates = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (
      updates.price !== undefined &&
      (!Number.isFinite(Number(updates.price)) || Number(updates.price) < 0)
    ) {
      return res.status(400).json({ success: false, message: 'Invalid room price' });
    }

    if (updates.price !== undefined) updates.price = Number(updates.price);

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    res.json({ success: true, room });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Unable to update room' });
  }
});

// Update payment status for booking or food order
router.patch('/payment/:type/:id', async (req, res) => {
  try {
    const Model = req.params.type === 'booking'
      ? Booking
      : req.params.type === 'food'
        ? FoodOrder
        : null;

    if (!Model) {
      return res.status(400).json({ success: false, message: 'Invalid payment type' });
    }

    const allowed = ['Unpaid', 'Pending', 'Paid', 'Refunded'];

    if (!allowed.includes(req.body.paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status' });
    }

    const existingRecord = await Model.findById(req.params.id);

    if (!existingRecord) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    if (
      req.body.paymentStatus === 'Paid' &&
      existingRecord.paymentMethod === 'UPI' &&
      !String(existingRecord.transactionId || '').trim()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Cannot verify UPI payment without a transaction ID'
      });
    }

    existingRecord.paymentStatus = req.body.paymentStatus;
    existingRecord.paymentVerifiedAt =
      req.body.paymentStatus === 'Paid' ? new Date() : null;

    const record = await existingRecord.save();

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Unable to update payment' });
  }
});

// Offer management — all routes are protected by router-level adminAuth.
router.get('/offers', async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, offers });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch offers' });
  }
});

router.post('/offers', async (req, res) => {
  try {
    const { title, scope, discountType, discountValue, startsAt, expiresAt, isActive = true } = req.body;
    const value = Number(discountValue);
    const start = new Date(startsAt);
    const expiry = new Date(expiresAt);

    if (!String(title || '').trim() || !['room', 'food'].includes(scope) ||
        !['percentage', 'fixed'].includes(discountType) ||
        !Number.isFinite(value) || value <= 0 ||
        (discountType === 'percentage' && value > 100) ||
        isNaN(start) || isNaN(expiry) || expiry <= start) {
      return res.status(400).json({ success: false, message: 'Please enter valid offer details and dates' });
    }

    // Keep one offer per category; older offers remain stored but inactive.
if (isActive === true) {
  await Offer.updateMany(
    { scope },
    { $set: { isActive: false } }
  );
}
    const offer = await Offer.create({
      title: String(title).trim(),
      scope,
      discountType,
      discountValue: value,
      startsAt: start,
      expiresAt: expiry,
      isActive: Boolean(isActive)
    });

    res.status(201).json({ success: true, offer });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to create offer' });
  }
});

router.patch('/offers/:id', async (req, res) => {
  try {
    const allowed = ['title', 'scope', 'discountType', 'discountValue', 'startsAt', 'expiresAt', 'isActive'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (update.scope && !['room', 'food'].includes(update.scope)) {
      return res.status(400).json({ success: false, message: 'Invalid offer category' });
    }
    if (update.discountType && !['percentage', 'fixed'].includes(update.discountType)) {
      return res.status(400).json({ success: false, message: 'Invalid discount type' });
    }
    if (update.discountValue !== undefined) {
      update.discountValue = Number(update.discountValue);
      if (!Number.isFinite(update.discountValue) || update.discountValue <= 0 ||
          (update.discountType === 'percentage' && update.discountValue > 100)) {
        return res.status(400).json({ success: false, message: 'Invalid discount value' });
      }
    }
    if (update.startsAt) update.startsAt = new Date(update.startsAt);
    if (update.expiresAt) update.expiresAt = new Date(update.expiresAt);

    const offer = await Offer.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });

    if (offer.isActive) {
      await Offer.updateMany({ scope: offer.scope, _id: { $ne: offer._id } }, { $set: { isActive: false } });
    }

    res.json({ success: true, offer });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Unable to update offer' });
  }
});

router.delete('/offers/:id', async (req, res) => {
  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, message: 'Offer deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Unable to delete offer' });
  }
});


// Admin notification inbox.
router.get('/notifications', async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      AdminNotification.find()
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      AdminNotification.countDocuments({ read: false })
    ]);

    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    console.error('Admin notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch notifications'
    });
  }
});

// Mark one notification as read.
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const notification = await AdminNotification.findByIdAndUpdate(
      req.params.id,
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
    res.status(400).json({
      success: false,
      message: 'Unable to update notification'
    });
  }
});

// Mark all notifications as read.
router.patch('/notifications/read-all', async (req, res) => {
  try {
    await AdminNotification.updateMany(
      { read: false },
      { $set: { read: true } }
    );

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to update notifications'
    });
  }
});


// All customer feedback for the authenticated admin dashboard.
router.get('/feedback', async (req, res) => {
  try {
    const [summary, feedback] = await Promise.all([
      CustomerFeedback.aggregate([
        { $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }}
      ]),
      CustomerFeedback.find()
        .sort({ createdAt: -1, _id: -1 })
        .limit(500)
        .lean()
    ]);

    const result = summary[0] || { totalReviews: 0, averageRating: 0 };

    res.json({
      success: true,
      totalReviews: result.totalReviews,
      averageRating: Number(result.averageRating.toFixed(1)),
      feedback
    });
  } catch (error) {
    console.error('Admin feedback:', error);
    res.status(500).json({ success: false, message: 'Unable to load customer feedback.' });
  }
});


module.exports = router;
