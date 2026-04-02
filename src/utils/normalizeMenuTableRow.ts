/**
 * SQL Server / mssql يعيد أسماء أعمدة كما في الجدول (مثل IsActive) وقد يعيد BIT كـ boolean أو رقم أو Buffer.
 * الواجهة تتوقع isActive (camelCase).
 */
export function normalizeMenuTableRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const raw =
    row.isActive ??
    row.IsActive ??
    row.active ??
    row.Active;

  let isActive = true;
  if (raw !== undefined && raw !== null) {
    if (typeof raw === "boolean") {
      isActive = raw;
    } else if (typeof raw === "number") {
      isActive = raw !== 0;
    } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
      isActive = raw.length > 0 && raw[0] === 1;
    } else {
      isActive = Boolean(raw);
    }
  }

  return { ...row, isActive };
}
