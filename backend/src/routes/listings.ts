// Listing management routes — marketplace listing CRUD, publishing, and completeness
import { Router, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getMarketplaceService } from '../services/marketplace-factory.js';
import { calculateCompleteness } from '../services/listing-scorer.js';

const router = Router();
router.use(authMiddleware);

// GET /api/listings — List all marketplace listings (paginated, filterable)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const marketplace = req.query.marketplace as string;
    const status = req.query.status as string;
    const inventoryItemId = req.query.inventoryItemId as string;
    const search = req.query.search as string;

    const where: Record<string, unknown> = {};

    if (marketplace) {
      where.marketplace = marketplace;
    }

    if (status) {
      where.status = status;
    }

    if (inventoryItemId) {
      where.inventoryItemId = inventoryItemId;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { marketplaceListingId: { contains: search } },
      ];
    }

    const [listings, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        skip,
        take: limit,
        include: {
          inventoryItem: {
            select: {
              id: true,
              sku: true,
              title: true,
              status: true,
              photos: { take: 1, orderBy: { sortOrder: 'asc' } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.marketplaceListing.count({ where }),
    ]);

    res.json({
      listings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('List listings error:', error);
    res.status(500).json({ error: 'Failed to list marketplace listings' });
  }
});

// GET /api/listings/:id — Single listing detail
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: req.params.id },
      include: {
        inventoryItem: {
          include: {
            photos: { orderBy: { sortOrder: 'asc' } },
            tags: { include: { tag: true } },
            storageLocation: true,
          },
        },
      },
    });

    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    res.json({ listing });
  } catch (error) {
    console.error('Get listing error:', error);
    res.status(500).json({ error: 'Failed to get listing' });
  }
});

