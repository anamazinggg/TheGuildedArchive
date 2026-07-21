import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);
// Analytics is read-only, all authenticated users can access

// GET /api/analytics/overview
router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const activeStatuses = ['ReadyToList', 'ListedOnEtsy', 'ListedOnEbay', 'ListedOnBoth'];
    const soldStatuses = ['Sold', 'Shipped'];

    const [
      activeCount,
      totalValue,
      totalCost,
      soldItems,
      allItemsEver,
      ordersWithItems,
      allOrders,
    ] = await Promise.all([
      prisma.inventoryItem.count({
        where: { deletedAt: null, status: { in: activeStatuses } },
      }),
      prisma.inventoryItem.aggregate({
        _sum: { askingPrice: true },
        where: { deletedAt: null, status: { in: activeStatuses } },
      }),
      prisma.inventoryItem.aggregate({
        _sum: { totalCostBasis: true },
        where: { deletedAt: null },
      }),
      prisma.orderItem.findMany({
        where: Object.keys(dateFilter).length > 0
          ? { order: { saleDate: dateFilter } }
          : {},
        include: {
          inventoryItem: { select: { id: true, createdAt: true, dateListed: true, totalCostBasis: true } },
          order: { select: { saleDate: true } },
        },
      }),
      prisma.inventoryItem.count({
        where: { deletedAt: null },
      }),
      prisma.order.findMany({
        where: Object.keys(dateFilter).length > 0
          ? { saleDate: dateFilter }
          : {},
        select: { saleDate: true, orderItems: { select: { salePrice: true, inventoryItem: { select: { totalCostBasis: true } } } } },
      }),
    ]);

    const sellingItems = await prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        status: { in: soldStatuses },
        dateListed: { not: null },
      },
      select: { dateListed: true, createdAt: true },
    });

    // Sell-through rate
    const totalSold = soldItems.length;
    const sellThroughRate = allItemsEver > 0 ? (totalSold / allItemsEver) * 100 : 0;

    // Average days to sell
    let totalDays = 0;
    let itemsWithDays = 0;
    for (const item of sellingItems) {
      const listDate = item.dateListed || item.createdAt;
      // We estimate using orderItems; find matching orders
      for (const oi of soldItems) {
        if (oi.inventoryItem?.id === item.dateListed) continue; // skip self-match
      }
    }
    
    // Better: compute from orderItems
    let sumDays = 0;
    let countDays = 0;
    for (const oi of soldItems) {
      const item = oi.inventoryItem;
      if (item) {
        const listDate = item.dateListed || item.createdAt;
        const saleDate = oi.order.saleDate;
        const days = Math.max(1, Math.round((new Date(saleDate).getTime() - new Date(listDate).getTime()) / (1000 * 60 * 60 * 24)));
        sumDays += days;
        countDays++;
      }
    }
    const avgDaysToSell = countDays > 0 ? Math.round(sumDays / countDays) : 0;

    // Average sale price
    const allSalePrices = soldItems.map(oi => oi.salePrice);
    const avgSalePrice = allSalePrices.length > 0
      ? allSalePrices.reduce((a, b) => a + b, 0) / allSalePrices.length
      : 0;

    // Average profit margin
    let totalProfit = 0;
    let profitCount = 0;
    for (const oi of soldItems) {
      const cost = oi.inventoryItem?.totalCostBasis || 0;
      if (cost > 0) {
        totalProfit += ((oi.salePrice - cost) / cost) * 100;
        profitCount++;
      }
    }
    const avgProfitMargin = profitCount > 0 ? Math.round((totalProfit / profitCount) * 10) / 10 : 0;

    res.json({
      totalActiveItems: activeCount,
      totalInventoryValue: totalValue._sum.askingPrice || 0,
      totalInventoryCost: totalCost._sum.totalCostBasis || 0,
      sellThroughRate: Math.round(sellThroughRate * 10) / 10,
      averageDaysToSell: avgDaysToSell,
      averageSalePrice: Math.round(avgSalePrice * 100) / 100,
      averageProfitMargin: avgProfitMargin,
      totalSold,
      totalListed: allItemsEver,
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
});

