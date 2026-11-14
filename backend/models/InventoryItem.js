const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sku: { type: String, trim: true, default: '' },
  category: { type: String, default: 'General' },
  unit: { type: String, required: true, default: 'pcs' },
  currentStock: { type: Number, default: 0, min: 0 },
  reorderLevel: { type: Number, default: 0, min: 0 },
  costPerUnit: { type: Number, default: 0, min: 0 },
  supplier: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

schema.index({ name: 1 });
schema.index({ sku: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('InventoryItem', schema);
