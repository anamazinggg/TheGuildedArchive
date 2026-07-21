import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';
import { crossMarketplaceProtection } from '../services/sync-engine.js';

const router = Router();

router.use(authMiddleware);
router.use(requireWriteForRole('Manager'));

// POST /api/sales/record — Record a manual sale
router.post('/record', async (req: AuthRequest, res: Response) => {
  try {
    const {
      inventoryItemId,
      salePrice,
      marketplace,
      buyerName,
      saleDate,
      shippingCost,
      marketplaceFees,
      notes,
    } = req.body;

    if (!inventoryItemId || salePrice === undefined || !marketplace || !saleDate) {
      res.status(400).json({ error: 'inventoryItemId, salePrice, marketplace, and saleDate are required' });
      return;
    }

    // 1. Check inventory item exists and is not already Sold
    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });

    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    if (item.status === 'Sold') {
      res.status(409).json({ error: 'This item has already been sold' });
      return;
    }

    const timestamp = Date.now();
    const orderNumber = `MANUAL-${timestamp}`;
    const marketplaceOrderId = `MANUAL-${uuidv4()}`;
    const parsedSaleDate = new Date(saleDate);
    const parsedSalePrice = parseFloat(salePrice);
    const parsedShippingCost = shippingCost ? parseFloat(shippingCost) : 0;
    const parsedMarketplaceFees = marketplaceFees ? parseFloat(marketplaceFees) : 0;

    // Create everything in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 2. Create Order
      const order = await tx.order.create({
        data: {
          organizationId: req.user!.organizationId,
          id: uuidv4(),
          orderNumber,
          marketplace,
          marketplaceOrderId,
          buyerName: buyerName || null,
          saleDate: parsedSaleDate,
          paymentStatus: 'Paid',
          fulfillmentStatus: 'AwaitingShipment',
          shippingCost: parsedShippingCost,
          notes: notes || null,
        },
      });

      // 3. Create OrderItem
      const orderItem = await tx.orderItem.create({
        data: {
          organizationId: req.user!.organizationId,
          id: uuidv4(),
          orderId: order.id,
          inventoryItemId,
          salePrice: parsedSalePrice,
          quantity: 1,
        },
      });

      // 4. Update inventory item
      await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: {
          status: 'Sold',
          dateListed: parsedSaleDate,
        },
      });

      // 5. Create Revenue transaction
      await tx.transaction.create({
        data: {
          organizationId: req.user!.organizationId,
          id: uuidv4(),
          type: 'Revenue',
          category: 'Sale',
          orderId: order.id,
          inventoryItemId,
          amount: parsedSalePrice,
          description: `Manual sale of ${item.title}`,
          transactionDate: parsedSaleDate,
          marketplace,
        },
      });

      // 6. If marketplaceFees provided, create Fee transaction
      if (parsedMarketplaceFees > 0) {
        await tx.transaction.create({
          data: {
            organizationId: req.user!.organizationId,
            id: uuidv4(),
            type: 'Fee',
            category: 'MarketplaceFee',
            orderId: order.id,
            inventoryItemId,
            amount: parsedMarketplaceFees,
            description: `Marketplace fees for ${item.title}`,
            transactionDate: parsedSaleDate,
            marketplace,
          },
        });
      }

      // 7. If shippingCost provided, create Shipping transaction
      if (parsedShippingCost > 0) {
        await tx.transaction.create({
          data: {
            organizationId: req.user!.organizationId,
            id: uuidv4(),
            type: 'Shipping',
            category: 'ShippingCost',
            orderId: order.id,
            inventoryItemId,
            amount: parsedShippingCost,
            description: `Shipping cost for ${item.title}`,
            transactionDate: parsedSaleDate,
            marketplace,
          },
        });
      }

      return order;
    });

    // Delist every remaining Etsy/eBay listing for this one-of-a-kind item.
    // Drafts are closed locally; active marketplace listings are ended through their attached account.
    await crossMarketplaceProtection(inventoryItemId, marketplace);

    // Fetch complete order with item details
    const createdOrder = await prisma.order.findUnique({
      where: { id: result.id },
      include: {
        orderItems: {
          include: {
            inventoryItem: {
              select: { id: true, title: true, sku: true },
            },
          },
        },
        transactions: true,
      },
    });

    res.status(201).json({ order: createdOrder });
  } catch (error) {
    console.error('Record sale error:', error);
    res.status(500).json({ error: 'Failed to record sale' });
  }
});

export default router;