// POST /api/listings — Create a listing record (local, not published)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      inventoryItemId,
      marketplace,
      title,
      description,
      price,
      quantity,
      marketplaceCategory,
      shippingProfile,
      returnPolicy,
      tags,
      photoOrder,
      etsySpecificFields,
      ebaySpecificFields,
    } = req.body;

    // Validate required fields
    if (!inventoryItemId || !marketplace || !title || !price) {
      res.status(400).json({ error: 'inventoryItemId, marketplace, title, and price are required' });
      return;
    }

    if (!['Etsy', 'Ebay'].includes(marketplace)) {
      res.status(400).json({ error: 'marketplace must be "Etsy" or "Ebay"' });
      return;
    }

    // Check inventory item exists and isn't sold/reserved/archived
    const item = await prisma.inventoryItem.findUnique({
      where: { id: inventoryItemId },
    });

    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    const blockedStatuses = ['Sold', 'Shipped', 'Returned', 'Archived'];
    if (blockedStatuses.includes(item.status)) {
      res.status(400).json({
        error: `Item is "${item.status}". Cannot create listing.`,
      });
      return;
    }

    // Check for duplicate listing on same marketplace
    const existing = await prisma.marketplaceListing.findFirst({
      where: {
        inventoryItemId,
        marketplace,
        status: { not: 'Ended' },
      },
    });

    if (existing) {
      res.status(409).json({
        error: `Item already has an active listing on ${marketplace}`,
        existingListingId: existing.id,
      });
      return;
    }

    const listing = await prisma.marketplaceListing.create({
      data: {
        inventoryItemId,
        marketplace,
        marketplaceListingId: '', // Will be set on publish
        title,
        description: description || item.description || '',
        price: price || item.askingPrice || 0,
        quantity: quantity || 1,
        status: 'Draft',
        marketplaceCategory: marketplaceCategory || null,
        shippingProfile: shippingProfile || null,
        returnPolicy: returnPolicy || null,
        tags: tags || null,
        photoOrder: photoOrder ? (typeof photoOrder === 'string' ? photoOrder : JSON.stringify(photoOrder)) : null,
        etsySpecificFields: etsySpecificFields ? JSON.stringify(etsySpecificFields) : null,
        ebaySpecificFields: ebaySpecificFields ? JSON.stringify(ebaySpecificFields) : null,
        syncStatus: 'Pending',
      },
      include: {
        inventoryItem: {
          include: {
            photos: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    res.status(201).json({ listing });
  } catch (error) {
    console.error('Create listing error:', error);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

// PUT /api/listings/:id — Update listing record
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.marketplaceListing.findUnique({ where: { id } });

    if (!existing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    const {
      title, description, price, quantity, status,
      marketplaceCategory, shippingProfile, returnPolicy,
      tags, photoOrder, etsySpecificFields, ebaySpecificFields,
    } = req.body;

    const listing = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price }),
        ...(quantity !== undefined && { quantity }),
        ...(status !== undefined && { status }),
        ...(marketplaceCategory !== undefined && { marketplaceCategory }),
        ...(shippingProfile !== undefined && { shippingProfile }),
        ...(returnPolicy !== undefined && { returnPolicy }),
        ...(tags !== undefined && { tags }),
        ...(photoOrder !== undefined && {
          photoOrder: typeof photoOrder === 'string' ? photoOrder : JSON.stringify(photoOrder),
        }),
        ...(etsySpecificFields !== undefined && {
          etsySpecificFields: JSON.stringify(etsySpecificFields),
        }),
        ...(ebaySpecificFields !== undefined && {
          ebaySpecificFields: JSON.stringify(ebaySpecificFields),
        }),
      },
      include: {
        inventoryItem: {
          include: {
            photos: { orderBy: { sortOrder: 'asc' } },
            tags: { include: { tag: true } },
            storageLocation: true,
          },
        },
      },
    });

    res.json({ listing });
  } catch (error) {
    console.error('Update listing error:', error);
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// POST /api/listings/:id/publish — Publish to marketplace
router.post('/:id/publish', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });

    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    // Validate item status
    const blockedStatuses = ['Sold', 'Shipped', 'Returned', 'Reserved', 'Archived'];
    if (blockedStatuses.includes(listing.inventoryItem.status)) {
      res.status(400).json({
        error: `Item is "${listing.inventoryItem.status}". Cannot publish.`,
      });
      return;
    }

    // Check completeness
    const completeness = calculateCompleteness(
      {
        title: listing.title,
        description: listing.description,
        price: listing.price,
        marketplace: listing.marketplace,
        marketplaceCategory: listing.marketplaceCategory,
        shippingProfile: listing.shippingProfile,
        returnPolicy: listing.returnPolicy,
        tags: listing.tags,
        photoOrder: listing.photoOrder,
      },
      listing.inventoryItem
    );

    if (completeness.score < 60) {
      res.status(400).json({
        error: 'Listing completeness is too low to publish',
        completeness,
      });
      return;
    }

    // Publish via marketplace service
    const service = getMarketplaceService(listing.marketplace.toLowerCase() as 'etsy' | 'ebay');

    // Find the connected account
    const account = await prisma.marketplaceAccount.findFirst({
      where: {
        marketplace: listing.marketplace,
        isConnected: true,
      },
    });

    if (!account) {
      res.status(400).json({ error: `No connected ${listing.marketplace} account` });
      return;
    }

    const result = await service.createListing(account.id, {
      title: listing.title,
      description: listing.description || '',
      price: listing.price,
      quantity: listing.quantity,
      category: listing.marketplaceCategory || undefined,
      tags: listing.tags ? listing.tags.split(',').map((t: string) => t.trim()) : undefined,
      shippingProfile: listing.shippingProfile || undefined,
      returnPolicy: listing.returnPolicy || undefined,
      etsySpecificFields: listing.etsySpecificFields ? JSON.parse(listing.etsySpecificFields) : undefined,
      ebaySpecificFields: listing.ebaySpecificFields ? JSON.parse(listing.ebaySpecificFields) : undefined,
    });

    // Update the listing record with marketplace data
    const updatedListing = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        marketplaceListingId: result.listingId,
        marketplaceListingUrl: result.url,
        status: 'Active',
        syncStatus: 'Synced',
        lastSyncAt: new Date(),
        syncMessage: null,
      },
    });

    // Update inventory status
    await prisma.inventoryItem.update({
      where: { id: listing.inventoryItemId },
      data: {
        status: listing.marketplace === 'Etsy' ? 'ListedOnEtsy' : 'ListedOnEbay',
        dateListed: new Date(),
        currentMarketplacePrice: listing.price,
      },
    });

    // Create sync event
    await prisma.syncEvent.create({
      data: {
        marketplace: listing.marketplace,
        eventType: 'Export',
        status: 'Success',
        message: `Published listing "${listing.title}" to ${listing.marketplace}`,
        relatedItemId: listing.inventoryItemId,
        relatedListingId: listing.marketplaceListingId || result.listingId,
        lastAttemptAt: new Date(),
      },
    });

    res.json({
      listing: updatedListing,
      completeness,
      published: true,
    });
  } catch (error) {
    console.error('Publish listing error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: `Failed to publish listing: ${msg}` });
  }
});

