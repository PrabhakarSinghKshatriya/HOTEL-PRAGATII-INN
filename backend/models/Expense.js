const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0.01 },
  date: { type: Date, default: Date.now },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'UPI', 'Bank', 'Other'],
    default: 'Cash'
  },
  notes: { type: String, default: '' }
}, { timestamps: true });

schema.index({ date: -1 });

module.exports = mongoose.model('Expense', schema);
