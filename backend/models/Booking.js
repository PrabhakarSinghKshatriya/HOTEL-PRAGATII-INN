const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  refNo: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  roomId: {
    type: require('mongoose').Schema.Types.ObjectId,
    ref: 'Room',
    default: null
  },
  roomNumber: {
    type: Number,
    default: null
  },
  roomType: {
    type: String,
    enum: ['AC', 'Non-AC'],
    default: undefined
  },
  roomName: {
    type: String,
    required: true
  },
  roomPrice: {
    type: Number,
    required: true,
    min: 0
  },
  checkin: {
    type: Date,
    required: true
  },
  checkout: {
    type: Date,
    required: true
  },
  guests: {
    type: Number,
    default: 1,
    min: 1,
    max: 4
  },
  specialRequests: {
    type: String,
    default: '',
    maxlength: 1000
  },
  nights: {
    type: Number,
    required: true,
    min: 1
  },
  offerId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'Offer', default: null },
  offerTitle: { type: String, default: '' },
  originalSubtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    required: true
  },
  total: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Checked-in', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'UPI'],
    default: 'Cash'
  },
  transactionId: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  },
  paymentVerifiedAt: {
    type: Date,
    default: null
  },
  cancellationRequest: {
    requested: { type: Boolean, default: false },
    reason: { type: String, default: '', maxlength: 500 },
    requestedAt: { type: Date, default: null }
  },
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Pending', 'Paid', 'Refunded'],
    default: 'Unpaid'
  }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
