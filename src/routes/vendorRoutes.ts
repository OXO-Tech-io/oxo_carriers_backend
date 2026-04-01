import { Router } from 'express';
import * as vendorController from '../controllers/vendorController';
import { authenticate, requireHROrFinance } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', requireHROrFinance, vendorController.getAllVendors);
router.get('/:id', requireHROrFinance, vendorController.getVendorById);
router.post('/', requireHROrFinance, vendorController.createVendor);

export default router;
