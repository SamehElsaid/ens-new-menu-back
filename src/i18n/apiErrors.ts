import type { BilingualMessage } from "../utils/apiErrorResponse";

/** Shared bilingual strings for API errors (en + ar). */
export const ApiErrors = {
  internalServerError: {
    en: "Internal server error",
    ar: "خطأ داخلي في الخادم",
  },
  routeNotFound: {
    en: "Route not found",
    ar: "المسار غير موجود",
  },
  validationFailed: {
    en: "Validation failed",
    ar: "فشل التحقق من البيانات",
  },
  validationFailedInternal: {
    en: "Internal server error during validation",
    ar: "خطأ داخلي أثناء التحقق من البيانات",
  },
  noToken: {
    en: "No token provided",
    ar: "لم يتم إرسال رمز الدخول",
  },
  tokenRevoked: {
    en: "Token has been revoked",
    ar: "تم إلغاء صلاحية الرمز",
  },
  tokenExpired: {
    en: "Token expired",
    ar: "انتهت صلاحية الرمز",
  },
  invalidToken: {
    en: "Invalid or expired token",
    ar: "رمز غير صالح أو منتهي الصلاحية",
  },
  adminRequired: {
    en: "Admin access required",
    ar: "يتطلب صلاحية مسؤول",
  },
  staffRequired: {
    en: "Staff access required",
    ar: "يتطلب صلاحية طاقم",
  },
  invalidTokenFormat: {
    en: "Invalid token format",
    ar: "تنسيق الرمز غير صالح",
  },
  apiKeyDecryptFailed: {
    en: "Failed to decrypt or validate API key",
    ar: "فشل فك تشفير أو التحقق من مفتاح الـ API",
  },
  noActiveSubscription: {
    en: "No active subscription found. Please subscribe to a plan.",
    ar: "لا يوجد اشتراك نشط. يرجى الاشتراك في خطة.",
  },
  menuNotFoundOrAccess: {
    en: "Menu not found or access denied",
    ar: "المنيو غير موجود أو تم رفض الوصول",
  },
  failedCheckMenuLimit: {
    en: "Failed to check menu limit",
    ar: "فشل التحقق من حد القوائم",
  },
  failedCheckProductLimit: {
    en: "Failed to check product limit",
    ar: "فشل التحقق من حد المنتجات",
  },
  failedVerifySubscription: {
    en: "Failed to verify subscription",
    ar: "فشل التحقق من الاشتراك",
  },
  proFeatureOnly: {
    en: "This feature is available on Pro plans only. Please upgrade.",
    ar: "هذه الميزة متاحة لخطط Pro فقط. يرجى الترقية.",
  },
  menuNotFound: {
    en: "Menu not found",
    ar: "المنيو غير موجود",
  },
  failedGetMenus: {
    en: "Failed to get menus",
    ar: "فشل جلب القوائم",
  },
  nameRequiredArEn: {
    en: "Name is required in both Arabic and English",
    ar: "الاسم مطلوب بالعربي والإنجليزي",
  },
  logoRequired: {
    en: "Menu logo is required",
    ar: "شعار المنيو مطلوب",
  },
  failedCreateMenu: {
    en: "Failed to create menu",
    ar: "فشل إنشاء المنيو",
  },
  failedGetMenu: {
    en: "Failed to get menu",
    ar: "فشل جلب المنيو",
  },
  failedListActivityLog: {
    en: "Failed to load activity history",
    ar: "فشل تحميل سجل النشاط",
  },
  activityLogNotFound: {
    en: "Activity log entry not found",
    ar: "سجل النشاط غير موجود",
  },
  failedGetActivityLog: {
    en: "Failed to get activity log entry",
    ar: "فشل جلب سجل النشاط",
  },
  failedUpdateMenu: {
    en: "Failed to update menu",
    ar: "فشل تحديث المنيو",
  },
  isActiveMustBeBoolean: {
    en: "isActive must be a boolean value",
    ar: "يجب أن تكون isActive قيمة منطقية (true/false)",
  },
  failedUpdateMenuStatus: {
    en: "Failed to update menu status",
    ar: "فشل تحديث حالة المنيو",
  },
  failedDeleteMenu: {
    en: "Failed to delete menu",
    ar: "فشل حذف المنيو",
  },
  slugRequired: {
    en: "Slug is required",
    ar: "المعرف المختصر (slug) مطلوب",
  },
  invalidSlugFormat: {
    en: "Invalid slug format. Use only lowercase letters, numbers, and hyphens.",
    ar: "تنسيق الـ slug غير صالح. استخدم أحرفًا صغيرة وأرقامًا وشرطات فقط.",
  },
  failedCheckSlugAvailability: {
    en: "Failed to check slug availability",
    ar: "فشل التحقق من توفر الـ slug",
  },
  staffMenuNotFound: {
    en: "Staff menu not found",
    ar: "لم يُعثر على منيو مرتبط بهذا الطاقم",
  },
  failedListTableCallsHistory: {
    en: "Failed to list table calls history",
    ar: "فشل جلب سجل نداءات الطاولات",
  },
  failedListTableCalls: {
    en: "Failed to list table calls",
    ar: "فشل جلب نداءات الطاولات",
  },
  failedGetTableCall: {
    en: "Failed to get table order",
    ar: "فشل جلب الطلب",
  },
  tableCallNotFound: {
    en: "Order not found or does not belong to this menu",
    ar: "الطلب غير موجود أو لا يتبع هذا المنيو",
  },
  invalidCallId: {
    en: "Invalid call id",
    ar: "معرّف النداء غير صالح",
  },
  callNotFoundOrNotPending: {
    en: "Order not found, wrong menu, or not in pending status",
    ar: "الطلب غير موجود أو لمنيو مختلف أو ليس بحالة انتظار",
  },
  tableCallNotEditable: {
    en: "This order is cancelled or no longer allows editing items",
    ar: "الطلب ملغى أو لم يعد يقبل تعديل الأصناف",
  },
  failedCallStatusUpdate: {
    en: "Failed to update order status",
    ar: "فشل تحديث حالة الطلب",
  },
  failedUpdateCallItems: {
    en: "Failed to update order items",
    ar: "فشل تحديث عناصر الطلب",
  },
  tableNotFound: {
    en: "Table not found",
    ar: "الطاولة غير موجودة",
  },
  failedGetTables: {
    en: "Failed to get tables",
    ar: "فشل جلب الطاولات",
  },
  failedGetTable: {
    en: "Failed to get table",
    ar: "فشل جلب الطاولة",
  },
  failedCreateTable: {
    en: "Failed to create table",
    ar: "فشل إنشاء الطاولة",
  },
  noFieldsToUpdate: {
    en: "No fields to update",
    ar: "لا توجد حقول للتحديث",
  },
  failedUpdateTable: {
    en: "Failed to update table",
    ar: "فشل تحديث الطاولة",
  },
  failedDeleteTable: {
    en: "Failed to delete table",
    ar: "فشل حذف الطاولة",
  },
  failedCreateStaffMember: {
    en: "Failed to create staff member",
    ar: "فشل إنشاء عضو الطاقم",
  },
  failedListStaff: {
    en: "Failed to get staff",
    ar: "فشل جلب الطاقم",
  },
  staffMemberNotFound: {
    en: "Staff member not found",
    ar: "لم يُعثر على عضو الطاقم",
  },
  failedGetStaffMember: {
    en: "Failed to get staff member",
    ar: "فشل جلب بيانات عضو الطاقم",
  },
  emailExistsForMenu: {
    en: "Email already exists for this menu",
    ar: "البريد الإلكتروني مسجّل مسبقًا لهذا المنيو",
  },
  failedUpdateStaffMember: {
    en: "Failed to update staff member",
    ar: "فشل تحديث عضو الطاقم",
  },
  failedDeleteStaffMember: {
    en: "Failed to delete staff member",
    ar: "فشل حذف عضو الطاقم",
  },
  passwordColumnNotConfigured: {
    en: "Password column not configured on MenuStaff table",
    ar: "عمود كلمة المرور غير مهيأ في جدول طاقم المنيو",
  },
  invalidStaffJobRole: {
    en: "Staff role must be waiter or cashier",
    ar: "يجب أن يكون دور الموظف نادلًا (waiter) أو كاشيرًا (cashier)",
  },
  staffCashierRequired: {
    en: "Only cashiers can access the restaurant dashboard",
    ar: "الدخول إلى لوحة التحكم متاح للكاشير فقط",
  },
  failedGetMenuItems: {
    en: "Failed to get menu items",
    ar: "فشل جلب أصناف المنيو",
  },
  validPriceRequired: {
    en: "Valid price is required",
    ar: "السعر الصحيح مطلوب",
  },
  categoryRequiredEitherOr: {
    en: "Category is required (either categoryId or category)",
    ar: "التصنيف مطلوب (categoryId أو category)",
  },
  categoryRequired: {
    en: "Category is required",
    ar: "التصنيف مطلوب",
  },
  failedCreateMenuItem: {
    en: "Failed to create menu item",
    ar: "فشل إنشاء الصنف",
  },
  failedUpdateMenuItem: {
    en: "Failed to update menu item",
    ar: "فشل تحديث الصنف",
  },
  menuItemNotFound: {
    en: "Menu item not found",
    ar: "الصنف غير موجود",
  },
  failedDeleteMenuItem: {
    en: "Failed to delete menu item",
    ar: "فشل حذف الصنف",
  },
  failedUpdateDisplayOrder: {
    en: "Failed to update display order",
    ar: "فشل تحديث ترتيب العرض",
  },
  failedGetCategories: {
    en: "Failed to get categories",
    ar: "فشل جلب التصنيفات",
  },
  categoryNotFound: {
    en: "Category not found",
    ar: "التصنيف غير موجود",
  },
  failedGetCategory: {
    en: "Failed to get category",
    ar: "فشل جلب التصنيف",
  },
  failedCreateCategory: {
    en: "Failed to create category",
    ar: "فشل إنشاء التصنيف",
  },
  failedUpdateCategory: {
    en: "Failed to update category",
    ar: "فشل تحديث التصنيف",
  },
  failedDeleteCategory: {
    en: "Failed to delete category",
    ar: "فشل حذف التصنيف",
  },
  bulkImportInvalidPayload: {
    en: "Request body must be a non-empty categories array",
    ar: "يجب إرسال مصفوفة تصنيفات غير فارغة",
  },
  bulkImportProductLimitExceeded: {
    en: "Import would exceed your plan product limit",
    ar: "الاستيراد يتجاوز الحد الأقصى للمنتجات في خطتك",
  },
  bulkImportUsageLimitExceeded: {
    en: "Bulk import is limited to 1 use on the Free plan. Upgrade to Pro for unlimited imports.",
    ar: "استيراد القائمة محدود بـ مرة واحدة في الخطة المجانية. ترقّ إلى Pro للاستيراد بدون حد.",
  },
  failedBulkImportCategories: {
    en: "Failed to bulk import categories and items",
    ar: "فشل استيراد التصنيفات والمنتجات",
  },
  failedGetBranches: {
    en: "Failed to get branches",
    ar: "فشل جلب الفروع",
  },
  branchNotFound: {
    en: "Branch not found",
    ar: "الفرع غير موجود",
  },
  failedCreateBranch: {
    en: "Failed to create branch",
    ar: "فشل إنشاء الفرع",
  },
  failedUpdateBranch: {
    en: "Failed to update branch",
    ar: "فشل تحديث الفرع",
  },
  failedDeleteBranch: {
    en: "Failed to delete branch",
    ar: "فشل حذف الفرع",
  },
  userNotFound: {
    en: "User not found",
    ar: "المستخدم غير موجود",
  },
  failedGetProfile: {
    en: "Failed to get profile",
    ar: "فشل جلب الملف الشخصي",
  },
  failedUpdateProfile: {
    en: "Failed to update profile",
    ar: "فشل تحديث الملف الشخصي",
  },
  currentPasswordIncorrect: {
    en: "Current password is incorrect",
    ar: "كلمة المرور الحالية غير صحيحة",
  },
  failedChangePassword: {
    en: "Failed to change password",
    ar: "فشل تغيير كلمة المرور",
  },
  failedGetStatistics: {
    en: "Failed to get statistics",
    ar: "فشل جلب الإحصائيات",
  },
  invalidPlanType: {
    en: "Invalid plan type",
    ar: "نوع الخطة غير صالح",
  },
  failedUpgradePlan: {
    en: "Failed to upgrade plan",
    ar: "فشل ترقية الخطة",
  },
  alreadyOnFreePlan: {
    en: "You are already on the Free plan",
    ar: "أنت بالفعل على الخطة المجانية",
  },
  noPaidSubscriptionToDowngrade: {
    en: "No active paid subscription to downgrade",
    ar: "لا يوجد اشتراك مدفوع نشط للتخفيض",
  },
  failedDowngradePlan: {
    en: "Failed to downgrade plan",
    ar: "فشل تخفيض الخطة",
  },
  pendingSubscriptionPaymentNotFound: {
    en: "No subscription payment found to recover",
    ar: "لم يُعثر على دفعة اشتراك لاستردادها",
  },
  failedRecoverSubscriptionPayment: {
    en: "Failed to recover subscription payment",
    ar: "فشل استرداد دفع الاشتراك",
  },
  failedGetSubscription: {
    en: "Failed to get subscription",
    ar: "فشل جلب الاشتراك",
  },
  passwordIncorrect: {
    en: "Password is incorrect",
    ar: "كلمة المرور غير صحيحة",
  },
  failedDeleteAccount: {
    en: "Failed to delete account",
    ar: "فشل حذف الحساب",
  },
  unauthorized: {
    en: "Unauthorized",
    ar: "غير مصرّح",
  },
  failedGetNotifications: {
    en: "Failed to get notifications",
    ar: "فشل جلب الإشعارات",
  },
  failedGetUnreadCount: {
    en: "Failed to get unread count",
    ar: "فشل جلب عدد غير المقروء",
  },
  invalidNotificationId: {
    en: "Invalid notification ID",
    ar: "معرّف الإشعار غير صالح",
  },
  failedMarkNotificationRead: {
    en: "Failed to mark notification as read",
    ar: "فشل تعليم الإشعار كمقروء",
  },
  failedMarkAllNotificationsRead: {
    en: "Failed to mark all notifications as read",
    ar: "فشل تعليم كل الإشعارات كمقروءة",
  },
  failedDeleteNotification: {
    en: "Failed to delete notification",
    ar: "فشل حذف الإشعار",
  },
  fcmTokenRequired: {
    en: "FCM device token is required",
    ar: "رمز الجهاز (FCM) مطلوب",
  },
  invalidFcmTokenLength: {
    en: "FCM token is too long",
    ar: "رمز FCM طويل جداً",
  },
  failedSaveFcmToken: {
    en: "Failed to save push notification token",
    ar: "فشل حفظ رمز الإشعارات",
  },
  fcmTooManyDevices: {
    en: "Too many registered devices for push notifications on this account",
    ar: "عدد الأجهزة المسجّلة للإشعارات لهذا الحساب تجاوز الحد المسموح",
  },
  customizationsProOnly: {
    en: "Customizations are only available for Pro users",
    ar: "التخصيصات متاحة لمشتركي Pro فقط",
  },
  failedGetCustomizations: {
    en: "Failed to get customizations",
    ar: "فشل جلب إعدادات التخصيص",
  },
  failedUpdateCustomizations: {
    en: "Failed to update customizations",
    ar: "فشل تحديث التخصيصات",
  },
  failedResetCustomizations: {
    en: "Failed to reset customizations",
    ar: "فشل إعادة تعيين التخصيصات",
  },
  emailOrPhoneRequired: {
    en: "Email or phone number is required",
    ar: "البريد الإلكتروني أو رقم الهاتف مطلوب",
  },
  failedCheckAvailability: {
    en: "Failed to check availability",
    ar: "فشل التحقق من التوفر",
  },
  phoneRequired: {
    en: "Phone number is required",
    ar: "رقم الهاتف مطلوب",
  },
  emailAlreadyRegistered: {
    en: "Email already registered",
    ar: "البريد الإلكتروني مسجّل مسبقًا",
  },
  phoneAlreadyRegistered: {
    en: "Phone number already registered",
    ar: "رقم الهاتف مسجّل مسبقًا",
  },
  freePlanNotConfigured: {
    en: "Free plan not configured",
    ar: "الخطة المجانية غير مهيأة",
  },
  failedCreateAccount: {
    en: "Failed to create account",
    ar: "فشل إنشاء الحساب",
  },
  failedLogin: {
    en: "Failed to login",
    ar: "فشل تسجيل الدخول",
  },
  tokenRequired: {
    en: "Token is required",
    ar: "الرمز مطلوب",
  },
  invalidVerificationToken: {
    en: "Invalid or expired verification token",
    ar: "رمز التحقق غير صالح أو منتهي الصلاحية",
  },
  failedVerifyEmail: {
    en: "Failed to verify email",
    ar: "فشل التحقق من البريد",
  },
  emailAlreadyVerified: {
    en: "Email is already verified",
    ar: "البريد الإلكتروني مفعّل مسبقًا",
  },
  failedResendVerification: {
    en: "Failed to resend verification email",
    ar: "فشل إعادة إرسال بريد التحقق",
  },
  failedPasswordResetRequest: {
    en: "Failed to process password reset request",
    ar: "فشل معالجة طلب استعادة كلمة المرور",
  },
  invalidResetToken: {
    en: "Invalid or expired reset token",
    ar: "رمز الاستعادة غير صالح أو منتهي الصلاحية",
  },
  failedResetPassword: {
    en: "Failed to reset password",
    ar: "فشل إعادة تعيين كلمة المرور",
  },
  failedGetUserData: {
    en: "Failed to get user data",
    ar: "فشل جلب بيانات المستخدم",
  },
  refreshTokenRequired: {
    en: "Refresh token is required",
    ar: "رمز التحديث مطلوب",
  },
  invalidRefreshToken: {
    en: "Invalid or expired refresh token",
    ar: "رمز التحديث غير صالح أو منتهي الصلاحية",
  },
  refreshTokenRevoked: {
    en: "Refresh token has been revoked",
    ar: "تم إلغاء صلاحية رمز التحديث",
  },
  failedRefreshToken: {
    en: "Failed to refresh token",
    ar: "فشل تحديث الرمز",
  },
  failedLogout: {
    en: "Failed to logout",
    ar: "فشل تسجيل الخروج",
  },
  googleTokenRequired: {
    en: "Google token, access_token, or code is required",
    ar: "مطلوب Google token أو access_token أو code",
  },
  redirectUriRequiredWithCode: {
    en: "redirect_uri is required when using code",
    ar: "redirect_uri مطلوب عند استخدام code",
  },
  invalidGoogleToken: {
    en: "Invalid Google token",
    ar: "رمز Google غير صالح",
  },
  failedGoogleAuth: {
    en: "Failed to authenticate with Google",
    ar: "فشل المصادقة مع Google",
  },
  failedGoogleConfig: {
    en: "Failed to get Google configuration",
    ar: "فشل جلب إعدادات Google",
  },
  accountTemporarilyLocked: {
    en: "Account is temporarily locked",
    ar: "تم قفل الحساب مؤقتًا",
  },
  noFileUploaded: {
    en: "No file uploaded",
    ar: "لم يتم رفع أي ملف",
  },
  invalidUploadType: {
    en: "Invalid upload type",
    ar: "نوع الرفع غير صالح",
  },
  invalidFileTypeDetected: {
    en: "Invalid file type detected",
    ar: "تم اكتشاف نوع ملف غير صالح",
  },
  icoOnlyForLogos: {
    en: "ICO files are only allowed for logos",
    ar: "ملفات ICO مسموحة للشعارات فقط",
  },
  faviconMax1mb: {
    en: "Favicon file size must be less than 1MB",
    ar: "حجم أيقونة الموقع يجب أن يكون أقل من 1 ميجابايت",
  },
  failedUploadImage: {
    en: "Failed to upload image",
    ar: "فشل رفع الصورة",
  },
  invalidFilename: {
    en: "Invalid filename",
    ar: "اسم الملف غير صالح",
  },
  fileNotFound: {
    en: "File not found",
    ar: "الملف غير موجود",
  },
  failedDeleteImage: {
    en: "Failed to delete image",
    ar: "فشل حذف الصورة",
  },
  failedGetImageInfo: {
    en: "Failed to get image info",
    ar: "فشل جلب معلومات الصورة",
  },
  failedGetAdminStats: {
    en: "Failed to get admin statistics",
    ar: "فشل جلب إحصائيات المسؤول",
  },
  failedGetUsers: {
    en: "Failed to get users",
    ar: "فشل جلب المستخدمين",
  },
  failedGetUserDetails: {
    en: "Failed to get user details",
    ar: "فشل جلب تفاصيل المستخدم",
  },
  invalidUserId: {
    en: "Invalid user id",
    ar: "معرّف المستخدم غير صالح",
  },
  noMenuWithLogo: {
    en: "User has no menu with a logo",
    ar: "لا يوجد منيو بشعار لهذا المستخدم",
  },
  menuAlreadyFeaturedOnHomepage: {
    en: "This menu logo is already on the homepage",
    ar: "شعار هذا المنيو موجود بالفعل في الصفحة الرئيسية",
  },
  failedFeatureOnHomepage: {
    en: "Failed to add menu logo to homepage",
    ar: "فشل إضافة شعار المنيو إلى الصفحة الرئيسية",
  },
  notFeaturedOnHomepage: {
    en: "This user is not featured on the homepage",
    ar: "هذا المستخدم غير موجود في الصفحة الرئيسية",
  },
  failedUnfeatureOnHomepage: {
    en: "Failed to remove menu logo from homepage",
    ar: "فشل إزالة شعار المنيو من الصفحة الرئيسية",
  },
  invalidPasswordFormat: {
    en: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character",
    ar: "كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وصغير ورقم ورمز خاص",
  },
  failedAdminSetPassword: {
    en: "Failed to update user password",
    ar: "فشل تحديث كلمة مرور المستخدم",
  },
  failedUpdateUserSuspension: {
    en: "Failed to update user suspension status",
    ar: "فشل تحديث حالة تعليق المستخدم",
  },
  cannotDeleteAdminUsers: {
    en: "Cannot delete admin users",
    ar: "لا يمكن حذف حسابات المسؤولين",
  },
  failedDeleteUser: {
    en: "Failed to delete user",
    ar: "فشل حذف المستخدم",
  },
  failedGetPlans: {
    en: "Failed to get plans",
    ar: "فشل جلب الخطط",
  },
  planNotFound: {
    en: "Plan not found",
    ar: "الخطة غير موجودة",
  },
  failedUpdatePlan: {
    en: "Failed to update plan",
    ar: "فشل تحديث الخطة",
  },
  missingRequiredFields: {
    en: "Missing required fields",
    ar: "حقول مطلوبة ناقصة",
  },
  failedCreatePlan: {
    en: "Failed to create plan",
    ar: "فشل إنشاء الخطة",
  },
  failedGetAds: {
    en: "Failed to get ads",
    ar: "فشل جلب الإعلانات",
  },
  adTitleRequired: {
    en: "Title (English or Arabic) is required",
    ar: "العنوان (إنجليزي أو عربي) مطلوب",
  },
  failedCreateAd: {
    en: "Failed to create ad",
    ar: "فشل إنشاء الإعلان",
  },
  adNotFound: {
    en: "Ad not found",
    ar: "الإعلان غير موجود",
  },
  failedUpdateAd: {
    en: "Failed to update ad",
    ar: "فشل تحديث الإعلان",
  },
  failedDeleteAd: {
    en: "Failed to delete ad",
    ar: "فشل حذف الإعلان",
  },
  adminCredentialsRequired: {
    en: "Email, password, and name are required",
    ar: "البريد وكلمة المرور والاسم مطلوبة",
  },
  emailAlreadyExists: {
    en: "Email already exists",
    ar: "البريد الإلكتروني موجود مسبقًا",
  },
  failedCreateAdmin: {
    en: "Failed to create admin",
    ar: "فشل إنشاء المسؤول",
  },
  cannotDeleteOwnAdmin: {
    en: "Cannot delete your own admin account",
    ar: "لا يمكن حذف حساب المسؤول الخاص بك",
  },
  adminNotFound: {
    en: "Admin not found",
    ar: "المسؤول غير موجود",
  },
  failedDeleteAdministrator: {
    en: "Failed to delete administrator",
    ar: "فشل حذف المسؤول",
  },
  failedGetAdmins: {
    en: "Failed to get admins",
    ar: "فشل جلب المسؤولين",
  },
  failedGetAdAnalytics: {
    en: "Failed to get ad analytics",
    ar: "فشل جلب تحليلات الإعلان",
  },
  planIdAndBillingRequired: {
    en: "Plan ID and billing cycle are required",
    ar: "معرّف الخطة ودورة الفوترة مطلوبة",
  },
  invalidBillingCycle: {
    en: "Invalid billing cycle. Must be monthly, yearly, or free",
    ar: "دورة الفوترة غير صالحة. يجب أن تكون monthly أو yearly أو free",
  },
  cannotModifyAdminSubscriptions: {
    en: "Cannot modify admin user subscriptions",
    ar: "لا يمكن تعديل اشتراكات حسابات المسؤولين",
  },
  failedUpdateUserSubscription: {
    en: "Failed to update user subscription",
    ar: "فشل تحديث اشتراك المستخدم",
  },
  failedApplyFreePlanLimits: {
    en: "Failed to apply free plan limits",
    ar: "فشل تطبيق حدود الخطة المجانية",
  },
  cannotApplyFreePlanToAdmin: {
    en: "Cannot apply free plan limits to admin users",
    ar: "لا يمكن تطبيق حدود الخطة المجانية على حسابات المسؤولين",
  },
  menuNotFoundNoAccess: {
    en: "Menu not found or you do not have access to it",
    ar: "المنيو غير موجود أو ليس لديك صلاحية للوصول إليه",
  },
  failedFetchMenuItems: {
    en: "Failed to fetch menu items",
    ar: "فشل جلب أصناف المنيو",
  },
  failedFetchMenuItem: {
    en: "Failed to fetch menu item",
    ar: "فشل جلب الصنف",
  },
  translationsBothRequired: {
    en: "Translations for both Arabic and English are required",
    ar: "مطلوب ترجمتان للعربية والإنجليزية",
  },
  nameRequiredBothLanguages: {
    en: "Name is required in both languages",
    ar: "الاسم مطلوب باللغتين",
  },
  versionNotFound: {
    en: "App version configuration not found",
    ar: "إعدادات إصدار التطبيق غير موجودة",
  },
  failedGetVersion: {
    en: "Failed to fetch app version",
    ar: "فشل جلب إصدار التطبيق",
  },
  failedUpdateVersion: {
    en: "Failed to update app version",
    ar: "فشل تحديث إصدار التطبيق",
  },
  failedCreateVersion: {
    en: "Failed to create app version",
    ar: "فشل إضافة إصدار التطبيق",
  },
  versionNumberRequired: {
    en: "Version number is required",
    ar: "رقم الإصدار مطلوب",
  },
  downloadUrlRequired: {
    en: "Download URL is required",
    ar: "رابط التحميل مطلوب",
  },
  verifykitNotConfigured: {
    en: "Phone verification service is not configured",
    ar: "خدمة التحقق من رقم الهاتف غير مهيأة",
  },
  verifykitInitFailed: {
    en: "Failed to load phone verification options",
    ar: "فشل تحميل خيارات التحقق من رقم الهاتف",
  },
  verifykitStartFailed: {
    en: "Failed to start phone verification",
    ar: "فشل بدء التحقق من رقم الهاتف",
  },
  verifykitCheckFailed: {
    en: "Failed to check phone verification status",
    ar: "فشل التحقق من حالة رقم الهاتف",
  },
  verifykitCountryFailed: {
    en: "Failed to load country list",
    ar: "فشل تحميل قائمة الدول",
  },
  verifykitSendOtpFailed: {
    en: "Failed to send verification code",
    ar: "فشل إرسال رمز التحقق",
  },
  verifykitResultFailed: {
    en: "Failed to complete phone verification",
    ar: "فشل إكمال التحقق من رقم الهاتف",
  },
  verifykitAccessTokenFailed: {
    en: "Failed to initialize phone verification widget",
    ar: "فشل تهيئة واجهة التحقق من رقم الهاتف",
  },
} as const satisfies Record<string, BilingualMessage>;
