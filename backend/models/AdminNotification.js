const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['booking', 'food'],
    required: true
  },
  refNo: {
    type: String,
    required: true,
    index: true
  },
  recordId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  customerName: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  }
}, { timestamps: true });

adminNotificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