// GET /api/analytics/revenue — monthly revenue/profit for charts
router.get('/revenue', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const whereClause = Object.keys(dateFilter).length > 0
      ? { transactionDate: dateFilter }
      : {};

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      select: { type: true, amount: true, transactionDate: true, marketplace: true },
      orderBy: { transactionDate: 'asc' },
    });

    // Group by month
    const byMonth: Record<string, { month: string; revenue: number; profit: number; fees: number; expenses: number; shipping: number }> = {};

    for (const tx of transactions) {
      const month = tx.transactionDate.toISOString().substring(0, 7);
      if (!byMonth[month]) {
        byMonth[month] = { month, revenue: 0, profit: 0, fees: 0, expenses: 0, shipping: 0 };
      }
      if (tx.type === 'Revenue') byMonth[month].revenue += tx.amount;
      else if (tx.type === 'Fee') byMonth[month].fees += tx.amount;
      else if (tx.type === 'Shipping') byMonth[month].shipping += tx.amount;
      else if (tx.type === 'Expense') byMonth[month].expenses += tx.amount;
    }

    const monthly = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
    for (const m of monthly) {
      m.profit = m.revenue - m.fees - m.shipping - m.expenses;
    }

    // By marketplace
    const byMarketplace: Record<string, { revenue: number; fees: number }> = {};
    for (const tx of transactions) {
      const mp = tx.marketplace || 'Other';
      if (!byMarketplace[mp]) byMarketplace[mp] = { revenue: 0, fees: 0 };
      if (tx.type === 'Revenue') byMarketplace[mp].revenue += tx.amount;
      else if (tx.type === 'Fee' || tx.type === 'Shipping') byMarketplace[mp].fees += tx.amount;
    }

    const marketplace = Object.entries(byMarketplace).map(([name, data]) => ({
      name,
      revenue: data.revenue,
      profit: data.revenue - data.fees,
    }));

    res.json({ monthly, marketplace });
  } catch (error) {
    console.error('Analytics revenue error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue analytics' });
  }
});

