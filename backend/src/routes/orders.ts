import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import { authMiddleware, requireWriteForRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);
router.use(requireWriteForRole('FulfillmentAssistant'));

// GET /api/orders — List orders with pagination, filterable
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const marketplace = req.query.marketplace as string;
    const fulfillmentStatus = req.query.fulfillmentStatus as string;
    const paymentStatus = req.query.paymentStatus as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const where: Record<string, unknown> = {};

    if (marketplace) {
      where.marketplace = marketplace;
    }
    if (fulfillmentStatus) {
      where.fulfillmentStatus = fulfillmentStatus;
    }
    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }
    if (startDate || endDate) {
      const saleDate: Record<string, Date> = {};
      if (startDate) saleDate.gte = new Date(startDate);
      if (endDate) saleDate.lte = new Date(endDate);
      where.saleDate = saleDate;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          orderItems: {
            include: {
              inventoryItem: { select: { id: true, title: true, sku: true } },
            },
          },
        },
        orderBy: { saleDate: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List orders error:', error);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// GET /api/orders/:id — Single order with details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        orderItems: {
          include: {
            inventoryItem: {
              select: {
                id: true, title: true, sku: true, status: true,
                category: true, type: true, purchaseCost: true,
                totalCostBasis: true,
              },
            },
          },
        },
        transactions: {
          orderBy: { transactionDate: 'desc' },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json({ order });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// PUT /api/orders/:id — Update order fields
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const {
      fulfillmentStatus, paymentStatus, shippingCarrier,
      trackingNumber, shippingDeadline, notes,
      shippingCost, insuranceCost,
    } = req.body;

    const validFulfillmentStatuses = [
      'AwaitingPayment', 'AwaitingShipment', 'Packed', 'Shipped',
      'Delivered', 'Cancelled', 'ReturnRequested', 'Returned', 'Refunded',
    ];
    const validPaymentStatuses = ['Paid', 'Pending', 'Refunded', 'PartiallyRefunded'];

    if (fulfillmentStatus && !validFulfillmentStatuses.includes(fulfillmentStatus)) {
      res.status(400).json({ error: `Invalid fulfillmentStatus. Must be one of: ${validFulfillmentStatuses.join(', ')}` });
      return;
    }
    if (paymentStatus && !validPaymentStatuses.includes(paymentStatus)) {
      res.status(400).json({ error: `Invalid paymentStatus. Must be one of: ${validPaymentStatuses.join(', ')}` });
      return;
    }

    const order = await prisma.order.update({
      where: { id },
      data: {
        ...(fulfillmentStatus !== undefined && { fulfillmentStatus }),
        ...(paymentStatus !== undefined && { paymentStatus }),
        ...(shippingCarrier !== undefined && { shippingCarrier }),
        ...(trackingNumber !== undefined && { trackingNumber }),
        ...(shippingDeadline !== undefined && { shippingDeadline: new Date(shippingDeadline) }),
        ...(notes !== undefined && { notes }),
        ...(shippingCost !== undefined && { shippingCost: parseFloat(shippingCost) }),
        ...(insuranceCost !== undefined && { insuranceCost: parseFloat(insuranceCost) }),
      },
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true, sku: true } },
          },
        },
        transactions: true,
      },
    });

    res.json({ order });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// POST /api/orders — Create a manual order
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      orderNumber, marketplace, buyerName, buyerUsername,
      saleDate, items, shippingCost, salesTaxCollected, notes,
    } = req.body;

    if (!orderNumber || !marketplace || !saleDate || !items || !items.length) {
      res.status(400).json({ error: 'orderNumber, marketplace, saleDate, and items are required' });
      return;
    }

    const marketplaceOrderId = `MANUAL-${uuidv4()}`;
    const parsedSaleDate = new Date(saleDate);
    const parsedShippingCost = shippingCost ? parseFloat(shippingCost) : 0;
    const parsedSalesTax = salesTaxCollected ? parseFloat(salesTaxCollected) : 0;

    // Validate all items exist and are not Sold
    for (const item of items) {
      if (!item.inventoryItemId || item.salePrice === undefined) {
        res.status(400).json({ error: 'Each item must have inventoryItemId and salePrice' });
        return;
      }
      const invItem = await prisma.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });
      if (!invItem) {
        res.status(404).json({ error: `Inventory item ${item.inventoryItemId} not found` });
        return;
      }
      if (invItem.status === 'Sold') {
        res.status(409).json({ error: `Inventory item ${invItem.title} has already been sold` });
        return;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Create the order
      const order = await tx.order.create({
        data: {
          id: uuidv4(),
          orderNumber,
          marketplace,
          marketplaceOrderId,
          buyerName: buyerName || null,
          buyerUsername: buyerUsername || null,
          saleDate: parsedSaleDate,
          paymentStatus: 'Paid',
          fulfillmentStatus: 'AwaitingShipment',
          shippingCost: parsedShippingCost,
          salesTaxCollected: parsedSalesTax,
          notes: notes || null,
        },
      });

      // Create order items and update inventory
      for (const item of items) {
        const invItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
        });

        await tx.orderItem.create({
          data: {
            id: uuidv4(),
            orderId: order.id,
            inventoryItemId: item.inventoryItemId,
            salePrice: parseFloat(item.salePrice),
            quantity: item.quantity || 1,
          },
        });

        // Mark item as Sold
        await tx.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: {
            status: 'Sold',
            dateListed: parsedSaleDate,
          },
        });

        // Create Revenue transaction per item
        await tx.transaction.create({
          data: {
            id: uuidv4(),
            type: 'Revenue',
            category: 'Sale',
            orderId: order.id,
            inventoryItemId: item.inventoryItemId,
            amount: parseFloat(item.salePrice),
            description: `Sale of ${invItem?.title || 'item'}`,
            transactionDate: parsedSaleDate,
            marketplace,
          },
        });
      }

      // Create Shipping transaction if applicable
      if (parsedShippingCost > 0) {
        await tx.transaction.create({
          data: {
            id: uuidv4(),
            type: 'Shipping',
            category: 'ShippingCost',
            orderId: order.id,
            amount: parsedShippingCost,
            description: 'Shipping cost for order',
            transactionDate: parsedSaleDate,
            marketplace,
          },
        });
      }

      // Create Tax transaction if applicable
      if (parsedSalesTax > 0) {
        await tx.transaction.create({
          data: {
            id: uuidv4(),
            type: 'Tax',
            category: 'SalesTax',
            orderId: order.id,
            amount: parsedSalesTax,
            description: 'Sales tax collected',
            transactionDate: parsedSaleDate,
            marketplace,
          },
        });
      }

      return order;
    });

    const createdOrder = await prisma.order.findUnique({
      where: { id: result.id },
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true, sku: true } },
          },
        },
        transactions: true,
      },
    });

    res.status(201).json({ order: createdOrder });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// POST /api/orders/:id/refund — Process refund
