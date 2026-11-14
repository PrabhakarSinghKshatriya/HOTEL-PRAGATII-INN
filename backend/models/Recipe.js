const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  itemId: { type: String, required: true },
  menuItemName: { type: String, default: '' },
  variant: {
    type: String,
    enum: ['single', 'half', 'full'],
    default: 'single'
  },
  ingredients: [{
    inventoryItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryItem',
      required: true
    },
    quantity: { type: Number, required: true, min: 0.0001 }
  }]
}, { timestamps: true });

schema.index({ itemId: 1, variant: 1 }, { unique: true });

module.exports = mongoose.model('Recipe', schema);
