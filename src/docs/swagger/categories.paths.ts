/**
 * @openapi
 * /api/menu-groups:
 *   get:
 *     tags: [Menu Groups]
 *     summary: List menu groups (Pro)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Groups list
 *   post:
 *     tags: [Menu Groups]
 *     summary: Create menu group (Pro)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, menuIds]
 *             properties:
 *               name: { type: string }
 *               menuIds:
 *                 type: array
 *                 minItems: 2
 *                 items: { type: integer }
 *     responses:
 *       201:
 *         description: Group created
 *
 * /api/menu-groups/{groupId}:
 *   put:
 *     tags: [Menu Groups]
 *     summary: Update menu group (Pro)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Menu Groups]
 *     summary: Delete menu group (Pro)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/menu-groups/{groupId}/menus:
 *   post:
 *     tags: [Menu Groups]
 *     summary: Add menu to group (Pro)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [menuId]
 *             properties:
 *               menuId: { type: integer }
 *     responses:
 *       200:
 *         description: Menu added
 *
 * /api/menus/{menuId}/categories:
 *   get:
 *     tags: [Categories]
 *     summary: List categories
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         description: Categories
 *   post:
 *     tags: [Categories]
 *     summary: Create category
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/menus/{menuId}/categories/bulk:
 *   post:
 *     tags: [Categories]
 *     summary: Bulk import categories & items
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         description: Import result
 *
 * /api/menus/{menuId}/categories/bulk/canuse:
 *   get:
 *     tags: [Categories]
 *     summary: Check bulk import quota
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         description: Quota info
 *
 * /api/menus/{menuId}/categories/{categoryId}:
 *   get:
 *     tags: [Categories]
 *     summary: Get category
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Category
 *   put:
 *     tags: [Categories]
 *     summary: Update category
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Categories]
 *     summary: Delete category
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/menus/{menuId}/ads:
 *   get:
 *     tags: [Ads]
 *     summary: List menu ads
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         description: Ads list
 *   post:
 *     tags: [Ads]
 *     summary: Create menu ad
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       201:
 *         description: Ad created
 *
 * /api/ads/{adId}:
 *   put:
 *     tags: [Ads]
 *     summary: Update ad
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Ads]
 *     summary: Delete ad
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/ads/{adId}/toggle:
 *   patch:
 *     tags: [Ads]
 *     summary: Toggle ad status
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: adId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Toggled
 */

export {};
