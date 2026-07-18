/**
 * @openapi
 * /api/staff-permissions/catalog:
 *   get:
 *     tags: [Staff]
 *     summary: Staff permission catalog
 *     description: |
 *       Static catalog of assignable staff permissions (RBAC). Roles are dynamic
 *       per-menu, but the set of permissions is fixed in code. Human labels are
 *       resolved on the client via i18n using `labelKey` / `descriptionKey`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               groups: [orders, menu, dashboard, delivery, staff, settings, analytics, ads]
 *               permissions:
 *                 - key: "orders:view"
 *                   labelKey: "StaffPermissions.keys.orders:view"
 *                   descriptionKey: "StaffPermissions.descriptions.orders:view"
 *                   group: orders
 *                   dependsOn: []
 *                 - key: "orders:complete"
 *                   labelKey: "StaffPermissions.keys.orders:complete"
 *                   descriptionKey: "StaffPermissions.descriptions.orders:complete"
 *                   group: orders
 *                   dependsOn: ["orders:view", "orders:confirm"]
 *
 * /api/menus/{menuId}/staff-roles:
 *   get:
 *     tags: [Staff]
 *     summary: List staff roles
 *     description: Dynamic per-menu roles (RBAC). **Pro plan** required.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               roles:
 *                 - id: 3
 *                   menuId: 42
 *                   name: "Cashier"
 *                   permissions: ["dashboard:access", "orders:view", "orders:confirm", "orders:complete"]
 *                   isDefault: true
 *                   staffCount: 2
 *
 *   post:
 *     tags: [Staff]
 *     summary: Create staff role
 *     description: |
 *       Permissions must be keys from `GET /api/staff-permissions/catalog`.
 *       Missing dependencies are auto-included on save.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             name: "Food preparer"
 *             permissions: ["orders:prepare"]
 *     responses:
 *       201:
 *         content:
 *           application/json:
 *             example:
 *               role:
 *                 id: 5
 *                 menuId: 42
 *                 name: "Food preparer"
 *                 permissions: ["orders:view", "orders:prepare"]
 *                 isDefault: false
 *                 staffCount: 0
 *       400:
 *         description: Invalid permission or missing name
 *       409:
 *         description: Role name already exists
 *
 * /api/menus/{menuId}/staff-roles/{roleId}:
 *   get:
 *     tags: [Staff]
 *     summary: Get staff role
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: integer, example: 3 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               role:
 *                 id: 3
 *                 menuId: 42
 *                 name: "Cashier"
 *                 permissions: ["dashboard:access", "orders:view", "orders:complete"]
 *                 isDefault: true
 *                 staffCount: 2
 *       404:
 *         description: Role not found
 *   put:
 *     tags: [Staff]
 *     summary: Update staff role
 *     description: |
 *       Editing cannot remove the last role that grants `dashboard:access`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: integer, example: 3 }
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             name: "Senior cashier"
 *             permissions: ["orders:view", "orders:confirm", "orders:complete"]
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               role:
 *                 id: 3
 *                 menuId: 42
 *                 name: "Senior cashier"
 *                 permissions: ["dashboard:access", "orders:view", "orders:confirm", "orders:complete"]
 *                 isDefault: true
 *                 staffCount: 2
 *       409:
 *         description: Role name exists or last dashboard-access role
 *   delete:
 *     tags: [Staff]
 *     summary: Delete staff role
 *     description: |
 *       Fails when the role is still assigned to staff, or when it is the last
 *       role granting `dashboard:access`.
 *     security: [{ ApiKeyAuth: [], BearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/menuId'
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: integer, example: 5 }
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             example:
 *               message: "Role deleted successfully"
 *       409:
 *         description: Role in use or last dashboard-access role
 */

export {};
