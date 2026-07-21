# Tenancy, marketplace safety, and template architecture

## Tenant boundary

An `Organization` represents one storefront business. A `User` may belong to multiple organizations through `OrganizationMembership`, and the role belongs to the membership rather than the person globally.

Authenticated tokens identify the active organization and membership. The server validates that membership on every protected request. A request-scoped tenant context automatically adds `organizationId` to tenant-owned Prisma reads and writes.

Tenant-owned roots include inventory, tags, storage, marketplace accounts, listings, orders, financial records, sync events, analytics snapshots, alerts, and activity logs. Compound database constraints allow separate organizations to use the same SKU, tag, storage code, or external order number without collisions.

## Marketplace lifecycle

An inventory item is the source of truth. It may have zero, one, or several marketplace listings.

When an item is created, `listingTargets` may contain `Etsy`, `Ebay`, or both. The server creates linked listing drafts in the same database transaction. Drafts can exist before a marketplace account is connected; they are marked `NeedsConnection` until an account becomes available.

When a listing is published, it is attached to a specific `MarketplaceAccount`. Marketplace listing and order identifiers are unique per connected account rather than globally.

When a sale is imported or manually recorded:

1. The inventory item is marked sold.
2. Every other active or draft listing for that item is located.
3. Active listings are ended through their attached marketplace account.
4. Drafts are closed locally.
5. Failures remain visible with an urgent sync error rather than being silently treated as successful.

Reconciliation jobs run for each organization inside an explicit system tenant context. The prototype marketplace stores are also isolated by marketplace-account ID, so development data cannot bleed between storefronts.

## Portable database

The checked-in Prisma migration creates the complete multi-tenant SQLite schema. `npm run db:init` applies it without requiring a native Prisma schema-engine binary, which keeps the prototype easy to run in restricted development environments. The application uses Prisma's JavaScript engine with the libSQL adapter.

Managed PostgreSQL remains the intended paid-production database. The organization model and tenant query layer are database-neutral.

## White-label preparation

This repo remains The Guilded Archive while it is being polished. The reusable seams are centralized so the finished code can later be copied into a separate template repo without carrying product-specific database logic into the core.

Primary configuration files:

- `frontend/src/config/product.ts`
- `backend/src/config/product.ts`
- `frontend/tailwind.config.js`
- Brand assets under `frontend/public/`

The frontend configuration controls product name, niche language, item terminology, categories, conditions, and enabled marketplaces. The tenant, authorization, inventory, listing, order, and sync layers remain niche-neutral.

## Before a paid launch

- Complete the live Etsy and eBay provider adapters and production approval processes.
- Migrate SQLite to managed PostgreSQL.
- Move uploads to S3-compatible object storage.
- Replace interval reconciliation with a durable queue and verified webhook workers.
- Add Stripe plans and organization entitlements.
- Add automated integration coverage for tenant isolation, OAuth state, sync idempotency, and cross-marketplace sale races.
