-- Multi-tenant foundation for The Guilded Archive
PRAGMA foreign_keys=OFF;

CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL UNIQUE,
    "niche" TEXT NOT NULL DEFAULT 'antique-vintage-jewelry',
    "brandConfig" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Owner',
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrganizationMembership_organizationId_userId_key" UNIQUE ("organizationId", "userId"),
    CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'Other',
    "type" TEXT NOT NULL DEFAULT 'Unknown',
    "estimatedEra" TEXT,
    "brand" TEXT,
    "metalType" TEXT,
    "metalPurity" TEXT,
    "gemstoneType" TEXT,
    "gemstoneColor" TEXT,
    "ringSize" TEXT,
    "dimensions" TEXT,
    "weight" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'Good',
    "conditionNotes" TEXT,
    "restorationHistory" TEXT,
    "authenticityNotes" TEXT,
    "purchaseSource" TEXT,
    "purchaseDate" DATETIME,
    "purchaseCost" REAL,
    "restorationCost" REAL DEFAULT 0,
    "cleaningCost" REAL DEFAULT 0,
    "appraisalCost" REAL DEFAULT 0,
    "packagingCost" REAL DEFAULT 0,
    "shippingCost" REAL DEFAULT 0,
    "totalCostBasis" REAL,
    "askingPrice" REAL,
    "minAcceptablePrice" REAL,
    "currentMarketplacePrice" REAL,
    "storageLocationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "dateListed" DATETIME,
    "daysInInventory" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "InventoryItem_organizationId_sku_key" UNIQUE ("organizationId", "sku"),
    CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryItem_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "InventoryPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryPhoto_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryPhoto_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InventoryDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "documentType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryDocument_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    CONSTRAINT "Tag_organizationId_name_key" UNIQUE ("organizationId", "name"),
    CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "InventoryTag" (
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    PRIMARY KEY ("inventoryItemId", "tagId"),
    CONSTRAINT "InventoryTag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryTag_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "cabinet" TEXT,
    "shelf" TEXT,
    "drawer" TEXT,
    "tray" TEXT,
    "box" TEXT,
    "slot" TEXT,
    "qrCode" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StorageLocation_organizationId_code_key" UNIQUE ("organizationId", "code"),
    CONSTRAINT "StorageLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StorageLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorageLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "state" TEXT NOT NULL UNIQUE,
    "codeVerifier" TEXT,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "storeName" TEXT,
    "storeId" TEXT,
    "lastSyncAt" DATETIME,
    "syncStatus" TEXT NOT NULL DEFAULT 'Idle',
    "syncErrorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceAccount_organizationId_marketplace_storeId_key" UNIQUE ("organizationId", "marketplace", "storeId"),
    CONSTRAINT "MarketplaceAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "marketplaceAccountId" TEXT,
    "marketplace" TEXT NOT NULL,
    "marketplaceListingId" TEXT,
    "marketplaceListingUrl" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" REAL NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "marketplaceCategory" TEXT,
    "shippingProfile" TEXT,
    "returnPolicy" TEXT,
    "tags" TEXT,
    "photoOrder" TEXT,
    "etsySpecificFields" TEXT,
    "ebaySpecificFields" TEXT,
    "lastSyncAt" DATETIME,
    "syncStatus" TEXT NOT NULL DEFAULT 'Pending',
    "syncMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MarketplaceListing_marketplaceAccountId_marketplaceListingId_key" UNIQUE ("marketplaceAccountId", "marketplaceListingId"),
    CONSTRAINT "MarketplaceListing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MarketplaceListing_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "MarketplaceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ListingTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "titleTemplate" TEXT,
    "descriptionTemplate" TEXT,
    "tagsTemplate" TEXT,
    "shippingProfile" TEXT,
    "returnPolicy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListingTemplate_organizationId_name_key" UNIQUE ("organizationId", "name"),
    CONSTRAINT "ListingTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "marketplaceAccountId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "marketplaceOrderId" TEXT,
    "buyerName" TEXT,
    "buyerUsername" TEXT,
    "buyerEmail" TEXT,
    "saleDate" DATETIME NOT NULL,
    "paymentStatus" TEXT NOT NULL DEFAULT 'Pending',
    "fulfillmentStatus" TEXT NOT NULL DEFAULT 'AwaitingPayment',
    "shippingDeadline" DATETIME,
    "shippingCarrier" TEXT,
    "trackingNumber" TEXT,
    "shippingCost" REAL DEFAULT 0,
    "insuranceCost" REAL DEFAULT 0,
    "salesTaxCollected" REAL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_marketplaceAccountId_marketplaceOrderId_key" UNIQUE ("marketplaceAccountId", "marketplaceOrderId"),
    CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Order_marketplaceAccountId_fkey" FOREIGN KEY ("marketplaceAccountId") REFERENCES "MarketplaceAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "salePrice" REAL NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "orderId" TEXT,
    "inventoryItemId" TEXT,
    "amount" REAL NOT NULL,
    "description" TEXT,
    "transactionDate" DATETIME NOT NULL,
    "marketplace" TEXT NOT NULL DEFAULT 'Manual',
    "vendor" TEXT,
    "paymentMethod" TEXT,
    "receiptFilename" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "vendor" TEXT,
    "amount" REAL NOT NULL,
    "expenseDate" DATETIME NOT NULL,
    "paymentMethod" TEXT,
    "receiptFilename" TEXT,
    "inventoryItemId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "relatedItemId" TEXT,
    "relatedListingId" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ActionAlertState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionAlertState_organizationId_alertId_key" UNIQUE ("organizationId", "alertId"),
    CONSTRAINT "ActionAlertState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "marketplaceListingId" TEXT,
    "views" INTEGER DEFAULT 0,
    "favorites" INTEGER DEFAULT 0,
    "watchers" INTEGER DEFAULT 0,
    "clicks" INTEGER DEFAULT 0,
    "conversions" INTEGER DEFAULT 0,
    "score" REAL,
    "snapshotDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsSnapshot_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");
