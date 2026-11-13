const express = require('express');
const crypto = require('crypto');
const FoodItem = require('../models/FoodItem');
const FoodOrder = require('../models/FoodOrder');
const adminAuth = require('../middleware/adminAuth');
const createNotification = require('../utils/createNotification');
const createAdminNotification = require('../utils/createAdminNotification');
const { getActiveOffer, calculateDiscount } = require('../utils/offerPricing');

const router = express.Router();

const makeRef = () =>
  'ORD-' + crypto.randomBytes(4).toString('hex').toUpperCase();

const WAIT_NOTE =
  'Order ke baad 15 minute intezaar karna pad sakta hai. (आर्डर के बाद 15 मिनट प्रतीक्षा करना पड़ सकता है।)';

function getPrice(item, variant) {
  if (variant === 'half' || variant === 'full') {
    const price = item.priceOptions?.[variant];
    return Number.isFinite(price) ? price : null;
  }

  if (variant !== 'single') return null;

  return Number.isFinite(item.price) ? item.price : null;
}

// Customer menu: include unavailable items so customers can see their status.
router.get('/menu', async (req, res) => {
  try {
    const items = await FoodItem.find({})
      .sort({ category: 1, name: 1 })
      .lean();

    res.json({ success: true, items });
  } catch (error) {
    console.error('Fetch menu:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to fetch menu'
    });
  }
});

// Customer: place order using database prices only.
router.post('/orders', async (req, res) => {
  try {
    const {
      customerName, customerPhone, table, items,
      paymentMethod = 'Cash', transactionId = ''
    } = req.body;

    if (
      !customerName ||
      !customerPhone ||
      !table ||
      !Array.isArray(items) ||
      !items.length
    ) {
      return res.status(400).json({
        success: false,
        message: 'Name, mobile number, location and cart items are required'
      });
    }

    if (!['Cash', 'UPI'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    if (paymentMethod === 'UPI' && !String(transactionId).trim()) {
      return res.status(400).json({
        success: false,
        message: 'UPI transaction ID is required'
      });
    }

    if (!/^[0-9]{10}$/.test(String(customerPhone))) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number must contain exactly 10 digits'
      });
    }

    const normalized = [];

    for (const item of items) {
      const qty = Number(item.qty);
      const variant = item.variant || 'single';

      if (
        !item.itemId ||
        !['single', 'half', 'full'].includes(variant) ||
        !Number.isInteger(qty) ||
        qty < 1 ||
        qty > 50
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item, variant or quantity'
        });
      }

      normalized.push({
        itemId: String(item.itemId),
        variant,
        qty
      });
    }

    const ids = [...new Set(normalized.map(item => item.itemId))];

    const menuItems = await FoodItem.find({
      itemId: { $in: ids },
      isAvailable: true
    }).lean();

    if (menuItems.length !== ids.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more selected items are unavailable'
      });
    }

    const menuMap = new Map(
      menuItems.map(item => [item.itemId, item])
    );

    const activeOffer = await getActiveOffer('food');
    const orderItems = [];

    for (const selected of normalized) {
      const menuItem = menuMap.get(selected.itemId);
      const price = getPrice(menuItem, selected.variant);

      if (price === null) {
        return res.status(400).json({
          success: false,
          message: `${menuItem.name} does not have a valid ${selected.variant} price`
        });
      }

      const pricing = calculateDiscount(price, activeOffer);

      orderItems.push({
        itemId: menuItem.itemId,
        name: menuItem.name,
        variant: selected.variant,
        price: pricing.finalPrice,
        originalPrice: price,
        discountAmount: pricing.discount,
        qty: selected.qty
      });
    }

    const originalSubtotal = orderItems.reduce(
      (sum, item) => sum + item.originalPrice * item.qty,
      0
    );
    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.qty,
      0
    );
    const discountAmount = originalSubtotal - subtotal;
    const tax = Math.round(subtotal * 0.05);

    const order = await FoodOrder.create({
      refNo: makeRef(),
      customerName: String(customerName).trim(),
      customerPhone: String(customerPhone),
      table: String(table).trim(),
      items: orderItems,
      offerId: activeOffer?._id || null,
      offerTitle: activeOffer?.title || '',
      originalSubtotal,
      discountAmount,
      subtotal,
      tax,
      total: subtotal + tax,
      status: 'Received',
      paymentMethod,
      transactionId: paymentMethod === 'UPI' ? String(transactionId).trim() : '',
      paymentStatus: paymentMethod === 'UPI' ? 'Pending' : 'Unpaid',
      paymentVerifiedAt: null
    });

    await createAdminNotification({
      type: 'food',
      refNo: order.refNo,
      recordId: order._id,
      customerName: order.customerName,
      phone: order.customerPhone,
      title: 'New Food Order',
      message: `${order.customerName} placed a food order for ${order.table}.`
    });

    await createNotification({
      refNo: order.refNo,
      phone: order.customerPhone,
      type: 'food',
      title: 'Order Received',
      message: `Your food order for ${order.table} has been received by the kitchen.`,
      status: order.status
    });

    res.status(201).json({
      success: true,
      message: WAIT_NOTE,
      order
    });

  } catch (error) {
    console.error('Create food order:', error);

    res.status(500).json({
      success: false,
      message: 'Unable to place food order'
    });
  }
});

