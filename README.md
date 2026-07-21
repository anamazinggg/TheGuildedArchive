# The Guilded Archive

A multi-tenant inventory, marketplace listing, sales, storage, and analytics system for antique and vintage jewelry sellers using Etsy and eBay.

## What this prototype supports

- Separate storefront organizations with isolated data
- Organization-level staff memberships and roles
- Inventory creation with an option to prepare an Etsy draft, an eBay draft, or both
- One inventory record linked to every marketplace listing for that item
- Automatic cross-marketplace delisting after a sale is detected or manually recorded
- A complete Etsy/eBay prototype mode that can publish listings, import a simulated sale, and prove the counterpart listing is closed
- Encrypted marketplace tokens using AES-256-GCM
- Tenant-bound OAuth authorization state stored in the database
- Central product configuration for future niche-specific versions

## Local setup

Requirements: Node.js 20+ and npm.

```bash
cp backend/.env.example backend/.env
npm run setup
npm run dev
```

Frontend: `http://localhost:5173`  
Backend API: `http://localhost:3001/api/health`

`npm run db:init` creates the portable SQLite prototype database from the checked-in migration. If an old single-store `dev.db` exists, back it up and remove it before initialization.

When marketplace credentials are absent, the Integrations screen uses isolated prototype Etsy and eBay accounts so the complete listing workflow can be tested without affecting real stores.

## Prototype workflow

1. Register a storefront workspace.
2. Connect the prototype Etsy and eBay accounts.
3. Add an inventory item.
4. Select Etsy, eBay, or both under Marketplace destinations.
5. Complete each prepared listing draft.
6. Publish the Etsy and/or eBay listing.
7. Use **Simulate Sale** on either active prototype listing.
8. Confirm the inventory is sold, the order is recorded once, and the counterpart listing is ended.

## Railway prototype deployment

This repository is configured to deploy as one Railway service. Express serves the built frontend and the API from the same domain.

1. Create a Railway project from this GitHub repository and select the `main` branch.
2. Attach a volume mounted at `/app/uploads`.
3. Add these service variables:
   - `NODE_ENV=production`
   - `DATABASE_URL=file:/app/uploads/dev.db`
   - `JWT_SECRET=<long random secret>`
   - `TOKEN_ENCRYPTION_KEY=<different long random secret>`
4. Generate a public Railway domain and deploy.
5. Verify `/api/health`, register two test organizations, and run the prototype Etsy/eBay sale workflow.

The checked-in `railway.json` builds both workspaces, initializes the database on the mounted volume at runtime, starts the production server, and verifies the health endpoint. Etsy and eBay credentials remain optional while using prototype mode.

## Production boundary

The prototype marketplace adapter is fully runnable. The live Etsy and eBay adapters still need their provider-specific listing, order, webhook, and approval work completed before real customer stores are connected.

SQLite and local uploads are retained for portability. Before accepting paying customers, move the Prisma datasource to managed PostgreSQL, move uploads to managed object storage, and replace interval reconciliation with durable queues and webhook workers. The application-level tenant boundary is already in place, so those infrastructure changes do not require rebuilding the product model.

See [`docs/TENANCY_AND_TEMPLATE.md`](docs/TENANCY_AND_TEMPLATE.md) for the architecture and future template process.