// POST /api/listings/:id/end — End listing on marketplace
router.post('/:id/end', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });

    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    if (listing.status === 'Ended' || listing.status === 'Sold') {
      res.status(400).json({ error: `Listing is already ${listing.status}` });
      return;
    }

    // End on marketplace
    if (listing.marketplaceListingId) {
      const service = getMarketplaceService(listing.marketplace.toLowerCase() as 'etsy' | 'ebay');
      const account = await prisma.marketplaceAccount.findFirst({
        where: { marketplace: listing.marketplace, isConnected: true },
      });
      if (account) {
        await service.endListing(account.id, listing.marketplaceListingId);
      }
    }

    // Update local record
    const updatedListing = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        status: 'Ended',
        syncStatus: 'Synced',
        syncMessage: 'Manually ended',
        lastSyncAt: new Date(),
      },
    });

    // If item was only listed here, update inventory status
    if (listing.inventoryItem) {
      const validStatuses = ['ListedOnEtsy', 'ListedOnEbay', 'ListedOnBoth'];
      if (validStatuses.includes(listing.inventoryItem.status)) {
        await prisma.inventoryItem.update({
          where: { id: listing.inventoryItemId },
          data: { status: 'ReadyToList' },
        });
      }
    }

    await prisma.syncEvent.create({
      data: {
        marketplace: listing.marketplace,
        eventType: 'Delete',
        status: 'Success',
        message: `Ended listing "${listing.title}" on ${listing.marketplace}`,
        relatedItemId: listing.inventoryItemId,
        relatedListingId: listing.marketplaceListingId,
        lastAttemptAt: new Date(),
      },
    });

    res.json({ listing: updatedListing });
  } catch (error) {
    console.error('End listing error:', error);
    res.status(500).json({ error: 'Failed to end listing' });
  }
});

// POST /api/listings/bulk-publish — Publish multiple listings
router.post('/bulk-publish', async (req: AuthRequest, res: Response) => {
  try {
    const { listingIds } = req.body as { listingIds: string[] };

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      res.status(400).json({ error: 'listingIds array is required' });
      return;
    }

    const results: { id: string; status: string; error?: string }[] = [];

    for (const id of listingIds) {
      try {
        const listing = await prisma.marketplaceListing.findUnique({
          where: { id },
          include: { inventoryItem: true },
        });

        if (!listing) {
          results.push({ id, status: 'error', error: 'Not found' });
          continue;
        }

        const blockedStatuses = ['Sold', 'Shipped', 'Returned', 'Reserved', 'Archived'];
        if (blockedStatuses.includes(listing.inventoryItem.status)) {
          results.push({ id, status: 'error', error: `Item is ${listing.inventoryItem.status}` });
          continue;
        }

        const completeness = calculateCompleteness(
          {
            title: listing.title,
            description: listing.description,
            price: listing.price,
            marketplace: listing.marketplace,
            marketplaceCategory: listing.marketplaceCategory,
            shippingProfile: listing.shippingProfile,
            returnPolicy: listing.returnPolicy,
            tags: listing.tags,
            photoOrder: listing.photoOrder,
          },
          listing.inventoryItem
        );

        if (completeness.score < 60) {
          results.push({ id, status: 'error', error: `Completeness too low (${completeness.score}%)` });
          continue;
        }

        const service = getMarketplaceService(listing.marketplace.toLowerCase() as 'etsy' | 'ebay');
        const account = await prisma.marketplaceAccount.findFirst({
          where: { marketplace: listing.marketplace, isConnected: true },
        });

        if (!account) {
          results.push({ id, status: 'error', error: 'No connected account' });
          continue;
        }

        const result = await service.createListing(account.id, {
          title: listing.title,
          description: listing.description || '',
          price: listing.price,
          quantity: listing.quantity,
          category: listing.marketplaceCategory || undefined,
          tags: listing.tags ? listing.tags.split(',').map((t: string) => t.trim()) : undefined,
        });

        await prisma.marketplaceListing.update({
          where: { id },
          data: {
            marketplaceListingId: result.listingId,
            marketplaceListingUrl: result.url,
            status: 'Active',
            syncStatus: 'Synced',
            lastSyncAt: new Date(),
          },
        });

        await prisma.inventoryItem.update({
          where: { id: listing.inventoryItemId },
          data: { status: listing.marketplace === 'Etsy' ? 'ListedOnEtsy' : 'ListedOnEbay', dateListed: new Date() },
        });

        results.push({ id, status: 'published' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ id, status: 'error', error: msg });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Bulk publish error:', error);
    res.status(500).json({ error: 'Failed to bulk publish' });
  }
});

// POST /api/listings/bulk-end — End multiple listings
router.post('/bulk-end', async (req: AuthRequest, res: Response) => {
  try {
    const { listingIds } = req.body as { listingIds: string[] };

    if (!listingIds || !Array.isArray(listingIds) || listingIds.length === 0) {
      res.status(400).json({ error: 'listingIds array is required' });
      return;
    }

    const results: { id: string; status: string; error?: string }[] = [];

    for (const id of listingIds) {
      try {
        const listing = await prisma.marketplaceListing.findUnique({
          where: { id },
          include: { inventoryItem: true },
        });

        if (!listing) {
          results.push({ id, status: 'error', error: 'Not found' });
          continue;
        }

        if (listing.status === 'Ended' || listing.status === 'Sold') {
          results.push({ id, status: 'skipped', error: `Already ${listing.status}` });
          continue;
        }

        if (listing.marketplaceListingId) {
          const service = getMarketplaceService(listing.marketplace.toLowerCase() as 'etsy' | 'ebay');
          const account = await prisma.marketplaceAccount.findFirst({
            where: { marketplace: listing.marketplace, isConnected: true },
          });
          if (account) {
            await service.endListing(account.id, listing.marketplaceListingId);
          }
        }

        await prisma.marketplaceListing.update({
          where: { id },
          data: { status: 'Ended', syncMessage: 'Bulk ended' },
        });

        results.push({ id, status: 'ended' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ id, status: 'error', error: msg });
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Bulk end error:', error);
    res.status(500).json({ error: 'Failed to bulk end listings' });
  }
});

// GET /api/listings/completeness/:id — Get completeness score
router.get('/completeness/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // This endpoint works with either a listing ID or inventory item ID
    // Try listing first
    let listing = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: { inventoryItem: { include: { photos: true } } },
    });

    // If not found as listing, try as inventory item
    if (!listing) {
      const item = await prisma.inventoryItem.findUnique({
        where: { id },
        include: { photos: true },
      });

      if (!item) {
        res.status(404).json({ error: 'Listing or inventory item not found' });
        return;
      }

      // Return completeness for a hypothetical listing
      const score = calculateCompleteness(
        {
          title: item.title,
          description: item.description,
          price: item.askingPrice || 0,
          marketplace: 'Etsy',
          marketplaceCategory: null,
          shippingProfile: null,
          returnPolicy: null,
          tags: null,
          photoOrder: null,
        },
        item
      );

      res.json({ id, completeness: score });
      return;
    }

    const score = calculateCompleteness(
      {
        title: listing.title,
        description: listing.description,
        price: listing.price,
        marketplace: listing.marketplace,
        marketplaceCategory: listing.marketplaceCategory,
        shippingProfile: listing.shippingProfile,
        returnPolicy: listing.returnPolicy,
        tags: listing.tags,
        photoOrder: listing.photoOrder,
      },
      listing.inventoryItem
    );

    res.json({ id, listingId: listing.id, completeness: score });
  } catch (error) {
    console.error('Completeness error:', error);
    res.status(500).json({ error: 'Failed to calculate completeness' });
  }
});

