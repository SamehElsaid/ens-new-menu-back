/**
 * @openapi
 * /api/promo:
 *   get:
 *     tags: [CMS]
 *     summary: Get promo data
 *     security: []
 *     responses:
 *       200:
 *         description: Promo
 *   post:
 *     tags: [CMS]
 *     summary: Create/update promo (Admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Saved
 *
 * /api/searchInformation:
 *   get:
 *     tags: [CMS]
 *     summary: List search information
 *     security: []
 *     responses:
 *       200:
 *         description: List
 *   post:
 *     tags: [CMS]
 *     summary: Create search info (Admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/searchInformation/{id}:
 *   get:
 *     tags: [CMS]
 *     summary: Get search info by ID
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Item
 *   put:
 *     tags: [CMS]
 *     summary: Update search info (Admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [CMS]
 *     summary: Delete search info (Admin)
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
 * /api/metaData:
 *   get:
 *     tags: [CMS]
 *     summary: List all meta data
 *     security: []
 *     responses:
 *       200:
 *         description: List
 *   post:
 *     tags: [CMS]
 *     summary: Create meta data (Admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       201:
 *         description: Created
 *
 * /api/metaData/{pageName}:
 *   get:
 *     tags: [CMS]
 *     summary: Get meta data by page name
 *     security: []
 *     parameters:
 *       - in: path
 *         name: pageName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Meta data
 *   put:
 *     tags: [CMS]
 *     summary: Replace meta data (Admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: pageName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated
 *   patch:
 *     tags: [CMS]
 *     summary: Partial update meta data (Admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: pageName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Patched
 *   delete:
 *     tags: [CMS]
 *     summary: Delete meta data (Admin)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: pageName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *
 * /api/public/app-version/latest:
 *   get:
 *     tags: [CMS]
 *     summary: Latest app version (public)
 *     security: []
 *     responses:
 *       200:
 *         description: Version
 */

export {};
