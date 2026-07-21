import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.use(authMiddleware);

// Default fee settings
interface FeeSettings {
  etsyTransactionFeePercent: number;
  etsyPaymentFeePercent: number;
  ebayFinalValueFeePercent: number;
  ebayPaymentFeePercent: number;
  shippingCostDefault: number;
  packagingCostDefault: number;
}

const defaultSettings: FeeSettings = {
  etsyTransactionFeePercent: 6.5,
  etsyPaymentFeePercent: 3.0,
  ebayFinalValueFeePercent: 13.25,
  ebayPaymentFeePercent: 0,
  shippingCostDefault: 5.0,
  packagingCostDefault: 2.0,
};

const settingsFilePath = path.join(__dirname, '..', '..', '..', 'data', 'fee-settings.json');

function loadSettings(): FeeSettings {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch {
    // fall through to defaults
  }
  return { ...defaultSettings };
}

function saveSettings(settings: FeeSettings): void {
  const dir = path.dirname(settingsFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsFilePath, JSON.stringify(settings, null, 2));
}

// GET /api/calculator/fees — Return current fee settings
router.get('/fees', (_req: AuthRequest, res: Response) => {
  try {
    const settings = loadSettings();
    res.json(settings);
  } catch (error) {
    console.error('Get fee settings error:', error);
    res.status(500).json({ error: 'Failed to get fee settings' });
  }
});

// PUT /api/calculator/fees — Update fee settings
router.put('/fees', (req: AuthRequest, res: Response) => {
  try {
    const current = loadSettings();
    const updates = req.body;

    const updated: FeeSettings = {
      etsyTransactionFeePercent: updates.etsyTransactionFeePercent ?? current.etsyTransactionFeePercent,
      etsyPaymentFeePercent: updates.etsyPaymentFeePercent ?? current.etsyPaymentFeePercent,
      ebayFinalValueFeePercent: updates.ebayFinalValueFeePercent ?? current.ebayFinalValueFeePercent,
      ebayPaymentFeePercent: updates.ebayPaymentFeePercent ?? current.ebayPaymentFeePercent,
      shippingCostDefault: updates.shippingCostDefault ?? current.shippingCostDefault,
      packagingCostDefault: updates.packagingCostDefault ?? current.packagingCostDefault,
    };

    saveSettings(updated);
    res.json(updated);
  } catch (error) {
    console.error('Update fee settings error:', error);
    res.status(500).json({ error: 'Failed to update fee settings' });
  }
});

// POST /api/calculator/estimate — Calculate profit estimate
router.post('/estimate', (req: AuthRequest, res: Response) => {
  try {
    const {
      salePrice,
      purchaseCost,
      marketplace,
      shippingCost,
      packagingCost,
      advertisingCost,
      additionalCosts,
    } = req.body;

    if (salePrice === undefined) {
      res.status(400).json({ error: 'salePrice is required' });
      return;
    }

    const settings = loadSettings();
    const mp = (marketplace as string)?.toLowerCase() || 'other';
    const sp = parseFloat(salePrice);
    const pc = parseFloat(purchaseCost) || 0;
    const sc = parseFloat(shippingCost) || settings.shippingCostDefault;
    const pkg = parseFloat(packagingCost) || settings.packagingCostDefault;
    const adv = parseFloat(advertisingCost) || 0;
    const addl = parseFloat(additionalCosts) || 0;

    let estimatedFees = 0;
    const totalCosts = pc + sc + pkg + adv + addl;

    if (mp === 'etsy') {
      const txFee = sp * (settings.etsyTransactionFeePercent / 100);
      const payFee = sp * (settings.etsyPaymentFeePercent / 100) + 0.25;
      estimatedFees = txFee + payFee;
    } else if (mp === 'ebay') {
      const fvf = sp * (settings.ebayFinalValueFeePercent / 100);
      const payFee = sp * (settings.ebayPaymentFeePercent / 100);
      estimatedFees = fvf + payFee;
    } else {
      // "other" — estimate 0 fees (manual sale)
      estimatedFees = 0;
    }

    const estimatedNetProceeds = sp - estimatedFees;
    const estimatedProfit = estimatedNetProceeds - totalCosts;
    const estimatedProfitMargin = sp > 0 ? (estimatedProfit / sp) * 100 : 0;

    // suggestedMinimumPrice = totalCosts / (1 - totalFeeRate - desiredMarginRate)
    const desiredMarginRate = 0.2; // 20% desired margin
    const totalFeeRate = sp > 0 ? estimatedFees / sp : 0;
    const divisor = 1 - totalFeeRate - desiredMarginRate;
    const suggestedMinimumPrice = divisor > 0 ? totalCosts / divisor : totalCosts * 1.5;

    res.json({
      estimatedFees: Math.round(estimatedFees * 100) / 100,
      estimatedNetProceeds: Math.round(estimatedNetProceeds * 100) / 100,
      estimatedProfit: Math.round(estimatedProfit * 100) / 100,
      estimatedProfitMargin: Math.round(estimatedProfitMargin * 100) / 100,
      suggestedMinimumPrice: Math.round(suggestedMinimumPrice * 100) / 100,
    });
  } catch (error) {
    console.error('Calculate estimate error:', error);
    res.status(500).json({ error: 'Failed to calculate estimate' });
  }
});

export default router;
