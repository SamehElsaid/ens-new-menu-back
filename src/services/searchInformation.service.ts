import { getPool, sql } from "../config/database";
import { ensureSearchInformationSchema } from "./searchInformationSchema.service";

export interface SearchInformation {
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  updatedAt?: string;
}

const EMPTY: SearchInformation = {
  titleAr: "",
  titleEn: "",
  descriptionAr: "",
  descriptionEn: "",
};

function mapRow(row: Record<string, unknown>): SearchInformation {
  return {
    titleAr: String(row.titleAr ?? ""),
    titleEn: String(row.titleEn ?? ""),
    descriptionAr: String(row.descriptionAr ?? ""),
    descriptionEn: String(row.descriptionEn ?? ""),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt != null
          ? String(row.updatedAt)
          : undefined,
  };
}

export async function getSearchInformation(): Promise<SearchInformation> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT titleAr, titleEn, descriptionAr, descriptionEn, updatedAt
    FROM SearchInformation
    WHERE id = 1
  `);

  if (result.recordset.length === 0) {
    return { ...EMPTY };
  }

  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export type UpsertSearchInformationInput = SearchInformation;

export async function upsertSearchInformation(
  input: UpsertSearchInformationInput,
): Promise<SearchInformation> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  await pool
    .request()
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
      WHERE id = 1;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO SearchInformation (
          id,
          titleAr,
          titleEn,
          descriptionAr,
          descriptionEn,
          updatedAt
        )
        VALUES (
          1,
          @titleAr,
          @titleEn,
          @descriptionAr,
          @descriptionEn,
          SYSUTCDATETIME()
        );
      END
    `);

  return getSearchInformation();
}

export async function deleteSearchInformation(): Promise<SearchInformation> {
  await ensureSearchInformationSchema();
  const pool = await getPool();

  await pool.request().query(`
    UPDATE SearchInformation
    SET
      titleAr = N'',
      titleEn = N'',
      descriptionAr = N'',
      descriptionEn = N'',
      updatedAt = SYSUTCDATETIME()
    WHERE id = 1;

    IF @@ROWCOUNT = 0
    BEGIN
      INSERT INTO SearchInformation (
        id,
        titleAr,
        titleEn,
        descriptionAr,
        descriptionEn,
        updatedAt
      )
      VALUES (1, N'', N'', N'', N'', SYSUTCDATETIME());
    END
  `);

  return getSearchInformation();
}
