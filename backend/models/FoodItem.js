const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  hindiName: { type: String, default: '' },
  description: { type: String, default: '' },
  price: { type: Number, min: 0, default: null },
  priceOptions: {
    half: { type: Number, min: 0 },
    full: { type: Number, min: 0 }
  },
  emoji: { type: String, default: '🍽️' },
  category: { type: String, required: true },
  categoryHindi: { type: String, default: '' },
  isVegetarian: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  ingredients: { type: [String], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('FoodItem', foodItemSchema);
