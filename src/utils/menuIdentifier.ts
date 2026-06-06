import { validate as validateUuid, v4 as uuidv4 } from "uuid";
import { getPool, sql } from "../config/database";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMenuUuid(value: string): boolean {
  return UUID_REGEX.test(value) || validateUuid(value);
}

export function isNumericMenuId(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0;
}

/** Accepts legacy numeric id or public menu UUID. */
export function isMenuIdentifier(value: string): boolean {
  return isMenuUuid(value) || isNumericMenuId(value);
}

export function generateMenuUuid(): string {
  return uuidv4();
}

/** Resolve dashboard/API menu segment to internal numeric Menus.id. */
export async function resolveMenuNumericId(
  identifier: string,
): Promise<number | null> {
  if (isNumericMenuId(identifier)) {
    return parseInt(identifier, 10);
  }

  if (!isMenuUuid(identifier)) {
    return null;
  }

  const pool = await getPool();
  const result = await pool
    .request()
    .input("uuid", sql.UniqueIdentifier, identifier)
    .query("SELECT id FROM Menus WHERE uuid = @uuid");

  if (result.recordset.length === 0) {
    return null;
  }

  const id = result.recordset[0]?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : Number(id);
}
