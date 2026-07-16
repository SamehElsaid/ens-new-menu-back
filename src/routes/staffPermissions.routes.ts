import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { getStaffPermissionsCatalog } from "../controllers/staffPermissions.controller";

const router = Router();

// GET /api/staff-permissions/catalog — static permission metadata (owner + staff)
router.get("/catalog", requireAuth, getStaffPermissionsCatalog);

export default router;
