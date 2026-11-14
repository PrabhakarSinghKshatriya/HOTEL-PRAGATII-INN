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
  const session = await mongoose.startSession();

  try {
    const {
      name, sku, category, unit, currentStock,
      reorderLevel, costPerUnit, supplier
    } = req.body;

    if (!String(name || '').trim() || !String(unit || '').trim()) {
      return res.status(400).json({
        success: false,
        message: 'Item name and unit are required.'
      });
    }

    const stock = Number(currentStock ?? 0);
    const reorder = Number(reorderLevel ?? 0);
    const cost = Number(costPerUnit ?? 0);

    if (
      !Number.isFinite(stock) || stock < 0 ||
      !Number.isFinite(reorder) || reorder < 0 ||
      !Number.isFinite(cost) || cost < 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock, reorder level or cost.'
      });
    }

    let item;

    await session.withTransaction(async () => {
      [item] = await InventoryItem.create([{
        name, sku, category, unit,
        currentStock: stock,
        reorderLevel: reorder,
        costPerUnit: cost,
        supplier
      }], { session });

      if (stock > 0) {
        await StockMovement.create([{
          inventoryItem: item._id,
          type: 'Opening',
          quantity: stock,
          previousStock: 0,
          newStock: stock,
          note: 'Opening stock'
        }], { session });
      }
    });

    res.status(201).json({ success: true, item });

  } catch (error) {
    console.error('Create inventory item:', error);
    res.status(400).json({
      success: false,
      message: error.code === 11000
        ? 'SKU already exists.'
        : error.message
    });
  } finally {
    await session.endSession();
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
      return res.status(400).json({
        success: false,
        message: 'Select an item and enter a non-zero adjustment.'
      });
    }

    let result;

    await session.withTransaction(async () => {
      const filter = {
        _id: itemId,
        isActive: true
      };

      if (change < 0) {
        filter.currentStock = { $gte: Math.abs(change) };
      }

      const item = await InventoryItem.findOneAndUpdate(
        filter,
        { $inc: { currentStock: change } },
        { new: true, session, runValidators: true }
      );

      if (!item) {
        const existing = await InventoryItem.findById(itemId)
          .session(session);

        if (!existing || !existing.isActive) {
          throw new Error('Inventory item not found or inactive.');
        }

        throw new Error('Adjustment cannot make stock negative.');
      }

      const previousStock = item.currentStock - change;

      const [movement] = await StockMovement.create([{
        inventoryItem: item._id,
        type: 'Adjustment',
        quantity: change,
        previousStock,
        newStock: item.currentStock,
        note: String(note || 'Manual stock adjustment').slice(0, 500)
      }], { session });

      result = { item, movement };
    });

    res.json({ success: true, ...result });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  } finally {
    await session.endSession();
  }
});

// Recipe management
router.post('/recipes', async (req, res) => {
  try {
    const {
      itemId,
      menuItemName,
      variant = 'single',
      ingredients
    } = req.body;

    if (
      !String(itemId || '').trim() ||
      !['single', 'half', 'full'].includes(variant) ||
      !Array.isArray(ingredients) ||
      !ingredients.length ||
      ingredients.some(i =>
        !i ||
        !validId(i.inventoryItem) ||
        !Number.isFinite(Number(i.quantity)) ||
        Number(i.quantity) <= 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Provide a menu item, variant and valid ingredients.'
      });
    }

    const ingredientIds = [
      ...new Set(ingredients.map(i => String(i.inventoryItem)))
    ];

    const activeItems = await InventoryItem.find({
      _id: { $in: ingredientIds },
      isActive: true
    }).select('_id').lean();

    if (activeItems.length !== ingredientIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more ingredients are missing or inactive.'
      });
    }

    const recipe = await Recipe.findOneAndUpdate(
      { itemId: String(itemId).trim(), variant },
      {
        $set: {
          menuItemName: String(menuItemName || '').trim(),
          ingredients
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({ success: true, recipe });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.code === 11000
        ? 'Recipe already exists. Please retry.'
        : error.message
    });
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


// Safely reverse a purchase's stock quantities inside the current transaction.
async function reversePurchaseStock(purchase, session) {
  const totals = new Map();

  for (const row of (purchase.items || [])) {
    const id = String(row.inventoryItem);
    totals.set(id, (totals.get(id) || 0) + Number(row.quantity || 0));
  }

  for (const [id, quantity] of totals) {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: id, currentStock: { $gte: quantity } },
      { $inc: { currentStock: -quantity } },
      { new: true, session }
    );

    if (!item) {
      throw new Error(
        `Cannot reverse purchase: insufficient current stock for ${id}. Some stock may already have been consumed.`
      );
    }

    await StockMovement.create([{
      inventoryItem: id,
      type: 'Adjustment',
      quantity: -quantity,
      previousStock: item.currentStock + quantity,
      newStock: item.currentStock,
      reference: `PURCHASE:${purchase._id}`,
      note: `Purchase reversal: ${purchase.supplier}`
    }], { session });
  }
}

