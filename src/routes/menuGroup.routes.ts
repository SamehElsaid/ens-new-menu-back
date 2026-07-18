import { Router } from "express";
import { body, param } from "express-validator";
import * as menuGroupController from "../controllers/menuGroup.controller";
import { validate } from "../middleware/validation";
import { requireAuth } from "../middleware/auth.middleware";
import { requireProPlan } from "../middleware/planLimits";

const router = Router();

router.use(requireAuth);
router.use(requireProPlan);

router.get("/", menuGroupController.getMenuGroups);

router.post(
  "/",
  validate([
    body("name").notEmpty().trim().isLength({ max: 255 }),
    body("menuIds").isArray({ min: 2 }),
    body("menuIds.*").isInt({ min: 1 }),
  ]),
  menuGroupController.postMenuGroup,
);

router.put(
  "/:groupId",
  validate([
    param("groupId").isInt({ min: 1 }),
    body("name").optional().trim().isLength({ max: 255 }),
    body("menuIds").optional().isArray({ min: 2 }),
    body("menuIds.*").optional().isInt({ min: 1 }),
  ]),
  menuGroupController.putMenuGroup,
);

router.post(
  "/:groupId/menus",
  validate([
    param("groupId").isInt({ min: 1 }),
    body("menuId").isInt({ min: 1 }),
  ]),
  menuGroupController.postMenuToGroup,
);

router.delete(
  "/:groupId",
  validate([param("groupId").isInt({ min: 1 })]),
  menuGroupController.removeMenuGroup,
);

export default router;
