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
 *     responses:
 *       200:
 *         description: Updated
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