router.post('/:id/refund', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, reason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const refundAmount = amount ? parseFloat(amount) : 0;

    // Determine payment status
    let paymentStatus: string;
    if (refundAmount <= 0) {
      paymentStatus = 'Refunded';
    } else {
      // If partial refund: check if there's already been a partial refund
      // For simplicity, if amount is provided and less than total, mark as PartiallyRefunded
      const totalSalePrice = order.orderItems.reduce((sum, oi) => sum + oi.salePrice, 0);
      paymentStatus = refundAmount >= totalSalePrice ? 'Refunded' : 'PartiallyRefunded';
    }

    const result = await prisma.$transaction(async (tx) => {
      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          paymentStatus,
          fulfillmentStatus: paymentStatus === 'Refunded' ? 'Refunded' : order.fulfillmentStatus,
        },
      });

      // Create Refund transaction
      await tx.transaction.create({
        data: {
          id: uuidv4(),
          type: 'Refund',
          category: 'Refund',
          orderId: id,
          amount: refundAmount > 0 ? refundAmount : 0,
          description: reason || 'Refund processed',
          transactionDate: new Date(),
          marketplace: order.marketplace,
        },
      });

      return updatedOrder;
    });

    const updatedOrder = await prisma.order.findUnique({
      where: { id: result.id },
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true, sku: true } },
          },
        },
        transactions: true,
      },
    });

    res.json({ order: updatedOrder });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
});

// POST /api/orders/:id/return — Process return
router.post('/:id/return', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // Update order fulfillment status to Returned
      await tx.order.update({
        where: { id },
        data: {
          fulfillmentStatus: 'Returned',
        },
      });

      // Update each inventory item status to Returned
      for (const oi of order.orderItems) {
        await tx.inventoryItem.update({
          where: { id: oi.inventoryItemId },
          data: {
            status: 'Returned',
          },
        });
      }

      // Create a Refund transaction to track the return
      await tx.transaction.create({
        data: {
          id: uuidv4(),
          type: 'Refund',
          category: 'Return',
          orderId: id,
          amount: 0,
          description: reason || 'Return processed',
          transactionDate: new Date(),
          marketplace: order.marketplace,
        },
      });
    });

    const updatedOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: {
            inventoryItem: { select: { id: true, title: true, sku: true } },
          },
        },
        transactions: true,
      },
    });

    res.json({ order: updatedOrder });
  } catch (error) {
    console.error('Process return error:', error);
    res.status(500).json({ error: 'Failed to process return' });
  }
});

export default router;
