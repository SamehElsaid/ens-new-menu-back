import { Router } from "express";
import { validate, adminVoucherSchema } from "../middleware/validation";
import {
  getAdminStats,
  getAllUsers,
  getUserDetails,
  toggleUserSuspension,
  adminSetUserPassword,
  deleteUser,
  getAllPlans,
  updatePlan,
  createPlan,
  getGlobalAds,
  createGlobalAd,
  updateGlobalAd,
  deleteGlobalAd,
  createAdmin,
  deleteAdmin,
  getAllAdmins,
  getAdAnalytics,
  updateUserSubscription,
  updateUserExtraMenus,
  getPlansForSubscription,
  applyFreePlanLimits,
  patchAdminPermissions,
  featureUserOnHomepage,
  unfeatureUserOnHomepage,
} from "../controllers/admin.controller";
import { requireAdmin } from "../middleware/auth.middleware";
import { createAdminAppVersion } from "../controllers/version.controller";
import { getAdminAnalytics } from "../controllers/adminAnalytics.controller";
import { getAdminPayments } from "../controllers/adminPayments.controller";
import {
  getFollowUpQueue,
  getFollowUpCalls,
  postFollowUpCall,
  patchFollowUpCall,
  removeFollowUpCall,
  getFollowUpReport,
} from "../controllers/adminFollowUp.controller";
import {
  getAdminVouchers,
  getAdminVoucherById,
  postAdminVoucher,
  putAdminVoucher,
  deleteAdminVoucher,
  getAdminVoucherRedemptions,
} from "../controllers/adminVoucher.controller";
import { getAdminActivityLog } from "../controllers/adminActivityLog.controller";
import {
  patchAdminUserProfile,
  patchAdminUserBlock,
  softDeleteAdminUser,
  restoreAdminUser,
  postAdminUserResetPassword,
  getAdminUserAddresses,
  postAdminUserAddress,
  patchAdminUserAddress,
  deleteAdminUserAddress,
  getAdminUserNotes,
  postAdminUserNote,
  deleteAdminUserNote,
  getAdminUserActivityLog,
  getAdminUserOrders,
  getAdminUserVouchers,
  postAdminUserVoucherAssign,
  postAdminUserVoucherBlock,
  deleteAdminUserVoucherBlock,
  getAdminUserSupport,
  postAdminUserSupport,
  patchAdminUserSupportStatus,
} from "../controllers/adminCustomer.controller";
import {
  getBroadcastPreview,
  postBroadcastSend,
} from "../controllers/adminBroadcast.controller";
import {
  getAdminDomainTransfers,
  getAdminDomainTransferById,
  postAdminDomainTransferMessage,
  postAdminDomainTransferComplete,
  postAdminDomainTransferCancel,
} from "../controllers/domainTransfer.controller";

const router = Router();

// All routes require admin authentication
router.use(requireAdmin);

// Dashboard Stats
router.get("/stats", getAdminStats);
router.get("/analytics", getAdminAnalytics);
router.get("/payments", getAdminPayments);

// Domain transfer requests
router.get("/domain-transfers", getAdminDomainTransfers);
router.get("/domain-transfers/:id", getAdminDomainTransferById);
router.post("/domain-transfers/:id/message", postAdminDomainTransferMessage);
router.post("/domain-transfers/:id/complete", postAdminDomainTransferComplete);
router.post("/domain-transfers/:id/cancel", postAdminDomainTransferCancel);

// Customer follow-ups
router.get("/follow-ups/queue", getFollowUpQueue);
router.get("/follow-ups/calls", getFollowUpCalls);
router.post("/follow-ups/calls", postFollowUpCall);
router.put("/follow-ups/calls/:id", patchFollowUpCall);
router.delete("/follow-ups/calls/:id", removeFollowUpCall);
router.get("/follow-ups/report", getFollowUpReport);

// Users Management
router.get("/users", getAllUsers);

// Customer email broadcast
router.get("/broadcast/preview", getBroadcastPreview);
router.post("/broadcast/send", postBroadcastSend);
router.get("/users/:id", getUserDetails);
router.put("/users/:id/suspend", toggleUserSuspension);
router.put("/users/:id/password", adminSetUserPassword);
router.put("/users/:id/subscription", updateUserSubscription);
router.put("/users/:id/extra-menus", updateUserExtraMenus);
router.post("/users/:id/apply-free-limits", applyFreePlanLimits);
router.post("/users/:id/feature-on-homepage", featureUserOnHomepage);
router.delete("/users/:id/feature-on-homepage", unfeatureUserOnHomepage);
router.delete("/users/:id", deleteUser);
router.put("/users/:id/profile", patchAdminUserProfile);
router.put("/users/:id/block", patchAdminUserBlock);
router.post("/users/:id/soft-delete", softDeleteAdminUser);
router.post("/users/:id/restore", restoreAdminUser);
router.post("/users/:id/send-reset-password", postAdminUserResetPassword);
router.get("/users/:id/addresses", getAdminUserAddresses);
router.post("/users/:id/addresses", postAdminUserAddress);
router.put("/users/:id/addresses/:addressId", patchAdminUserAddress);
router.delete("/users/:id/addresses/:addressId", deleteAdminUserAddress);
router.get("/users/:id/notes", getAdminUserNotes);
router.post("/users/:id/notes", postAdminUserNote);
router.delete("/users/:id/notes/:noteId", deleteAdminUserNote);
router.get("/users/:id/activity-log", getAdminUserActivityLog);
router.get("/users/:id/orders", getAdminUserOrders);
router.get("/users/:id/vouchers", getAdminUserVouchers);
router.post("/users/:id/vouchers/assign", postAdminUserVoucherAssign);
router.post("/users/:id/vouchers/:voucherId/block", postAdminUserVoucherBlock);
router.delete(
  "/users/:id/vouchers/:voucherId/block",
  deleteAdminUserVoucherBlock,
);
router.get("/users/:id/support", getAdminUserSupport);
router.post("/users/:id/support", postAdminUserSupport);
router.put("/users/:id/support/:caseId", patchAdminUserSupportStatus);

// Plans Management
router.get("/plans/subscription", getPlansForSubscription);
router.get("/plans", getAllPlans);
router.post("/plans", createPlan);
router.put("/plans/:id", updatePlan);
router.patch("/plans/:id", updatePlan);

// Ads Management
router.get("/ads", getGlobalAds);
router.post("/ads", createGlobalAd);
router.put("/ads/:id", updateGlobalAd);
router.delete("/ads/:id", deleteGlobalAd);
router.get("/ads/:id/analytics", getAdAnalytics);

// Admin Management
router.get("/activity-log", getAdminActivityLog);
router.get("/admins", getAllAdmins);
router.post("/admins", createAdmin);
router.patch("/admins/:id/permissions", patchAdminPermissions);
router.delete("/admins/:id", deleteAdmin);

// App version — POST only (GET is public: /api/public/app-version)
router.post("/app-version", createAdminAppVersion);

// Vouchers
router.get("/vouchers", getAdminVouchers);
router.get("/vouchers/:id/redemptions", getAdminVoucherRedemptions);
router.get("/vouchers/:id", getAdminVoucherById);
router.post("/vouchers", validate(adminVoucherSchema), postAdminVoucher);
router.patch("/vouchers/:id", putAdminVoucher);
router.delete("/vouchers/:id", deleteAdminVoucher);

export default router;
