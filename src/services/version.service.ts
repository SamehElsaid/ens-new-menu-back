import { getPool } from "../config/database";

export interface AppVersion {
  latestVersion: string;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotes: string | null;
  updatedAt?: string;
}

function mapRow(row: Record<string, unknown>): AppVersion {
  return {
    latestVersion: String(row.latestVersion ?? ""),
    forceUpdate: Boolean(row.forceUpdate),
    downloadUrl: String(row.downloadUrl ?? ""),
    releaseNotes:
      row.releaseNotes != null ? String(row.releaseNotes) : null,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt != null
          ? String(row.updatedAt)
          : undefined,
  };
}

export async function getAppVersion(): Promise<AppVersion | null> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP 1
      latestVersion,
      forceUpdate,
      downloadUrl,
      releaseNotes,
      updatedAt
    FROM AppVersion
    WHERE id = 1
  `);

  if (result.recordset.length === 0) {
    return null;
  }

  return mapRow(result.recordset[0] as Record<string, unknown>);
}
