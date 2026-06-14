import { getPool, sql } from "../config/database";
import { ensureSearchInformationSchema } from "../schemas/searchInformation.schema";

export interface SearchInformation {
  id: number;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface SearchInformationSummary {
  id: number;
  titleAr: string;
  titleEn: string;
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

function mapRow(row: Record<string, unknown>): SearchInformation {
  return {
    id: Number(row.id),
    titleAr: String(row.titleAr ?? ""),
    titleEn: String(row.titleEn ?? ""),
    descriptionAr: String(row.descriptionAr ?? ""),
    descriptionEn: String(row.descriptionEn ?? ""),
    updatedAt: mapDateField(row.updatedAt),
    createdAt: mapDateField(row.createdAt),
  };
}

function mapRowSummary(row: Record<string, unknown>): SearchInformationSummary {
  return {
    id: Number(row.id),
    titleAr: String(row.titleAr ?? ""),
    titleEn: String(row.titleEn ?? ""),
    updatedAt: mapDateField(row.updatedAt),
    createdAt: mapDateField(row.createdAt),
  };
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function matchesSearch(row: Record<string, unknown>, term: string): boolean {
  const lower = term.toLowerCase();
  const titleAr = String(row.titleAr ?? "").toLowerCase();
  const titleEn = String(row.titleEn ?? "").toLowerCase();
  const descriptionAr = stripHtml(String(row.descriptionAr ?? "")).toLowerCase();
  const descriptionEn = stripHtml(String(row.descriptionEn ?? "")).toLowerCase();

  return (
    titleAr.includes(lower) ||
    titleEn.includes(lower) ||
    descriptionAr.includes(lower) ||
    descriptionEn.includes(lower)
  );
}

export async function getAllSearchInformation(
  page: number,
  limit: number,
  search?: string,
): Promise<PaginatedResult<SearchInformationSummary>> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT id, titleAr, titleEn, descriptionAr, descriptionEn, updatedAt, createdAt
    FROM SearchInformation
    ORDER BY createdAt DESC
  `);

  let records = result.recordset as Record<string, unknown>[];

  if (search?.trim()) {
    records = records.filter((row) => matchesSearch(row, search.trim()));
  }

  const total = records.length;
  const offset = (page - 1) * limit;
  const paginated = records.slice(offset, offset + limit);

  return {
    data: paginated.map(mapRowSummary),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getSearchInformationById(
  id: number,
): Promise<SearchInformation | null> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      SELECT id, titleAr, titleEn, descriptionAr, descriptionEn, updatedAt, createdAt
      FROM SearchInformation
      WHERE id = @id
    `);

  if (result.recordset.length === 0) return null;

  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export type CreateSearchInformationInput = Omit<
  SearchInformation,
  "id" | "updatedAt" | "createdAt"
>;

export async function createSearchInformation(
  input: CreateSearchInformationInput,
): Promise<SearchInformation> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  const result = await pool
    .request()
    .input("titleAr", sql.NVarChar(512), input.titleAr)
    .input("titleEn", sql.NVarChar(512), input.titleEn)
    .input("descriptionAr", sql.NVarChar(sql.MAX), input.descriptionAr)
    .input("descriptionEn", sql.NVarChar(sql.MAX), input.descriptionEn)
    .query(`
      INSERT INTO SearchInformation (titleAr, titleEn, descriptionAr, descriptionEn, updatedAt, createdAt)
      OUTPUT INSERTED.id
      VALUES (@titleAr, @titleEn, @descriptionAr, @descriptionEn, SYSUTCDATETIME(), SYSUTCDATETIME());
    `);

  const newId = result.recordset[0]?.id as number;
  return (await getSearchInformationById(newId))!;
}

export async function updateSearchInformation(
  id: number,
  input: CreateSearchInformationInput,
): Promise<SearchInformation | null> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  const affected = await pool
    .request()
    .input("id", sql.Int, id)
    .input("titleAr", sql.NVarChar(512), input.titleAr)
    .input("titleEn", sql.NVarChar(512), input.titleEn)
    .input("descriptionAr", sql.NVarChar(sql.MAX), input.descriptionAr)
    .input("descriptionEn", sql.NVarChar(sql.MAX), input.descriptionEn)
    .query(`
      UPDATE SearchInformation
      SET
        titleAr = @titleAr,
        titleEn = @titleEn,
        descriptionAr = @descriptionAr,
        descriptionEn = @descriptionEn,
        updatedAt = SYSUTCDATETIME()
      WHERE id = @id;
      SELECT @@ROWCOUNT AS affected;
    `);

  if (affected.recordset[0]?.affected === 0) return null;

  return getSearchInformationById(id);
}

export async function deleteSearchInformationById(id: number): Promise<boolean> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .query(`
      DELETE FROM SearchInformation WHERE id = @id;
      SELECT @@ROWCOUNT AS affected;
    `);

  return result.recordset[0]?.affected > 0;
}
