/**
 * @openapi
 * /api/menus/{menuId}/ads:
 *   get:
 *     tags: [Ads]
 *     summary: List menu ads (dashboard)
 *     description: |
 *       Custom ads shown inside the customer's public menu (`adType: menu`).
 *       Paginated. Free plan: max **1** ad per menu (`FREE_MAX_ADS_PER_MENU`).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, example: 10 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 ads:
 *                   - id: 9
 *                     title: "Summer Offer"
 *                     titleAr: "عرض الصيف"
 *                     content: "20% off all drinks"
 *                     contentAr: "خصم 20% على المشروبات"
 *                     imageUrl: "/uploads/ads/summer.webp"
 *                     linkUrl: "https://example.com/promo"
 *                     position: banner
 *                     displayOrder: 0
 *                     isActive: true
 *                     adType: menu
 *                     menuId: 42
 *                     impressionCount: 120
 *                     clickCount: 15
 *                 pagination:
 *                   total: 1
 *                   page: 1
 *                   limit: 10
 *                   totalPages: 1
 *       404:
 *         description: Menu not found
 *
 *   post:
 *     tags: [Ads]
 *     summary: Create menu ad
 *     description: |
 *       Positions: typically `banner` or `popup`.
 *       Upload image first via `POST /api/upload` with `type: ads`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, titleAr, content, contentAr]
 *             properties:
 *               title: { type: string, example: "Summer Offer" }
 *               titleAr: { type: string, example: "عرض الصيف" }
 *               content: { type: string, example: "20% off all drinks" }
 *               contentAr: { type: string, example: "خصم 20% على المشروبات" }
 *               imageUrl: { type: string, example: "/uploads/ads/summer.webp" }
 *               linkUrl: { type: string, example: "https://example.com/promo" }
 *               position: { type: string, example: banner }
 *           example:
 *             title: "Summer Offer"
 *             titleAr: "عرض الصيف"
 *             content: "20% off all drinks"
 *             contentAr: "خصم 20% على المشروبات"
 *             imageUrl: "/uploads/ads/summer.webp"
 *             linkUrl: "https://example.com/promo"
 *             position: banner
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Ad created successfully"
 *               data:
 *                 adId: 9
 *       403:
 *         description: Free plan ad limit exceeded (code AD_LIMIT)
 *
 * /api/ads/{adId}:
 *   put:
 *     tags: [Ads]
 *     summary: Update menu ad
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema: { type: integer, example: 9 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             title: "Winter Offer"
 *             titleAr: "عرض الشتاء"
 *             isActive: true
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Ad updated successfully"
 *       404:
 *         description: Ad not found
 *   delete:
 *     tags: [Ads]
 *     summary: Delete menu ad
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema: { type: integer, example: 9 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Ad deleted successfully"
 *
 * /api/ads/{adId}/toggle:
 *   patch:
 *     tags: [Ads]
 *     summary: Toggle ad active/inactive
 *     description: Flips isActive without deleting the ad.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema: { type: integer, example: 9 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Ad status updated successfully"
 *               data:
 *                 isActive: false
 *
 * /api/public/ads:
 *   get:
 *     tags: [Ads]
 *     summary: Active global ads (landing / platform)
 *     description: |
 *       Platform-wide ads (adType global), not tied to a specific menu.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: position
 *         schema: { type: string, example: header }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, maximum: 20, example: 5 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               ads:
 *                 - id: 1
 *                   title: "Upgrade to Pro"
 *                   titleAr: "ترقية إلى Pro"
 *                   imageUrl: "/uploads/ads/pro-banner.webp"
 *                   linkUrl: "/pricing"
 *                   position: header
 *                   isActive: true
 *
 * /api/public/menu/{menuId}/ads:
 *   get:
 *     tags: [Ads]
 *     summary: Active menu custom ads (public)
 *     description: Returns only **active** menu ads for display on the public menu page.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema: { type: integer, example: 42 }
 *       - in: query
 *         name: position
 *         schema: { type: string, example: banner }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, maximum: 20, example: 3 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               ads:
 *                 - id: 9
 *                   title: "Summer Offer"
 *                   titleAr: "عرض الصيف"
 *                   imageUrl: "/uploads/ads/summer.webp"
 *                   linkUrl: "https://example.com/promo"
 *                   position: banner
 *
 * /api/public/ads/{id}/click:
 *   post:
 *     tags: [Ads]
 *     summary: Track ad click (public menu)
 *     description: Increments clickCount for analytics. Call when user taps the ad.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 9 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Click recorded"
 *
 * /api/admin/ads:
 *   get:
 *     tags: [Ads]
 *     summary: List global ads (admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               ads:
 *                 - id: 1
 *                   title: "Platform Promo"
 *                   adType: global
 *                   isActive: true
 *                   impressionCount: 5000
 *                   clickCount: 320
 *   post:
 *     tags: [Ads]
 *     summary: Create global ad (admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             title: "New Feature"
 *             titleAr: "ميزة جديدة"
 *             content: "Try menu groups"
 *             contentAr: "جرب مجموعات المنيو"
 *             position: header
 *             imageUrl: "/uploads/ads/feature.webp"
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/admin/ads/{id}:
 *   put:
 *     tags: [Ads]
 *     summary: Update global ad (admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Ads]
 *     summary: Delete global ad (admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/admin/ads/{id}/analytics:
 *   get:
 *     tags: [Ads]
 *     summary: Ad impressions & clicks (admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               adId: 1
 *               impressionCount: 5000
 *               clickCount: 320
 *               ctr: 6.4
 */

export {};
