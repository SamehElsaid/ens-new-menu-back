import { Router } from 'express';
import {
  getAdminStats,
  getAllUsers,
  getUserDetails,
  toggleUserSuspension,
  deleteUser,
  getAllPlans,
  updatePlan,
  createPlan,
  getGlobalAds,
  createGlobalAd,
  updateGlobalAd,
  deleteGlobalAd,
  createAdmin,
  getAllAdmins,
  getAdAnalytics,
  updateUserSubscription,
  getPlansForSubscription,
  applyFreePlanLimits,
} from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// All routes require admin authentication
router.use(requireAdmin);

// Dashboard Stats
router.get('/stats', getAdminStats);

// Users Management
router.get('/users', getAllUsers);
router.get('/users/:id', getUserDetails);
router.put('/users/:id/suspend', toggleUserSuspension);
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

export default router;
