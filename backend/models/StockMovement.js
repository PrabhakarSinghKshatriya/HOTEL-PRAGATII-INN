const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true
  },
  type: {
    type: String,
    enum: ['Opening', 'Purchase', 'Consumption', 'Restoration', 'Adjustment'],
    required: true
  },
  quantity: { type: Number, required: true },
  previousStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  reference: { type: String, default: '' },
  note: { type: String, default: '' }
}, { timestamps: true });

schema.index({ createdAt: -1 });

module.exports = mongoose.model('StockMovement', schema);
