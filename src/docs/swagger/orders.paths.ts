/**
 * @openapi
 * /api/public/staff-call:
 *   post:
 *     tags: [Orders]
 *     summary: Submit guest order / staff call
 *     description: |
 *       **Public — no JWT.** Primary endpoint for customer orders from the menu app.
 *
 *       **Table order** (`type: table`, `requestKind: order` default):
 *       - Set `tableNumber` from QR scan
 *       - Notifies staff via socket + persists as table call
 *       - If an open table order already exists, new items are appended
 *
 *       **Waiter call** (`requestKind: waiter`):
 *       - Requires `tableNumber`; ignores `items`
 *       - Notifies staff that the guest wants a waiter at the table
 *
 *       **Bill request** (`requestKind: bill`):
 *       - Requires `tableNumber`; ignores `items`
 *       - If an open table order exists, attaches a bill flag to that order (no new card)
 *       - Notifies staff that the guest wants the check
 *
 *       **Delivery order** (`type: delivery`):
 *       - Set `customerName`, `customerPhone`, `customerAddress`
 *       - **Governorates mode**: pass `governorateId`
 *       - **Distance mode**: pass `branchId`, `customerLat`, `customerLng`
 *       - Not valid with `requestKind` waiter/bill
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
 *             callWaiter:
 *               summary: Call waiter to table T-5
 *               value:
 *                 menuId: 42
 *                 type: table
 *                 tableNumber: "T-5"
 *                 requestKind: waiter
 *             requestBill:
 *               summary: Ask waiter to bring the bill
 *               value:
 *                 menuId: 42
 *                 type: table
 *                 tableNumber: "T-5"
 *                 requestKind: bill
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
 *       200:
 *         description: Call created
 *         content:
 *           application/json:
 *             examples:
 *               order:
 *                 value:
 *                   ok: true
 *                   id: 9001
 *                   menuId: 42
 *                   tableNumber: "T-5"
 *                   status: pending
 *                   requestKind: order
 *                   orderTotal: 70
 *               waiter:
 *                 value:
 *                   ok: true
 *                   id: 9002
 *                   menuId: 42
 *                   tableNumber: "T-5"
 *                   status: pending
 *                   requestKind: waiter
 *                   items: []
 *                   orderTotal: 0
 *       400:
 *         description: Validation error or delivery not enabled
 *
 * /api/public/staff-call/open:
 *   get:
 *     tags: [Orders]
 *     summary: Get open table order for guest
 *     description: |
 *       **Public — no JWT.** Returns the live open order for a dine-in table
 *       (status pending, confirmed, or prepared). Used by the guest menu View
 *       to show and sync the current table order.
 *
 *       When the cashier finishes the table (delivered) or the order is cancelled,
 *       `call` is null.
 *     security: []
 *     parameters:
 *       - in: query
 *         name: menuId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *         example: 42
 *       - in: query
 *         name: tableNumber
 *         required: true
 *         schema: { type: string, maxLength: 50 }
 *         example: "T-5"
 *     responses:
 *       200:
 *         description: Open call or null
 *         content:
 *           application/json:
 *             examples:
 *               openPending:
 *                 value:
 *                   ok: true
 *                   call:
 *                     id: 9001
 *                     menuId: 42
 *                     tableNumber: "T-5"
 *                     status: pending
 *                     requestKind: order
 *                     orderTotal: 70
 *                     items:
 *                       - name: "Orange Juice"
 *                         menuItemId: 101
 *                         quantity: 2
 *                         price: 35
 *                         total: 70
 *               none:
 *                 value:
 *                   ok: true
 *                   call: null
 *       400:
 *         description: Invalid menuId or tableNumber
 *       403:
 *         description: Pro feature required
 *       404:
 *         description: Menu not found
 *   patch:
 *     tags: [Orders]
 *     summary: Edit pending open table order (guest)
 *     description: |
 *       **Public — no JWT.** Guest replaces the full item list on the open
 *       table order while status is `pending` only.
 *
 *       - Confirmed or prepared orders return 409 NOT_EDITABLE
 *       - Empty `items` cancels the pending order and returns `cancelled: true`
 *       - Staff are notified via activity log + socket
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [menuId, tableNumber, items]
 *             properties:
 *               menuId: { type: integer, minimum: 1 }
 *               tableNumber: { type: string, maxLength: 50 }
 *               items:
 *                 type: array
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   properties:
 *                     menuItemId: { type: integer }
 *                     quantity: { type: integer, minimum: 1 }
 *                     price: { type: number }
 *                     name: { type: string }
 *                     size: { type: object, nullable: true }
 *                     variant: { type: object, nullable: true }
 *           examples:
 *             updateQty:
 *               summary: Change quantities while pending
 *               value:
 *                 menuId: 42
 *                 tableNumber: "T-5"
 *                 items:
 *                   - menuItemId: 101
 *                     quantity: 1
 *                     price: 35
 *             cancelPending:
 *               summary: Remove all items (cancels pending order)
 *               value:
 *                 menuId: 42
 *                 tableNumber: "T-5"
 *                 items: []
 *     responses:
 *       200:
 *         description: Updated or cancelled
 *         content:
 *           application/json:
 *             examples:
 *               updated:
 *                 value:
 *                   ok: true
 *                   cancelled: false
 *                   call:
 *                     id: 9001
 *                     menuId: 42
 *                     tableNumber: "T-5"
 *                     status: pending
 *                     orderTotal: 35
 *               cancelled:
 *                 value:
 *                   ok: true
 *                   cancelled: true
 *                   call: null
 *       400:
 *         description: Invalid payload or table
 *       403:
 *         description: Pro feature required
 *       404:
 *         description: No open order for this table
 *       409:
 *         description: Order is confirmed and no longer guest-editable
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
 *                   requestKind: order
 *                   status: pending
 *                   customerName: "Ahmed Hassan"
 *                   customerPhone: "+201012345678"
 *                   tableNumber: null
 *                   items:
 *                     - name: "Burger"
 *                       quantity: 1
 *                       price: 85
 *                   requestedAt: "2026-07-05T12:00:00.000Z"
 *                 - id: 9002
 *                   menuId: 42
 *                   requestKind: bill
 *                   status: pending
 *                   tableNumber: "T-5"
 *                   items: []
 *                   orderTotal: 0
 *                   at: "2026-07-05T12:05:00.000Z"
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
 * /api/menus/{menuId}/activity-logs/{id}/items:
 *   put:
 *     tags: [Orders]
 *     summary: Replace order items (dashboard)
 *     description: |
 *       Replaces line items on an open table or delivery order.
 *       Dashboard clients send HTTP PUT (legacy `axiosPatch`). PATCH is also accepted.
 *       Not allowed on cancelled or delivered orders.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1180 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             items:
 *               - menuItemId: 2380
 *                 name: "Tahini Plate"
 *                 quantity: 2
 *                 price: 10
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               items:
 *                 - menuItemId: 2380
 *                   name: "Tahini Plate"
 *                   quantity: 2
 *                   price: 10
 *                   total: 20
 *               orderTotal: 20
 *               status: confirmed
 *   patch:
 *     tags: [Orders]
 *     summary: Replace order items (dashboard, PATCH alias)
 *     description: Same as PUT — replaces line items on an open order.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, example: 1180 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             items:
 *               - menuItemId: 2380
 *                 quantity: 1
 *     responses:
 *       200:
 *         description: Items updated
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
