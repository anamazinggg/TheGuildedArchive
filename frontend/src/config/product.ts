export const productConfig = {
  productName: 'The Guilded Archive',
  productShortName: 'Guilded Archive',
  productDescription: 'Multi-store inventory and sales control for one-of-a-kind merchandise.',
  niche: 'Antique and vintage jewelry',
  itemSingular: 'piece',
  itemPlural: 'pieces',
  inventoryLabel: 'Inventory',
  categoryLabel: 'Jewelry Type',
  categories: ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Brooch', 'Watch', 'Other'],
  types: ['Antique', 'Vintage', 'Estate', 'Reproduction', 'Unknown'],
  conditions: ['Mint', 'Excellent', 'VeryGood', 'Good', 'Fair', 'Poor', 'AsIs'],
  marketplaces: [
    { id: 'Etsy', label: 'Etsy' },
    { id: 'Ebay', label: 'eBay' },
  ],
  storageEnabled: true,
  provenanceEnabled: true,
} as const;

export type MarketplaceId = (typeof productConfig.marketplaces)[number]['id'];
