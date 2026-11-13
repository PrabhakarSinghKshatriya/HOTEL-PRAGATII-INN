const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1
  },
  roomType: {
    type: String,
    required: true,
    enum: ['AC', 'Non-AC']
  },
  name: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    default: 1200
  },
  image: {
    type: String,
    default: ''
  },
  amenities: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['Available', 'Occupied', 'Maintenance'],
    default: 'Available'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });


module.exports = mongoose.model('Room', roomSchema);
