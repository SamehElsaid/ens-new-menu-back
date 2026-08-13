import fs from "fs/promises";
import path from "path";
import { executeTransaction, getPool } from "../config/database";
import { logger } from "../utils/logger";

const MENU_SCOPED_TABLES = [
  "HomepageFeaturedLogos",
  "MenuActivityLog",
  "MenuAuditLog",
  "MenuBrandingEvents",
  "MenuBulkImportUsage",
  "MenuItemViewEvents",
  "MenuOrders",
  "MenuTables",
  "MenuViewEvents",
  "StaffTableCalls",
  "UserMenuPermission",
] as const;

const USER_SCOPED_TABLES: ReadonlyArray<{
  table: string;
  column: string;
}> = [
  { table: "AdminFollowUpCalls", column: "userId" },
  { table: "AdminPermissions", column: "adminUserId" },
  { table: "DomainTransferRequests", column: "userId" },
  { table: "EmailVerifications", column: "userId" },
  { table: "ExtraMenuPurchases", column: "userId" },
  { table: "HomepageFeaturedLogos", column: "userId" },
  { table: "MenuBulkImportUsage", column: "userId" },
  { table: "Notifications", column: "userId" },
  { table: "PasswordResets", column: "userId" },
  { table: "PhoneVerifications", column: "userId" },
  { table: "RefreshTokens", column: "userId" },
  { table: "SocialAccounts", column: "userId" },
  { table: "SubscriptionCheckouts", column: "userId" },
  { table: "Subscriptions", column: "userId" },
  { table: "TokenBlacklist", column: "userId" },
  { table: "UserAddresses", column: "userId" },
  { table: "UserAdminActivityLog", column: "userId" },
  { table: "UserBlockedVouchers", column: "userId" },
  { table: "UserDashboardPagePermission", column: "userId" },
  { table: "UserDeliveryGovernorates", column: "userId" },
  { table: "UserInternalNotes", column: "userId" },
  { table: "UserMenuPermission", column: "userId" },
  { table: "UserSupportCases", column: "userId" },
  { table: "VoucherRedemptions", column: "user_id" },
  { table: "subscriptionCheckout", column: "user_id" },
];

function deleteByTempTableSql(
  table: string,
  column: string,
  tempTable: "#AccountMenus" | "#AccountUsers",
): string {
  return `
    IF OBJECT_ID(N'dbo.${table}', N'U') IS NOT NULL
    BEGIN
      EXEC(N'
        DELETE target
        FROM dbo.[${table}] target
        INNER JOIN ${tempTable} owned
          ON TRY_CONVERT(INT, target.[${column}]) = owned.id
      ');
    END
  `;
}

function localUploadPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  let pathname = value.trim();
  try {
    if (/^https?:\/\//i.test(pathname)) {
      pathname = new URL(pathname).pathname;
    }
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const marker = "/uploads/";
  const markerIndex = pathname.toLowerCase().indexOf(marker);
  if (markerIndex < 0) return null;

  const relativePath = pathname
    .slice(markerIndex + marker.length)
    .replace(/^[/\\]+/, "");
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const resolved = path.resolve(uploadsRoot, relativePath);
  if (!resolved.startsWith(`${uploadsRoot}${path.sep}`)) return null;
  return resolved;
}

async function collectOwnedUploadPaths(userId: number): Promise<string[]> {
  const pool = await getPool();
  const result = await pool.request().input("userId", userId).query(`
    SELECT value
    FROM (
      SELECT profileImage AS value FROM dbo.Users WHERE id = @userId
      UNION ALL
      SELECT logo FROM dbo.Menus WHERE userId = @userId
      UNION ALL
      SELECT footerLogo FROM dbo.Menus WHERE userId = @userId
      UNION ALL
      SELECT c.image
      FROM dbo.Categories c
      INNER JOIN dbo.Menus m ON m.id = c.menuId
      WHERE m.userId = @userId
      UNION ALL
      SELECT mi.image
      FROM dbo.MenuItems mi
      INNER JOIN dbo.Menus m ON m.id = mi.menuId
      WHERE m.userId = @userId
      UNION ALL
      SELECT a.imageUrl
      FROM dbo.Ads a
      INNER JOIN dbo.Menus m ON m.id = a.menuId
      WHERE m.userId = @userId
      UNION ALL
      SELECT h.logo
      FROM dbo.HomepageFeaturedLogos h
      WHERE h.userId = @userId
    ) images
    WHERE value IS NOT NULL AND LTRIM(RTRIM(value)) <> ''
  `);

  return [
    ...new Set(
      result.recordset
        .map((row: { value?: unknown }) => localUploadPath(row.value))
        .filter((filePath: string | null): filePath is string => filePath != null),
    ),
  ];
}

