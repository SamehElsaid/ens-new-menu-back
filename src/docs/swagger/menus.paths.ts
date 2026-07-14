/**
 * @openapi
 * /api/menus/check-slug:
 *   get:
 *     tags: [Menus]
 *     summary: Check slug availability
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: slug
 *         required: true
 *         schema: { type: string, minLength: 3, maxLength: 100 }
 *     responses:
 *       200:
 *         description: Availability
 *
 * /api/menus:
 *   get:
 *     tags: [Menus]
 *     summary: Get user's menus
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/locale'
 *     responses:
 *       200:
 *         description: Menus list
 *   post:
 *     tags: [Menus]
 *     summary: Create menu
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nameAr, nameEn, logo]
 *             properties:
 *               nameAr: { type: string }
 *               nameEn: { type: string }
 *               descriptionAr: { type: string }
 *               descriptionEn: { type: string }
 *               slug: { type: string }
 *               logo: { type: string }
 *               theme: { type: string }
 *     responses:
 *       201:
 *         description: Menu created
 *
 * /api/menus/{menuId}/copy:
 *   post:
 *     tags: [Menus]
 *     summary: Copy menu shape and settings
 *     description: |
 *       Creates a new menu from an existing one. Requires Arabic/English names
 *       and a new slug. Copies design (theme, customizations), settings (wifi,
 *       tax, service, social, hours, delivery flags/zones), descriptions, and logo.
 *       Does not copy categories, items, staff, tables, ads, or group membership.
 *       Subject to the same active menu plan limit as create.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nameAr, nameEn, slug]
 *             properties:
 *               nameAr:
 *                 type: string
 *                 maxLength: 255
 *                 example: فرع جديد
 *               nameEn:
 *                 type: string
 *                 maxLength: 255
 *                 example: New Branch
 *               slug:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: my-new-branch
 *           example:
 *             nameAr: فرع جديد
 *             nameEn: New Branch
 *             slug: my-new-branch
 *     responses:
 *       201:
 *         description: Menu copied
 *         content:
 *           application/json:
 *             example:
 *               message: Menu copied successfully
 *               menuId: 42
 *               uuid: 550e8400-e29b-41d4-a716-446655440000
 *               slug: my-new-branch
 *               nameAr: فرع جديد
 *               nameEn: New Branch
 *               logo: https://cdn.example.com/logo.png
 *               theme: default
 *               currency: EGP
 *               isActive: true
 *       400:
 *         description: Missing names, invalid slug, or source menu has no logo
 *       403:
 *         description: Menu limit reached or staff not allowed
 *       404:
 *         description: Source menu not found
 *       409:
 *         description: Slug already taken
 *
 * /api/menus/{menuId}/analytics:
 *   get:
 *     tags: [Menus]
 *     summary: Menu analytics (Pro)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: query
 *         name: period
 *         schema: { type: string, enum: [7d, 30d, 90d] }
 *     responses:
 *       200:
 *         description: Analytics data
 *
 * /api/menus/{menuId}/ratings:
 *   get:
 *     tags: [Menus]
 *     summary: List customer ratings for a menu
 *     description: |
 *       Returns paginated customer ratings for a menu the caller owns
 *       (or cashier staff assigned to). Includes optional contact fields.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 12 }
 *       - in: query
 *         name: q
 *         schema: { type: string, maxLength: 100 }
 *         description: Search name, phone, email, or comment
 *     responses:
 *       200:
 *         description: Ratings list
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 ratings:
 *                   - id: 12
 *                     stars: 5
 *                     comment: Great food
 *                     customerName: Ahmed
 *                     customerPhone: "+201012345678"
 *                     customerEmail: ahmed@example.com
 *                     createdAt: "2026-07-14T12:00:00.000Z"
 *                 summary:
 *                   total: 42
 *                   average: 4.5
 *                 pagination:
 *                   total: 42
 *                   page: 1
 *                   limit: 12
 *                   totalPages: 4
 *       404:
 *         description: Menu not found or no access
 *
 * /api/menus/{menuId}/audit-logs:
 *   get:
 *     tags: [Menus]
 *     summary: Menu audit trail
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Audit logs
 *
 * /api/menus/{id}:
 *   get:
 *     tags: [Menus]
 *     summary: Get menu by ID or UUID
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Menu details
 *   put:
 *     tags: [Menus]
 *     summary: Update menu
 *     description: |
 *       Updates menu profile and optional settings. WiFi (name/password), tax percent,
 *       and service percent are optional and gated by their enabled flags (default off).
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               wifiEnabled: { type: boolean }
 *               wifiName: { type: string, nullable: true, maxLength: 255 }
 *               wifiPassword: { type: string, nullable: true, maxLength: 255 }
 *               taxEnabled: { type: boolean }
 *               taxPercent: { type: number, nullable: true, minimum: 0, maximum: 100 }
 *               serviceEnabled: { type: boolean }
 *               servicePercent: { type: number, nullable: true, minimum: 0, maximum: 100 }
 *           example:
 *             wifiEnabled: true
 *             wifiName: Guest-WiFi
 *             wifiPassword: cafe1234
 *             taxEnabled: true
 *             taxPercent: 14
 *             serviceEnabled: false
 *             servicePercent: 12
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             example:
 *               message: Menu updated successfully
 *   delete:
 *     tags: [Menus]
 *     summary: Delete menu
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/menus/{id}/status:
 *   put:
 *     tags: [Menus]
 *     summary: Toggle menu active status
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Status toggled
 *
 * /api/menus/{menuId}/items:
 *   get:
 *     tags: [Menus]
 *     summary: List menu items
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - $ref: '#/components/parameters/locale'
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: categoryId
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Items list
 *   post:
 *     tags: [Menus]
 *     summary: Create menu item
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nameAr, nameEn]
 *     responses:
 *       201:
 *         description: Item created
 *
 * /api/menus/{menuId}/items/reorder:
 *   post:
 *     tags: [Menus]
 *     summary: Reorder menu items
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     sortOrder: { type: integer }
 *     responses:
 *       200:
 *         description: Order updated
 *
 * /api/menus/{menuId}/items/{itemId}:
 *   get:
 *     tags: [Menus]
 *     summary: Get single item
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Item details
 *   put:
 *     tags: [Menus]
 *     summary: Update item
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Menus]
 *     summary: Delete item
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 */

export {};
