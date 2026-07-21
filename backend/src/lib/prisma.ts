import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { getTenantContext } from './tenant-context.js';

const tenantModels = new Set([
  'InventoryItem',
  'InventoryPhoto',
  'InventoryDocument',
  'InventoryTag',
  'Tag',
  'StorageLocation',
  'MarketplaceAuthorization',
  'MarketplaceAccount',
  'MarketplaceListing',
  'ListingTemplate',
  'Order',
  'OrderItem',
  'Transaction',
  'Expense',
  'SyncEvent',
  'ActivityLog',
  'ActionAlertState',
  'AnalyticsSnapshot',
]);

function addOrganizationWhere(args: Record<string, any>, organizationId: string) {
  return {
    ...args,
    where: {
      ...(args.where || {}),
      organizationId,
    },
  };
}

function addOrganizationData(data: any, organizationId: string) {
  if (Array.isArray(data)) {
    return data.map((entry) => ({ ...entry, organizationId }));
  }
  return { ...data, organizationId };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDatabasePath = path.resolve(__dirname, '../../prisma/dev.db');
const adapter = new PrismaLibSQL({
  url: process.env.DATABASE_URL || `file:${defaultDatabasePath}`,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});

export const systemPrisma = new PrismaClient({ adapter });
const basePrisma = systemPrisma;

const prisma = basePrisma.$extends({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !tenantModels.has(model)) {
          return query(args);
        }

        const tenant = getTenantContext();
        if (!tenant) {
          throw new Error(`Tenant context missing for ${model}.${operation}`);
        }

        let scopedArgs: Record<string, any> = { ...(args as Record<string, any>) };

        switch (operation) {
          case 'create':
            scopedArgs.data = addOrganizationData(scopedArgs.data, tenant.organizationId);
            break;
          case 'createMany':
          case 'createManyAndReturn':
            scopedArgs.data = addOrganizationData(scopedArgs.data, tenant.organizationId);
            break;
          case 'upsert':
            scopedArgs = addOrganizationWhere(scopedArgs, tenant.organizationId);
            scopedArgs.create = addOrganizationData(scopedArgs.create, tenant.organizationId);
            break;
          case 'findUnique':
          case 'findUniqueOrThrow':
          case 'findFirst':
          case 'findFirstOrThrow':
          case 'findMany':
          case 'count':
          case 'aggregate':
          case 'groupBy':
          case 'update':
          case 'updateMany':
          case 'updateManyAndReturn':
          case 'delete':
          case 'deleteMany':
            scopedArgs = addOrganizationWhere(scopedArgs, tenant.organizationId);
            break;
          default:
            break;
        }

        return query(scopedArgs as typeof args);
      },
    },
  },
});

export default prisma;
