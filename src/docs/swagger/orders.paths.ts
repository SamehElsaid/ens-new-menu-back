/**
 * @openapi
 * /api/public/staff-call:
 *   post:
 *     tags: [Orders]
 *     summary: Submit guest order / staff call
 *     description: |
 *       **Public — no JWT.** Primary endpoint for customer orders from the menu app.
 *
 *       **Table order** (`type: table`):
 *       - Set `tableNumber` from QR scan
 *       - Notifies staff via socket + persists as table call
 *
 *       **Delivery order** (`type: delivery`):
 *       - Set `customerName`, `customerPhone`, `customerAddress`
 *       - **Governorates mode**: pass `governorateId`
 *       - **Distance mode**: pass `branchId`, `customerLat`, `customerLng`
 *
 *       Optional `items` array for cart lines. `status` defaults to `pending`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/GuestStaffCallRequest' }
 *           examples:
 *             tableOrder:
 *               summary: Dine-in from QR table T-5
 *               value:
 *                 menuId: 42
 *                 type: table
 *                 tableNumber: "T-5"
 *                 customerName: "Mohamed"
 *                 orderNotes: "No ice"
 *                 status: pending
 *                 items:
 *                   - itemId: 101
 *                     name: "Orange Juice"
 *                     quantity: 2
 *                     price: 35
 *             deliveryGovernorates:
 *               summary: Home delivery (governorates mode)
 *               value:
 *                 menuId: 42
 *                 type: delivery
 *                 customerName: "Ahmed Hassan"
 *                 customerPhone: "+201012345678"
 *                 customerAddress: "15 El Tahrir St, Nasr City"
 *                 governorateId: 4
 *                 orderNotes: "Ring doorbell twice"
 *                 status: pending
 *             deliveryDistance:
 *               summary: Home delivery (distance mode)
 *               value:
 *                 menuId: 42
 *                 type: delivery
 *                 customerName: "Sara"
 *                 customerPhone: "+201098765432"
 *                 customerAddress: "Building 10, Maadi"
 *                 branchId: 3
 *                 customerLat: 29.9602
 *                 customerLng: 31.2569
 *                 status: pending
 *     responses:
 *       201:
 *         description: Order created
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               callId: 9001
 *               status: pending
 *               type: delivery
 *       400:
 *         description: Validation error or delivery not enabled
 *
 * /api/staff-auth/table-calls:
 *   get:
 *     tags: [Orders]
 *     summary: Pending orders (staff app)
 *     description: Live queue for kitchen/cashier. Requires staff JWT.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               calls:
 *                 - id: 9001
 *                   menuId: 42
 *                   type: delivery
 *                   status: pending
 *                   customerName: "Ahmed Hassan"
 *                   customerPhone: "+201012345678"
 *                   tableNumber: null
 *                   items:
 *                     - name: "Burger"
 *                       quantity: 1
 *                       price: 85
 *                   requestedAt: "2026-07-05T12:00:00.000Z"
 *
 * /api/staff-auth/table-calls/history:
 *   get:
 *     tags: [Orders]
 *     summary: Order history (staff app)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 50 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               calls:
 *                 - id: 9000
 *                   status: confirmed
 *                   confirmedAt: "2026-07-05T11:30:00.000Z"
 *               pagination:
 *                 page: 1
 *                 limit: 50
 *                 total: 120
 *
 * /api/staff-auth/table-calls/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get single order
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 9001 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               id: 9001
 *               type: delivery
 *               status: pending
 *               items: []
 *   put:
 *     tags: [Orders]
 *     summary: Replace order items and status
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 9001 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             status: confirmed
 *             items:
 *               - name: "Burger"
 *                 quantity: 2
 *                 price: 85
 *     responses:
 *       200:
 *         description: Updated
 *
 * /api/staff-auth/table-calls/{id}/status:
 *   patch:
 *     tags: [Orders]
 *     summary: Confirm or cancel order
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 9001 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             status: confirmed
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Status updated"
 *               status: confirmed
 *
 * /api/staff-auth/table-calls/{id}/items:
 *   patch:
 *     tags: [Orders]
 *     summary: Edit cart lines (pending or confirmed)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 9001 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             items:
 *               - name: "Burger"
 *                 quantity: 1
 *                 price: 85
 *     responses:
 *       200:
 *         description: Items updated
 *
 * /api/staff-auth/table-calls/{id}/complete:
 *   patch:
 *     tags: [Orders]
 *     summary: Mark order complete (cashier)
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 9001 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Order completed"
 *               status: completed
 *
 * /api/menus/{menuId}/activity-logs:
 *   get:
 *     tags: [Orders]
 *     summary: Order activity log (owner dashboard)
 *     description: Audit trail of table/delivery orders for menu owners.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: q
 *         schema: { type: string, example: "Ahmed" }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               logs:
 *                 - id: 501
 *                   action: TABLE_CALL_CONFIRMED
 *                   summaryEn: "Confirmed delivery order #9001"
 *                   summaryAr: "تأكيد طلب توصيل #9001"
 *               pagination:
 *                 page: 1
 *                 total: 45
 *
 * /api/menus/{menuId}/activity-logs/{id}/actions:
 *   post:
 *     tags: [Orders]
 *     summary: Owner action on order
 *     description: |
 *       Actions: `TABLE_CALL_CONFIRMED`, `TABLE_CALL_CANCELLED`,
 *       `TABLE_CALL_PREPARED`, `TABLE_CALL_DELIVERED`, `TABLE_CALL_COMPLETED`
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 501 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             action: TABLE_CALL_CONFIRMED
 *     responses:
 *       200:
 *         description: Action applied
 */

export {};
