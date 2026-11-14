const mongoose = require('mongoose');

const customerFeedbackSchema = new mongoose.Schema({
  type: { type: String, enum: ['booking', 'food'], required: true },
  refNo: { type: String, required: true },
  phone: { type: String, required: true },
  customerName: { type: String, default: '' },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', maxlength: 1000 }
}, { timestamps: true });

customerFeedbackSchema.index({ type: 1, refNo: 1 }, { unique: true });

module.exports = mongoose.model('CustomerFeedback', customerFeedbackSchema);
