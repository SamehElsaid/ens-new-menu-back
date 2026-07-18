/**
 * @openapi
 * /api/menus/{menuId}/tables:
 *   get:
 *     tags: [Tables]
 *     summary: List menu tables
 *     description: |
 *       QR table codes for dine-in ordering. **Pro plan** required.
 *       Table numbers appear in public menu URLs: `?tableNumber=T-5` or `?tableId=12`.
 *       Staff receive table orders via `/api/staff-auth/table-calls`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         description: All tables for the menu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tables:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/MenuTable' }
 *             example:
 *               tables:
 *                 - id: 12
 *                   menuId: 42
 *                   tableNumber: "T-5"
 *                   seats: 4
 *                   isActive: true
 *                 - id: 13
 *                   menuId: 42
 *                   tableNumber: "VIP-1"
 *                   seats: 8
 *                   isActive: true
 *       404:
 *         description: Menu not found
 *
 *   post:
 *     tags: [Tables]
 *     summary: Create table
 *     description: |
 *       `tableNumber` must be unique per menu (letters/numbers/Arabic, max 50 chars).
 *       Used when printing QR codes for each table.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tableNumber]
 *             properties:
 *               tableNumber:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: "T-5"
 *               seats: { type: integer, minimum: 1, example: 4 }
 *               isActive: { type: boolean, example: true }
 *           example:
 *             tableNumber: "T-5"
 *             seats: 4
 *             isActive: true
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             example:
 *               message: "Table created successfully"
 *               table:
 *                 id: 12
 *                 menuId: 42
 *                 tableNumber: "T-5"
 *                 seats: 4
 *                 isActive: true
 *       400:
 *         description: Invalid tableNumber or duplicate
 *
 * /api/menus/{menuId}/tables/{tableId}:
 *   get:
 *     tags: [Tables]
 *     summary: Get table by ID
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: tableId
 *         required: true
 *         schema: { type: integer, example: 12 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               table:
 *                 id: 12
 *                 menuId: 42
 *                 tableNumber: "T-5"
 *                 seats: 4
 *                 isActive: true
 *       404:
 *         description: Table not found
 *
 *   put:
 *     tags: [Tables]
 *     summary: Update table
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: tableId
 *         required: true
 *         schema: { type: integer, example: 12 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             tableNumber: "T-5A"
 *             seats: 6
 *             isActive: false
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Table updated successfully"
 *       400:
 *         description: Duplicate tableNumber or no fields
 *       404:
 *         description: Table not found
 *
 *   delete:
 *     tags: [Tables]
 *     summary: Delete table
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: tableId
 *         required: true
 *         schema: { type: integer, example: 12 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Table deleted successfully"
 *       404:
 *         description: Table not found
 */

export {};
