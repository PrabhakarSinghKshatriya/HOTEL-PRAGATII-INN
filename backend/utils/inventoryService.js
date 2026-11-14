const mongoose = require('mongoose');
const FoodOrder = require('../models/FoodOrder');
const Recipe = require('../models/Recipe');
const InventoryItem = require('../models/InventoryItem');
const StockMovement = require('../models/StockMovement');

async function updateOrderStock(orderId, newStatus) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const order = await FoodOrder.findById(orderId).session(session);

      if (!order) throw new Error('Food order not found');

      const oldStatus = order.status;

      if (oldStatus === newStatus) return;

      if (newStatus === 'Preparing' && !order.stockDeducted) {
        const required = new Map();

        for (const item of order.items) {
          const recipe = await Recipe.findOne({
            itemId: item.itemId,
            variant: item.variant || 'single'
          }).session(session);

          // Recipes are optional until configured for a menu item.
          if (!recipe) continue;

          for (const ingredient of recipe.ingredients) {
            const id = String(ingredient.inventoryItem);
            const amount = Number(ingredient.quantity) * Number(item.qty);

            required.set(id, (required.get(id) || 0) + amount);
          }
        }

        for (const [id, quantity] of required) {
          const stock = await InventoryItem.findById(id).session(session);

          if (!stock || !stock.isActive) {
            throw new Error('A recipe ingredient is missing or inactive.');
          }

          if (stock.currentStock < quantity) {
            throw new Error(
              `Insufficient stock for ${stock.name}. Available: ${stock.currentStock} ${stock.unit}, Required: ${quantity} ${stock.unit}.`
            );
          }

          const previousStock = stock.currentStock;
          stock.currentStock -= quantity;
          await stock.save({ session });

          await StockMovement.create([{
            inventoryItem: stock._id,
            type: 'Consumption',
            quantity: -quantity,
            previousStock,
            newStock: stock.currentStock,
            reference: order.refNo,
            note: `Food order ${order.refNo}`
          }], { session });
        }

        order.stockDeducted = true;
        order.stockDeductedAt = new Date();
      }

      if (newStatus === 'Cancelled' && order.stockDeducted) {
        const recipes = await Recipe.find({
          itemId: { $in: order.items.map(i => i.itemId) }
        }).session(session);

        const required = new Map();

        for (const item of order.items) {
          const recipe = recipes.find(r =>
            r.itemId === item.itemId &&
            r.variant === (item.variant || 'single')
          );

          if (!recipe) continue;

          for (const ingredient of recipe.ingredients) {
            const id = String(ingredient.inventoryItem);
            const amount = Number(ingredient.quantity) * Number(item.qty);

            required.set(id, (required.get(id) || 0) + amount);
          }
        }

        for (const [id, quantity] of required) {
          const stock = await InventoryItem.findById(id).session(session);
          if (!stock) continue;

          const previousStock = stock.currentStock;
          stock.currentStock += quantity;
          await stock.save({ session });

          await StockMovement.create([{
            inventoryItem: stock._id,
            type: 'Restoration',
            quantity,
            previousStock,
            newStock: stock.currentStock,
            reference: order.refNo,
            note: `Cancelled food order ${order.refNo}`
          }], { session });
        }

        order.stockDeducted = false;
        order.stockDeductedAt = null;
      }

      order.status = newStatus;
      await order.save({ session });
    });

  } finally {
    await session.endSession();
  }
}

module.exports = { updateOrderStock };