function validatePurchasePayload(body) {
  if (!String(body.supplier || '').trim()) {
    throw new Error('Supplier is required.');
  }
  if (!Array.isArray(body.items) || !body.items.length) {
    throw new Error('Add at least one purchase item.');
  }

  const totals = new Map();
  for (const row of body.items) {
    const id = String(row.inventoryItem || '');
    const quantity = Number(row.quantity);
    const unitCost = Number(row.unitCost);

    if (!id || !Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error('Invalid purchase item, quantity, or unit cost.');
    }

    const old = totals.get(id) || { quantity: 0, total: 0 };
    old.quantity += quantity;
    old.total += quantity * unitCost;
    totals.set(id, old);
  }

  return body.items.map(row => ({
    inventoryItem: row.inventoryItem,
    name: String(row.name || '').trim(),
    quantity: Number(row.quantity),
    unitCost: Number(row.unitCost),
    total: Number(row.quantity) * Number(row.unitCost)
  }));
}

// Edit purchase and reconcile stock atomically.
router.patch('/purchases/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let result;

    await session.withTransaction(async () => {
      if (!validId(req.params.id)) throw new Error('Invalid purchase ID.');

      const purchase = await Purchase.findById(req.params.id).session(session);
      if (!purchase) throw new Error('Purchase not found.');

      const items = validatePurchasePayload(req.body);
      await reversePurchaseStock(purchase, session);

      for (const row of items) {
        const item = await InventoryItem.findOneAndUpdate(
          { _id: row.inventoryItem, isActive: true },
          { $inc: { currentStock: row.quantity }, $set: { costPerUnit: row.unitCost } },
          { new: true, session }
        );

        if (!item) throw new Error('An inventory item was not found or is inactive.');

        await StockMovement.create([{
          inventoryItem: item._id,
          type: 'Purchase',
          quantity: row.quantity,
          previousStock: item.currentStock - row.quantity,
          newStock: item.currentStock,
          reference: `PURCHASE:${purchase._id}`,
          note: `Updated purchase from ${String(req.body.supplier).trim()}`
        }], { session });

        row.name = item.name;
      }

      purchase.supplier = String(req.body.supplier).trim();
      purchase.invoiceNo = String(req.body.invoiceNo || '');
      purchase.purchaseDate = req.body.purchaseDate || purchase.purchaseDate;
      purchase.notes = String(req.body.notes || '');
      purchase.items = items;
      purchase.total = items.reduce((sum, row) => sum + row.total, 0);

      await purchase.save({ session });
      result = purchase;
    });

    res.json({ success: true, purchase: result, message: 'Purchase updated and stock reconciled.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
});

// Delete purchase only when its quantity can safely be reversed.
router.delete('/purchases/:id', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (!validId(req.params.id)) throw new Error('Invalid purchase ID.');

      const purchase = await Purchase.findById(req.params.id).session(session);
      if (!purchase) throw new Error('Purchase not found.');

      await reversePurchaseStock(purchase, session);
      await Purchase.deleteOne({ _id: purchase._id }, { session });
    });

    res.json({ success: true, message: 'Purchase deleted and stock reversed.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
});


// Update existing expense
router.patch('/expenses/:id', async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid expense ID.' });
    }

    const { category, description, amount, date, paymentMethod, notes } = req.body;

    if (
      !String(category || '').trim() ||
      !String(description || '').trim() ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0 ||
      !['Cash', 'UPI', 'Bank', 'Other'].includes(paymentMethod)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid expense details.'
      });
    }

    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          category: category.trim(),
          description: description.trim(),
          amount: Number(amount),
          date: date || new Date(),
          paymentMethod,
          notes: String(notes || '')
        }
      },
      { new: true, runValidators: true }
    );

    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    res.json({ success: true, expense });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
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
