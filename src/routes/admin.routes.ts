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
  patchAdminPermissions,
} from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';
import { createAdminAppVersion } from '../controllers/version.controller';
import { getAdminAnalytics } from '../controllers/adminAnalytics.controller';
import { getAdminPayments } from '../controllers/adminPayments.controller';
import {
  getFollowUpQueue,
  getFollowUpCalls,
  postFollowUpCall,
  getFollowUpReport,
} from '../controllers/adminFollowUp.controller';

const router = Router();

// All routes require admin authentication
router.use(requireAdmin);

// Dashboard Stats
router.get('/stats', getAdminStats);
router.get('/analytics', getAdminAnalytics);
router.get('/payments', getAdminPayments);

// Customer follow-ups
router.get('/follow-ups/queue', getFollowUpQueue);
router.get('/follow-ups/calls', getFollowUpCalls);
router.post('/follow-ups/calls', postFollowUpCall);
router.get('/follow-ups/report', getFollowUpReport);

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
router.patch('/admins/:id/permissions', patchAdminPermissions);
router.delete('/admins/:id', deleteAdmin);

// App version — POST only (GET is public: /api/public/app-version)
router.post('/app-version', createAdminAppVersion);

export default router;
