const express = require('express');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');

const InventoryItem = require('../models/InventoryItem');
const Recipe = require('../models/Recipe');
const StockMovement = require('../models/StockMovement');
const Purchase = require('../models/Purchase');
const Expense = require('../models/Expense');
const Booking = require('../models/Booking');
const FoodOrder = require('../models/FoodOrder');

const router = express.Router();
router.use(adminAuth);

function validId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function dateRange(query) {
  const valid = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata'
  });

  const from = query.startDate || query.date || today;
  const to = query.endDate || from;

  if (!valid(from) || !valid(to) || to < from) {
    throw new Error('Invalid date range');
  }

  return {
    start: new Date(`${from}T00:00:00+05:30`),
    end: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000),
    from,
    to
  };
}

// Dashboard summary
router.get('/dashboard', async (req, res) => {
  try {
    const [items, recipes, lowStock, recentMovements, purchases, expenses] =
      await Promise.all([
        InventoryItem.find().sort({ name: 1 }).lean(),
        Recipe.find().populate('ingredients.inventoryItem').lean(),
        InventoryItem.find({
          isActive: true,
          $expr: { $lte: ['$currentStock', '$reorderLevel'] }
        }).lean(),
        StockMovement.find().populate('inventoryItem', 'name unit')
          .sort({ createdAt: -1 }).limit(30).lean(),
        Purchase.find().sort({ purchaseDate: -1 }).limit(20).lean(),
        Expense.find().sort({ date: -1 }).limit(20).lean()
      ]);

    res.json({
      success: true,
      items,
      recipes,
      lowStock,
      movements: recentMovements,
      purchases,
      expenses
    });
  } catch (error) {
    console.error('Inventory dashboard:', error);
    res.status(500).json({ success: false, message: 'Unable to load inventory' });
  }
});

// Inventory item CRUD
router.post('/items', async (req, res) => {
  try {
    const { name, sku, category, unit, currentStock, reorderLevel, costPerUnit, supplier } = req.body;

    if (!String(name || '').trim() || !String(unit || '').trim()) {
      return res.status(400).json({ success: false, message: 'Item name and unit are required.' });
    }

    const stock = Number(currentStock || 0);
    const item = await InventoryItem.create({
      name, sku, category, unit,
      currentStock: stock,
      reorderLevel: Number(reorderLevel || 0),
      costPerUnit: Number(costPerUnit || 0),
      supplier
    });

    if (stock > 0) {
      await StockMovement.create({
        inventoryItem: item._id,
        type: 'Opening',
        quantity: stock,
        previousStock: 0,
        newStock: stock,
        note: 'Opening stock'
      });
    }

    res.status(201).json({ success: true, item });
  } catch (error) {
    res.status(400).json({ success: false, message: error.code === 11000 ? 'SKU already exists.' : error.message });
  }
});

router.patch('/items/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid item ID.' });

    const allowed = ['name', 'sku', 'category', 'unit', 'reorderLevel', 'costPerUnit', 'supplier', 'isActive'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const item = await InventoryItem.findByIdAndUpdate(
      req.params.id, { $set: updates }, { new: true, runValidators: true }
    );

    if (!item) return res.status(404).json({ success: false, message: 'Inventory item not found.' });
    res.json({ success: true, item });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to deactivate item.' });
  }
});

// Manual stock adjustment
router.post('/adjustments', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { itemId, quantity, note } = req.body;
    const change = Number(quantity);

    if (!validId(itemId) || !Number.isFinite(change) || change === 0) {
      return res.status(400).json({ success: false, message: 'Select an item and enter a non-zero adjustment.' });
    }

    let result;
    await session.withTransaction(async () => {
      const item = await InventoryItem.findById(itemId).session(session);
      if (!item) throw new Error('Inventory item not found.');

      const previousStock = item.currentStock;
      const nextStock = previousStock + change;
      if (nextStock < 0) throw new Error('Adjustment cannot make stock negative.');

      item.currentStock = nextStock;
      await item.save({ session });

      const [movement] = await StockMovement.create([{
        inventoryItem: item._id,
        type: 'Adjustment',
        quantity: change,
        previousStock,
        newStock: nextStock,
        note: note || 'Manual stock adjustment'
      }], { session });

      result = { item, movement };
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
});

// Recipe management
router.post('/recipes', async (req, res) => {
  try {
    const { itemId, menuItemName, variant = 'single', ingredients } = req.body;

    if (!itemId || !['single', 'half', 'full'].includes(variant) ||
        !Array.isArray(ingredients) || !ingredients.length ||
        ingredients.some(i => !validId(i.inventoryItem) || !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0)) {
      return res.status(400).json({ success: false, message: 'Provide a menu item, variant and valid ingredients.' });
    }

    const recipe = await Recipe.findOneAndUpdate(
      { itemId: String(itemId), variant },
      { $set: { menuItemName: menuItemName || '', ingredients } },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({ success: true, recipe });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/recipes/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndDelete(req.params.id);
    if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found.' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Unable to delete recipe.' });
  }
});

