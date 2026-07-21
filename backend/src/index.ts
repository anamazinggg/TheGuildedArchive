import { productConfig } from './config/product.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import inventoryRouter from './routes/inventory.js';
import tagsRouter from './routes/tags.js';
import storageRouter from './routes/storage.js';
import dashboardRouter from './routes/dashboard.js';
import ordersRouter from './routes/orders.js';
import transactionsRouter from './routes/transactions.js';
import expensesRouter from './routes/expenses.js';
import calculatorRouter from './routes/calculator.js';
import salesRouter from './routes/sales.js';
import integrationsRouter from './routes/integrations.js';
import listingsRouter from './routes/listings.js';
import templatesRouter from './routes/templates.js';
import analyticsRouter from './routes/analytics.js';
import actionsRouter from './routes/actions.js';
import reportsRouter from './routes/reports.js';
import usersRouter from './routes/users.js';
import activityRouter from './routes/activity.js';
import { errorHandler } from './middleware/error.js';
import { scheduleSync } from './services/sync-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

if (process.env.NODE_ENV === 'production') {
  const missing = ['JWT_SECRET', 'TOKEN_ENCRYPTION_KEY'].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required production secrets: ${missing.join(', ')}`);
  }
}

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', '..', 'uploads')));

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
}

// API routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/storage', storageRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/calculator', calculatorRouter);
app.use('/api/sales', salesRouter);
app.use('/api/integrations', integrationsRouter);
app.use('/api/listings/templates', templatesRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/actions', actionsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/users', usersRouter);
app.use('/api/activity', activityRouter);

// SPA fallback for production
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`${productConfig.productName} backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  if (process.env.SYNC_ENABLED !== 'false' && process.env.DISABLE_SCHEDULED_SYNC !== 'true') {
    scheduleSync(parseInt(process.env.SYNC_INTERVAL_MS || '900000', 10));
  }
});

export default app;