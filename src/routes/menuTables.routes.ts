import { Router } from "express";
import { body, param } from "express-validator";
import * as tablesController from "../controllers/menuTables.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePlanCapability } from "../middleware/planLimits";

const router = Router({ mergeParams: true });

const tableNumberBodyRule = body("tableNumber")
  .notEmpty()
  .trim()
  .isLength({ min: 1, max: 50 })
  .matches(/^[a-zA-Z0-9\u0600-\u06FF][a-zA-Z0-9\u0600-\u06FF\s\-_]*$/)
  .withMessage(
    "tableNumber must contain letters and/or numbers (max 50 characters)",
  );

const tableNumberBodyOptionalRule = body("tableNumber")
  .optional()
  .notEmpty()
  .trim()
  .isLength({ min: 1, max: 50 })
  .matches(/^[a-zA-Z0-9\u0600-\u06FF][a-zA-Z0-9\u0600-\u06FF\s\-_]*$/)
  .withMessage(
    "tableNumber must contain letters and/or numbers (max 50 characters)",
  );

router.use(requireAuth);
router.use(requirePlanCapability("staffAndTables"));

// GET /api/menus/:menuId/tables
router.get("/", [param("menuId").isInt()], tablesController.getTables);

// GET /api/menus/:menuId/tables/:tableId
router.get(
  "/:tableId",
  [param("menuId").isInt(), param("tableId").isInt()],
  tablesController.getTableById
);

// POST /api/menus/:menuId/tables
router.post(
  "/",
  validate([
    param("menuId").isInt(),
    tableNumberBodyRule,
    body("seats").optional().isInt({ min: 1 }),
    body("isActive").optional().isBoolean(),
  ]),
  tablesController.createTable
);

// PUT /api/menus/:menuId/tables/:tableId
router.put(
  "/:tableId",
  validate([
    param("menuId").isInt(),
    param("tableId").isInt(),
    tableNumberBodyOptionalRule,
    body("seats").optional().isInt({ min: 1 }),
    body("isActive").optional().isBoolean(),
  ]),
  tablesController.updateTable
);

// DELETE /api/menus/:menuId/tables/:tableId
router.delete(
  "/:tableId",
  [param("menuId").isInt(), param("tableId").isInt()],
  tablesController.deleteTable
);

export default router;
