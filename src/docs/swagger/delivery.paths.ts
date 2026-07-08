/**
 * @openapi
 * /api/menus/{menuId}/delivery/settings:
 *   get:
 *     tags: [Delivery]
 *     summary: Get menu delivery settings
 *     description: |
 *       Returns delivery toggle, mode, contact phone, WhatsApp flag, and governorates list.
 *       Requires menu owner JWT. Governorates mode is available on Free and Pro.
 *       Public menu exposes the same shape (Free plan always uses `governorates` mode).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         description: Current delivery configuration
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MenuDeliverySettings' }
 *             example:
 *               deliveryOn: true
 *               deliveryMode: governorates
 *               deliveryPhone: "+201012345678"
 *               phoneNumber: "+201098765432"
 *               deliveryWhatsAppOn: true
 *               governorates:
 *                 - id: 4
 *                   nameAr: "مدينة نصر"
 *                   nameEn: "Nasr City"
 *                   price: 25
 *                   lat: 30.0561
 *                   lan: 31.3302
 *       404:
 *         description: Menu not found or not owned by user
 *
 *   put:
 *     tags: [Delivery]
 *     summary: Update menu delivery settings
 *     description: |
 *       Partial update. At least one field required.
 *       When enabling delivery or WhatsApp, a phone number must be available
 *       (`deliveryPhone` or owner `phoneNumber`).
 *       `deliveryMode: governorates` is available on Free and Pro.
 *       `deliveryMode: distance` requires Pro (403 PRO_REQUIRED on Free).
 *       Free menus always expose governorates mode publicly even if distance was stored before downgrade.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deliveryOn: { type: boolean, example: true }
 *               deliveryWhatsAppOn: { type: boolean, example: true }
 *               deliveryPhone: { type: string, maxLength: 50, example: "+201012345678" }
 *               deliveryMode: { type: string, enum: [governorates, distance], example: distance }
 *           example:
 *             deliveryOn: true
 *             deliveryMode: distance
 *             deliveryWhatsAppOn: true
 *             deliveryPhone: "+201012345678"
 *     responses:
 *       200:
 *         description: Updated settings
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - type: object
 *                   properties:
 *                     message: { type: string, example: "Delivery settings updated successfully" }
 *                 - $ref: '#/components/schemas/MenuDeliverySettings'
 *       400:
 *         description: No fields to update or phone required when enabling delivery/WhatsApp
 *       403:
 *         description: distance mode requires Pro (PRO_REQUIRED)
 *
 * /api/menus/{menuId}/delivery/governorates:
 *   get:
 *     tags: [Delivery]
 *     summary: List menu delivery areas (governorates)
 *     description: Flat-fee delivery zones used when `deliveryMode` is `governorates`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         description: Governorates for this menu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 governorates:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/DeliveryGovernorate' }
 *             example:
 *               governorates:
 *                 - id: 4
 *                   nameAr: "مدينة نصر"
 *                   nameEn: "Nasr City"
 *                   price: 25
 *                   lat: 30.0561
 *                   lan: 31.3302
 *
 *   post:
 *     tags: [Delivery]
 *     summary: Create delivery area
 *     description: |
 *       Adds a governorate/area with fixed delivery price.
 *       Optional `lat`/`lan` (or `lng`) used for geo redirect in linked menu groups.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nameAr, nameEn, price]
 *             properties:
 *               nameAr: { type: string, maxLength: 255 }
 *               nameEn: { type: string, maxLength: 255 }
 *               price: { type: number, minimum: 0 }
 *               lat: { type: number, nullable: true }
 *               lan: { type: number, nullable: true }
 *               lng: { type: number, nullable: true, description: Alias for lan }
 *           example:
 *             nameAr: "مدينة نصر"
 *             nameEn: "Nasr City"
 *             price: 25
 *             lat: 30.0561
 *             lng: 31.3302
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 governorate: { $ref: '#/components/schemas/DeliveryGovernorate' }
 *
 * /api/menus/{menuId}/delivery/governorates/{governorateId}:
 *   put:
 *     tags: [Delivery]
 *     summary: Update delivery area
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: governorateId
 *         required: true
 *         schema: { type: integer, example: 4 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             nameAr: "مدينة نصر"
 *             nameEn: "Nasr City"
 *             price: 30
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 governorate: { $ref: '#/components/schemas/DeliveryGovernorate' }
 *       404:
 *         description: Governorate not found
 *
 *   delete:
 *     tags: [Delivery]
 *     summary: Delete delivery area
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: governorateId
 *         required: true
 *         schema: { type: integer, example: 4 }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             example:
 *               message: "Governorate deleted successfully"
 *
 * /api/menus/{menuId}/branches:
 *   get:
 *     tags: [Delivery]
 *     summary: List branches (distance delivery)
 *     description: |
 *       Branches with GPS and per-km pricing. Required when `deliveryMode` is `distance`.
 *       Also returned on the public menu payload for Pro owners.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - $ref: '#/components/parameters/locale'
 *     responses:
 *       200:
 *         description: Branches list
 *         content:
 *           application/json:
 *             example:
 *               branches:
 *                 - id: 3
 *                   nameAr: "فرع مدينة نصر"
 *                   nameEn: "Nasr City Branch"
 *                   phone: "+201012345678"
 *                   latitude: 30.0561
 *                   longitude: 31.3302
 *                   deliveryBasePrice: 15
 *                   deliveryPricePerKm: 5
 *                   maxDeliveryRadiusKm: 10
 *                   isActive: true
 *
 *   post:
 *     tags: [Delivery]
 *     summary: Create branch
 *     description: |
 *       For distance mode, set `latitude`, `longitude`, `deliveryBasePrice`,
 *       `deliveryPricePerKm`, and `maxDeliveryRadiusKm`.
 *       Fee formula: first km = base; each extra km (ceil) adds pricePerKm.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             nameAr: "فرع مدينة نصر"
 *             nameEn: "Nasr City Branch"
 *             addressAr: "شارع عباس العقاد"
 *             addressEn: "Abbas El Akkad St"
 *             phone: "+201012345678"
 *             latitude: 30.0561
 *             longitude: 31.3302
 *             deliveryBasePrice: 15
 *             deliveryPricePerKm: 5
 *             maxDeliveryRadiusKm: 10
 *             isActive: true
 *     responses:
 *       201:
 *         description: Branch created
 *         content:
 *           application/json:
 *             example:
 *               message: "Branch created successfully"
 *               branchId: 3
 *
 * /api/menus/{menuId}/branches/{branchId}:
 *   put:
 *     tags: [Delivery]
 *     summary: Update branch
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: integer, example: 3 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             deliveryBasePrice: 20
 *             maxDeliveryRadiusKm: 12
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Branch updated successfully"
 *   delete:
 *     tags: [Delivery]
 *     summary: Delete branch
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: integer, example: 3 }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             example:
 *               message: "Branch deleted successfully"
 *
 * /api/user/delivery/settings:
 *   get:
 *     tags: [Delivery]
 *     summary: Get account-level delivery settings (legacy/user)
 *     description: |
 *       User-scoped delivery settings on the **Users** table.
 *       Menu-scoped delivery (`/api/menus/{menuId}/delivery/*`) is preferred for multi-menu owners.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Settings + governorates
 *         content:
 *           application/json:
 *             example:
 *               deliveryOn: true
 *               deliveryPhone: "+201012345678"
 *               phoneNumber: "+201098765432"
 *               deliveryWhatsAppOn: true
 *               governorates:
 *                 - id: 1
 *                   nameAr: "القاهرة"
 *                   nameEn: "Cairo"
 *                   price: 20
 *                   lat: null
 *                   lan: null
 *
 *   put:
 *     tags: [Delivery]
 *     summary: Update account-level delivery settings
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             deliveryOn: true
 *             deliveryWhatsAppOn: true
 *             deliveryPhone: "+201012345678"
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             example:
 *               message: "Delivery settings updated successfully"
 *               user:
 *                 id: 128
 *                 deliveryOn: true
 *                 deliveryPhone: "+201012345678"
 *
 * /api/user/delivery/governorates:
 *   get:
 *     tags: [Delivery]
 *     summary: List user delivery governorates
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               governorates:
 *                 - id: 1
 *                   nameAr: "القاهرة"
 *                   nameEn: "Cairo"
 *                   price: 20
 *   post:
 *     tags: [Delivery]
 *     summary: Create user delivery governorate
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             nameAr: "الجيزة"
 *             nameEn: "Giza"
 *             price: 30
 *             lat: 30.0131
 *             lng: 31.2089
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               governorate:
 *                 id: 2
 *                 nameAr: "الجيزة"
 *                 nameEn: "Giza"
 *                 price: 30
 *
 * /api/user/delivery/governorates/{governorateId}:
 *   put:
 *     tags: [Delivery]
 *     summary: Update user delivery governorate
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: governorateId
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             price: 25
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               governorate:
 *                 id: 1
 *                 nameAr: "القاهرة"
 *                 nameEn: "Cairo"
 *                 price: 25
 *   delete:
 *     tags: [Delivery]
 *     summary: Delete user delivery governorate
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: governorateId
 *         required: true
 *         schema: { type: integer, example: 1 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Governorate deleted successfully"
 *
 * /api/public/menu/{slug}/branches/{branchId}/delivery-quote:
 *   get:
 *     tags: [Delivery]
 *     summary: Calculate delivery fee (public, distance mode)
 *     description: |
 *       **Public — no JWT.** Customer GPS → branch fee quote.
 *       Requires menu effective mode `distance` (Pro). Returns `inRange: false` when outside radius.
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string, example: alsham-restaurant }
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: integer, example: 3 }
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number, example: 30.0444 }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number, example: 31.2357 }
 *     responses:
 *       200:
 *         description: Quote (may be out of range)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/DeliveryQuote' }
 *             examples:
 *               inRange:
 *                 summary: Customer inside delivery radius
 *                 value:
 *                   success: true
 *                   data:
 *                     inRange: true
 *                     distanceKm: 4.2
 *                     deliveryFee: 30
 *                     maxDeliveryRadiusKm: 10
 *               outOfRange:
 *                 summary: Customer too far
 *                 value:
 *                   success: true
 *                   data:
 *                     inRange: false
 *                     distanceKm: 12.5
 *                     deliveryFee: null
 *                     maxDeliveryRadiusKm: 10
 *                     message:
 *                       en: "Delivery address is outside the service area"
 *                       ar: "عنوان التوصيل خارج نطاق الخدمة"
 *       400:
 *         description: Menu not in distance mode or branch not configured
 *       404:
 *         description: Menu or branch not found
 */

export {};
