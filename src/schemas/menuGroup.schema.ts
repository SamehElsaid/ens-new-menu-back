import { getPool, sql } from "../config/database";

/** Named menu groups for shared delivery orders + geo redirect. */
export async function ensureMenuGroupSchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('Menus', 'primaryMenuId') IS NULL
    BEGIN
      ALTER TABLE Menus ADD primaryMenuId INT NULL;
    END

    IF COL_LENGTH('StaffTableCalls', 'sourceMenuId') IS NULL
    BEGIN
      ALTER TABLE StaffTableCalls ADD sourceMenuId INT NULL;
    END

    IF NOT EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MenuGroups'
    )
    BEGIN
      CREATE TABLE MenuGroups (
        id INT IDENTITY(1,1) PRIMARY KEY,
        userId INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        inboxMenuId INT NULL,
        createdAt DATETIME2 NOT NULL CONSTRAINT DF_MenuGroups_createdAt DEFAULT GETDATE(),
        updatedAt DATETIME2 NOT NULL CONSTRAINT DF_MenuGroups_updatedAt DEFAULT GETDATE(),
        CONSTRAINT FK_MenuGroups_Users FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
      );

      CREATE INDEX IX_MenuGroups_userId ON MenuGroups(userId);
    END

    IF COL_LENGTH('Menus', 'menuGroupId') IS NULL
    BEGIN
      ALTER TABLE Menus ADD menuGroupId INT NULL;
    END
  `);

  await migrateLegacyPrimaryLinksToMenuGroups(pool);
}

async function migrateLegacyPrimaryLinksToMenuGroups(
  pool: Awaited<ReturnType<typeof getPool>>,
): Promise<void> {
  const pending = await pool.request().query(`
    SELECT
      cm.menuId,
      cm.userId,
      cm.clusterRoot
    FROM (
      SELECT
        m.id AS menuId,
        m.userId,
        CASE
          WHEN m.primaryMenuId IS NOT NULL AND m.primaryMenuId > 0 THEN m.primaryMenuId
          ELSE m.id
        END AS clusterRoot
      FROM Menus m
      WHERE m.menuGroupId IS NULL
        AND (
          (m.primaryMenuId IS NOT NULL AND m.primaryMenuId > 0)
          OR EXISTS (SELECT 1 FROM Menus c WHERE c.primaryMenuId = m.id)
        )
    ) cm
    ORDER BY cm.clusterRoot, cm.menuId
  `);

  const rows = pending.recordset as {
    menuId: number;
    userId: number;
    clusterRoot: number;
  }[];

  if (rows.length === 0) return;

  const clusters = new Map<
    number,
    { userId: number; menuIds: number[] }
  >();

  for (const row of rows) {
    const root = Number(row.clusterRoot);
    const menuId = Number(row.menuId);
    const userId = Number(row.userId);
    if (!Number.isFinite(root) || !Number.isFinite(menuId)) continue;

    const existing = clusters.get(root);
    if (existing) {
      existing.menuIds.push(menuId);
    } else {
      clusters.set(root, { userId, menuIds: [menuId] });
    }
  }

  for (const [clusterRoot, cluster] of clusters) {
    const uniqueMenuIds = [...new Set(cluster.menuIds)].filter(
      (id) => Number.isFinite(id) && id > 0,
    );
    if (uniqueMenuIds.length < 2) continue;

    const alreadyGrouped = await pool
      .request()
      .input("menuId", sql.Int, uniqueMenuIds[0])
      .query(`SELECT menuGroupId FROM Menus WHERE id = @menuId`);

    if (alreadyGrouped.recordset[0]?.menuGroupId != null) continue;

    const inboxMenuId = uniqueMenuIds.includes(clusterRoot)
      ? clusterRoot
      : Math.min(...uniqueMenuIds);

    const insert = await pool
      .request()
      .input("userId", sql.Int, cluster.userId)
      .input("name", sql.NVarChar, `مجموعة #${inboxMenuId}`)
      .input("inboxMenuId", sql.Int, inboxMenuId)
      .query(`
        INSERT INTO MenuGroups (userId, name, inboxMenuId)
        OUTPUT INSERTED.id
        VALUES (@userId, @name, @inboxMenuId)
      `);

    const groupId = Number(insert.recordset[0]?.id);
    if (!Number.isFinite(groupId) || groupId <= 0) continue;

    for (const menuId of uniqueMenuIds) {
      await pool
        .request()
        .input("groupId", sql.Int, groupId)
        .input("menuId", sql.Int, menuId)
        .query(`
          UPDATE Menus
          SET menuGroupId = @groupId, primaryMenuId = NULL
          WHERE id = @menuId AND menuGroupId IS NULL
        `);
    }
  }
}
