const mongoose = require('mongoose');

const foodOrderSchema = new mongoose.Schema({
  refNo: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, required: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  table: { type: String, required: true },
  items: [{
    itemId: String,
    name: String,
    variant: {
      type: String,
      enum: ['single', 'half', 'full'],
      default: 'single'
    },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    qty: { type: Number, min: 1 }
  }],
  offerId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'Offer', default: null },
  offerTitle: { type: String, default: '' },
  originalSubtotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  subtotal: { type: Number, required: true },
  tax: { type: Number, required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['Received', 'Preparing', 'Ready', 'Served', 'Cancelled'],
    default: 'Received'
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
  paymentStatus: {
    type: String,
    enum: ['Unpaid', 'Pending', 'Paid', 'Refunded'],
    default: 'Unpaid'
  },
  stockDeducted: { type: Boolean, default: false },
  stockDeductedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('FoodOrder', foodOrderSchema);