async function collectRemainingUploadPaths(): Promise<Set<string>> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT value
    FROM (
      SELECT profileImage AS value FROM dbo.Users
      UNION ALL
      SELECT logo FROM dbo.Menus
      UNION ALL
      SELECT footerLogo FROM dbo.Menus
      UNION ALL
      SELECT image FROM dbo.Categories
      UNION ALL
      SELECT image FROM dbo.MenuItems
      UNION ALL
      SELECT imageUrl FROM dbo.Ads
      UNION ALL
      SELECT logo FROM dbo.HomepageFeaturedLogos
    ) images
    WHERE value IS NOT NULL AND LTRIM(RTRIM(value)) <> ''
  `);

  return new Set(
    result.recordset
      .map((row: { value?: unknown }) => localUploadPath(row.value))
      .filter((filePath: string | null): filePath is string => filePath != null),
  );
}

function deleteDomainTransferMessagesSql(): string {
  return `
    IF OBJECT_ID(N'dbo.DomainTransferMessages', N'U') IS NOT NULL
       AND OBJECT_ID(N'dbo.DomainTransferRequests', N'U') IS NOT NULL
    BEGIN
      EXEC(N'
        DELETE messages
        FROM dbo.DomainTransferMessages messages
        INNER JOIN dbo.DomainTransferRequests requests
          ON requests.id = messages.requestId
        INNER JOIN #AccountUsers users
          ON users.id = requests.userId
      ');
    END
  `;
}

function deleteCheckoutPaymentsSql(): string {
  return `
    IF OBJECT_ID(N'dbo.payments', N'U') IS NOT NULL
       AND OBJECT_ID(N'dbo.subscriptionCheckout', N'U') IS NOT NULL
    BEGIN
      EXEC(N'
        DELETE payments
        FROM dbo.payments payments
        INNER JOIN dbo.subscriptionCheckout checkout
          ON checkout.id = payments.order_id
        INNER JOIN #AccountUsers users
          ON users.id = checkout.user_id
      ');
    END
  `;
}

function deleteStaffDataSql(): string {
  return `
    IF OBJECT_ID(N'dbo.MenuStaffGrants', N'U') IS NOT NULL
       AND OBJECT_ID(N'dbo.MenuStaff', N'U') IS NOT NULL
    BEGIN
      DELETE grants
      FROM dbo.MenuStaffGrants grants
      INNER JOIN dbo.MenuStaff staff ON staff.id = grants.staffId
      INNER JOIN #AccountUsers users
        ON users.id = staff.ownerUserId;
    END

    IF OBJECT_ID(N'dbo.MenuStaffGrants', N'U') IS NOT NULL
    BEGIN
      DELETE grants
      FROM dbo.MenuStaffGrants grants
      INNER JOIN #AccountMenus menus ON menus.id = grants.menuId;
    END

    IF OBJECT_ID(N'dbo.MenuStaff', N'U') IS NOT NULL
    BEGIN
      DELETE staff
      FROM dbo.MenuStaff staff
      WHERE EXISTS (
        SELECT 1 FROM #AccountUsers users
        WHERE users.id = staff.ownerUserId
      )
      OR EXISTS (
        SELECT 1 FROM #AccountMenus menus
        WHERE menus.id = TRY_CONVERT(INT, staff.menuId)
      );
    END

    IF OBJECT_ID(N'dbo.MenuStaffRoles', N'U') IS NOT NULL
    BEGIN
      DELETE roles
      FROM dbo.MenuStaffRoles roles
      INNER JOIN #AccountUsers users ON users.id = roles.ownerUserId;
    END
  `;
}

export async function permanentlyDeleteOwnerAccount(
  userId: number,
): Promise<void> {
  const uploadPaths = await collectOwnedUploadPaths(userId);

  await executeTransaction(async (transaction) => {
    const menuScopedDeletes = MENU_SCOPED_TABLES.map((table) =>
      deleteByTempTableSql(table, "menuId", "#AccountMenus"),
    ).join("\n");
    const userScopedDeletes = USER_SCOPED_TABLES.map(({ table, column }) =>
      deleteByTempTableSql(table, column, "#AccountUsers"),
    ).join("\n");

    await transaction
      .request()
      .input("userId", userId)
      .query(`
        CREATE TABLE #AccountUsers (id INT NOT NULL PRIMARY KEY);

        ;WITH ownedUsers AS (
          SELECT id FROM dbo.Users WHERE id = @userId
          UNION ALL
          SELECT child.id
          FROM dbo.Users child
          INNER JOIN ownedUsers parent ON child.ownerUserId = parent.id
        )
        INSERT INTO #AccountUsers (id)
        SELECT DISTINCT id FROM ownedUsers
        OPTION (MAXRECURSION 100);

        CREATE TABLE #AccountMenus (id INT NOT NULL PRIMARY KEY);
        INSERT INTO #AccountMenus (id)
        SELECT menus.id
        FROM dbo.Menus menus
        INNER JOIN #AccountUsers users ON users.id = menus.userId;

        ${deleteDomainTransferMessagesSql()}
        ${deleteCheckoutPaymentsSql()}
        ${menuScopedDeletes}
        ${deleteStaffDataSql()}

        DELETE menus
        FROM dbo.Menus menus
        INNER JOIN #AccountMenus owned ON owned.id = menus.id;

        ${userScopedDeletes}

        UPDATE users
        SET ownerUserId = NULL
        FROM dbo.Users users
        INNER JOIN #AccountUsers owned ON owned.id = users.id;

        DELETE users
        FROM dbo.Users users
        INNER JOIN #AccountUsers owned ON owned.id = users.id;
      `);
  });

  let removablePaths: string[] = [];
  try {
    const remainingPaths = await collectRemainingUploadPaths();
    removablePaths = uploadPaths.filter(
      (filePath) => !remainingPaths.has(filePath),
    );
  } catch (error) {
    // Shared image URLs are possible after copying a menu. If the reference
    // check fails, retain files rather than breaking another owner's menu.
    logger.warn("Skipped account upload cleanup: reference check failed", {
      error,
    });
    return;
  }

  const cleanupResults = await Promise.allSettled(
    removablePaths.map((filePath) => fs.rm(filePath, { force: true })),
  );
  cleanupResults.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.warn("Failed to remove account upload after deletion", {
        filePath: removablePaths[index],
        error: result.reason,
      });
    }
  });
}
