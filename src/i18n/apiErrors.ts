import type { BilingualMessage } from '../utils/apiErrorResponse';

/** Shared bilingual strings for API errors (en + ar). */
export const ApiErrors = {
  internalServerError: {
    en: 'Internal server error',
    ar: 'خطأ داخلي في الخادم',
  },
  routeNotFound: {
    en: 'Route not found',
    ar: 'المسار غير موجود',
  },
  validationFailed: {
    en: 'Validation failed',
    ar: 'فشل التحقق من البيانات',
  },
  validationFailedInternal: {
    en: 'Internal server error during validation',
    ar: 'خطأ داخلي أثناء التحقق من البيانات',
  },
  noToken: {
    en: 'No token provided',
    ar: 'لم يتم إرسال رمز الدخول',
  },
  tokenRevoked: {
    en: 'Token has been revoked',
    ar: 'تم إلغاء صلاحية الرمز',
  },
  tokenExpired: {
    en: 'Token expired',
    ar: 'انتهت صلاحية الرمز',
  },
  invalidToken: {
    en: 'Invalid or expired token',
    ar: 'رمز غير صالح أو منتهي الصلاحية',
  },
  adminRequired: {
    en: 'Admin access required',
    ar: 'يتطلب صلاحية مسؤول',
  },
  restaurantOwnerOnly: {
    en: 'This action is only available to restaurant accounts.',
    ar: 'هذا الإجراء متاح لحسابات أصحاب المطاعم فقط.',
  },
  staffRequired: {
    en: 'Staff access required',
    ar: 'يتطلب صلاحية طاقم',
  },
  invalidTokenFormat: {
    en: 'Invalid token format',
    ar: 'تنسيق الرمز غير صالح',
  },
  apiKeyDecryptFailed: {
    en: 'Failed to decrypt or validate API key',
    ar: 'فشل فك تشفير أو التحقق من مفتاح الـ API',
  },
  noActiveSubscription: {
    en: 'No active subscription found. Please subscribe to a plan.',
    ar: 'لا يوجد اشتراك نشط. يرجى الاشتراك في خطة.',
  },
  menuNotFoundOrAccess: {
    en: 'Menu not found or access denied',
    ar: 'المنيو غير موجود أو تم رفض الوصول',
  },
  failedCheckMenuLimit: {
    en: 'Failed to check menu limit',
    ar: 'فشل التحقق من حد القوائم',
  },
  failedCheckProductLimit: {
    en: 'Failed to check product limit',
    ar: 'فشل التحقق من حد المنتجات',
  },
  failedVerifySubscription: {
    en: 'Failed to verify subscription',
    ar: 'فشل التحقق من الاشتراك',
  },
  proFeatureOnly: {
    en: 'This feature is available on Pro plans only. Please upgrade.',
    ar: 'هذه الميزة متاحة لخطط Pro فقط. يرجى الترقية.',
  },
  menuNotFound: {
    en: 'Menu not found',
    ar: 'المنيو غير موجود',
  },
  failedGetMenus: {
    en: 'Failed to get menus',
    ar: 'فشل جلب القوائم',
  },
  nameRequiredArEn: {
    en: 'Name is required in both Arabic and English',
    ar: 'الاسم مطلوب بالعربي والإنجليزي',
  },
  failedCreateMenu: {
    en: 'Failed to create menu',
    ar: 'فشل إنشاء المنيو',
  },
  failedGetMenu: {
    en: 'Failed to get menu',
    ar: 'فشل جلب المنيو',
  },
  failedListActivityLog: {
    en: 'Failed to load activity history',
    ar: 'فشل تحميل سجل النشاط',
  },
  failedUpdateMenu: {
    en: 'Failed to update menu',
    ar: 'فشل تحديث المنيو',
  },
  isActiveMustBeBoolean: {
    en: 'isActive must be a boolean value',
    ar: 'يجب أن تكون isActive قيمة منطقية (true/false)',
  },
  failedUpdateMenuStatus: {
    en: 'Failed to update menu status',
    ar: 'فشل تحديث حالة المنيو',
  },
  failedDeleteMenu: {
    en: 'Failed to delete menu',
    ar: 'فشل حذف المنيو',
  },
  slugRequired: {
    en: 'Slug is required',
    ar: 'المعرف المختصر (slug) مطلوب',
  },
  invalidSlugFormat: {
    en: 'Invalid slug format. Use only lowercase letters, numbers, and hyphens.',
    ar: 'تنسيق الـ slug غير صالح. استخدم أحرفًا صغيرة وأرقامًا وشرطات فقط.',
  },
  failedCheckSlugAvailability: {
    en: 'Failed to check slug availability',
    ar: 'فشل التحقق من توفر الـ slug',
  },
  staffMenuNotFound: {
    en: 'Staff menu not found',
    ar: 'لم يُعثر على منيو مرتبط بهذا الطاقم',
  },
  failedListTableCallsHistory: {
    en: 'Failed to list table calls history',
    ar: 'فشل جلب سجل نداءات الطاولات',
  },
  failedListTableCalls: {
    en: 'Failed to list table calls',
    ar: 'فشل جلب نداءات الطاولات',
  },
  failedGetTableCall: {
    en: 'Failed to get table order',
    ar: 'فشل جلب الطلب',
  },
  tableCallNotFound: {
    en: 'Order not found or does not belong to this menu',
    ar: 'الطلب غير موجود أو لا يتبع هذا المنيو',
  },
  invalidCallId: {
    en: 'Invalid call id',
    ar: 'معرّف النداء غير صالح',
  },
  callNotFoundOrNotPending: {
    en: 'Order not found, wrong menu, or not in pending status',
    ar: 'الطلب غير موجود أو لمنيو مختلف أو ليس بحالة انتظار',
  },
  tableCallNotEditable: {
    en: 'This order is cancelled or no longer allows editing items',
    ar: 'الطلب ملغى أو لم يعد يقبل تعديل الأصناف',
  },
  failedCallStatusUpdate: {
    en: 'Failed to update order status',
    ar: 'فشل تحديث حالة الطلب',
  },
  failedUpdateCallItems: {
    en: 'Failed to update order items',
    ar: 'فشل تحديث عناصر الطلب',
  },
  tableNotFound: {
    en: 'Table not found',
    ar: 'الطاولة غير موجودة',
  },
  failedGetTables: {
    en: 'Failed to get tables',
    ar: 'فشل جلب الطاولات',
  },
  failedGetTable: {
    en: 'Failed to get table',
    ar: 'فشل جلب الطاولة',
  },
  failedCreateTable: {
    en: 'Failed to create table',
    ar: 'فشل إنشاء الطاولة',
  },
  noFieldsToUpdate: {
    en: 'No fields to update',
    ar: 'لا توجد حقول للتحديث',
  },
  failedUpdateTable: {
    en: 'Failed to update table',
    ar: 'فشل تحديث الطاولة',
  },
  failedDeleteTable: {
    en: 'Failed to delete table',
    ar: 'فشل حذف الطاولة',
  },
  failedCreateStaffMember: {
    en: 'Failed to create staff member',
    ar: 'فشل إنشاء عضو الطاقم',
  },
  failedListStaff: {
    en: 'Failed to get staff',
    ar: 'فشل جلب الطاقم',
  },
  staffMemberNotFound: {
    en: 'Staff member not found',
    ar: 'لم يُعثر على عضو الطاقم',
  },
  failedGetStaffMember: {
    en: 'Failed to get staff member',
    ar: 'فشل جلب بيانات عضو الطاقم',
  },
  emailExistsForMenu: {
    en: 'Email already exists for this menu',
    ar: 'البريد الإلكتروني مسجّل مسبقًا لهذا المنيو',
  },
  failedUpdateStaffMember: {
    en: 'Failed to update staff member',
    ar: 'فشل تحديث عضو الطاقم',
  },
  failedDeleteStaffMember: {
    en: 'Failed to delete staff member',
    ar: 'فشل حذف عضو الطاقم',
  },
  passwordColumnNotConfigured: {
    en: 'Password column not configured on MenuStaff table',
    ar: 'عمود كلمة المرور غير مهيأ في جدول طاقم المنيو',
  },
  invalidStaffJobRole: {
    en: 'Staff role must be waiter',
    ar: 'يجب أن يكون دور الموظف نادلاً (waiter)',
  },
  staffWebDashboardForbidden: {
    en: 'The restaurant web dashboard is only available to the menu owner.',
    ar: 'لوحة التحكم على الويب متاحة لصاحب المنيو فقط.',
  },
  failedGetMenuItems: {
    en: 'Failed to get menu items',
    ar: 'فشل جلب أصناف المنيو',
  },
  validPriceRequired: {
    en: 'Valid price is required',
    ar: 'السعر الصحيح مطلوب',
  },
  categoryRequiredEitherOr: {
    en: 'Category is required (either categoryId or category)',
    ar: 'التصنيف مطلوب (categoryId أو category)',
  },
  categoryRequired: {
    en: 'Category is required',
    ar: 'التصنيف مطلوب',
  },
  failedCreateMenuItem: {
    en: 'Failed to create menu item',
    ar: 'فشل إنشاء الصنف',
  },
  failedUpdateMenuItem: {
    en: 'Failed to update menu item',
    ar: 'فشل تحديث الصنف',
  },
  menuItemNotFound: {
    en: 'Menu item not found',
    ar: 'الصنف غير موجود',
  },
  failedDeleteMenuItem: {
    en: 'Failed to delete menu item',
    ar: 'فشل حذف الصنف',
  },
  failedUpdateDisplayOrder: {
    en: 'Failed to update display order',
    ar: 'فشل تحديث ترتيب العرض',
  },
  failedGetCategories: {
    en: 'Failed to get categories',
    ar: 'فشل جلب التصنيفات',
  },
  categoryNotFound: {
    en: 'Category not found',
    ar: 'التصنيف غير موجود',
  },
  failedGetCategory: {
    en: 'Failed to get category',
    ar: 'فشل جلب التصنيف',
  },
  failedCreateCategory: {
    en: 'Failed to create category',
    ar: 'فشل إنشاء التصنيف',
  },
  failedUpdateCategory: {
    en: 'Failed to update category',
    ar: 'فشل تحديث التصنيف',
  },
  failedDeleteCategory: {
    en: 'Failed to delete category',
    ar: 'فشل حذف التصنيف',
  },
  failedGetBranches: {
    en: 'Failed to get branches',
    ar: 'فشل جلب الفروع',
  },
  branchNotFound: {
    en: 'Branch not found',
    ar: 'الفرع غير موجود',
  },
  failedCreateBranch: {
    en: 'Failed to create branch',
    ar: 'فشل إنشاء الفرع',
  },
  failedUpdateBranch: {
    en: 'Failed to update branch',
    ar: 'فشل تحديث الفرع',
  },
  failedDeleteBranch: {
    en: 'Failed to delete branch',
    ar: 'فشل حذف الفرع',
  },
  userNotFound: {
    en: 'User not found',
    ar: 'المستخدم غير موجود',
  },
  failedGetProfile: {
    en: 'Failed to get profile',
    ar: 'فشل جلب الملف الشخصي',
  },
  failedUpdateProfile: {
    en: 'Failed to update profile',
    ar: 'فشل تحديث الملف الشخصي',
  },
  currentPasswordIncorrect: {
    en: 'Current password is incorrect',
    ar: 'كلمة المرور الحالية غير صحيحة',
  },
  failedChangePassword: {
    en: 'Failed to change password',
    ar: 'فشل تغيير كلمة المرور',
  },
  failedGetStatistics: {
    en: 'Failed to get statistics',
    ar: 'فشل جلب الإحصائيات',
  },
  invalidPlanType: {
    en: 'Invalid plan type',
    ar: 'نوع الخطة غير صالح',
  },
  failedUpgradePlan: {
    en: 'Failed to upgrade plan',
    ar: 'فشل ترقية الخطة',
  },
  failedGetSubscription: {
    en: 'Failed to get subscription',
    ar: 'فشل جلب الاشتراك',
  },
  passwordIncorrect: {
    en: 'Password is incorrect',
    ar: 'كلمة المرور غير صحيحة',
  },
  failedDeleteAccount: {
    en: 'Failed to delete account',
    ar: 'فشل حذف الحساب',
  },
  unauthorized: {
    en: 'Unauthorized',
    ar: 'غير مصرّح',
  },
  failedGetNotifications: {
    en: 'Failed to get notifications',
    ar: 'فشل جلب الإشعارات',
  },
  failedGetUnreadCount: {
    en: 'Failed to get unread count',
    ar: 'فشل جلب عدد غير المقروء',
  },
  invalidNotificationId: {
    en: 'Invalid notification ID',
    ar: 'معرّف الإشعار غير صالح',
  },
  failedMarkNotificationRead: {
    en: 'Failed to mark notification as read',
    ar: 'فشل تعليم الإشعار كمقروء',
  },
  failedMarkAllNotificationsRead: {
    en: 'Failed to mark all notifications as read',
    ar: 'فشل تعليم كل الإشعارات كمقروءة',
  },
  failedDeleteNotification: {
    en: 'Failed to delete notification',
    ar: 'فشل حذف الإشعار',
  },
  customizationsProOnly: {
    en: 'Customizations are only available for Pro users',
    ar: 'التخصيصات متاحة لمشتركي Pro فقط',
  },
  failedGetCustomizations: {
    en: 'Failed to get customizations',
    ar: 'فشل جلب إعدادات التخصيص',
  },
  failedUpdateCustomizations: {
    en: 'Failed to update customizations',
    ar: 'فشل تحديث التخصيصات',
  },
  failedResetCustomizations: {
    en: 'Failed to reset customizations',
    ar: 'فشل إعادة تعيين التخصيصات',
  },
  emailOrPhoneRequired: {
    en: 'Email or phone number is required',
    ar: 'البريد الإلكتروني أو رقم الجوال مطلوب',
  },
  failedCheckAvailability: {
    en: 'Failed to check availability',
    ar: 'فشل التحقق من التوفر',
  },
  phoneRequired: {
    en: 'Phone number is required',
    ar: 'رقم الجوال مطلوب',
  },
  emailAlreadyRegistered: {
    en: 'Email already registered',
    ar: 'البريد الإلكتروني مسجّل مسبقًا',
  },
  phoneAlreadyRegistered: {
    en: 'Phone number already registered',
    ar: 'رقم الجوال مسجّل مسبقًا',
  },
  freePlanNotConfigured: {
    en: 'Free plan not configured',
    ar: 'الخطة المجانية غير مهيأة',
  },
  failedCreateAccount: {
    en: 'Failed to create account',
    ar: 'فشل إنشاء الحساب',
  },
  failedLogin: {
    en: 'Failed to login',
    ar: 'فشل تسجيل الدخول',
  },
  tokenRequired: {
    en: 'Token is required',
    ar: 'الرمز مطلوب',
  },
  invalidVerificationToken: {
    en: 'Invalid or expired verification token',
    ar: 'رمز التحقق غير صالح أو منتهي الصلاحية',
  },
  failedVerifyEmail: {
    en: 'Failed to verify email',
    ar: 'فشل التحقق من البريد',
  },
  emailAlreadyVerified: {
    en: 'Email is already verified',
    ar: 'البريد الإلكتروني مفعّل مسبقًا',
  },
  failedResendVerification: {
    en: 'Failed to resend verification email',
    ar: 'فشل إعادة إرسال بريد التحقق',
  },
  failedPasswordResetRequest: {
    en: 'Failed to process password reset request',
    ar: 'فشل معالجة طلب استعادة كلمة المرور',
  },
  invalidResetToken: {
    en: 'Invalid or expired reset token',
    ar: 'رمز الاستعادة غير صالح أو منتهي الصلاحية',
  },
  failedResetPassword: {
    en: 'Failed to reset password',
    ar: 'فشل إعادة تعيين كلمة المرور',
  },
  failedGetUserData: {
    en: 'Failed to get user data',
    ar: 'فشل جلب بيانات المستخدم',
  },
  refreshTokenRequired: {
    en: 'Refresh token is required',
    ar: 'رمز التحديث مطلوب',
  },
  invalidRefreshToken: {
    en: 'Invalid or expired refresh token',
    ar: 'رمز التحديث غير صالح أو منتهي الصلاحية',
  },
  refreshTokenRevoked: {
    en: 'Refresh token has been revoked',
    ar: 'تم إلغاء صلاحية رمز التحديث',
  },
  failedRefreshToken: {
    en: 'Failed to refresh token',
    ar: 'فشل تحديث الرمز',
  },
  failedLogout: {
    en: 'Failed to logout',
    ar: 'فشل تسجيل الخروج',
  },
  googleTokenRequired: {
    en: 'Google token, access_token, or code is required',
    ar: 'مطلوب Google token أو access_token أو code',
  },
  redirectUriRequiredWithCode: {
    en: 'redirect_uri is required when using code',
    ar: 'redirect_uri مطلوب عند استخدام code',
  },
  invalidGoogleToken: {
    en: 'Invalid Google token',
    ar: 'رمز Google غير صالح',
  },
  failedGoogleAuth: {
    en: 'Failed to authenticate with Google',
    ar: 'فشل المصادقة مع Google',
  },
  failedGoogleConfig: {
    en: 'Failed to get Google configuration',
    ar: 'فشل جلب إعدادات Google',
  },
  accountTemporarilyLocked: {
    en: 'Account is temporarily locked',
    ar: 'تم قفل الحساب مؤقتًا',
  },
  noFileUploaded: {
    en: 'No file uploaded',
    ar: 'لم يتم رفع أي ملف',
  },
  invalidUploadType: {
    en: 'Invalid upload type',
    ar: 'نوع الرفع غير صالح',
  },
  invalidFileTypeDetected: {
    en: 'Invalid file type detected',
    ar: 'تم اكتشاف نوع ملف غير صالح',
  },
  icoOnlyForLogos: {
    en: 'ICO files are only allowed for logos',
    ar: 'ملفات ICO مسموحة للشعارات فقط',
  },
  faviconMax1mb: {
    en: 'Favicon file size must be less than 1MB',
    ar: 'حجم أيقونة الموقع يجب أن يكون أقل من 1 ميجابايت',
  },
  failedUploadImage: {
    en: 'Failed to upload image',
    ar: 'فشل رفع الصورة',
  },
  invalidFilename: {
    en: 'Invalid filename',
    ar: 'اسم الملف غير صالح',
  },
  fileNotFound: {
    en: 'File not found',
    ar: 'الملف غير موجود',
  },
  failedDeleteImage: {
    en: 'Failed to delete image',
    ar: 'فشل حذف الصورة',
  },
  failedGetImageInfo: {
    en: 'Failed to get image info',
    ar: 'فشل جلب معلومات الصورة',
  },
  failedGetAdminStats: {
    en: 'Failed to get admin statistics',
    ar: 'فشل جلب إحصائيات المسؤول',
  },
  failedGetUsers: {
    en: 'Failed to get users',
    ar: 'فشل جلب المستخدمين',
  },
  failedGetUserDetails: {
    en: 'Failed to get user details',
    ar: 'فشل جلب تفاصيل المستخدم',
  },
  failedUpdateUserSuspension: {
    en: 'Failed to update user suspension status',
    ar: 'فشل تحديث حالة تعليق المستخدم',
  },
  cannotDeleteAdminUsers: {
    en: 'Cannot delete admin users',
    ar: 'لا يمكن حذف حسابات المسؤولين',
  },
  failedDeleteUser: {
    en: 'Failed to delete user',
    ar: 'فشل حذف المستخدم',
  },
  failedGetPlans: {
    en: 'Failed to get plans',
    ar: 'فشل جلب الخطط',
  },
  planNotFound: {
    en: 'Plan not found',
    ar: 'الخطة غير موجودة',
  },
  failedUpdatePlan: {
    en: 'Failed to update plan',
    ar: 'فشل تحديث الخطة',
  },
  missingRequiredFields: {
    en: 'Missing required fields',
    ar: 'حقول مطلوبة ناقصة',
  },
  failedCreatePlan: {
    en: 'Failed to create plan',
    ar: 'فشل إنشاء الخطة',
  },
  failedGetAds: {
    en: 'Failed to get ads',
    ar: 'فشل جلب الإعلانات',
  },
  adTitleRequired: {
    en: 'Title (English or Arabic) is required',
    ar: 'العنوان (إنجليزي أو عربي) مطلوب',
  },
  failedCreateAd: {
    en: 'Failed to create ad',
    ar: 'فشل إنشاء الإعلان',
  },
  adNotFound: {
    en: 'Ad not found',
    ar: 'الإعلان غير موجود',
  },
  failedUpdateAd: {
    en: 'Failed to update ad',
    ar: 'فشل تحديث الإعلان',
  },
  failedDeleteAd: {
    en: 'Failed to delete ad',
    ar: 'فشل حذف الإعلان',
  },
  adminCredentialsRequired: {
    en: 'Email, password, and name are required',
    ar: 'البريد وكلمة المرور والاسم مطلوبة',
  },
  emailAlreadyExists: {
    en: 'Email already exists',
    ar: 'البريد الإلكتروني موجود مسبقًا',
  },
  failedCreateAdmin: {
    en: 'Failed to create admin',
    ar: 'فشل إنشاء المسؤول',
  },
  cannotDeleteOwnAdmin: {
    en: 'Cannot delete your own admin account',
    ar: 'لا يمكن حذف حساب المسؤول الخاص بك',
  },
  adminNotFound: {
    en: 'Admin not found',
    ar: 'المسؤول غير موجود',
  },
  failedDeleteAdministrator: {
    en: 'Failed to delete administrator',
    ar: 'فشل حذف المسؤول',
  },
  failedGetAdmins: {
    en: 'Failed to get admins',
    ar: 'فشل جلب المسؤولين',
  },
  failedGetAdAnalytics: {
    en: 'Failed to get ad analytics',
    ar: 'فشل جلب تحليلات الإعلان',
  },
  planIdAndBillingRequired: {
    en: 'Plan ID and billing cycle are required',
    ar: 'معرّف الخطة ودورة الفوترة مطلوبة',
  },
  invalidBillingCycle: {
    en: 'Invalid billing cycle. Must be monthly, yearly, or free',
    ar: 'دورة الفوترة غير صالحة. يجب أن تكون monthly أو yearly أو free',
  },
  cannotModifyAdminSubscriptions: {
    en: 'Cannot modify admin user subscriptions',
    ar: 'لا يمكن تعديل اشتراكات حسابات المسؤولين',
  },
  failedUpdateUserSubscription: {
    en: 'Failed to update user subscription',
    ar: 'فشل تحديث اشتراك المستخدم',
  },
  failedApplyFreePlanLimits: {
    en: 'Failed to apply free plan limits',
    ar: 'فشل تطبيق حدود الخطة المجانية',
  },
  cannotApplyFreePlanToAdmin: {
    en: 'Cannot apply free plan limits to admin users',
    ar: 'لا يمكن تطبيق حدود الخطة المجانية على حسابات المسؤولين',
  },
  menuNotFoundNoAccess: {
    en: 'Menu not found or you do not have access to it',
    ar: 'المنيو غير موجود أو ليس لديك صلاحية للوصول إليه',
  },
  failedFetchMenuItems: {
    en: 'Failed to fetch menu items',
    ar: 'فشل جلب أصناف المنيو',
  },
  failedFetchMenuItem: {
    en: 'Failed to fetch menu item',
    ar: 'فشل جلب الصنف',
  },
  translationsBothRequired: {
    en: 'Translations for both Arabic and English are required',
    ar: 'مطلوب ترجمتان للعربية والإنجليزية',
  },
  nameRequiredBothLanguages: {
    en: 'Name is required in both languages',
    ar: 'الاسم مطلوب باللغتين',
  },
} as const satisfies Record<string, BilingualMessage>;
