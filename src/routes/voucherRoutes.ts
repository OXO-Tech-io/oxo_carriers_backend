import { Router } from 'express';
import { VoucherController } from '../controllers/voucherController';
import { authenticate } from '../middleware/auth';
import { uploadVoucherInvoice } from '../middleware/upload';

const router = Router();
router.use(authenticate);

router.get('/service-providers', VoucherController.getServiceProviders);
router.post('/', uploadVoucherInvoice, VoucherController.create);
router.get('/', VoucherController.getAll);
router.get('/:id', VoucherController.getById);
router.put('/:id/review', VoucherController.review);
router.put('/:id/resubmit', VoucherController.resubmit);
router.put('/:id/bank-upload', VoucherController.bankUpload);
router.put('/:id/paid', VoucherController.markPaid);

export default router;
