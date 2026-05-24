import { getPool, sql } from "../config/database";
import { ensurePromoSchema } from "./promoSchema.service";

export interface Promo {
  text: string;
  boolean: boolean;
  updatedAt?: string;
}

function mapRow(row: Record<string, unknown>): Promo {
  return {
    text: String(row.text ?? ""),
    boolean: Boolean(row.boolean),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : row.updatedAt != null
          ? String(row.updatedAt)
          : undefined,
  };
}

export async function getPromo(): Promise<Promo> {
  await ensurePromoSchema();
  const pool = await getPool();

  const result = await pool.request().query(`
    SELECT text, [boolean], updatedAt
    FROM Promo
    WHERE id = 1
  `);

  if (result.recordset.length === 0) {
    return { text: "", boolean: false };
  }

  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export interface UpsertPromoInput {
  text: string;
  boolean: boolean;
}

export async function upsertPromo(input: UpsertPromoInput): Promise<Promo> {
  await ensurePromoSchema();
  const pool = await getPool();

  await pool
    .request()
    .input("text", sql.NVarChar(sql.MAX), input.text)
    .input("boolean", sql.Bit, input.boolean ? 1 : 0)
    .query(`
      UPDATE Promo
      SET
        text = @text,
        [boolean] = @boolean,
        updatedAt = SYSUTCDATETIME()
      WHERE id = 1;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO Promo (id, text, [boolean], updatedAt)
        VALUES (1, @text, @boolean, SYSUTCDATETIME());
      END
    `);

  return getPromo();
}
