import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { validate, voucherValidateSchema, voucherRedeemSchema } from "../middleware/validation";
import {
  validateVoucherHandler,
  redeemDurationVoucherHandler,
} from "../controllers/voucher.controller";

const router = Router();

router.use(requireAuth);

router.post("/validate", validate(voucherValidateSchema), validateVoucherHandler);
router.post("/redeem-duration", validate(voucherRedeemSchema), redeemDurationVoucherHandler);

export default router;