// GET /api/analytics/performance
router.get('/performance', async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    // Sold items
    const soldItems = await prisma.orderItem.findMany({
      where: Object.keys(dateFilter).length > 0
        ? { order: { saleDate: dateFilter } }
        : {},
      include: {
        inventoryItem: true,
        order: { select: { saleDate: true, marketplace: true } },
      },
    });

    // Active items
    const activeItems = await prisma.inventoryItem.findMany({
      where: { deletedAt: null, status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] } },
      include: { analyticsSnapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 } },
    });

    // ---- Category performance ----
    const catMap: Record<string, { sales: number; revenue: number; profit: number; count: number }> = {};
    for (const oi of soldItems) {
      const cat = oi.inventoryItem?.category || 'Other';
      if (!catMap[cat]) catMap[cat] = { sales: 0, revenue: 0, profit: 0, count: 0 };
      catMap[cat].sales++;
      catMap[cat].revenue += oi.salePrice;
      catMap[cat].profit += oi.salePrice - (oi.inventoryItem?.totalCostBasis || 0);
      catMap[cat].count++;
    }
    const categories = Object.entries(catMap).map(([name, d]) => ({
      name,
      sales: d.sales,
      revenue: Math.round(d.revenue * 100) / 100,
      profit: Math.round(d.profit * 100) / 100,
      avgProfit: d.count > 0 ? Math.round((d.profit / d.count) * 100) / 100 : 0,
    })).sort((a, b) => b.profit - a.profit);

    // ---- Era performance ----
    const eraMap: Record<string, { sales: number; revenue: number; count: number }> = {};
    for (const oi of soldItems) {
      const era = oi.inventoryItem?.estimatedEra || 'Unknown';
      if (!eraMap[era]) eraMap[era] = { sales: 0, revenue: 0, count: 0 };
      eraMap[era].sales++;
      eraMap[era].revenue += oi.salePrice;
      eraMap[era].count++;
    }
    const eras = Object.entries(eraMap).map(([name, d]) => ({
      name, sales: d.sales, revenue: Math.round(d.revenue * 100) / 100,
    })).sort((a, b) => b.revenue - a.revenue);

    // ---- Metal performance ----
    const metalMap: Record<string, { sales: number; revenue: number; count: number }> = {};
    for (const oi of soldItems) {
      const metal = oi.inventoryItem?.metalType || 'Unknown';
      if (!metalMap[metal]) metalMap[metal] = { sales: 0, revenue: 0, count: 0 };
      metalMap[metal].sales++;
      metalMap[metal].revenue += oi.salePrice;
      metalMap[metal].count++;
    }
    const metals = Object.entries(metalMap).map(([name, d]) => ({
      name, sales: d.sales, revenue: Math.round(d.revenue * 100) / 100,
    })).sort((a, b) => b.revenue - a.revenue);

    // ---- Gemstone performance ----
    const gemMap: Record<string, { sales: number; revenue: number; count: number }> = {};
    for (const oi of soldItems) {
      const gem = oi.inventoryItem?.gemstoneType || 'None';
      if (!gemMap[gem]) gemMap[gem] = { sales: 0, revenue: 0, count: 0 };
      gemMap[gem].sales++;
      gemMap[gem].revenue += oi.salePrice;
      gemMap[gem].count++;
    }
    const gemstones = Object.entries(gemMap).map(([name, d]) => ({
      name, sales: d.sales, revenue: Math.round(d.revenue * 100) / 100,
    })).sort((a, b) => b.revenue - a.revenue);

    // ---- Top/Bottom performers ----
    const itemPerformance: Record<string, { id: string; title: string; sku: string; profit: number; salePrice: number; cost: number }> = {};
    for (const oi of soldItems) {
      const inv = oi.inventoryItem;
      if (!inv) continue;
      if (!itemPerformance[inv.id]) {
        itemPerformance[inv.id] = {
          id: inv.id, title: inv.title, sku: inv.sku,
          profit: 0, salePrice: 0, cost: inv.totalCostBasis || 0,
        };
      }
      itemPerformance[inv.id].profit += oi.salePrice - (inv.totalCostBasis || 0);
      itemPerformance[inv.id].salePrice += oi.salePrice;
    }

    const allPerformers = Object.values(itemPerformance);
    allPerformers.sort((a, b) => b.profit - a.profit);
    const topPerformers = allPerformers.slice(0, 5);
    const bottomPerformers = allPerformers.slice(-5).reverse();

    // Fastest selling (from sold items, days to sell)
    const speedMap: { id: string; title: string; sku: string; days: number; salePrice: number }[] = [];
    for (const oi of soldItems) {
      const inv = oi.inventoryItem;
      if (!inv) continue;
      const listDate = inv.dateListed || inv.createdAt;
      const days = Math.round((oi.order.saleDate.getTime() - listDate.getTime()) / (1000 * 60 * 60 * 24));
      speedMap.push({ id: inv.id, title: inv.title, sku: inv.sku, days: Math.max(1, days), salePrice: oi.salePrice });
    }
    speedMap.sort((a, b) => a.days - b.days);
    const fastestSelling = speedMap.slice(0, 5);

    // Slowest (active items listed >90 days)
    const now = new Date();
    const slowItems = activeItems
      .filter(item => {
        const listDate = item.dateListed || item.createdAt;
        const days = Math.round((now.getTime() - listDate.getTime()) / (1000 * 60 * 60 * 24));
        return days > 90;
      })
      .map(item => {
        const listDate = item.dateListed || item.createdAt;
        const days = Math.round((now.getTime() - listDate.getTime()) / (1000 * 60 * 60 * 24));
        return { id: item.id, title: item.title, sku: item.sku, days, askingPrice: item.askingPrice || 0 };
      })
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);

    res.json({
      categories,
      eras,
      metals,
      gemstones,
      topPerformers,
      bottomPerformers,
      fastestSelling,
      slowestMoving: slowItems,
    });
  } catch (error) {
    console.error('Analytics performance error:', error);
    res.status(500).json({ error: 'Failed to fetch performance data' });
  }
});

// GET /api/analytics/aging
router.get('/aging', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const activeItems = await prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] },
      },
      select: {
        id: true, title: true, sku: true, askingPrice: true,
        createdAt: true, dateListed: true, status: true, category: true,
      },
    });

    const distribution = { '0-30': 0, '30-60': 0, '60-90': 0, '90-180': 0, '180+': 0 };
    const agingItems: any[] = [];

    for (const item of activeItems) {
      const listDate = item.dateListed || item.createdAt;
      const days = Math.round((now.getTime() - listDate.getTime()) / (1000 * 60 * 60 * 24));

      if (days <= 30) distribution['0-30']++;
      else if (days <= 60) distribution['30-60']++;
      else if (days <= 90) distribution['60-90']++;
      else if (days <= 180) distribution['90-180']++;
      else distribution['180+']++;

      agingItems.push({
        id: item.id,
        title: item.title,
        sku: item.sku,
        askingPrice: item.askingPrice || 0,
        category: item.category,
        status: item.status,
        daysListed: days,
      });
    }

    agingItems.sort((a, b) => b.daysListed - a.daysListed);

    res.json({ distribution, items: agingItems });
  } catch (error) {
    console.error('Analytics aging error:', error);
    res.status(500).json({ error: 'Failed to fetch aging data' });
  }
});