// POST /api/listings/:id/duplicate — Duplicate listing to other marketplace
router.post('/:id/duplicate', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const source = await prisma.marketplaceListing.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });

    if (!source) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }

    const targetMarketplace = source.marketplace === 'Etsy' ? 'Ebay' : 'Etsy';

    // Check for duplicate
    const existingTarget = await prisma.marketplaceListing.findFirst({
      where: {
        inventoryItemId: source.inventoryItemId,
        marketplace: targetMarketplace,
        status: { not: 'Ended' },
      },
    });

    if (existingTarget) {
      res.status(409).json({
        error: `Item already has an active listing on ${targetMarketplace}`,
        existingListingId: existingTarget.id,
      });
      return;
    }

    // Check inventory status
    const blockedStatuses = ['Sold', 'Shipped', 'Returned', 'Archived'];
    if (blockedStatuses.includes(source.inventoryItem.status)) {
      res.status(400).json({ error: `Item is "${source.inventoryItem.status}". Cannot duplicate listing.` });
      return;
    }

    const newListing = await prisma.marketplaceListing.create({
      data: {
        inventoryItemId: source.inventoryItemId,
        marketplace: targetMarketplace,
        marketplaceListingId: '',
        title: source.title,
        description: source.description,
        price: source.price,
        quantity: source.quantity,
        status: 'Draft',
        marketplaceCategory: source.marketplaceCategory,
        shippingProfile: source.shippingProfile,
        returnPolicy: source.returnPolicy,
        tags: source.tags,
        photoOrder: source.photoOrder,
        etsySpecificFields: targetMarketplace === 'Etsy' ? source.etsySpecificFields : null,
        ebaySpecificFields: targetMarketplace === 'Ebay' ? source.ebaySpecificFields : null,
        syncStatus: 'Pending',
        syncMessage: `Duplicated from ${source.marketplace} listing`,
      },
      include: {
        inventoryItem: {
          include: { photos: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    // Update inventory status to ListedOnBoth if source is active
    if (source.status === 'Active') {
      const itemStatus = source.inventoryItem.status;
      const validStatuses = ['ListedOnEtsy', 'ListedOnEbay'];
      if (validStatuses.includes(itemStatus)) {
        await prisma.inventoryItem.update({
          where: { id: source.inventoryItemId },
          data: { status: 'ListedOnBoth' },
        });
      }
    }

    res.status(201).json({ listing: newListing });
  } catch (error) {
    console.error('Duplicate listing error:', error);
    res.status(500).json({ error: 'Failed to duplicate listing' });
  }
});

export default router;
