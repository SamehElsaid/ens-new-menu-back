/**
 * @openapi
 * components:
 *   schemas:
 *     DeliveryGovernorate:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 4 }
 *         nameAr: { type: string, example: "مدينة نصر" }
 *         nameEn: { type: string, example: "Nasr City" }
 *         price: { type: number, example: 25 }
 *         lat: { type: number, nullable: true, example: 30.0561 }
 *         lan: { type: number, nullable: true, example: 31.3302, description: "Longitude (DB column name is lan; lng is accepted on input)" }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     MenuDeliverySettings:
 *       type: object
 *       description: Per-menu delivery configuration shown in dashboard and public menu.
 *       properties:
 *         deliveryOn: { type: boolean, example: true, description: "Master toggle for delivery orders" }
 *         deliveryMode:
 *           type: string
 *           enum: [governorates, distance]
 *           example: governorates
 *           description: |
 *             - `governorates`: flat fee per area (Free & Pro)
 *             - `distance`: GPS fee from branch (Pro only; Free owners always see governorates publicly)
 *         deliveryPhone: { type: string, nullable: true, example: "+201012345678" }
 *         phoneNumber: { type: string, nullable: true, example: "+201098765432", description: "Owner account phone fallback" }
 *         deliveryWhatsAppOn: { type: boolean, example: true, description: "Send orders via WhatsApp when true" }
 *         governorates:
 *           type: array
 *           items: { $ref: '#/components/schemas/DeliveryGovernorate' }
 *
 *     BranchDeliveryPricing:
 *       type: object
 *       description: Branch fields used when deliveryMode is `distance`.
 *       properties:
 *         id: { type: integer, example: 3 }
 *         nameAr: { type: string, example: "فرع مدينة نصر" }
 *         nameEn: { type: string, example: "Nasr City Branch" }
 *         phone: { type: string, nullable: true, example: "+201012345678" }
 *         latitude: { type: number, nullable: true, example: 30.0561 }
 *         longitude: { type: number, nullable: true, example: 31.3302 }
 *         deliveryBasePrice: { type: number, nullable: true, example: 15, description: "Fee for first km" }
 *         deliveryPricePerKm: { type: number, nullable: true, example: 5, description: "Added per extra km (rounded up)" }
 *         maxDeliveryRadiusKm: { type: number, nullable: true, example: 10 }
 *         isActive: { type: boolean, example: true }
 *
 *     DeliveryQuote:
 *       type: object
 *       properties:
 *         inRange: { type: boolean, example: true }
 *         distanceKm: { type: number, example: 4.2 }
 *         deliveryFee: { type: number, nullable: true, example: 30 }
 *         maxDeliveryRadiusKm: { type: number, nullable: true, example: 10 }
 *
 *     MenuTable:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 12 }
 *         menuId: { type: integer, example: 42 }
 *         tableNumber: { type: string, example: "T-5", description: "Letters/numbers, max 50 chars, used in QR links" }
 *         seats: { type: integer, nullable: true, example: 4 }
 *         isActive: { type: boolean, example: true }
 *
 *     MenuAd:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 9 }
 *         title: { type: string, example: "Summer Offer" }
 *         titleAr: { type: string, example: "عرض الصيف" }
 *         content: { type: string, example: "20% off all drinks" }
 *         contentAr: { type: string, example: "خصم 20% على المشروبات" }
 *         imageUrl: { type: string, nullable: true, example: "/uploads/ads/example.webp" }
 *         linkUrl: { type: string, nullable: true, example: "https://example.com/promo" }
 *         position: { type: string, example: banner, description: "banner | popup | etc." }
 *         displayOrder: { type: integer, example: 0 }
 *         isActive: { type: boolean, example: true }
 *         adType: { type: string, example: menu }
 *         menuId: { type: integer, example: 42 }
 *         impressionCount: { type: integer, example: 120 }
 *         clickCount: { type: integer, example: 15 }
 *         createdAt: { type: string, format: date-time }
 *
 *     MenuStaffMember:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 7 }
 *         menuId: { type: integer, example: 42 }
 *         name: { type: string, example: "Karim" }
 *         role: { type: string, example: cashier, description: "waiter | cashier" }
 *         phone: { type: string, nullable: true }
 *         email: { type: string, format: email, nullable: true }
 *         isActive: { type: boolean, example: true }
 *
 *     GuestStaffCallRequest:
 *       type: object
 *       required: [menuId]
 *       properties:
 *         menuId: { type: integer, example: 42 }
 *         type:
 *           type: string
 *           enum: [table, delivery]
 *           example: delivery
 *           description: "table = dine-in order; delivery = home delivery"
 *         requestKind:
 *           type: string
 *           enum: [order, waiter, bill]
 *           example: waiter
 *           description: "order = food/cart (default); waiter = call waiter; bill = request the check. waiter/bill require tableNumber and ignore items."
 *         tableNumber: { type: string, example: "T-5", description: "Required for table orders from QR" }
 *         customerName: { type: string, example: "Mohamed Ali" }
 *         customerPhone: { type: string, example: "+201012345678" }
 *         customerAddress: { type: string, example: "15 El Tahrir St, Nasr City" }
 *         orderNotes: { type: string, example: "Extra spicy, no onions" }
 *         governorateId: { type: integer, example: 4, description: "For governorates delivery mode" }
 *         branchId: { type: integer, example: 3, description: "For distance delivery mode" }
 *         customerLat: { type: number, example: 30.0444 }
 *         customerLng: { type: number, example: 31.2357 }
 *         status:
 *           type: string
 *           enum: [pending, confirmed, cancelled]
 *           example: pending
 *         items:
 *           type: array
 *           description: Cart lines (optional on create; ignored for waiter/bill)
 *           items:
 *             type: object
 *             properties:
 *               itemId: { type: integer }
 *               name: { type: string }
 *               quantity: { type: integer }
 *               price: { type: number }
 *
 *     UserProfile:
 *       type: object
 *       description: Account owner profile returned by GET /api/user/profile.
 *       properties:
 *         id: { type: integer, example: 128 }
 *         email: { type: string, format: email, example: "owner@restaurant.com" }
 *         name: { type: string, example: "Ahmed Hassan" }
 *         restaurantName: { type: string, nullable: true, example: "مطعم الشام" }
 *         phoneNumber: { type: string, nullable: true, example: "+201012345678" }
 *         deliveryPhone: { type: string, nullable: true, example: "+201098765432" }
 *         deliveryOn: { type: boolean, example: true }
 *         country: { type: string, nullable: true, example: "Egypt" }
 *         dateOfBirth: { type: string, format: date-time, nullable: true }
 *         gender: { type: string, enum: [male, female, other], nullable: true }
 *         address: { type: string, nullable: true }
 *         profileImage: { type: string, nullable: true, example: "/uploads/profile-images/example.webp" }
 *         role: { type: string, example: user }
 *         isEmailVerified: { type: boolean, example: true }
 *         isPhoneVerified: { type: boolean, example: false }
 *         phoneVerifiedAt: { type: string, format: date-time, nullable: true }
 *         hasFcmToken: { type: boolean, example: true, description: "Whether push token is registered" }
 *         createdAt: { type: string, format: date-time }
 *
 *     UserSubscription:
 *       type: object
 *       description: Current plan, limits, and renewal info.
 *       properties:
 *         plan: { type: string, example: Pro }
 *         planName: { type: string, example: Pro }
 *         status: { type: string, example: active }
 *         billingCycle: { type: string, enum: [free, monthly, yearly], example: yearly }
 *         startDate: { type: string, format: date-time, nullable: true }
 *         endDate: { type: string, format: date-time, nullable: true }
 *         amount: { type: number, example: 999 }
 *         maxMenus: { type: integer, example: 5 }
 *         extraMenus: { type: integer, example: 2 }
 *         effectiveMaxMenus: { type: integer, example: 7 }
 *         extraMenuPrice: { type: number, example: 150 }
 *         subscriptionDaysRemaining: { type: integer, example: 180 }
 *         canRenewPro: { type: boolean, example: false }
 *         isInGracePeriod: { type: boolean, example: false }
 *
 *     DomainTransferRequest:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 5 }
 *         userId: { type: integer, example: 128 }
 *         domainUrl: { type: string, example: "https://myrestaurant.com" }
 *         status: { type: string, enum: [pending, in_progress, completed, cancelled], example: pending }
 *         adminNotes: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 *
 *     AdminDashboardStats:
 *       type: object
 *       properties:
 *         totalUsers: { type: integer, example: 1250 }
 *         activeAccounts: { type: integer, example: 1180 }
 *         paidPlans: { type: integer, example: 320 }
 *         trialUsers: { type: integer, example: 45 }
 *         monthlyRevenue: { type: number, example: 48500 }
 *         suspendedAccounts: { type: integer, example: 12 }
 *
 *     AdminUserListItem:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 128 }
 *         name: { type: string, example: "Ahmed Hassan" }
 *         restaurantName: { type: string, nullable: true, example: "مطعم الشام" }
 *         email: { type: string, example: "owner@restaurant.com" }
 *         phoneNumber: { type: string, nullable: true }
 *         planName: { type: string, example: Pro }
 *         billingCycle: { type: string, example: yearly }
 *         menusCount: { type: integer, example: 3 }
 *         isSuspended: { type: boolean, example: false }
 *         featuredOnHomepage: { type: boolean, example: false }
 *         createdAt: { type: string, format: date-time }
 *         lastLoginAt: { type: string, format: date-time, nullable: true }
 */

export {};
