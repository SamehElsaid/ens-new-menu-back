import { Router } from 'express';
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
  getPlansForSubscription,
  applyFreePlanLimits,
} from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';
import { createAdminAppVersion } from '../controllers/version.controller';

const router = Router();

// All routes require admin authentication
router.use(requireAdmin);

// Dashboard Stats
router.get('/stats', getAdminStats);

// Users Management
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetails);
router.put('/users/:id/suspend', toggleUserSuspension);
router.put('/users/:id/password', adminSetUserPassword);
router.put('/users/:id/subscription', updateUserSubscription);
router.post('/users/:id/apply-free-limits', applyFreePlanLimits);
router.delete('/users/:id', deleteUser);

// Plans Management
router.get('/plans/subscription', getPlansForSubscription);
router.get('/plans', getAllPlans);
router.post('/plans', createPlan);
router.put('/plans/:id', updatePlan);

// Ads Management
router.get('/ads', getGlobalAds);
router.post('/ads', createGlobalAd);
router.put('/ads/:id', updateGlobalAd);
router.delete('/ads/:id', deleteGlobalAd);
router.get('/ads/:id/analytics', getAdAnalytics);

// Admin Management
router.get('/admins', getAllAdmins);
router.post('/admins', createAdmin);
router.delete('/admins/:id', deleteAdmin);

// App version — POST only (GET is public: /api/public/app-version)
router.post('/app-version', createAdminAppVersion);

export default router;
