const express = require('express');
const crypto = require('crypto');
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const adminAuth = require('../middleware/adminAuth');
const createNotification = require('../utils/createNotification');
const createAdminNotification = require('../utils/createAdminNotification');
const { getActiveOffer, calculateDiscount } = require('../utils/offerPricing');

const router = express.Router();

const makeRef = () => 'PRG-' + crypto.randomBytes(4).toString('hex').toUpperCase();

// Homepage: Live date-wise room availability summary
router.get('/availability-summary', async (req, res) => {
  try {
    const { checkin, checkout } = req.query;

    if (!checkin || !checkout) {
      return res.status(400).json({
        success: false,
        message: 'Check-in and check-out dates are required'
      });
    }

    const start = new Date(checkin);
    const end = new Date(checkout);

    if (isNaN(start) || isNaN(end) || end <= start) {
      return res.status(400).json({
        success: false,
        message: 'Invalid check-in or check-out dates'
      });
    }

    const rooms = await Room.find({
      isActive: true,
      status: { $ne: 'Maintenance' }
    }).select('roomNumber roomType').lean();

    const bookedRooms = await Booking.distinct('roomNumber', {
      status: { $nin: ['Cancelled', 'Completed'] },
      checkin: { $lt: end },
      checkout: { $gt: start }
    });

    const availableRooms = rooms.filter(
      room => !bookedRooms.includes(room.roomNumber)
    );

    const ac = availableRooms.filter(room => room.roomType === 'AC').length;
    const nonAc = availableRooms.filter(room => room.roomType === 'Non-AC').length;

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      checkin,
      checkout,
      available: {
        AC: ac,
        NonAC: nonAc,
        total: ac + nonAc
      },
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Homepage availability summary:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch room availability'
    });
  }
});

// Customer: Get available rooms by type and booking dates
router.get('/rooms', async (req, res) => {
  try {
    const { roomType, checkin, checkout } = req.query;

    const filter = {
      isActive: true,
      status: { $ne: 'Maintenance' }
    };

    if (roomType) {
      if (!['AC', 'Non-AC'].includes(roomType)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid room type'
        });
      }
      filter.roomType = roomType;
    }

    const rooms = await Room.find(filter)
      .sort({ roomNumber: 1 })
      .lean();

    if (!checkin || !checkout) {
      const availableRooms = rooms.filter(
        room => room.status === 'Available'
      );
      return res.json({ success: true, rooms: availableRooms });
    }

    const start = new Date(checkin);
    const end = new Date(checkout);

    if (isNaN(start) || isNaN(end) || end <= start) {
      return res.status(400).json({
        success: false,
        message: 'Invalid check-in or check-out date'
      });
    }

    const bookedRooms = await Booking.distinct('roomNumber', {
      status: { $nin: ['Cancelled', 'Completed'] },
      checkin: { $lt: end },
      checkout: { $gt: start }
    });

    const availableRooms = rooms.filter(
      room => !bookedRooms.includes(room.roomNumber)
    );

    res.json({ success: true, rooms: availableRooms });
  } catch (error) {
    console.error('Fetch available rooms:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch available rooms'
    });
  }
});

