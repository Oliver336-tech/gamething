import { Router } from 'express';

import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';

const router = Router();

router.use(authenticate, requireRole('admin'));

router.get('/experimental-toggles', (_req, res) => {
  return res.json({ features: ['new-matchmaking', 'enhanced-logging'] });
});

router.post('/moderation/flag', (req, res) => {
  const { reason } = req.body ?? {};
  return res.json({ status: 'received', reason: reason ?? 'unspecified' });
});

router.get('/playground-access', (_req, res) => {
  return res.json({ access: true, message: 'Admin playground unlocked' });
});

export default router;