// Purchase entry: increase stock and save purchase together.
router.post('/purchases', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { supplier, invoiceNo, purchaseDate, items, notes } = req.body;

    if (!String(supplier || '').trim() || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: 'Supplier and purchase items are required.' });
    }

    let purchase;
    await session.withTransaction(async () => {
      const normalized = [];
      let total = 0;

      for (const row of items) {
        const quantity = Number(row.quantity);
        const unitCost = Number(row.unitCost);

        if (!validId(row.inventoryItem) || !Number.isFinite(quantity) || quantity <= 0 ||
            !Number.isFinite(unitCost) || unitCost < 0) {
          throw new Error('Invalid purchase item, quantity or unit cost.');
        }

        const item = await InventoryItem.findById(row.inventoryItem).session(session);
        if (!item || !item.isActive) throw new Error('Inventory item not found or inactive.');

        const previousStock = item.currentStock;
        item.currentStock += quantity;
        item.costPerUnit = unitCost;
        await item.save({ session });

        const lineTotal = quantity * unitCost;
        total += lineTotal;

        await StockMovement.create([{
          inventoryItem: item._id,
          type: 'Purchase',
          quantity,
          previousStock,
          newStock: item.currentStock,
          note: `Purchase from ${supplier}`
        }], { session });

        normalized.push({
          inventoryItem: item._id,
          name: item.name,
          quantity,
          unitCost,
          total: lineTotal
        });
      }

      [purchase] = await Purchase.create([{
        supplier, invoiceNo, purchaseDate: purchaseDate || new Date(),
        items: normalized, total, notes
      }], { session });
    });

    res.status(201).json({ success: true, purchase });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
});

// Expenses
router.get('/expenses', async (req, res) => {
  try {
    const range = dateRange(req.query);
    const expenses = await Expense.find({
      date: { $gte: range.start, $lt: range.end }
    }).sort({ date: -1 }).lean();

    res.json({ success: true, expenses, period: { from: range.from, to: range.to } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const { category, description, amount, date, paymentMethod, notes } = req.body;
    if (!category || !description || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Category, description and valid amount are required.' });
    }

    const expense = await Expense.create({
      category, description, amount: Number(amount),
      date: date || new Date(), paymentMethod, notes
    });

    res.status(201).json({ success: true, expense });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found.' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Unable to delete expense.' });
  }
});

// Accounting report: paid collections minus recorded expenses.
router.get('/reports', async (req, res) => {
  try {
    const range = dateRange(req.query);

    const [bookings, orders, expenses, purchases] = await Promise.all([
      Booking.find({ createdAt: { $gte: range.start, $lt: range.end }, paymentStatus: 'Paid' }).lean(),
      FoodOrder.find({ createdAt: { $gte: range.start, $lt: range.end }, paymentStatus: 'Paid' }).lean(),
      Expense.find({ date: { $gte: range.start, $lt: range.end } }).lean(),
      Purchase.find({ purchaseDate: { $gte: range.start, $lt: range.end } }).lean()
    ]);

    const roomIncome = bookings.reduce((sum, x) => sum + Number(x.total || 0), 0);
    const foodIncome = orders.reduce((sum, x) => sum + Number(x.total || 0), 0);
    const expenseTotal = expenses.reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const purchaseTotal = purchases.reduce((sum, x) => sum + Number(x.total || 0), 0);
    const income = roomIncome + foodIncome;

    res.json({
      success: true,
      period: { from: range.from, to: range.to },
      roomIncome,
      foodIncome,
      income,
      expenseTotal,
      purchaseTotal,
      netAfterExpenses: income - expenseTotal,
      cashFlowAfterPurchasesAndExpenses: income - expenseTotal - purchaseTotal,
      expenseCount: expenses.length,
      purchaseCount: purchases.length,
      expenses,
      purchases
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