// Customer: Create booking
router.post('/', async (req, res) => {
  try {
    const {
      name, phone, roomNumber, checkin, checkout,
      guests, specialRequests, paymentMethod = 'Cash', transactionId = ''
    } = req.body;

    if (!name || !phone || !roomNumber || !checkin || !checkout) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required booking details'
      });
    }

    if (!['Cash', 'UPI'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    if (paymentMethod === 'UPI' && !String(transactionId).trim()) {
      return res.status(400).json({
        success: false,
        message: 'UPI transaction ID is required'
      });
    }

    if (!/^[0-9]{10}$/.test(String(phone))) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must contain exactly 10 digits'
      });
    }

    const start = new Date(checkin);
    const end = new Date(checkout);

    if (isNaN(start) || isNaN(end) || end <= start) {
      return res.status(400).json({
        success: false,
        message: 'Invalid check-in or check-out date'
      });
    }

    if (start < new Date(new Date().setHours(0, 0, 0, 0))) {
      return res.status(400).json({
        success: false,
        message: 'Check-in date cannot be in the past'
      });
    }

    const room = await Room.findOne({
      roomNumber: Number(roomNumber),
      isActive: true,
      status: { $ne: 'Maintenance' }
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Selected room is unavailable'
      });
    }

    const conflict = await Booking.findOne({
      roomNumber: room.roomNumber,
      status: { $nin: ['Cancelled', 'Completed'] },
      checkin: { $lt: end },
      checkout: { $gt: start }
    });

    if (conflict) {
      return res.status(409).json({
        success: false,
        message: 'This room is already booked for these dates'
      });
    }

    const nights = Math.ceil((end - start) / 86400000);
    const originalSubtotal = Number(room.price) * nights;
    const activeOffer = await getActiveOffer('room');
    const pricing = calculateDiscount(room.price, activeOffer);
    const subtotal = pricing.finalPrice * nights;
    const discountAmount = originalSubtotal - subtotal;
    const tax = Math.round(subtotal * 0.05);

    const booking = await Booking.create({
      refNo: makeRef(),
      name: String(name).trim(),
      phone: String(phone),
      roomId: room._id,
      roomNumber: room.roomNumber,
      roomType: room.roomType,
      roomName: room.name || room.roomType,
      roomPrice: pricing.finalPrice,
      offerId: activeOffer?._id || null,
      offerTitle: activeOffer?.title || '',
      originalSubtotal,
      discountAmount,
      checkin: start,
      checkout: end,
      guests: Number(guests) || 1,
      specialRequests: String(specialRequests || '').trim(),
      nights,
      subtotal,
      tax,
      total: subtotal + tax,
      status: 'Pending',
      paymentMethod,
      transactionId: paymentMethod === 'UPI' ? String(transactionId).trim() : '',
      paymentStatus: paymentMethod === 'UPI' ? 'Pending' : 'Unpaid',
      paymentVerifiedAt: null
    });

    await createAdminNotification({
      type: 'booking',
      refNo: booking.refNo,
      recordId: booking._id,
      customerName: booking.name,
      phone: booking.phone,
      title: 'New Room Booking',
      message: `${booking.name} requested Room ${booking.roomNumber}.`
    });

    await createNotification({
      refNo: booking.refNo,
      phone: booking.phone,
      type: 'booking',
      title: 'Booking Received',
      message: `Your room booking request for Room ${booking.roomNumber} has been received. Awaiting hotel confirmation.`,
      status: booking.status
    });

    res.status(201).json({
      success: true,
      message: 'Booking request received. Awaiting hotel confirmation.',
      booking
    });
  } catch (error) {
    console.error('========== CREATE BOOKING ERROR ==========');
    console.error('Name:', error.name);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    if (error.errors) {
      console.error('Validation Errors:', error.errors);
    }
    console.error('==========================================');

    res.status(500).json({
      success: false,
      message: 'Unable to create booking'
    });
  }
});

// Admin: View all bookings
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch bookings' });
  }
});

// Admin: Update booking status and synchronize room status
router.patch('/admin/:id/status', adminAuth, async (req, res) => {
  try {
    const allowed = [
      'Pending',
      'Confirmed',
      'Checked-in',
      'Completed',
      'Cancelled'
    ];

    const newStatus = req.body.status;

    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking status'
      });
    }

    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Find the associated room
    let room = booking.roomId
      ? await Room.findById(booking.roomId)
      : null;

    if (!room && booking.roomNumber) {
      room = await Room.findOne({
        roomNumber: booking.roomNumber
      });
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Associated room not found'
      });
    }

    // Never confirm or check-in a maintenance room
    if (
      ['Confirmed', 'Checked-in'].includes(newStatus) &&
      room.status === 'Maintenance'
    ) {
      return res.status(409).json({
        success: false,
        message: 'This room is under maintenance and cannot be booked.'
      });
    }

    const previousStatus = booking.status;

    booking.status = newStatus;
    await booking.save();

    // Synchronize the actual Room collection
    // Maintenance status is always preserved.
    if (room.status !== 'Maintenance') {
      if (['Confirmed', 'Checked-in'].includes(newStatus)) {
        room.status = 'Occupied';
        await room.save();
      } else {
        // Check whether another confirmed or checked-in booking
        // still requires this room.
        const otherActiveBooking = await Booking.findOne({
          _id: { $ne: booking._id },
          $or: [
            { roomId: room._id },
            { roomNumber: room.roomNumber }
          ],
          status: { $in: ['Confirmed', 'Checked-in'] },
          checkout: { $gt: new Date() }
        }).lean();

        if (!otherActiveBooking) {
          room.status = 'Available';
          await room.save();
        }
      }
    }

    // Preserve existing customer notifications
    if (previousStatus !== booking.status) {
      const messages = {
        Confirmed: 'Your room booking has been confirmed by the hotel.',
        'Checked-in': 'Your check-in has been recorded. Welcome to Hotel Pragati!',
        Completed: 'Your stay has been marked as completed. Thank you for choosing Hotel Pragati.',
        Cancelled: 'Your room booking has been cancelled. Please contact the hotel if you need assistance.',
        Pending: 'Your booking status has been changed to Pending.'
      };

      await createNotification({
        refNo: booking.refNo,
        phone: booking.phone,
        type: 'booking',
        title: `Booking ${booking.status}`,
        message: messages[booking.status] ||
          `Your booking status is now ${booking.status}.`,
        status: booking.status
      });
    }

    res.json({
      success: true,
      booking,
      roomStatus: room.status
    });

  } catch (error) {
    console.error('Update booking and room status:', error);

    res.status(500).json({
      success: false,
      message: 'Unable to update booking'
    });
  }
});

module.exports = router;
