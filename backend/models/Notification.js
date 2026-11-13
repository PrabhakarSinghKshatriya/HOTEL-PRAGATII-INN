const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  refNo: {
    type: String,
    required: true,
    index: true
  },
  phone: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['booking', 'food'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

notificationSchema.index({ refNo: 1, phone: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
