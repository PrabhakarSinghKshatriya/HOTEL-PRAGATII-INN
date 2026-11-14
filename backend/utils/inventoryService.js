const mongoose = require('mongoose');
const FoodOrder = require('../models/FoodOrder');
const Recipe = require('../models/Recipe');
const InventoryItem = require('../models/InventoryItem');
const StockMovement = require('../models/StockMovement');

const ALLOWED_TRANSITIONS = {
  Received: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready: ['Served', 'Cancelled'],
  Served: [],
  Cancelled: []
};

async function updateOrderStock(orderId, newStatus) {
  const session = await mongoose.startSession();

  try {
    let updatedOrder;

    await session.withTransaction(async () => {
      const order = await FoodOrder.findById(orderId).session(session);

      if (!order) throw new Error('Food order not found.');

      const oldStatus = order.status;

      if (oldStatus === newStatus) {
        updatedOrder = order;
        return;
      }

      if (!ALLOWED_TRANSITIONS[oldStatus]?.includes(newStatus)) {
        throw new Error(
          `Invalid status transition: ${oldStatus} → ${newStatus}.`
        );
      }

      // Deduct stock exactly once when preparation starts.
      if (newStatus === 'Preparing') {
        const required = new Map();

        for (const item of order.items) {
          const recipe = await Recipe.findOne({
            itemId: item.itemId,
            variant: item.variant || 'single'
          }).session(session);

          // Recipes are optional until configured.
          if (!recipe) continue;

          for (const ingredient of recipe.ingredients) {
            const id = String(ingredient.inventoryItem);
            const quantity =
              Number(ingredient.quantity) * Number(item.qty);

            if (!Number.isFinite(quantity) || quantity <= 0) {
              throw new Error('Invalid recipe ingredient quantity.');
            }

            required.set(
              id,
              (required.get(id) || 0) + quantity
            );
          }
        }

        const snapshot = [];

        for (const [id, quantity] of required) {
          // Atomic conditional decrement prevents negative stock.
          const stock = await InventoryItem.findOneAndUpdate(
            {
              _id: id,
              isActive: true,
              currentStock: { $gte: quantity }
            },
            { $inc: { currentStock: -quantity } },
            { new: false, session }
          );

          if (!stock) {
            const current = await InventoryItem.findById(id)
              .session(session);

            if (!current || !current.isActive) {
              throw new Error(
                'A recipe ingredient is missing or inactive.'
              );
            }

            throw new Error(
              `Insufficient stock for ${current.name}. ` +
              `Available: ${current.currentStock} ${current.unit}, ` +
              `Required: ${quantity} ${current.unit}.`
            );
          }

          const previousStock = stock.currentStock;
          const newStock = previousStock - quantity;

          await StockMovement.create([{
            inventoryItem: stock._id,
            type: 'Consumption',
            quantity: -quantity,
            previousStock,
            newStock,
            reference: order.refNo,
            note: `Food order ${order.refNo}`
          }], { session });

          snapshot.push({
            inventoryItem: stock._id,
            itemName: stock.name,
            unit: stock.unit,
            quantity
          });
        }

        order.stockDeductionSnapshot = snapshot;
        order.stockDeducted = snapshot.length > 0;
        order.stockDeductedAt =
          snapshot.length > 0 ? new Date() : null;
      }

      // Restore the exact original deduction on cancellation.
      if (newStatus === 'Cancelled' && order.stockDeducted) {
        let restoration = [];

        const snapshot = order.stockDeductionSnapshot || [];

        if (snapshot.length > 0) {
          restoration = snapshot.map(entry => ({
            inventoryItem: entry.inventoryItem,
            quantity: Number(entry.quantity)
          }));
        } else {
          // Backward compatibility for older orders.
          const movements = await StockMovement.find({
            reference: order.refNo,
            type: 'Consumption'
          }).session(session);

          const grouped = new Map();

          for (const movement of movements) {
            const id = String(movement.inventoryItem);
            const quantity = Math.abs(Number(movement.quantity));

            if (!Number.isFinite(quantity) || quantity <= 0) {
              continue;
            }

            grouped.set(
              id,
              (grouped.get(id) || 0) + quantity
            );
          }

          restoration = Array.from(
            grouped,
            ([inventoryItem, quantity]) => ({
              inventoryItem,
              quantity
            })
          );
        }

        for (const entry of restoration) {
          const quantity = Number(entry.quantity);

          if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error('Invalid stock restoration quantity.');
          }

          const stock = await InventoryItem.findById(
            entry.inventoryItem
          ).session(session);

          if (!stock) {
            throw new Error(
              'An inventory item required for restoration no longer exists.'
            );
          }

          const previousStock = stock.currentStock;
          const newStock = previousStock + quantity;

          await InventoryItem.updateOne(
            { _id: stock._id },
            { $inc: { currentStock: quantity } },
            { session }
          );

          await StockMovement.create([{
            inventoryItem: stock._id,
            type: 'Restoration',
            quantity,
            previousStock,
            newStock,
            reference: order.refNo,
            note: `Cancelled food order ${order.refNo}`
          }], { session });
        }

        order.stockDeducted = false;
        order.stockDeductedAt = null;
        order.stockDeductionSnapshot = [];
      }

      order.status = newStatus;
      await order.save({ session });

      updatedOrder = order;
    });

    return updatedOrder;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  updateOrderStock,
  ALLOWED_TRANSITIONS
};
