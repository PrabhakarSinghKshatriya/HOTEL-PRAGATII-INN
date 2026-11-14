const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  supplier: { type: String, required: true, trim: true },
  invoiceNo: { type: String, default: '' },
  purchaseDate: { type: Date, default: Date.now },
  items: [{
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true
    },
    name: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 0.0001 },
    unitCost: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 }
  }],
  total: { type: Number, required: true, min: 0 },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Purchase', schema);
