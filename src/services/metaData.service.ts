import { getPool, sql } from "../config/database";
import { ApiError } from "../middleware/errorHandler";
import { ensureMetaDataSchema } from "../schemas/metaData.schema";

export interface MetaData {
  id: number;
  pageName: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  keywordsAr: string;
  keywordsEn: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function mapDateField(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (value != null) return String(value);
  return undefined;
}

function mapRow(row: Record<string, unknown>): MetaData {
  return {
    id: Number(row.id),
    pageName: String(row.pageName ?? ""),
    titleAr: String(row.titleAr ?? ""),
    titleEn: String(row.titleEn ?? ""),
    descriptionAr: String(row.descriptionAr ?? ""),
    descriptionEn: String(row.descriptionEn ?? ""),
    keywordsAr: String(row.keywordsAr ?? ""),
    keywordsEn: String(row.keywordsEn ?? ""),
    updatedAt: mapDateField(row.updatedAt),
    createdAt: mapDateField(row.createdAt),
  };
}

function normalizePageName(pageName: string): string {
  return pageName.trim();
}

export async function getAllMetaData(
  page: number,
  limit: number,
): Promise<PaginatedResult<MetaData>> {
  await ensureMetaDataSchema();
  const pool = await getPool();

  const countResult = await pool.request().query(`
    SELECT COUNT(*) AS total FROM MetaData
  `);
  const total = Number(countResult.recordset[0]?.total ?? 0);

  const offset = (page - 1) * limit;
  const result = await pool
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, limit)
    .query(`
      SELECT id, pageName, titleAr, titleEn, descriptionAr, descriptionEn, keywordsAr, keywordsEn, updatedAt, createdAt
      FROM MetaData
      ORDER BY createdAt DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

  return {
    data: (result.recordset as Record<string, unknown>[]).map(mapRow),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getMetaDataByPageName(
  pageName: string,
): Promise<MetaData | null> {
  await ensureMetaDataSchema();
  const pool = await getPool();

  const result = await pool
    .request()
    .input("pageName", sql.NVarChar(128), normalizePageName(pageName))
    .query(`
      SELECT id, pageName, titleAr, titleEn, descriptionAr, descriptionEn, keywordsAr, keywordsEn, updatedAt, createdAt
      FROM MetaData
      WHERE pageName = @pageName
    `);

  if (result.recordset.length === 0) return null;

  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export type CreateMetaDataInput = Omit<
  MetaData,
  "id" | "updatedAt" | "createdAt"
>;

export type UpdateMetaDataInput = Partial<
  Omit<CreateMetaDataInput, "pageName">
>;

export type ReplaceMetaDataInput = Omit<CreateMetaDataInput, "pageName">;

export async function createMetaData(
  input: CreateMetaDataInput,
): Promise<MetaData> {
  await ensureMetaDataSchema();
  const pool = await getPool();
  const pageName = normalizePageName(input.pageName);

  if (!pageName) {
    throw new ApiError(400, "pageName is required", true, "اسم الصفحة مطلوب");
  }

  const dup = await pool
    .request()
    .input("pageName", sql.NVarChar(128), pageName)
    .query(`SELECT id FROM MetaData WHERE pageName = @pageName`);

  if (dup.recordset.length > 0) {
    throw new ApiError(
      409,
      "pageName already exists",
      true,
      "اسم الصفحة موجود بالفعل",
    );
  }

  const result = await pool
    .request()
    .input("pageName", sql.NVarChar(128), pageName)
    .input("titleAr", sql.NVarChar(512), input.titleAr)
    .input("titleEn", sql.NVarChar(512), input.titleEn)
    .input("descriptionAr", sql.NVarChar(sql.MAX), input.descriptionAr)
    .input("descriptionEn", sql.NVarChar(sql.MAX), input.descriptionEn)
    .input("keywordsAr", sql.NVarChar(sql.MAX), input.keywordsAr)
    .input("keywordsEn", sql.NVarChar(sql.MAX), input.keywordsEn)
    .query(`
      INSERT INTO MetaData (pageName, titleAr, titleEn, descriptionAr, descriptionEn, keywordsAr, keywordsEn, updatedAt, createdAt)
      OUTPUT INSERTED.pageName
      VALUES (@pageName, @titleAr, @titleEn, @descriptionAr, @descriptionEn, @keywordsAr, @keywordsEn, SYSUTCDATETIME(), SYSUTCDATETIME());
    `);

  const insertedPageName = String(result.recordset[0]?.pageName ?? pageName);
  return (await getMetaDataByPageName(insertedPageName))!;
}

export async function patchMetaData(
  pageName: string,
  input: UpdateMetaDataInput,
): Promise<MetaData | null> {
  const existing = await getMetaDataByPageName(pageName);
  if (!existing) return null;

  const merged: Omit<CreateMetaDataInput, "pageName"> = {
    titleAr: input.titleAr ?? existing.titleAr,
    titleEn: input.titleEn ?? existing.titleEn,
    descriptionAr: input.descriptionAr ?? existing.descriptionAr,
    descriptionEn: input.descriptionEn ?? existing.descriptionEn,
    keywordsAr: input.keywordsAr ?? existing.keywordsAr,
    keywordsEn: input.keywordsEn ?? existing.keywordsEn,
  };

  await ensureMetaDataSchema();
  const pool = await getPool();

  await pool
    .request()
    .input("pageName", sql.NVarChar(128), normalizePageName(pageName))
    .input("titleAr", sql.NVarChar(512), merged.titleAr)
    .input("titleEn", sql.NVarChar(512), merged.titleEn)
    .input("descriptionAr", sql.NVarChar(sql.MAX), merged.descriptionAr)
    .input("descriptionEn", sql.NVarChar(sql.MAX), merged.descriptionEn)
    .input("keywordsAr", sql.NVarChar(sql.MAX), merged.keywordsAr)
    .input("keywordsEn", sql.NVarChar(sql.MAX), merged.keywordsEn)
    .query(`
      UPDATE MetaData
      SET
        titleAr = @titleAr,
        titleEn = @titleEn,
        descriptionAr = @descriptionAr,
        descriptionEn = @descriptionEn,
        keywordsAr = @keywordsAr,
        keywordsEn = @keywordsEn,
        updatedAt = SYSUTCDATETIME()
      WHERE pageName = @pageName
    `);

  return getMetaDataByPageName(pageName);
}

export async function updateMetaData(
  pageName: string,
  input: ReplaceMetaDataInput,
): Promise<MetaData | null> {
  const existing = await getMetaDataByPageName(pageName);
  if (!existing) return null;

  await ensureMetaDataSchema();
  const pool = await getPool();

  await pool
    .request()
    .input("pageName", sql.NVarChar(128), normalizePageName(pageName))
    .input("titleAr", sql.NVarChar(512), input.titleAr)
    .input("titleEn", sql.NVarChar(512), input.titleEn)
    .input("descriptionAr", sql.NVarChar(sql.MAX), input.descriptionAr)
    .input("descriptionEn", sql.NVarChar(sql.MAX), input.descriptionEn)
    .input("keywordsAr", sql.NVarChar(sql.MAX), input.keywordsAr)
    .input("keywordsEn", sql.NVarChar(sql.MAX), input.keywordsEn)
    .query(`
      UPDATE MetaData
      SET
        titleAr = @titleAr,
        titleEn = @titleEn,
        descriptionAr = @descriptionAr,
        descriptionEn = @descriptionEn,
        keywordsAr = @keywordsAr,
        keywordsEn = @keywordsEn,
        updatedAt = SYSUTCDATETIME()
      WHERE pageName = @pageName
    `);

  return getMetaDataByPageName(pageName);
}

export async function deleteMetaDataByPageName(
  pageName: string,
): Promise<boolean> {
  await ensureMetaDataSchema();
  const pool = await getPool();

  const result = await pool
    .request()
    .input("pageName", sql.NVarChar(128), normalizePageName(pageName))
    .query(`
      DELETE FROM MetaData WHERE pageName = @pageName;
      SELECT @@ROWCOUNT AS affected;
    `);

  return Number(result.recordset[0]?.affected ?? 0) > 0;
}
