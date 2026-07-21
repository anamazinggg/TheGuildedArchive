export const productConfig = {
  productName: process.env.PRODUCT_NAME || 'The Guilded Archive',
  niche: process.env.PRODUCT_NICHE || 'antique-vintage-jewelry',
  categories: ['Ring', 'Necklace', 'Bracelet', 'Earrings', 'Brooch', 'Watch', 'Other'],
  marketplaces: ['Etsy', 'Ebay'],
} as const;
