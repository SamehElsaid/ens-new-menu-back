import { Router } from "express";
import { body, param } from "express-validator";
import * as tablesController from "../controllers/menuTables.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router({ mergeParams: true });

router.use(requireAuth);

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
    body("tableNumber").notEmpty().trim().isLength({ max: 50 }),
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
    body("tableNumber").optional().notEmpty().trim().isLength({ max: 50 }),
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
