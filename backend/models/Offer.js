const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  scope: { type: String, enum: ['room', 'food'], required: true, index: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

offerSchema.index({ scope: 1, isActive: 1, startsAt: 1, expiresAt: 1 });

module.exports = mongoose.model('Offer', offerSchema);