// ADMIN: all menu items including unavailable ones.
router.get('/menu/admin/all', adminAuth, async (req, res) => {
  try {
    const items = await FoodItem.find({})
      .sort({ category: 1, name: 1 })
      .lean();

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to fetch admin menu'
    });
  }
});

// ADMIN: update price, availability and menu information.
router.patch('/menu/admin/:id', adminAuth, async (req, res) => {
  try {
    const allowed = [
      'name',
      'hindiName',
      'description',
      'price',
      'priceOptions',
      'category',
      'categoryHindi',
      'isAvailable',
      'isVegetarian',
      'emoji',
      'ingredients'
    ];

    const updates = {};

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields supplied'
      });
    }

    if (
      updates.price !== undefined &&
      updates.price !== null &&
      (!Number.isFinite(Number(updates.price)) || Number(updates.price) < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid single price'
      });
    }

    const item = await FoodItem.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    res.json({ success: true, item });

  } catch (error) {
    console.error('Update food menu item:', error);

    res.status(400).json({
      success: false,
      message: 'Unable to update menu item'
    });
  }
});

// ADMIN: create an additional menu item.
router.post('/menu/admin', adminAuth, async (req, res) => {
  try {
    const item = await FoodItem.create(req.body);

    res.status(201).json({
      success: true,
      item
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Unable to create menu item'
    });
  }
});

// ADMIN: disable an item without deleting order history.
router.delete('/menu/admin/:id', adminAuth, async (req, res) => {
  try {
    const item = await FoodItem.findByIdAndUpdate(
      req.params.id,
      { isAvailable: false },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Menu item not found'
      });
    }

    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to disable menu item'
    });
  }
});

// ADMIN: all food orders.
router.get('/orders/admin/all', adminAuth, async (req, res) => {
  try {
    const orders = await FoodOrder.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to fetch orders'
    });
  }
});

// ADMIN: update food order status.
router.patch('/orders/admin/:id/status', adminAuth, async (req, res) => {
  try {
    const allowed = [
      'Received',
      'Preparing',
      'Ready',
      'Served',
      'Cancelled'
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order status'
      });
    }

    const order = await FoodOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const previousStatus = order.status;
    order.status = req.body.status;
    await order.save();

    if (previousStatus !== order.status) {
      const messages = {
        Received: 'Your food order has been received.',
        Preparing: 'The kitchen has started preparing your food.',
        Ready: 'Your food order is ready.',
        Served: 'Your food order has been served. Enjoy your meal!',
        Cancelled: 'Your food order has been cancelled. Please contact the hotel if needed.'
      };

      await createNotification({
        refNo: order.refNo,
        phone: order.customerPhone,
        type: 'food',
        title: `Food Order ${order.status}`,
        message: messages[order.status] || `Your food order status is now ${order.status}.`,
        status: order.status
      });
    }

    res.json({ success: true, order });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Unable to update order'
    });
  }
});

module.exports = router;
