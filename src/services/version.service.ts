import { getPool, sql } from "../config/database";
import { ensureAppVersionSchema } from "../schemas/appVersion.schema";

export interface AppVersion {
  latestVersion: string;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotes_ar: string | null;
  releaseNotes_en: string | null;
  updatedAt?: string;
}

function mapRow(row: Record<string, unknown>): AppVersion {
  return {
    latestVersion: String(row.latestVersion ?? ""),
    forceUpdate: Boolean(row.forceUpdate),
    downloadUrl: String(row.downloadUrl ?? ""),
    releaseNotes_ar:
      row.releaseNotes_ar != null ? String(row.releaseNotes_ar) : null,
    releaseNotes_en:
      row.releaseNotes_en != null ? String(row.releaseNotes_en) : null,
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt != null
          ? String(row.updatedAt)
          : undefined,
  };
}

export async function getLatestAppVersion(): Promise<AppVersion | null> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT TOP 1
      latestVersion,
      forceUpdate,
      downloadUrl,
      releaseNotes_ar,
      releaseNotes_en,
      updatedAt
    FROM AppVersion
    ORDER BY id DESC
  `);

  if (result.recordset.length === 0) {
    return null;
  }

  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export interface CreateAppVersionInput {
  latestVersion: string;
  forceUpdate: boolean;
  downloadUrl: string;
  releaseNotes_ar?: string | null;
  releaseNotes_en?: string | null;
}

export async function createAppVersion(
  input: CreateAppVersionInput,
): Promise<AppVersion> {
  await ensureAppVersionSchema();
  const pool = await getPool();

  await pool
    .request()
    .input("latestVersion", sql.NVarChar(32), input.latestVersion)
    .input("forceUpdate", sql.Bit, input.forceUpdate ? 1 : 0)
    .input("downloadUrl", sql.NVarChar(2048), input.downloadUrl)
    .input("releaseNotes_ar", sql.NVarChar(sql.MAX), input.releaseNotes_ar ?? null)
    .input("releaseNotes_en", sql.NVarChar(sql.MAX), input.releaseNotes_en ?? null)
    .query(`
      INSERT INTO AppVersion (
        latestVersion,
        forceUpdate,
        downloadUrl,
        releaseNotes_ar,
        releaseNotes_en,
        updatedAt
      )
      VALUES (
        @latestVersion,
        @forceUpdate,
        @downloadUrl,
        @releaseNotes_ar,
        @releaseNotes_en,
        SYSUTCDATETIME()
      )
    `);

  const created = await getLatestAppVersion();
  if (!created) {
    throw new Error("App version row missing after insert");
  }
  return created;
}