CREATE INDEX "InventoryItem_organizationId_status_idx" ON "InventoryItem"("organizationId", "status");
CREATE INDEX "InventoryPhoto_organizationId_inventoryItemId_idx" ON "InventoryPhoto"("organizationId", "inventoryItemId");
CREATE INDEX "InventoryDocument_organizationId_inventoryItemId_idx" ON "InventoryDocument"("organizationId", "inventoryItemId");
CREATE INDEX "InventoryTag_organizationId_idx" ON "InventoryTag"("organizationId");
CREATE INDEX "MarketplaceAuthorization_organizationId_marketplace_expiresAt_idx" ON "MarketplaceAuthorization"("organizationId", "marketplace", "expiresAt");
CREATE INDEX "MarketplaceAccount_organizationId_marketplace_isConnected_idx" ON "MarketplaceAccount"("organizationId", "marketplace", "isConnected");
CREATE INDEX "MarketplaceListing_organizationId_inventoryItemId_marketplace_status_idx" ON "MarketplaceListing"("organizationId", "inventoryItemId", "marketplace", "status");
CREATE INDEX "Order_organizationId_saleDate_idx" ON "Order"("organizationId", "saleDate");
CREATE INDEX "OrderItem_organizationId_orderId_idx" ON "OrderItem"("organizationId", "orderId");
CREATE INDEX "Transaction_organizationId_transactionDate_idx" ON "Transaction"("organizationId", "transactionDate");
CREATE INDEX "Expense_organizationId_expenseDate_idx" ON "Expense"("organizationId", "expenseDate");
CREATE INDEX "SyncEvent_organizationId_createdAt_idx" ON "SyncEvent"("organizationId", "createdAt");
CREATE INDEX "ActivityLog_organizationId_createdAt_idx" ON "ActivityLog"("organizationId", "createdAt");
CREATE INDEX "ActionAlertState_organizationId_snoozedUntil_idx" ON "ActionAlertState"("organizationId", "snoozedUntil");
CREATE INDEX "AnalyticsSnapshot_organizationId_snapshotDate_idx" ON "AnalyticsSnapshot"("organizationId", "snapshotDate");

PRAGMA foreign_keys=ON;
