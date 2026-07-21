// Listing completeness scorer
// Evaluates how ready a listing is for publication to marketplaces

interface InventoryItemForScore {
  title: string;
  description: string;
  category: string;
  condition: string;
  conditionNotes?: string | null;
  dimensions?: string | null;
  weight?: string | null;
  metalType?: string | null;
  metalPurity?: string | null;
  gemstoneType?: string | null;
  gemstoneColor?: string | null;
  brand?: string | null;
  estimatedEra?: string | null;
  ringSize?: string | null;
  askingPrice?: number | null;
  purchaseCost?: number | null;
  totalCostBasis?: number | null;
  storageLocationId?: string | null;
  photos?: { length: number } | null;
}

interface MarketplaceListingForScore {
  title: string;
  description?: string | null;
  price: number;
  marketplace: string;
  marketplaceCategory?: string | null;
  shippingProfile?: string | null;
  returnPolicy?: string | null;
  tags?: string | null;
  photoOrder?: string | null;
}

export interface CompletenessResult {
  score: number;
  missing: string[];
  warnings: string[];
}

export function calculateCompleteness(
  listing: MarketplaceListingForScore,
  item?: InventoryItemForScore | null
): CompletenessResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  let maxScore = 100;
  let deductions = 0;
  const pointsPerCheck = 5;

  // ---- Required fields for ALL marketplaces ----

  // Title
  if (!listing.title || listing.title.trim().length < 10) {
    missing.push('Title is too short (minimum 10 characters)');
    deductions += pointsPerCheck * 2;
  } else if (listing.title.length > 140) {
    warnings.push('Title exceeds 140 characters (may be truncated on some marketplaces)');
    deductions += pointsPerCheck;
  }

  // Description
  if (!listing.description || listing.description.trim().length < 50) {
    missing.push('Description is too short (minimum 50 characters recommended)');
    deductions += pointsPerCheck * 2;
  }

  // Price
  if (!listing.price || listing.price <= 0) {
    missing.push('Price is not set');
    deductions += pointsPerCheck * 2;
  } else if (listing.price < 5) {
    warnings.push('Price is very low (below $5)');
    deductions += pointsPerCheck;
  }

  // Category
  if (!listing.marketplaceCategory) {
    missing.push('Marketplace category is not set');
    deductions += pointsPerCheck;
  }

  // Tags
  if (!listing.tags || listing.tags.trim().length === 0) {
    missing.push('No tags/keywords set');
    deductions += pointsPerCheck;
  }

  // Shipping profile
  if (!listing.shippingProfile) {
    warnings.push('No shipping profile set');
    deductions += pointsPerCheck;
  }

  // Return policy
  if (!listing.returnPolicy) {
    warnings.push('No return policy set');
    deductions += pointsPerCheck;
  }

  // ---- Inventory item checks ----
  if (item) {
    // Photos
    if (!item.photos || item.photos.length === 0) {
      missing.push('No photos attached to inventory item');
      deductions += pointsPerCheck * 3;
    } else if (item.photos.length < 3) {
      warnings.push('Less than 3 photos (more photos improve listing quality)');
      deductions += pointsPerCheck;
    }

    // Condition
    if (!item.condition) {
      missing.push('Condition not specified');
      deductions += pointsPerCheck;
    }
    if (!item.conditionNotes) {
      warnings.push('No condition notes — buyers expect detailed condition information');
      deductions += pointsPerCheck;
    }

    // Measurements/Dimensions
    if (!item.dimensions && !item.ringSize) {
      warnings.push('No dimensions or ring size specified');
      deductions += pointsPerCheck;
    }

    // Materials
    if (!item.metalType) {
      warnings.push('Metal type not specified');
      deductions += pointsPerCheck;
    }
    if (!item.metalPurity) {
      warnings.push('Metal purity not specified');
      deductions += pointsPerCheck;
    }

    // Gemstone info (warning only — not all items have gemstones)
    if (item.gemstoneType && !item.gemstoneColor) {
      warnings.push('Gemstone type set but no gemstone color');
      deductions += Math.floor(pointsPerCheck / 2);
    }

    // Cost info
    if (!item.purchaseCost && !item.totalCostBasis) {
      warnings.push('No cost information (helpful for profit tracking)');
      deductions += Math.floor(pointsPerCheck / 2);
    }

    // Storage location
    if (!item.storageLocationId) {
      warnings.push('No storage location assigned (makes physical retrieval harder)');
      deductions += Math.floor(pointsPerCheck / 2);
    }

    // Brand/Era
    if (!item.brand && !item.estimatedEra) {
      warnings.push('No brand or era information (buyers value this context)');
      deductions += pointsPerCheck;
    }
  }

  // ---- Marketplace-specific checks ----
  if (listing.marketplace === 'etsy') {
    // Etsy requires specific fields
    if (!listing.shippingProfile) {
      missing.push('Etsy: Shipping profile is required');
      deductions += pointsPerCheck;
    }

    // Etsy tags are comma-separated, max 13
    if (listing.tags) {
      const tagCount = listing.tags.split(',').length;
      if (tagCount < 3) {
        warnings.push(`Etsy: Only ${tagCount} tags (use more for better visibility)`);
        deductions += Math.floor(pointsPerCheck / 2);
      }
    }
  }

  if (listing.marketplace === 'ebay') {
    // eBay requires item specifics
    if (!item?.metalType) {
      missing.push('eBay: Metal type is required for item specifics');
      deductions += pointsPerCheck;
    }
    if (!item?.conditionNotes) {
      missing.push('eBay: Condition details are required');
      deductions += pointsPerCheck;
    }
    if (!item?.brand) {
      warnings.push('eBay: Brand/manufacturer improves listing quality score');
      deductions += pointsPerCheck;
    }

    // eBay title max 80 chars
    if (listing.title.length > 80) {
      warnings.push('eBay: Title exceeds 80 character limit');
      deductions += pointsPerCheck;
    }
  }

  const score = Math.max(0, Math.min(100, maxScore - deductions));
  return { score, missing, warnings };
}
