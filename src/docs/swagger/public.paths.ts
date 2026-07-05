/**
 * @openapi
 * /api/public/app-version:
 *   get:
 *     tags: [Public]
 *     summary: App version (alias)
 *     security: []
 *     responses:
 *       200:
 *         description: Version info
 *
 * /api/public/app-version/latest:
 *   get:
 *     tags: [Public]
 *     summary: Latest app version
 *     security: []
 *     responses:
 *       200:
 *         description: Latest version
 *
 * /api/public/staff-call:
 *   post:
 *     tags: [Public]
 *     summary: Guest staff call / delivery order
 *     security: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [menuId]
 *             properties:
 *               menuId: { type: integer }
 *               type: { type: string, enum: [table, delivery] }
 *               tableNumber: { type: string }
 *               customerName: { type: string }
 *               customerPhone: { type: string }
 *               customerAddress: { type: string }
 *               orderNotes: { type: string }
 *               governorateId: { type: integer }
 *               branchId: { type: integer }
 *               customerLat: { type: number }
 *               customerLng: { type: number }
 *               status: { type: string, enum: [pending, confirmed, cancelled] }
 *     responses:
 *       201:
 *         description: Call created
 *
 * /api/public/menus:
 *   get:
 *     tags: [Public]
 *     summary: List all public menus
 *     security: []
 *     responses:
 *       200:
 *         description: Menus list
 *
 * /api/public/menus/{slug}/branding-events:
 *   post:
 *     tags: [Public]
 *     summary: Track ENSmenu banner events
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type]
 *             properties:
 *               type: { type: string, enum: [impression, click] }
 *     responses:
 *       200:
 *         description: Event recorded
 *
 * /api/public/menu/{slug}/catalog:
 *   get:
 *     tags: [Public]
 *     summary: Menu catalog with pagination
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/locale'
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 30 }
 *       - in: query
 *         name: categoryId
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Catalog data
 *
 * /api/public/menu/{slug}/nearby-branch:
 *   get:
 *     tags: [Public]
 *     summary: Geo-based nearest branch menu
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Branch redirect info
 *
 * /api/public/menu/{slug}/branches/{branchId}/delivery-quote:
 *   get:
 *     tags: [Public]
 *     summary: Distance-based delivery fee quote
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: branchId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: lat
 *         required: true
 *         schema: { type: number }
 *       - in: query
 *         name: lng
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Delivery quote
 *
 * /api/public/menu/{slug}:
 *   get:
 *     tags: [Public]
 *     summary: Get public menu by slug
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - $ref: '#/components/parameters/locale'
 *       - in: query
 *         name: tableNumber
 *         schema: { type: string }
 *       - in: query
 *         name: tableId
 *         schema: { type: integer }
 *       - in: query
 *         name: src
 *         schema: { type: string, enum: [qr] }
 *     responses:
 *       200:
 *         description: Full menu
 *
 * /api/public/menu/{slug}/view:
 *   get:
 *     tags: [Public]
 *     summary: Record page view (+ QR scan)
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: src
 *         schema: { type: string, enum: [qr] }
 *     responses:
 *       200:
 *         description: View recorded
 *
 * /api/public/menu/{slug}/items/{itemId}/view:
 *   post:
 *     tags: [Public]
 *     summary: Record product view
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: View recorded
 *
 * /api/public/menu/{slug}/ratings:
 *   get:
 *     tags: [Public]
 *     summary: Recent ratings
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ratings list
 *
 * /api/public/menu/{slug}/rate:
 *   post:
 *     tags: [Public]
 *     summary: Submit rating
 *     security: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stars]
 *             properties:
 *               stars: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *               customerName: { type: string }
 *     responses:
 *       201:
 *         description: Rating submitted
 *
 * /api/public/ads/{id}/click:
 *   post:
 *     tags: [Public]
 *     summary: Track ad click
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Click recorded
 *
 * /api/public/ads:
 *   get:
 *     tags: [Public]
 *     summary: Active global ads
 *     security: []
 *     parameters:
 *       - in: query
 *         name: position
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, maximum: 20 }
 *     responses:
 *       200:
 *         description: Ads list
 *
 * /api/public/menu/{menuId}/ads:
 *   get:
 *     tags: [Public]
 *     summary: Menu custom ads
 *     security: []
 *     parameters:
 *       - in: path
 *         name: menuId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Menu ads
 *
 * /api/public/plans:
 *   get:
 *     tags: [Public]
 *     summary: Active subscription plans
 *     security: []
 *     responses:
 *       200:
 *         description: Plans list
 *
 * /api/public/homepage-featured-logos:
 *   get:
 *     tags: [Public]
 *     summary: Landing page trusted-by logos
 *     security: []
 *     responses:
 *       200:
 *         description: Logos list
 *
 * /api/public/version:
 *   post:
 *     tags: [Public]
 *     summary: Mobile app version check
 *     security: []
 *     responses:
 *       200:
 *         description: Version check result
 *
 * /api/public/version/latest:
 *   get:
 *     tags: [Public]
 *     summary: Latest mobile version record
 *     security: []
 *     responses:
 *       200:
 *         description: Version record
 */

export {};