// GET /api/analytics/insights
router.get('/insights', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [
      soldItems,
      activeCount,
      agingCount,
      categoryData,
      marketplaceRevenue,
      noPhotoCount,
      noCostCount,
      totalActiveValue,
    ] = await Promise.all([
      prisma.orderItem.findMany({
        include: {
          inventoryItem: { select: { category: true, totalCostBasis: true, metalType: true, gemstoneType: true } },
          order: { select: { marketplace: true, saleDate: true } },
        },
      }),
      prisma.inventoryItem.count({ where: { deletedAt: null, status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] } } }),
      prisma.inventoryItem.count({
        where: {
          deletedAt: null,
          status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] },
          createdAt: { lt: ninetyDaysAgo },
        },
      }),
      prisma.inventoryItem.groupBy({
        by: ['category'],
        _count: { id: true },
        where: { deletedAt: null, status: { in: ['Sold', 'Shipped'] } },
      }),
      prisma.transaction.groupBy({
        by: ['marketplace'],
        _sum: { amount: true },
        where: { type: 'Revenue' },
      }),
      prisma.inventoryItem.count({
        where: {
          deletedAt: null,
          status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted', 'Draft', 'NeedsPhotos'] },
          photos: { none: {} },
        },
      }),
      prisma.inventoryItem.count({
        where: {
          deletedAt: null,
          status: { notIn: ['Draft'] },
          totalCostBasis: null,
        },
      }),
      prisma.inventoryItem.aggregate({
        _sum: { askingPrice: true },
        where: { deletedAt: null, status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] } },
      }),
    ]);

    const insights: { type: string; text: string }[] = [];

    // Best category by profit margin
    const catProfit: Record<string, { revenue: number; cost: number; count: number }> = {};
    for (const oi of soldItems) {
      const cat = oi.inventoryItem?.category || 'Other';
      if (!catProfit[cat]) catProfit[cat] = { revenue: 0, cost: 0, count: 0 };
      catProfit[cat].revenue += oi.salePrice;
      catProfit[cat].cost += oi.inventoryItem?.totalCostBasis || 0;
      catProfit[cat].count++;
    }
    const sortedCats = Object.entries(catProfit)
      .map(([name, d]) => ({ name, margin: d.revenue > 0 ? ((d.revenue - d.cost) / d.revenue) * 100 : 0 }))
      .filter(c => c.margin > 0)
      .sort((a, b) => b.margin - a.margin);

    if (sortedCats.length > 0) {
      insights.push({
        type: 'positive',
        text: `🔷 ${sortedCats[0].name}s are producing the highest profit margin at ${Math.round(sortedCats[0].margin)}%`,
      });
    }

    // Aging alert
    if (agingCount > 0) {
      insights.push({
        type: 'warning',
        text: `⚠️ ${agingCount} item${agingCount !== 1 ? 's' : ''} ${agingCount !== 1 ? 'have' : 'has'} been listed for more than 90 days with no engagement`,
      });
    }

    // Marketplace comparison
    const mpRev: Record<string, number> = {};
    for (const mp of marketplaceRevenue) {
      mpRev[mp.marketplace || 'Other'] = mp._sum.amount || 0;
    }
    if (mpRev['Etsy'] > 0 && mpRev['Ebay'] > 0) {
      const etsyHigher = mpRev['Etsy'] > mpRev['Ebay'];
      insights.push({
        type: 'info',
        text: `📊 ${etsyHigher ? 'Etsy is generating more revenue' : 'eBay is generating more revenue'}, but ${etsyHigher ? 'eBay' : 'Etsy'} may have different fee structures — review marketplace profitability`,
      });
    } else if (mpRev['Etsy'] > 0 && !mpRev['Ebay']) {
      insights.push({
        type: 'info',
        text: `📊 All sales so far are through Etsy. Consider cross-listing on eBay to reach more buyers`,
      });
    } else if (mpRev['Ebay'] > 0 && !mpRev['Etsy']) {
      insights.push({
        type: 'info',
        text: `📊 All sales so far are through eBay. Consider cross-listing on Etsy for vintage/antique buyers`,
      });
    }

    // Missing photos
    if (noPhotoCount > 0) {
      insights.push({
        type: 'warning',
        text: `💡 ${noPhotoCount} active listing${noPhotoCount !== 1 ? 's' : ''} ${noPhotoCount !== 1 ? 'are' : 'is'} missing photos — listings with photos sell ${'significantly'} faster`,
      });
    }

    // Missing cost
    if (noCostCount > 0) {
      insights.push({
        type: 'warning',
        text: `💰 ${noCostCount} item${noCostCount !== 1 ? 's' : ''} ${noCostCount !== 1 ? 'are' : 'is'} missing cost basis — add purchase costs to accurately track profitability`,
      });
    }

    // Inventory value
    const totalVal = totalActiveValue._sum.askingPrice || 0;
    if (totalVal > 0) {
      insights.push({
        type: 'positive',
        text: `💎 Your active inventory is valued at approximately $${Math.round(totalVal).toLocaleString()} — keep listings fresh to maintain sell-through`,
      });
    }

    // General tip if few insights
    if (insights.length < 3) {
      insights.push({
        type: 'tip',
        text: `💡 Keep your listings updated with fresh photos and competitive pricing — this improves visibility on both Etsy and eBay`,
      });
    }

    res.json({ insights });
  } catch (error) {
    console.error('Analytics insights error:', error);
    res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// GET /api/analytics/performance-scores
router.get('/performance-scores', async (req: AuthRequest, res: Response) => {
  try {
    const activeItems = await prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['Sold', 'Shipped', 'Returned', 'Archived', 'Delisted'] },
      },
      include: {
        photos: { take: 1 },
        analyticsSnapshots: { orderBy: { snapshotDate: 'desc' }, take: 1 },
      },
    });

    // Category sell-through rates
    const catSales = await prisma.inventoryItem.groupBy({
      by: ['category'],
      _count: { id: true },
      where: { deletedAt: null, status: { in: ['Sold', 'Shipped'] } },
    });
    const catCounts = await prisma.inventoryItem.groupBy({
      by: ['category'],
      _count: { id: true },
      where: { deletedAt: null },
    });

    const catSTR: Record<string, number> = {};
    for (const c of catCounts) {
      const sold = catSales.find(s => s.category === c.category)?._count.id || 0;
      catSTR[c.category] = c._count.id > 0 ? (sold / c._count.id) * 100 : 0;
    }

    const now = new Date();
    const scores = activeItems.map(item => {
      const listDate = item.dateListed || item.createdAt;
      const daysListed = Math.round((now.getTime() - listDate.getTime()) / (1000 * 60 * 60 * 24));
      const hasPhotos = item.photos.length > 0;
      const hasSnapshots = item.analyticsSnapshots.length > 0;
      const views = item.analyticsSnapshots[0]?.views || 0;
      const categorySTR = catSTR[item.category] || 50;

      let score = 50; // Base

      // Photos are good
      if (hasPhotos) score += 15;
      else score -= 10;

      // Freshness (newer is better)
      if (daysListed <= 30) score += 10;
      else if (daysListed <= 60) score += 5;
      else if (daysListed <= 90) score += 0;
      else if (daysListed <= 180) score -= 10;
      else score -= 20;

      // Category sell-through
      if (categorySTR > 60) score += 10;
      else if (categorySTR < 30) score -= 10;

      // Views
      if (views > 100) score += 10;
      else if (views > 50) score += 5;

      // Price set
      if (item.askingPrice && item.askingPrice > 0) score += 5;
      else score -= 10;

      // Description quality
      if (item.description && item.description.length > 100) score += 5;

      return {
        id: item.id,
        title: item.title,
        sku: item.sku,
        category: item.category,
        askingPrice: item.askingPrice || 0,
        daysListed,
        views,
        score: Math.max(0, Math.min(100, score)),
      };
    });

    scores.sort((a, b) => b.score - a.score);

    res.json({ scores });
  } catch (error) {
    console.error('Performance scores error:', error);
    res.status(500).json({ error: 'Failed to compute performance scores' });
  }
});

export default router;
