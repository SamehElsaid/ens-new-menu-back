/**
 * @openapi
 * /api/menus/{menuId}/customizations:
 *   get:
 *     tags: [Menus]
 *     summary: Get menu theme customizations
 *     description: Colors, fonts, and hero section copy for the public menu.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               primaryColor: "#FF5722"
 *               secondaryColor: "#FFFFFF"
 *               heroTitleAr: "مرحباً بكم"
 *               heroTitleEn: "Welcome"
 *   put:
 *     tags: [Menus]
 *     summary: Update customizations
 *     description: Partial update. Hero copy fields require Pro plan.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             primaryColor: "#FF5722"
 *             heroTitleAr: "أهلاً بكم في مطعمنا"
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     tags: [Menus]
 *     summary: Reset customizations to theme defaults
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Customizations reset to default"
 */

export {};
