const Offer = require('../models/Offer');

async function getActiveOffer(scope) {
  const now = new Date();
  return Offer.findOne({
    scope,
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gt: now }
  }).sort({ updatedAt: -1 }).lean();
}

function calculateDiscount(price, offer) {
  const base = Math.max(0, Number(price) || 0);
  if (!offer) return { originalPrice: base, discount: 0, finalPrice: base };

  let discount = offer.discountType === 'percentage'
    ? Math.round(base * Number(offer.discountValue) / 100)
    : Math.round(Number(offer.discountValue));

  discount = Math.min(base, Math.max(0, discount));
  return {
    originalPrice: base,
    discount,
    finalPrice: base - discount
  };
}

module.exports = { getActiveOffer, calculateDiscount };
