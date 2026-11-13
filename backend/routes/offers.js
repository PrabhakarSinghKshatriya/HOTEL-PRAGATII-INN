const express = require('express');
const { getActiveOffer } = require('../utils/offerPricing');
const router = express.Router();

router.get('/current', async (req, res) => {
  try {
    const [room, food] = await Promise.all([
      getActiveOffer('room'),
      getActiveOffer('food')
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      offers: {
        room: room ? { title: room.title, discountType: room.discountType, discountValue: room.discountValue, startsAt: room.startsAt, expiresAt: room.expiresAt } : null,
        food: food ? { title: food.title, discountType: food.discountType, discountValue: food.discountValue, startsAt: food.startsAt, expiresAt: food.expiresAt } : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch current offers' });
  }
});

module.exports = router;
