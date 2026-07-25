/**
 * Persisted guest → staff table calls (StaffTableCalls).
 */

import { getPool, sql } from "../config/database";
import { getMenuTablesColumnMeta } from "../config/menuTablesColumns";
import {
  getMenuStaffColumnMeta,
  getStaffIsActive,
  quoteMenuStaffIdent,
} from "../config/menuStaffColumns";
import { logger } from "../utils/logger";
import {
  type MenuItemSize,
  normalizeMenuItemSizesInput,
} from "../utils/menuItemSizes";
import {
  type MenuItemVariant,
  normalizeMenuItemVariantsInput,
} from "../utils/menuItemVariants";
import { hasCapability } from "./planCapabilities.service";
import { logMenuOrderEventSafe } from "./menuActivityLog.service";
import { ensureDeliverySchema } from "../schemas/delivery.schema";
import { ensureStaffTableCallsOrderTypeSchema } from "../schemas/staffTableCallsOrderType.schema";
import { ensureMenuGroupSchema } from "../schemas/menuGroup.schema";
import {
  fetchMenuDisplayNames,
  getDeliveryGroupMenuIds,
  resolveInboxMenuId,
} from "./menuGroup.service";
import {
  isMenuDeliveryEnabled,
  getEffectiveMenuDeliveryMode,
  resolveMenuDeliveryGovernorate,
  resolveBranchDeliveryQuote,
} from "./menuDelivery.service";
import {
  broadcastMenuActivityUpdated,
  broadcastStaffTableCallChanged,
} from "../socket/staffIoBroadcast";
import { ensureMenuWifiTaxServiceSchema } from "../schemas/menuWifiTaxService.schema";
import { applyMenuOrderCharges } from "../utils/menuOrderCharges";
import {
  normalizeOptionalEnabled,
  normalizePercent,
} from "../utils/normalizeOptionalEnabled";
import { parseGeoCoord } from "../utils/geoDistance";

export type StaffOrderType = "table" | "delivery";

/** Guest intent: food order, waiter ping, or bill request. */
export type StaffRequestKind = "order" | "waiter" | "bill";

/** Persisted on StaffTableCalls.status (after migration). */
export type StaffTableCallStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "prepared"
  | "delivered";

export function normalizeStaffTableCallStatus(
  statusRaw: unknown,
  acknowledgedAt: Date | null | undefined,
): StaffTableCallStatus {
  const s = String(statusRaw ?? "")
    .trim()
    .toLowerCase();
  if (s === "cancelled") {
    return "cancelled";
  }
  if (s === "delivered") {
    return "delivered";
  }
  if (s === "prepared") {
    return "prepared";
  }
  if (s === "confirmed") {
    return "confirmed";
  }
  if (acknowledgedAt) {
    return "confirmed";
  }
  if (s === "pending" || s === "") {
    return "pending";
  }
  return "pending";
}

export type GuestStaffCallError =
  | "INVALID_PAYLOAD"
  | "INVALID_ORDER_ITEMS"
  | "MENU_NOT_FOUND"
  | "INVALID_TABLE"
  | "INVALID_GOVERNORATE"
  | "INVALID_BRANCH"
  | "DELIVERY_OUT_OF_RANGE"
  | "INVALID_PHONE"
  | "INVALID_ADDRESS"
  | "DELIVERY_DISABLED"
  | "FEATURE_REQUIRES_PRO"
  | "SERVER_ERROR";

/** One line in a guest-submitted order (id + qty; price from DB or optional client override). */
export type StaffOrderItem = {
  name: string;
  menuItemId?: number;
  /** Unit price (from client override, or resolved from MenuItems when omitted). */
  price?: number;
  quantity: number;
  /** Line total (price × quantity), set by server after resolve. */
  total?: number;
  notes?: string;
  /** Selected size (when the menu item has size options). */
  size?: MenuItemSize | null;
  /** Selected add-on / variant. */
  variant?: MenuItemVariant | null;
};

export type GuestStaffCallOptions = {
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  orderNotes?: string | null;
  /** `table` | `delivery` — preferred over legacy heuristics. */
  type?: unknown;
  /**
   * Guest button intent:
   * - `order` (default): cart / food order
   * - `waiter`: call waiter to the table
   * - `bill`: ask waiter to bring the check
   */
  requestKind?: unknown;
  items?: unknown;
  /** If set, stored on insert (default `pending`). */
  status?: unknown;
  governorateId?: number | null;
  branchId?: number | null;
  customerLat?: number | null;
  customerLng?: number | null;
};

export function parseStaffRequestKind(raw: unknown): StaffRequestKind {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "waiter" || normalized === "bill") {
    return normalized;
  }
  return "order";
}

export function isServiceRequestKind(kind: StaffRequestKind): boolean {
  return kind === "waiter" || kind === "bill";
}

function parseOrderType(
  raw: unknown,
  governorateId: number | null,
  tableNumber: string,
  requestKind: StaffRequestKind = "order",
): StaffOrderType {
  if (isServiceRequestKind(requestKind)) {
    return "table";
  }
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "delivery" || normalized === "table") {
    return normalized;
  }
  if (governorateId != null || tableNumber.toLowerCase() === "delivery") {
    return "delivery";
  }
  return "table";
}

function serviceRequestSummaries(
  requestKind: "waiter" | "bill",
  tableNumber: string,
  customerName: string | null,
): { summaryAr: string; summaryEn: string } {
  if (requestKind === "bill") {
    return {
      summaryAr: customerName
        ? `طلب الحساب من ${customerName} - طاولة ${tableNumber}`
        : `طلب الحساب - طاولة ${tableNumber}`,
      summaryEn: customerName
        ? `Bill request from ${customerName} - table ${tableNumber}`
        : `Bill request - table ${tableNumber}`,
    };
  }
  return {
    summaryAr: customerName
      ? `استدعاء الويتر من ${customerName} - طاولة ${tableNumber}`
      : `استدعاء الويتر - طاولة ${tableNumber}`,
    summaryEn: customerName
      ? `Waiter call from ${customerName} - table ${tableNumber}`
      : `Waiter call - table ${tableNumber}`,
  };
}

function parseCustomerPhone(
  raw: unknown,
  required: boolean,
): { ok: true; value: string | null } | { ok: false } {
  if (raw == null || String(raw).trim() === "") {
    if (required) return { ok: false };
    return { ok: true, value: null };
  }
  const trimmed = String(raw).trim().slice(0, 50);
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false };
  }
  return { ok: true, value: trimmed };
}

function parseOrderNotes(raw: unknown): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim().slice(0, 500);
  return trimmed.length ? trimmed : null;
}

function parseCustomerAddress(
  raw: unknown,
  required: boolean,
): { ok: true; value: string | null } | { ok: false } {
  if (raw == null || String(raw).trim() === "") {
    if (required) return { ok: false };
    return { ok: true, value: null };
  }
  const trimmed = String(raw).trim().slice(0, 500);
  return trimmed.length ? { ok: true, value: trimmed } : { ok: false };
}

function parseGovernorateId(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

async function resolveDeliveryGovernorate(
  menuId: number,
  governorateId: number,
): Promise<
  | {
      ok: true;
      governorate: {
        id: number;
        nameAr: string;
        nameEn: string;
        price: number;
      };
    }
  | { ok: false }
> {
  const result = await resolveMenuDeliveryGovernorate(menuId, governorateId);
  if (!result.ok) return { ok: false };
  return { ok: true, governorate: result.governorate };
}

function parseCustomerName(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().slice(0, 200);
  return s.length ? s : null;
}

function parseGuestInitialStaffCallStatus(raw: unknown): StaffTableCallStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "confirmed" || s === "cancelled" || s === "pending") {
    return s;
  }
  return "pending";
}

function parsePriceField(
  raw: unknown,
): { ok: true; value: number } | { ok: false } {
  if (raw == null || raw === "") {
    return { ok: false };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999.99) {
    return { ok: false };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function lineTotal(unit: number, quantity: number): number {
  return Math.round(unit * quantity * 100) / 100;
}

function pickOptionString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickOptionPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Accept partial locale labels on round-trip edits (dashboard re-save). */
function coerceStaffOrderLineSize(raw: unknown): MenuItemSize | undefined {
  if (raw == null || raw === "") return undefined;
  const normalized = normalizeMenuItemSizesInput([raw]);
  if (normalized?.length === 1) return normalized[0];
  if (typeof raw !== "object") return undefined;
  const node = raw as Record<string, unknown>;
  const nameAr =
    pickOptionString(node.nameAr) ||
    pickOptionString(node.name_ar) ||
    pickOptionString(node.labelAr) ||
    pickOptionString(node.label);
  const nameEn =
    pickOptionString(node.nameEn) ||
    pickOptionString(node.name_en) ||
    pickOptionString(node.labelEn) ||
    pickOptionString(node.label);
  const price = pickOptionPrice(node.price);
  if (price === null) return undefined;
  const ar = nameAr || nameEn;
  const en = nameEn || nameAr;
  if (!ar || !en) return undefined;
  return { nameAr: ar, nameEn: en, price };
}

function coerceStaffOrderLineVariant(raw: unknown): MenuItemVariant | undefined {
  if (raw == null || raw === "") return undefined;
  const normalized = normalizeMenuItemVariantsInput([raw]);
  if (normalized?.length === 1) return normalized[0];
  if (typeof raw !== "object") return undefined;
  const node = raw as Record<string, unknown>;
  const labelAr =
    pickOptionString(node.labelAr) ||
    pickOptionString(node.label_ar) ||
    pickOptionString(node.nameAr) ||
    pickOptionString(node.label);
  const labelEn =
    pickOptionString(node.labelEn) ||
    pickOptionString(node.label_en) ||
    pickOptionString(node.nameEn) ||
    pickOptionString(node.label);
  const price = pickOptionPrice(node.price);
  if (price === null) return undefined;
  const ar = labelAr || labelEn;
  const en = labelEn || labelAr;
  if (!ar || !en) return undefined;
  return { labelAr: ar, labelEn: en, price };
}

function parseStaffOrderLineSize(
  raw: unknown,
): { ok: true; value: MenuItemSize | undefined } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: undefined };
  }
  return { ok: true, value: coerceStaffOrderLineSize(raw) };
}

function parseStaffOrderLineVariant(
  raw: unknown,
): { ok: true; value: MenuItemVariant | undefined } {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: undefined };
  }
  return { ok: true, value: coerceStaffOrderLineVariant(raw) };
}

function pickStaffOrderItemOptions(
  o: Record<string, unknown>,
): { ok: true; size?: MenuItemSize; variant?: MenuItemVariant } {
  const sizeParsed = parseStaffOrderLineSize(o.size);
  const variantParsed = parseStaffOrderLineVariant(o.variant);
  return {
    ok: true,
    ...(sizeParsed.value ? { size: sizeParsed.value } : {}),
    ...(variantParsed.value ? { variant: variantParsed.value } : {}),
  };
}

function appendOptionsToStaffItemName(
  baseName: string,
  size?: MenuItemSize,
  variant?: MenuItemVariant,
): string {
  const parts = [baseName];
  if (size) {
    parts.push(size.nameEn || size.nameAr);
  }
  if (variant) {
    parts.push(variant.labelEn || variant.labelAr);
  }
  if (parts.length === 1) {
    return baseName;
  }
  return parts.join(" · ");
}

function computeStaffLineUnitPrice(
  dbBasePrice: number,
  item: Pick<StaffOrderItem, "price" | "size" | "variant">,
): number {
  if (item.price !== undefined) {
    return item.price;
  }
  const base = item.size?.price ?? dbBasePrice;
  const addon = item.variant?.price ?? 0;
  return Math.round((base + addon) * 100) / 100;
}

export function computeOrderTotalFromItems(items: StaffOrderItem[]): number {
  return (
    Math.round(
      items.reduce((s, i) => {
        const line =
          i.total !== undefined ? i.total : lineTotal(i.price ?? 0, i.quantity);
        return s + line;
      }, 0) * 100,
    ) / 100
  );
}

async function fetchMenuOrderCharges(menuId: number): Promise<{
  taxEnabled: boolean;
  taxPercent: number | null;
  serviceEnabled: boolean;
  servicePercent: number | null;
} | null> {
  try {
    await ensureMenuWifiTaxServiceSchema();
    const pool = await getPool();
    const result = await pool
      .request()
      .input("id", sql.Int, menuId)
      .query(`
        SELECT
          ISNULL(taxEnabled, 0) AS taxEnabled,
          taxPercent,
          ISNULL(serviceEnabled, 0) AS serviceEnabled,
          servicePercent
        FROM Menus
        WHERE id = @id
      `);
    const row = result.recordset[0] as
      | {
          taxEnabled?: unknown;
          taxPercent?: unknown;
          serviceEnabled?: unknown;
          servicePercent?: unknown;
        }
      | undefined;
    if (!row) return null;
    return {
      taxEnabled: normalizeOptionalEnabled(row.taxEnabled),
      taxPercent: normalizePercent(row.taxPercent),
      serviceEnabled: normalizeOptionalEnabled(row.serviceEnabled),
      servicePercent: normalizePercent(row.servicePercent),
    };
  } catch (error) {
    logger.error("fetchMenuOrderCharges error:", error);
    return null;
  }
}

async function computeOrderTotalWithMenuCharges(
  menuId: number,
  items: StaffOrderItem[],
): Promise<number> {
  const subtotal = computeOrderTotalFromItems(items);
  const charges = await fetchMenuOrderCharges(menuId);
  if (!charges) return subtotal;
  return applyMenuOrderCharges(subtotal, charges).total;
}

export async function attachMenuChargeFieldsToOrder(
  menuId: number,
  items: StaffOrderItem[],
  order: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const subtotal = computeOrderTotalFromItems(items);
  const charges = await fetchMenuOrderCharges(menuId);
  const applied = applyMenuOrderCharges(subtotal, charges);
  return {
    ...order,
    itemsSubtotal: applied.subtotal,
    taxEnabled: charges?.taxEnabled === true,
    taxPercent: charges?.taxPercent ?? null,
    taxAmount: applied.taxAmount,
    serviceEnabled: charges?.serviceEnabled === true,
    servicePercent: charges?.servicePercent ?? null,
    serviceAmount: applied.serviceAmount,
    orderTotal: applied.total,
  };
}

export function isOpenStaffTableCallStatus(
  status: StaffTableCallStatus,
): boolean {
  return status !== "cancelled" && status !== "delivered";
}

/** Append guest round items as separate lines (do not sum qty with existing rows). */
export function mergeStaffOrderItems(
  existing: StaffOrderItem[],
  incoming: StaffOrderItem[],
): StaffOrderItem[] {
  return [...existing, ...incoming];
}

/**
 * Latest open table order for a table (pending / confirmed / prepared).
 * Used to append guest items instead of creating a new call until cashier finishes.
 */
export async function findOpenTableCallForTable(
  menuId: number,
  tableNumber: string,
): Promise<StaffTableCallRow | null> {
  const safeTable = String(tableNumber ?? "").trim();
  if (!safeTable || !Number.isFinite(menuId) || menuId <= 0) {
    return null;
  }
  try {
    const pool = await getPool();
    await ensureStaffTableCallsOrderTypeSchema();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("tableNumber", sql.NVarChar, safeTable).query(`
        SELECT TOP 1
          id, menuId, tableNumber, orderType, requestKind, customerPhone, customerAddress,
          orderNotes, createdAt, customerName, orderItemsJson, status, acknowledgedAt
        FROM StaffTableCalls
        WHERE menuId = @menuId
          AND tableNumber = @tableNumber
          AND (
            orderType IS NULL
            OR LOWER(LTRIM(RTRIM(orderType))) = N'table'
          )
          AND (
            requestKind IS NULL
            OR LOWER(LTRIM(RTRIM(requestKind))) = N'order'
          )
          AND (
            status IS NULL
            OR LOWER(LTRIM(RTRIM(status))) NOT IN (N'cancelled', N'delivered')
          )
        ORDER BY createdAt DESC
      `);
    const row = result.recordset[0] as
      | Parameters<typeof toStaffTableCallRow>[0]
      | undefined;
    if (!row) return null;
    const charges = await fetchMenuOrderCharges(menuId);
    const parsed = toStaffTableCallRow(row, false, charges);
    return isOpenStaffTableCallStatus(parsed.status) ? parsed : null;
  } catch (error) {
    logger.error("findOpenTableCallForTable error:", error);
    return null;
  }
}

/** Guest or system appends lines to an open table order (no staff editor id). */
export async function appendItemsToOpenTableCall(
  callId: number,
  menuId: number,
  incomingItems: StaffOrderItem[],
): Promise<
  | {
      ok: true;
      items: StaffOrderItem[];
      orderTotal: number;
      status: StaffTableCallStatus;
    }
  | { ok: false; error: UpdateStaffCallItemsError }
> {
  if (incomingItems.length === 0) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  try {
    const snap = await getStaffTableCallSnapshot(menuId, callId);
    if (!snap || !isOpenStaffTableCallStatus(snap.status)) {
      return { ok: false, error: "NOT_EDITABLE" };
    }
    const merged = mergeStaffOrderItems(snap.items, incomingItems);
    const orderTotal = await computeOrderTotalWithMenuCharges(menuId, merged);
    const orderJson = merged.length > 0 ? JSON.stringify(merged) : null;
    const pool = await getPool();
    const schema = await getStaffTableCallsSchemaFlags();
    const upd = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId)
      .input("orderItemsJson", sql.NVarChar(sql.MAX), orderJson).query(`
        UPDATE StaffTableCalls
        SET orderItemsJson = @orderItemsJson
        WHERE ${buildEditableRowWhereSql(schema)}
      `);
    if ((upd.rowsAffected?.[0] ?? 0) === 0) {
      return { ok: false, error: "NOT_FOUND" };
    }
    return {
      ok: true,
      items: merged,
      orderTotal,
      status: snap.status,
    };
  } catch (error) {
    logger.error("appendItemsToOpenTableCall error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

/**
 * Cashier closes an active table order (`confirmed` or `prepared` → `delivered`).
 * Also accepts rows that only have `acknowledgedAt` set (legacy / partial status writes).
 */
export async function completeStaffTableCall(
  callId: number,
  menuId: number,
): Promise<boolean> {
  try {
    const pool = await getPool();
    const schema = await getStaffTableCallsSchemaFlags();
    if (!schema.status) {
      return false;
    }
    const ackClause = schema.acknowledgedAt
      ? `OR (
           acknowledgedAt IS NOT NULL
           AND LOWER(LTRIM(RTRIM(ISNULL(status, '')))) NOT IN (N'cancelled', N'delivered')
         )`
      : "";
    const result = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId).query(`
        UPDATE StaffTableCalls
        SET status = N'delivered'
        WHERE id = @id AND menuId = @menuId
          AND (
            LOWER(LTRIM(RTRIM(ISNULL(status, '')))) IN (N'confirmed', N'prepared')
            ${ackClause}
          )
      `);
    return (result.rowsAffected?.[0] ?? 0) > 0;
  } catch (error) {
    logger.error("completeStaffTableCall error:", error);
    return false;
  }
}

function parseOrderItemsInput(
  raw: unknown,
): { ok: true; items: StaffOrderItem[] } | { ok: false } {
  if (raw == null || raw === undefined) {
    return { ok: true, items: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false };
  }
  if (raw.length > 100) {
    return { ok: false };
  }
  const out: StaffOrderItem[] = [];
  for (const el of raw) {
    if (el == null || typeof el !== "object") {
      return { ok: false };
    }
    const o = el as Record<string, unknown>;
    const nameRaw = String(o.name ?? "")
      .trim()
      .slice(0, 500);

    let menuItemId: number | undefined;
    if (o.menuItemId != null && o.menuItemId !== "") {
      const n = Number(o.menuItemId);
      if (!Number.isFinite(n) || n <= 0) {
        return { ok: false };
      }
      menuItemId = Math.floor(n);
    }

    if (menuItemId !== undefined) {
      if (o.quantity == null || o.quantity === "") {
        return { ok: false };
      }
      const q = Number(o.quantity);
      if (!Number.isFinite(q) || q < 1 || q > 999) {
        return { ok: false };
      }
      const quantity = Math.floor(q);
      let notes: string | undefined;
      if (o.notes != null && o.notes !== "") {
        notes = String(o.notes).trim().slice(0, 500);
      }
      const priceParsed = parsePriceField(o.price);
      const fromClient = priceParsed.ok ? priceParsed.value : undefined;
      const options = pickStaffOrderItemOptions(o);
      out.push({
        name: nameRaw,
        menuItemId,
        quantity,
        ...(fromClient !== undefined ? { price: fromClient } : {}),
        ...(notes ? { notes } : {}),
        ...(options.size ? { size: options.size } : {}),
        ...(options.variant ? { variant: options.variant } : {}),
      });
      continue;
    }

    if (!nameRaw) {
      return { ok: false };
    }
    let quantity = 1;
    if (o.quantity != null && o.quantity !== "") {
      const q = Number(o.quantity);
      if (!Number.isFinite(q) || q < 1 || q > 999) {
        return { ok: false };
      }
      quantity = Math.floor(q);
    }
    let notes: string | undefined;
    if (o.notes != null && o.notes !== "") {
      notes = String(o.notes).trim().slice(0, 500);
    }
    const optPrice = parsePriceField(o.price);
    const options = pickStaffOrderItemOptions(o);
    out.push({
      name: nameRaw,
      quantity,
      ...(optPrice.ok ? { price: optPrice.value } : {}),
      ...(notes ? { notes } : {}),
      ...(options.size ? { size: options.size } : {}),
      ...(options.variant ? { variant: options.variant } : {}),
    });
  }
  return { ok: true, items: out };
}

/**
 * Resolve display name + unit price from DB when missing; set line `total`.
 * If client sent `price`, it overrides DB unit price.
 */
export async function enrichMenuItemsFromDb(
  menuIdOrScope: number | number[],
  items: StaffOrderItem[],
): Promise<StaffOrderItem[]> {
  const menuScope = [
    ...new Set(
      (Array.isArray(menuIdOrScope) ? menuIdOrScope : [menuIdOrScope]).filter(
        (id) => Number.isFinite(id) && id > 0,
      ),
    ),
  ];
  const ids = [
    ...new Set(
      items
        .map((i) => i.menuItemId)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];
  const byId = new Map<number, { unitPrice: number; displayName: string }>();

  if (ids.length > 0 && menuScope.length > 0) {
    const pool = await getPool();
    const req = pool.request();
    const menuParts: string[] = [];
    menuScope.forEach((id, i) => {
      const p = `mscope${i}`;
      menuParts.push(`@${p}`);
      req.input(p, sql.Int, id);
    });
    const itemParts: string[] = [];
    ids.forEach((id, i) => {
      const p = `mid${i}`;
      itemParts.push(`@${p}`);
      req.input(p, sql.Int, id);
    });
    const r = await req.query(
      `SELECT mi.id,
        mi.price,
        COALESCE(mitar.name, miten.name, N'#' + CAST(mi.id AS NVARCHAR(20))) AS displayName
       FROM MenuItems mi
       LEFT JOIN MenuItemTranslations mitar ON mitar.menuItemId = mi.id AND mitar.locale = N'ar'
       LEFT JOIN MenuItemTranslations miten ON miten.menuItemId = mi.id AND miten.locale = N'en'
       WHERE mi.menuId IN (${menuParts.join(", ")}) AND mi.id IN (${itemParts.join(", ")})`,
    );
    for (const row of r.recordset as {
      id: number;
      price: unknown;
      displayName: string;
    }[]) {
      const p = Number(row.price);
      const unitPrice = Number.isFinite(p) ? Math.round(p * 100) / 100 : 0;
      const displayName =
        String(row.displayName ?? "").trim() || `Item ${row.id}`;
      byId.set(row.id, { unitPrice, displayName });
    }
  }

  return items.map((it) => {
    if (it.menuItemId == null) {
      const unit = computeStaffLineUnitPrice(0, it);
      const total = lineTotal(unit, it.quantity);
      const name = appendOptionsToStaffItemName(
        String(it.name ?? "").trim() || "—",
        it.size ?? undefined,
        it.variant ?? undefined,
      );
      return {
        ...it,
        name,
        ...(unit > 0 || it.price !== undefined ? { price: unit } : {}),
        ...(it.size ? { size: it.size } : {}),
        ...(it.variant ? { variant: it.variant } : {}),
        total,
      };
    }

    const db = byId.get(it.menuItemId);
    const nameFromClient = String(it.name ?? "").trim();
    const baseName =
      nameFromClient || (db?.displayName ?? `Item ${it.menuItemId}`);
    const name = appendOptionsToStaffItemName(
      baseName,
      it.size ?? undefined,
      it.variant ?? undefined,
    );

    const unit = computeStaffLineUnitPrice(db?.unitPrice ?? 0, it);
    const total = lineTotal(unit, it.quantity);

    return {
      ...it,
      name,
      price: unit,
      quantity: it.quantity,
      total,
      ...(it.notes ? { notes: it.notes } : {}),
      ...(it.size ? { size: it.size } : {}),
      ...(it.variant ? { variant: it.variant } : {}),
    };
  });
}

async function menuItemsExistForMenus(
  menuIds: number[],
  itemIds: number[],
): Promise<boolean> {
  if (itemIds.length === 0) return true;
  const scope = [
    ...new Set(menuIds.filter((id) => Number.isFinite(id) && id > 0)),
  ];
  if (scope.length === 0) return false;
  const unique = [...new Set(itemIds)];
  const pool = await getPool();
  const req = pool.request();
  const menuParts: string[] = [];
  scope.forEach((id, i) => {
    const p = `mscope${i}`;
    menuParts.push(`@${p}`);
    req.input(p, sql.Int, id);
  });
  const itemParts: string[] = [];
  unique.forEach((id, i) => {
    const p = `mid${i}`;
    itemParts.push(`@${p}`);
    req.input(p, sql.Int, id);
  });
  const r = await req.query(
    `SELECT COUNT(DISTINCT id) AS c FROM MenuItems WHERE menuId IN (${menuParts.join(", ")}) AND id IN (${itemParts.join(", ")})`,
  );
  return Number(r.recordset[0]?.c) === unique.length;
}

async function menuItemsExistForMenu(
  menuId: number,
  itemIds: number[],
): Promise<boolean> {
  return menuItemsExistForMenus([menuId], itemIds);
}

async function resolveOrderItemsMenuScope(menuId: number): Promise<number[]> {
  return getDeliveryGroupMenuIds(menuId);
}

/**
 * Shared guest "call staff" logic (Socket.IO + HTTP).
 */
export async function processGuestStaffCall(
  menuId: number,
  tableNumber: string,
  options?: GuestStaffCallOptions,
): Promise<
  | {
      ok: true;
      id: number;
      menuId: number;
      type: StaffOrderType;
      requestKind: StaffRequestKind;
      tableNumber: string;
      createdAt: Date;
      customerName: string | null;
      customerPhone: string | null;
      customerAddress: string | null;
      orderNotes: string | null;
      items: StaffOrderItem[];
      orderTotal: number;
      status: StaffTableCallStatus;
    }
  | { ok: false; error: GuestStaffCallError }
> {
  if (!Number.isFinite(menuId) || menuId <= 0) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const safeTable = String(tableNumber ?? "")
    .trim()
    .slice(0, 50);

  const requestKind = parseStaffRequestKind(options?.requestKind);
  const isServiceRequest = isServiceRequestKind(requestKind);
  const governorateIdFromOptions = parseGovernorateId(options?.governorateId);
  const orderType = parseOrderType(
    options?.type,
    governorateIdFromOptions,
    safeTable,
    requestKind,
  );
  const isDeliveryOrder = orderType === "delivery";

  if (isServiceRequest && isDeliveryOrder) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }

  if (!isDeliveryOrder && !safeTable) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }

  const customerName = parseCustomerName(options?.customerName);
  const phoneParsed = parseCustomerPhone(
    options?.customerPhone,
    isDeliveryOrder,
  );
  if (!phoneParsed.ok) {
    return { ok: false, error: "INVALID_PHONE" };
  }
  const customerPhone = phoneParsed.value;
  const addressParsed = parseCustomerAddress(options?.customerAddress, false);
  if (!addressParsed.ok) {
    return { ok: false, error: "INVALID_ADDRESS" };
  }
  const customerAddress = addressParsed.value;
  const orderNotes = parseOrderNotes(options?.orderNotes);
  const effectiveTable = isDeliveryOrder ? "" : safeTable;
  const initialStatus = parseGuestInitialStaffCallStatus(options?.status);
  const parsedItems = isServiceRequest
    ? { ok: true as const, items: [] as StaffOrderItem[] }
    : parseOrderItemsInput(options?.items);
  if (!parsedItems.ok) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const items = parsedItems.items;
  const idsForCheck = items
    .map((i) => i.menuItemId)
    .filter((id): id is number => typeof id === "number");

  try {
    const pool = await getPool();

    if (idsForCheck.length > 0) {
      const okIds = await menuItemsExistForMenu(menuId, idsForCheck);
      if (!okIds) {
        return { ok: false, error: "INVALID_ORDER_ITEMS" };
      }
    }
    const menuCheck = await pool
      .request()
      .input("id", sql.Int, menuId)
      .query(`SELECT id, isActive, userId FROM Menus WHERE id = @id`);

    const m = menuCheck.recordset[0];
    if (!m || !m.isActive) {
      return { ok: false, error: "MENU_NOT_FOUND" };
    }

    const ownerId = m.userId as number;
    if (
      !(await hasCapability(ownerId, "tableOrderingQr")) &&
      !isDeliveryOrder
    ) {
      return { ok: false, error: "FEATURE_REQUIRES_PRO" };
    }

    let deliveryGovernorate: {
      id: number;
      nameAr: string;
      nameEn: string;
      price: number;
    } | null = null;
    let distanceDelivery:
      | {
          branchId: number;
          distanceKm: number;
          deliveryFee: number;
          maxDeliveryRadiusKm: number | null;
        }
      | null = null;

    if (isDeliveryOrder) {
      await ensureDeliverySchema();
      const deliveryOn = await isMenuDeliveryEnabled(menuId);
      if (!deliveryOn) {
        return { ok: false, error: "DELIVERY_DISABLED" };
      }

      const deliveryMode = await getEffectiveMenuDeliveryMode(menuId);

      if (deliveryMode === "distance") {
        const branchId = parseGovernorateId(options?.branchId);
        const customerLat = parseGeoCoord(options?.customerLat);
        const customerLng = parseGeoCoord(options?.customerLng);

        if (branchId == null || customerLat == null || customerLng == null) {
          return { ok: false, error: "INVALID_PAYLOAD" };
        }

        const branchResult = await resolveBranchDeliveryQuote(
          menuId,
          branchId,
          customerLat,
          customerLng,
        );

        if (!branchResult.ok) {
          if (branchResult.reason === "out_of_range") {
            return { ok: false, error: "DELIVERY_OUT_OF_RANGE" };
          }
          return { ok: false, error: "INVALID_BRANCH" };
        }

        distanceDelivery = {
          branchId: branchResult.delivery.branchId,
          distanceKm: branchResult.delivery.quote.distanceKm,
          deliveryFee: branchResult.delivery.quote.deliveryFee ?? 0,
          maxDeliveryRadiusKm: branchResult.delivery.quote.maxDeliveryRadiusKm,
        };
      } else {
        const governorateId = governorateIdFromOptions;
        if (!governorateId) {
          return { ok: false, error: "INVALID_PAYLOAD" };
        }
        const govResult = await resolveDeliveryGovernorate(menuId, governorateId);
        if (!govResult.ok) {
          return { ok: false, error: "INVALID_GOVERNORATE" };
        }
        deliveryGovernorate = govResult.governorate;
      }
    }

    const tablesCount = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`SELECT COUNT(*) as c FROM MenuTables WHERE menuId = @menuId`);
    const hasTables = Number(tablesCount.recordset[0]?.c) > 0;
    if (hasTables && !isDeliveryOrder) {
      const tableMeta = await getMenuTablesColumnMeta();
      const activeSql = tableMeta.activeColumnQuoted
        ? ` AND ${tableMeta.activeColumnQuoted} = 1`
        : "";
      const match = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("tableNumber", sql.NVarChar, effectiveTable)
        .query(
          `SELECT id FROM MenuTables WHERE menuId = @menuId AND tableNumber = @tableNumber${activeSql}`,
        );
      if (match.recordset.length === 0) {
        return { ok: false, error: "INVALID_TABLE" };
      }
    }

    let itemsResolved: StaffOrderItem[];
    try {
      itemsResolved = await enrichMenuItemsFromDb(menuId, items);
    } catch (e) {
      logger.error("enrichMenuItemsFromDb error:", e);
      return { ok: false, error: "SERVER_ERROR" };
    }

    const orderTotal = await computeOrderTotalWithMenuCharges(
      menuId,
      itemsResolved,
    );

    let storageMenuId = menuId;
    let sourceMenuId: number | null = null;
    let sourceMenuNameAr: string | null = null;
    let sourceMenuNameEn: string | null = null;

    if (isDeliveryOrder) {
      await ensureMenuGroupSchema();
      const inboxId = await resolveInboxMenuId(menuId);
      storageMenuId = inboxId;
      if (inboxId !== menuId) {
        sourceMenuId = menuId;
        const names = await fetchMenuDisplayNames([menuId]);
        const n = names.get(menuId);
        sourceMenuNameAr = n?.nameAr ?? null;
        sourceMenuNameEn = n?.nameEn ?? null;
      }
    }

    if (!isServiceRequest && !isDeliveryOrder && itemsResolved.length > 0) {
      const openCall = await findOpenTableCallForTable(
        storageMenuId,
        effectiveTable,
      );
      if (openCall) {
        const appended = await appendItemsToOpenTableCall(
          openCall.id,
          storageMenuId,
          itemsResolved,
        );
        if (!appended.ok) {
          return { ok: false, error: "SERVER_ERROR" };
        }
        let existingPendingBill = false;
        try {
          const moRow = await pool
            .request()
            .input("menuId", sql.Int, storageMenuId)
            .input("orderId", sql.Int, openCall.id)
            .query(
              `SELECT orderJson FROM dbo.MenuOrders WHERE menuId = @menuId AND orderId = @orderId`,
            );
          const raw = moRow.recordset[0]?.orderJson;
          if (raw) {
            const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
            existingPendingBill = parsed.pendingBillRequest === true;
          }
        } catch {
          existingPendingBill = false;
        }
        await logMenuOrderEventSafe(
          storageMenuId,
          openCall.id,
          {
            action: "TABLE_CALL_ITEMS_UPDATED",
            targetType: "order",
            targetId: openCall.id,
            summaryAr: customerName
              ? `إضافة أصناف لطلب ${customerName} — طاولة ${effectiveTable}`
              : `إضافة أصناف لطلب طاولة ${effectiveTable}`,
            summaryEn: customerName
              ? `Items added to order — ${customerName} — table ${effectiveTable}`
              : `Items added to table ${effectiveTable} order`,
            detailJson: JSON.stringify({
              status: appended.status,
              mergedFromGuest: true,
              order: await attachMenuChargeFieldsToOrder(
                storageMenuId,
                appended.items,
                {
                  type: orderType,
                  requestKind: "order",
                  tableNumber: effectiveTable,
                  customerName: openCall.customerName ?? customerName,
                  items: appended.items,
                  orderTotal: appended.orderTotal,
                  status: appended.status,
                  pendingGuestAddition: true,
                  ...(existingPendingBill
                    ? { pendingBillRequest: true }
                    : {}),
                },
              ),
            }),
          },
          {
            actorName: customerName || "Guest",
            actorRole: "guest",
          },
        );
        broadcastMenuActivityUpdated(storageMenuId);
        const mergedSnap = await getStaffTableCallSnapshot(
          storageMenuId,
          openCall.id,
        );
        if (mergedSnap) {
          broadcastStaffTableCallChanged(storageMenuId, {
            id: mergedSnap.id,
            menuId: mergedSnap.menuId,
            tableNumber: mergedSnap.tableNumber,
            at: mergedSnap.createdAt.toISOString(),
            customerName: mergedSnap.customerName,
            items: mergedSnap.items,
            orderTotal: mergedSnap.orderTotal,
            status: mergedSnap.status,
            requestKind: mergedSnap.requestKind,
          });
        }
        return {
          ok: true,
          id: openCall.id,
          menuId: storageMenuId,
          type: orderType,
          requestKind: openCall.requestKind ?? "order",
          tableNumber: effectiveTable,
          createdAt: openCall.createdAt,
          customerName: openCall.customerName ?? customerName,
          customerPhone: openCall.customerPhone,
          customerAddress: openCall.customerAddress,
          orderNotes: openCall.orderNotes,
          items: appended.items,
          orderTotal: appended.orderTotal,
          status: appended.status,
        };
      }
    }

    /** Bill request attaches to the open table order — never a standalone card. */
    if (requestKind === "bill" && !isDeliveryOrder) {
      const openCall = await findOpenTableCallForTable(
        storageMenuId,
        effectiveTable,
      );
      if (openCall) {
        let existingOrder: Record<string, unknown> = {};
        try {
          const moRow = await pool
            .request()
            .input("menuId", sql.Int, storageMenuId)
            .input("orderId", sql.Int, openCall.id)
            .query(
              `SELECT orderJson FROM dbo.MenuOrders WHERE menuId = @menuId AND orderId = @orderId`,
            );
          const raw = moRow.recordset[0]?.orderJson;
          if (raw) {
            existingOrder = JSON.parse(String(raw)) as Record<string, unknown>;
          }
        } catch {
          existingOrder = {};
        }

        const billName = customerName || openCall.customerName;
        const summaries = serviceRequestSummaries(
          "bill",
          effectiveTable,
          billName,
        );

        await logMenuOrderEventSafe(
          storageMenuId,
          openCall.id,
          {
            action: "TABLE_CALL_BILL_REQUESTED",
            targetType: "order",
            targetId: openCall.id,
            summaryAr: summaries.summaryAr,
            summaryEn: summaries.summaryEn,
            detailJson: JSON.stringify({
              status: openCall.status,
              requestKind: "bill",
              order: await attachMenuChargeFieldsToOrder(
                storageMenuId,
                openCall.items,
                {
                  ...existingOrder,
                  type: "table",
                  requestKind: "order",
                  tableNumber: effectiveTable,
                  customerName: openCall.customerName ?? customerName,
                  customerPhone: openCall.customerPhone ?? customerPhone,
                  customerAddress: openCall.customerAddress ?? customerAddress,
                  orderNotes: openCall.orderNotes ?? orderNotes,
                  items: openCall.items,
                  orderTotal: openCall.orderTotal,
                  status: openCall.status,
                  pendingGuestAddition:
                    existingOrder.pendingGuestAddition === true,
                  pendingBillRequest: true,
                },
              ),
            }),
          },
          {
            actorName: billName || "Guest",
            actorRole: "guest",
          },
        );
        broadcastMenuActivityUpdated(storageMenuId);
        broadcastStaffTableCallChanged(storageMenuId, {
          id: openCall.id,
          menuId: storageMenuId,
          tableNumber: effectiveTable,
          at: openCall.createdAt.toISOString(),
          customerName: openCall.customerName ?? customerName,
          items: openCall.items,
          orderTotal: openCall.orderTotal,
          status: openCall.status,
          requestKind: "bill",
        });
        return {
          ok: true,
          id: openCall.id,
          menuId: storageMenuId,
          type: "table",
          requestKind: "bill",
          tableNumber: effectiveTable,
          createdAt: openCall.createdAt,
          customerName: openCall.customerName ?? customerName,
          customerPhone: openCall.customerPhone,
          customerAddress: openCall.customerAddress,
          orderNotes: openCall.orderNotes,
          items: openCall.items,
          orderTotal: openCall.orderTotal,
          status: openCall.status,
        };
      }
    }

    const persisted = await createStaffTableCall(
      storageMenuId,
      effectiveTable,
      customerName,
      itemsResolved,
      initialStatus,
      {
        orderType,
        requestKind,
        customerPhone,
        customerAddress,
        orderNotes,
        sourceMenuId,
      },
    );
    if (!persisted) {
      return { ok: false, error: "SERVER_ERROR" };
    }

    const serviceSummaries =
      requestKind === "waiter" || requestKind === "bill"
        ? serviceRequestSummaries(requestKind, effectiveTable, customerName)
        : null;

    await logMenuOrderEventSafe(
      storageMenuId,
      persisted.id,
      {
        action: "TABLE_CALL_CREATED",
        targetType: "order",
        targetId: persisted.id,
        summaryAr: serviceSummaries
          ? serviceSummaries.summaryAr
          : isDeliveryOrder
            ? customerName
              ? distanceDelivery
                ? `طلب توصيل جديد من ${customerName} - ${distanceDelivery.distanceKm} كم`
                : `طلب توصيل جديد من ${customerName}${deliveryGovernorate ? ` - ${deliveryGovernorate.nameAr}` : ""}`
              : distanceDelivery
                ? `طلب توصيل جديد - ${distanceDelivery.distanceKm} كم`
                : `طلب توصيل جديد${deliveryGovernorate ? ` - ${deliveryGovernorate.nameAr}` : ""}`
            : customerName
              ? `طلب جديد من ${customerName} - طاولة ${effectiveTable}`
              : `طلب جديد - طاولة ${effectiveTable}`,
        summaryEn: serviceSummaries
          ? serviceSummaries.summaryEn
          : isDeliveryOrder
            ? customerName
              ? distanceDelivery
                ? `New delivery order from ${customerName} - ${distanceDelivery.distanceKm} km`
                : `New delivery order from ${customerName}${deliveryGovernorate ? ` - ${deliveryGovernorate.nameEn}` : ""}`
              : distanceDelivery
                ? `New delivery order - ${distanceDelivery.distanceKm} km`
                : `New delivery order${deliveryGovernorate ? ` - ${deliveryGovernorate.nameEn}` : ""}`
            : customerName
              ? `New order from ${customerName} - table ${effectiveTable}`
              : `New order - table ${effectiveTable}`,
        detailJson: JSON.stringify({
          status: initialStatus,
          requestKind,
          order: await attachMenuChargeFieldsToOrder(menuId, itemsResolved, {
            type: orderType,
            requestKind,
            tableNumber: effectiveTable || null,
            customerName,
            customerPhone,
            customerAddress,
            orderNotes,
            items: itemsResolved,
            orderTotal,
            status: initialStatus,
            ...(sourceMenuId != null
              ? {
                  sourceMenuId,
                  sourceMenuNameAr,
                  sourceMenuNameEn,
                }
              : {}),
            ...(deliveryGovernorate
              ? {
                  governorateId: deliveryGovernorate.id,
                  governorateNameAr: deliveryGovernorate.nameAr,
                  governorateNameEn: deliveryGovernorate.nameEn,
                  deliveryFee: Number(deliveryGovernorate.price) || 0,
                }
              : {}),
            ...(distanceDelivery
              ? {
                  branchId: distanceDelivery.branchId,
                  distanceKm: distanceDelivery.distanceKm,
                  deliveryFee: distanceDelivery.deliveryFee,
                  maxDeliveryRadiusKm: distanceDelivery.maxDeliveryRadiusKm,
                  deliveryMode: "distance",
                }
              : {}),
          }),
        }),
      },
      {
        actorName: customerName || "Guest",
        actorRole: "guest",
      },
    );

    if (isDeliveryOrder) {
      const groupIds = await getDeliveryGroupMenuIds(storageMenuId);
      const extra = groupIds.filter((id) => id !== storageMenuId);
      if (extra.length > 0) {
        broadcastMenuActivityUpdated(storageMenuId, extra);
      }
    }

    return {
      ok: true,
      id: persisted.id,
      menuId: storageMenuId,
      type: orderType,
      requestKind,
      tableNumber: effectiveTable,
      createdAt: persisted.createdAt,
      customerName,
      customerPhone,
      customerAddress,
      orderNotes,
      items: itemsResolved,
      orderTotal,
      status: initialStatus,
    };
  } catch (error) {
    logger.error("processGuestStaffCall error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export type StaffTableCallRow = {
  id: number;
  menuId: number;
  type: StaffOrderType;
  requestKind: StaffRequestKind;
  tableNumber: string;
  createdAt: Date;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  orderNotes: string | null;
  items: StaffOrderItem[];
  /** Sum of line totals for this call. */
  orderTotal: number;
  status: StaffTableCallStatus;
  /** Set when loaded from DB (e.g. snapshot) for confirmedAt mapping. */
  acknowledgedAt?: Date | null;
  /** After optional migration `lastEditedByStaffId` / `lastEditedAt` on `StaffTableCalls`. */
  lastEditedByStaffId?: number | null;
  lastEditedAt?: Date | null;
  lastEditedByName?: string | null;
};

export type StaffTableCallHistoryRow = StaffTableCallRow & {
  acknowledgedAt: Date | null;
};

export type StaffTableCallHistoryPage = {
  rows: StaffTableCallHistoryRow[];
  total: number;
  page: number;
  limit: number;
};

export async function getMenuIdForStaff(
  staffId: number,
): Promise<number | null> {
  try {
    const meta = await getMenuStaffColumnMeta();
    const pool = await getPool();
    const r = await pool
      .request()
      .input("id", sql.Int, staffId)
      .query(`SELECT * FROM MenuStaff WHERE id = @id`);

    const row = r.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    if (!getStaffIsActive(row, meta)) {
      return null;
    }

    const raw = row.menuId;
    const menuId =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? parseInt(raw, 10)
          : NaN;
    return Number.isFinite(menuId) && menuId > 0 ? menuId : null;
  } catch (error) {
    logger.error("getMenuIdForStaff error:", error);
    return null;
  }
}

/**
 * Returns Expo push tokens of all active staff for a menu, de-duplicated.
 * Empty array if the column does not exist or no staff registered a token.
 */
export async function getStaffPushTokensForMenu(
  menuId: number,
): Promise<string[]> {
  try {
    const meta = await getMenuStaffColumnMeta();
    if (!meta.expoTokenColumnQuoted) return [];

    const tokenCol = `s.${meta.expoTokenColumnQuoted}`;
    const activeCol = meta.activeColumnQuoted
      ? `s.${meta.activeColumnQuoted}`
      : null;
    const activeClause = activeCol
      ? `AND (${activeCol} = 1 OR ${activeCol} IS NULL)`
      : "";

    // Grants, not the legacy MenuStaff.menuId anchor, decide who works here.
    const pool = await getPool();
    const r = await pool.request().input("menuId", sql.Int, menuId).query(`
        SELECT DISTINCT ${tokenCol} AS token
        FROM MenuStaff s
        INNER JOIN dbo.MenuStaffGrants g ON g.staffId = s.id AND g.menuId = @menuId
        WHERE ${tokenCol} IS NOT NULL
          AND LEN(${tokenCol}) > 0
          ${activeClause}
      `);

    const seen = new Set<string>();
    for (const row of r.recordset as { token: string | null }[]) {
      const t = (row.token ?? "").trim();
      if (t.length > 0) seen.add(t);
    }
    return Array.from(seen);
  } catch (error) {
    logger.warn("getStaffPushTokensForMenu error:", error);
    return [];
  }
}

/** Read stored JSON (older rows may omit `price`). */
function parseOrderItemsFromStored(raw: unknown): StaffOrderItem[] {
  if (!Array.isArray(raw)) return [];
  const out: StaffOrderItem[] = [];
  for (const el of raw) {
    if (el == null || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const nameRaw = String(o.name ?? "")
      .trim()
      .slice(0, 500);

    let menuItemId: number | undefined;
    if (o.menuItemId != null && o.menuItemId !== "") {
      const n = Number(o.menuItemId);
      if (!Number.isFinite(n) || n <= 0) continue;
      menuItemId = Math.floor(n);
    }

    let quantity = 1;
    if (o.quantity != null && o.quantity !== "") {
      const q = Number(o.quantity);
      if (!Number.isFinite(q) || q < 1 || q > 999) continue;
      quantity = Math.floor(q);
    }

    let price: number | undefined;
    if (o.price != null && o.price !== "") {
      const pr = Number(o.price);
      if (Number.isFinite(pr) && pr >= 0 && pr <= 999_999_999.99) {
        price = Math.round(pr * 100) / 100;
      }
    }

    let notes: string | undefined;
    if (o.notes != null && o.notes !== "") {
      notes = String(o.notes).trim().slice(0, 500);
    }

    let total: number | undefined;
    if (o.total != null && o.total !== "") {
      const t = Number(o.total);
      if (Number.isFinite(t) && t >= 0 && t <= 999_999_999.99) {
        total = Math.round(t * 100) / 100;
      }
    }

    const sizeParsed = parseStaffOrderLineSize(o.size);
    const size = sizeParsed.ok ? sizeParsed.value : undefined;
    const variantParsed = parseStaffOrderLineVariant(o.variant);
    const variant = variantParsed.ok ? variantParsed.value : undefined;

    if (menuItemId !== undefined) {
      const row: StaffOrderItem = {
        name: nameRaw || `Item ${menuItemId}`,
        menuItemId,
        quantity,
        ...(price !== undefined ? { price } : {}),
        ...(total !== undefined ? { total } : {}),
        ...(notes ? { notes } : {}),
        ...(size ? { size } : {}),
        ...(variant ? { variant } : {}),
      };
      if (row.total === undefined && row.price !== undefined) {
        row.total = lineTotal(row.price, row.quantity);
      }
      out.push(row);
      continue;
    }

    if (!nameRaw) continue;
    const row: StaffOrderItem = {
      name: nameRaw,
      quantity,
      ...(price !== undefined ? { price } : {}),
      ...(total !== undefined ? { total } : {}),
      ...(notes ? { notes } : {}),
      ...(size ? { size } : {}),
      ...(variant ? { variant } : {}),
    };
    if (row.total === undefined && row.price !== undefined) {
      row.total = lineTotal(row.price, row.quantity);
    }
    out.push(row);
  }
  return out;
}

function parseOrderItemsJson(raw: string | null | undefined): StaffOrderItem[] {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseOrderItemsFromStored(parsed);
  } catch {
    return [];
  }
}

type StaffTableCallsSchemaFlags = {
  status: boolean;
  acknowledgedAt: boolean;
  lastEditedByStaffId: boolean;
  lastEditedAt: boolean;
  orderType: boolean;
  requestKind: boolean;
  customerPhone: boolean;
  customerAddress: boolean;
  orderNotes: boolean;
};

type StaffTableCallsLastEditCols = {
  byId: boolean;
  at: boolean;
};

let staffTableCallsSchemaCache: StaffTableCallsSchemaFlags | null = null;

/** Cached `StaffTableCalls` columns (status / acknowledgedAt / lastEdited* may be missing on older DBs). */
async function getStaffTableCallsSchemaFlags(): Promise<StaffTableCallsSchemaFlags> {
  if (staffTableCallsSchemaCache) {
    return staffTableCallsSchemaCache;
  }
  await ensureStaffTableCallsOrderTypeSchema();
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = N'dbo' AND TABLE_NAME = N'StaffTableCalls'
  `);
  const lower = new Set(
    (r.recordset as { COLUMN_NAME: string }[]).map((x) =>
      String(x.COLUMN_NAME).toLowerCase(),
    ),
  );
  staffTableCallsSchemaCache = {
    status: lower.has("status"),
    acknowledgedAt: lower.has("acknowledgedat"),
    lastEditedByStaffId: lower.has("lasteditedbystaffid"),
    lastEditedAt: lower.has("lasteditedat"),
    orderType: lower.has("ordertype"),
    requestKind: lower.has("requestkind"),
    customerPhone: lower.has("customerphone"),
    customerAddress: lower.has("customeraddress"),
    orderNotes: lower.has("ordernotes"),
  };
  return staffTableCallsSchemaCache;
}

/** Optional columns from migration `add-staffTableCalls-lastEdited.sql` (or equivalent). */
async function getStaffTableCallsLastEditColFlags(): Promise<StaffTableCallsLastEditCols> {
  const s = await getStaffTableCallsSchemaFlags();
  return { byId: s.lastEditedByStaffId, at: s.lastEditedAt };
}

const staffCallRowKeyWhereSql = `id = @id AND menuId = @menuId`;

function buildPendingWhereSql(flags: StaffTableCallsSchemaFlags): string {
  if (flags.status) {
    return `(status = N'pending' OR (status IS NULL AND acknowledgedAt IS NULL))`;
  }
  if (flags.acknowledgedAt) {
    return `acknowledgedAt IS NULL`;
  }
  return `1 = 1`;
}

function buildNotCancelledWhereSql(flags: StaffTableCallsSchemaFlags): string {
  if (!flags.status) {
    return "1 = 1";
  }
  return `(status IS NULL OR LOWER(LTRIM(RTRIM(status))) <> N'cancelled')`;
}

function buildEditableRowWhereSql(flags: StaffTableCallsSchemaFlags): string {
  return `${staffCallRowKeyWhereSql} AND ${buildNotCancelledWhereSql(flags)}`;
}

function buildOrderItemsSetSql(
  flags: StaffTableCallsSchemaFlags,
  opts?: {
    confirm?: boolean;
    cancel?: boolean;
    /** First-time confirm from `pending` — always stamp `acknowledgedAt`. */
    setAcknowledgedNow?: boolean;
  },
): string {
  const sets = ["orderItemsJson = @orderItemsJson"];
  if (opts?.cancel) {
    if (flags.status) {
      sets.push("status = N'cancelled'");
    }
    if (flags.acknowledgedAt) {
      sets.push("acknowledgedAt = NULL");
    }
    return sets.join(",\n            ");
  }
  if (opts?.confirm) {
    if (flags.status) {
      sets.push("status = N'confirmed'");
    }
    if (flags.acknowledgedAt) {
      sets.push(
        opts.setAcknowledgedNow
          ? "acknowledgedAt = SYSUTCDATETIME()"
          : "acknowledgedAt = CASE WHEN acknowledgedAt IS NULL THEN SYSUTCDATETIME() ELSE acknowledgedAt END",
      );
    }
  }
  return sets.join(",\n            ");
}

function resolveStaffOrderType(row: {
  orderType?: string | null;
  tableNumber?: string | null;
}): StaffOrderType {
  const raw = String(row.orderType ?? "")
    .trim()
    .toLowerCase();
  if (raw === "delivery" || raw === "table") return raw;
  const table = String(row.tableNumber ?? "")
    .trim()
    .toLowerCase();
  return table === "delivery" ? "delivery" : "table";
}

function resolveStaffRequestKind(row: {
  requestKind?: string | null;
}): StaffRequestKind {
  return parseStaffRequestKind(row.requestKind);
}

function toStaffTableCallRow(
  row: {
    id: number;
    menuId: number;
    tableNumber: string;
    orderType?: string | null;
    requestKind?: string | null;
    createdAt: Date;
    customerName: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
    orderNotes?: string | null;
    orderItemsJson?: string;
    status?: string | null;
    acknowledgedAt?: Date | null;
    lastEditedByStaffId?: number | null;
    lastEditedAt?: Date | null;
    lastEditedByName?: string | null;
  },
  includeLastEdit: boolean,
  charges?: {
    taxEnabled: boolean;
    taxPercent: number | null;
    serviceEnabled: boolean;
    servicePercent: number | null;
  } | null,
): StaffTableCallRow {
  const items = parseOrderItemsJson(row.orderItemsJson);
  const status = normalizeStaffTableCallStatus(
    row.status,
    row.acknowledgedAt ?? null,
  );
  const subtotal = computeOrderTotalFromItems(items);
  const orderTotal = charges
    ? applyMenuOrderCharges(subtotal, charges).total
    : subtotal;
  const base: StaffTableCallRow = {
    id: row.id,
    menuId: row.menuId,
    type: resolveStaffOrderType(row),
    requestKind: resolveStaffRequestKind(row),
    tableNumber: String(row.tableNumber),
    createdAt: row.createdAt,
    customerName:
      row.customerName != null && String(row.customerName).trim() !== ""
        ? String(row.customerName).trim()
        : null,
    customerPhone:
      row.customerPhone != null && String(row.customerPhone).trim() !== ""
        ? String(row.customerPhone).trim()
        : null,
    customerAddress:
      row.customerAddress != null && String(row.customerAddress).trim() !== ""
        ? String(row.customerAddress).trim()
        : null,
    orderNotes:
      row.orderNotes != null && String(row.orderNotes).trim() !== ""
        ? String(row.orderNotes).trim()
        : null,
    items,
    orderTotal,
    status,
    acknowledgedAt: row.acknowledgedAt ?? null,
  };
  if (includeLastEdit) {
    const sid = row.lastEditedByStaffId;
    const sidNum =
      sid != null && Number.isFinite(Number(sid))
        ? Math.floor(Number(sid))
        : null;
    base.lastEditedByStaffId = sidNum && sidNum > 0 ? sidNum : null;
    if (row.lastEditedAt != null) {
      const d =
        row.lastEditedAt instanceof Date
          ? row.lastEditedAt
          : new Date(String(row.lastEditedAt));
      base.lastEditedAt = !Number.isNaN(d.getTime()) ? d : null;
    } else {
      base.lastEditedAt = null;
    }
    const nm = row.lastEditedByName;
    base.lastEditedByName =
      nm != null && String(nm).trim() !== "" ? String(nm).trim() : null;
  }
  return base;
}

export async function createStaffTableCall(
  menuId: number,
  tableNumber: string,
  customerName: string | null,
  items: StaffOrderItem[],
  initialStatus: StaffTableCallStatus = "pending",
  meta?: {
    orderType?: StaffOrderType;
    requestKind?: StaffRequestKind;
    customerPhone?: string | null;
    customerAddress?: string | null;
    orderNotes?: string | null;
    sourceMenuId?: number | null;
  },
): Promise<{ id: number; createdAt: Date } | null> {
  try {
    await ensureStaffTableCallsOrderTypeSchema();
    // Column may have been added after an earlier cache fill in this process.
    staffTableCallsSchemaCache = null;
    await ensureMenuGroupSchema();
    const pool = await getPool();
    const orderJson = items.length > 0 ? JSON.stringify(items) : null;
    const statusNorm = parseGuestInitialStaffCallStatus(initialStatus);
    const acknowledgedAt = statusNorm === "confirmed" ? new Date() : null;
    const orderType = meta?.orderType === "delivery" ? "delivery" : "table";
    const requestKind = parseStaffRequestKind(meta?.requestKind);
    const sourceMenuId =
      meta?.sourceMenuId != null &&
      Number.isFinite(meta.sourceMenuId) &&
      meta.sourceMenuId > 0
        ? meta.sourceMenuId
        : null;
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("tableNumber", sql.NVarChar, tableNumber)
      .input("customerName", sql.NVarChar, customerName)
      .input("orderItemsJson", sql.NVarChar(sql.MAX), orderJson)
      .input("status", sql.NVarChar(20), statusNorm)
      .input("acknowledgedAt", sql.DateTime2, acknowledgedAt)
      .input("orderType", sql.NVarChar(20), orderType)
      .input("requestKind", sql.NVarChar(20), requestKind)
      .input("customerPhone", sql.NVarChar(50), meta?.customerPhone ?? null)
      .input(
        "customerAddress",
        sql.NVarChar(500),
        meta?.customerAddress ?? null,
      )
      .input("orderNotes", sql.NVarChar(500), meta?.orderNotes ?? null)
      .input("sourceMenuId", sql.Int, sourceMenuId).query(`
        INSERT INTO StaffTableCalls (
          menuId, tableNumber, customerName, orderItemsJson, status, acknowledgedAt,
          orderType, requestKind, customerPhone, customerAddress, orderNotes, sourceMenuId
        )
        OUTPUT INSERTED.id, INSERTED.createdAt
        VALUES (
          @menuId, @tableNumber, @customerName, @orderItemsJson, @status, @acknowledgedAt,
          @orderType, @requestKind, @customerPhone, @customerAddress, @orderNotes, @sourceMenuId
        )
      `);
    const row = result.recordset[0];
    if (!row?.id) {
      return null;
    }
    return {
      id: row.id as number,
      createdAt: row.createdAt as Date,
    };
  } catch (error) {
    logger.error("createStaffTableCall error:", error);
    return null;
  }
}

export async function getStaffTableCallSnapshot(
  menuId: number,
  callId: number,
): Promise<StaffTableCallRow | null> {
  try {
    await ensureStaffTableCallsOrderTypeSchema();
    const pool = await getPool();
    const flags = await getStaffTableCallsLastEditColFlags();
    const hasLast = flags.byId && flags.at;
    let result;
    if (hasLast) {
      const ms = await getMenuStaffColumnMeta();
      const nameCol = quoteMenuStaffIdent(ms.nameKey);
      result = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("id", sql.Int, callId).query(`
        SELECT
          c.id,
          c.menuId,
          c.tableNumber,
          c.orderType,
          c.requestKind,
          c.customerPhone,
          c.customerAddress,
          c.orderNotes,
          c.createdAt,
          c.customerName,
          c.orderItemsJson,
          c.status,
          c.acknowledgedAt,
          c.lastEditedByStaffId,
          c.lastEditedAt,
          sm.${nameCol} AS lastEditedByName
        FROM StaffTableCalls c
        LEFT JOIN MenuStaff sm ON sm.id = c.lastEditedByStaffId
        WHERE c.id = @id AND c.menuId = @menuId
      `);
    } else {
      result = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("id", sql.Int, callId).query(`
        SELECT
          id,
          menuId,
          tableNumber,
          orderType,
          requestKind,
          customerPhone,
          customerAddress,
          orderNotes,
          createdAt,
          customerName,
          orderItemsJson,
          status,
          acknowledgedAt
        FROM StaffTableCalls
        WHERE id = @id AND menuId = @menuId
      `);
    }
    const row = result.recordset[0] as
      | {
          id: number;
          menuId: number;
          tableNumber: string;
          createdAt: Date;
          customerName: string | null;
          orderItemsJson?: string;
          status?: string | null;
          acknowledgedAt?: Date | null;
          lastEditedByStaffId?: number | null;
          lastEditedAt?: Date | null;
          lastEditedByName?: string | null;
        }
      | undefined;
    if (!row) {
      return null;
    }
    const charges = await fetchMenuOrderCharges(menuId);
    return toStaffTableCallRow(row, hasLast, charges);
  } catch (error) {
    logger.error("getStaffTableCallSnapshot error:", error);
    return null;
  }
}

export async function getPendingStaffTableCalls(
  menuId: number,
  limit = 100,
): Promise<StaffTableCallRow[]> {
  try {
    await ensureStaffTableCallsOrderTypeSchema();
    const pool = await getPool();
    const result = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .input("limit", sql.Int, Math.min(Math.max(limit, 1), 500)).query(`
        SELECT TOP (@limit)
          id,
          menuId,
          tableNumber,
          orderType,
          requestKind,
          customerPhone,
          customerAddress,
          orderNotes,
          createdAt,
          customerName,
          orderItemsJson,
          status,
          acknowledgedAt
        FROM StaffTableCalls
        WHERE menuId = @menuId
          AND (
            status = N'pending'
            OR (status IS NULL AND acknowledgedAt IS NULL)
          )
        ORDER BY createdAt ASC
      `);
    const charges = await fetchMenuOrderCharges(menuId);
    return (result.recordset as Record<string, unknown>[]).map((row) =>
      toStaffTableCallRow(
        row as Parameters<typeof toStaffTableCallRow>[0],
        false,
        charges,
      ),
    );
  } catch (error) {
    logger.error("getPendingStaffTableCalls error:", error);
    return [];
  }
}

/**
 * All table-call rows for a menu (newest first).
 */
export async function getStaffTableCallsHistory(
  menuId: number,
  page = 1,
  limit = 20,
): Promise<StaffTableCallHistoryPage> {
  try {
    await ensureStaffTableCallsOrderTypeSchema();
    const pool = await getPool();
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
    const offset = (safePage - 1) * safeLimit;

    const totalResult = await pool.request().input("menuId", sql.Int, menuId)
      .query(`
        SELECT COUNT(*) as total
        FROM StaffTableCalls
        WHERE menuId = @menuId
      `);
    const total = Number(totalResult.recordset[0]?.total ?? 0);

    const flags = await getStaffTableCallsLastEditColFlags();
    const hasLast = flags.byId && flags.at;
    let rowsResult;
    if (hasLast) {
      const ms = await getMenuStaffColumnMeta();
      const nameCol = quoteMenuStaffIdent(ms.nameKey);
      rowsResult = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("offset", sql.Int, offset)
        .input("limit", sql.Int, safeLimit).query(`
        SELECT
          c.id,
          c.menuId,
          c.tableNumber,
          c.orderType,
          c.requestKind,
          c.createdAt,
          c.acknowledgedAt,
          c.customerName,
          c.orderItemsJson,
          c.status,
          c.lastEditedByStaffId,
          c.lastEditedAt,
          sm.${nameCol} AS lastEditedByName
        FROM StaffTableCalls c
        LEFT JOIN MenuStaff sm ON sm.id = c.lastEditedByStaffId
        WHERE c.menuId = @menuId
        ORDER BY c.createdAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    } else {
      rowsResult = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("offset", sql.Int, offset)
        .input("limit", sql.Int, safeLimit).query(`
        SELECT
          id,
          menuId,
          tableNumber,
          orderType,
          requestKind,
          createdAt,
          acknowledgedAt,
          customerName,
          orderItemsJson,
          status
        FROM StaffTableCalls
        WHERE menuId = @menuId
        ORDER BY createdAt DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);
    }

    const charges = await fetchMenuOrderCharges(menuId);
    const rows = (rowsResult.recordset as Record<string, unknown>[]).map(
      (row) => {
        const r = row as {
          id: number;
          menuId: number;
          tableNumber: string;
          createdAt: Date;
          customerName: string | null;
          orderItemsJson?: string;
          status?: string | null;
          acknowledgedAt?: Date | null;
          lastEditedByStaffId?: number | null;
          lastEditedAt?: Date | null;
          lastEditedByName?: string | null;
        };
        return toStaffTableCallRow(
          r,
          hasLast,
          charges,
        ) as StaffTableCallHistoryRow;
      },
    );

    return {
      rows,
      total,
      page: safePage,
      limit: safeLimit,
    };
  } catch (error) {
    logger.error("getStaffTableCallsHistory error:", error);
    return {
      rows: [],
      total: 0,
      page: Math.max(1, Math.floor(page)),
      limit: Math.min(Math.max(Math.floor(limit), 1), 500),
    };
  }
}

/**
 * Staff sets order lifecycle: `confirmed` (sets `acknowledgedAt`) or `cancelled`.
 * Only from `pending`.
 */
export async function setStaffTableCallStatus(
  callId: number,
  menuId: number,
  nextStatus: "confirmed" | "cancelled",
): Promise<boolean> {
  try {
    const pool = await getPool();
    const schema = await getStaffTableCallsSchemaFlags();
    const pendingWhere = buildPendingWhereSql(schema);
    if (nextStatus === "confirmed") {
      const setParts: string[] = [];
      if (schema.acknowledgedAt) {
        setParts.push("acknowledgedAt = SYSUTCDATETIME()");
      }
      if (schema.status) {
        setParts.push("status = N'confirmed'");
      }
      if (setParts.length === 0) {
        return false;
      }
      const result = await pool
        .request()
        .input("id", sql.Int, callId)
        .input("menuId", sql.Int, menuId).query(`
          UPDATE StaffTableCalls
          SET ${setParts.join(", ")}
          WHERE id = @id AND menuId = @menuId
            AND ${pendingWhere}
        `);
      return (result.rowsAffected?.[0] ?? 0) > 0;
    }
    const cancelSets: string[] = [];
    if (schema.status) {
      cancelSets.push("status = N'cancelled'");
    }
    if (schema.acknowledgedAt) {
      cancelSets.push("acknowledgedAt = NULL");
    }
    if (cancelSets.length === 0) {
      return false;
    }
    const result = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId).query(`
        UPDATE StaffTableCalls
        SET ${cancelSets.join(", ")}
        WHERE id = @id AND menuId = @menuId
          AND ${pendingWhere}
      `);
    return (result.rowsAffected?.[0] ?? 0) > 0;
  } catch (error) {
    logger.error("setStaffTableCallStatus error:", error);
    return false;
  }
}

/**
 * Advance lifecycle after confirm: `confirmed` → `prepared` → `delivered`.
 */
export async function advanceStaffTableCallStatus(
  callId: number,
  menuId: number,
  nextStatus: "prepared" | "delivered",
): Promise<boolean> {
  try {
    const pool = await getPool();
    const schema = await getStaffTableCallsSchemaFlags();
    if (!schema.status) {
      return false;
    }
    const requiredCurrent =
      nextStatus === "prepared" ? "confirmed" : "prepared";
    const result = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId)
      .input("nextStatus", sql.NVarChar(20), nextStatus)
      .input("requiredCurrent", sql.NVarChar(20), requiredCurrent).query(`
        UPDATE StaffTableCalls
        SET status = @nextStatus
        WHERE id = @id AND menuId = @menuId
          AND LOWER(LTRIM(RTRIM(ISNULL(status, '')))) = @requiredCurrent
      `);
    return (result.rowsAffected?.[0] ?? 0) > 0;
  } catch (error) {
    logger.error("advanceStaffTableCallStatus error:", error);
    return false;
  }
}

export type UpdateStaffCallItemsError =
  | "NOT_FOUND"
  | "NOT_PENDING"
  | "NOT_EDITABLE"
  | "INVALID_PAYLOAD"
  | "INVALID_ORDER_ITEMS"
  | "SERVER_ERROR";

/**
 * Staff edits line quantities / removes lines while the order is pending or after confirm.
 * Replaces `orderItemsJson` with enriched items and recomputed line totals.
 * Cancelled orders are not editable.
 */
export async function updateStaffTableCallItems(
  callId: number,
  menuId: number,
  itemsRaw: unknown,
  editorStaffId: number,
): Promise<
  | {
      ok: true;
      items: StaffOrderItem[];
      orderTotal: number;
      tableNumber: string;
      customerName: string | null;
      createdAt: Date;
      status: StaffTableCallStatus;
    }
  | { ok: false; error: UpdateStaffCallItemsError }
> {
  const parsed = parseOrderItemsInput(itemsRaw);
  if (!parsed.ok) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const itemsIn = parsed.items;
  if (!Number.isFinite(editorStaffId) || editorStaffId <= 0) {
    return { ok: false, error: "SERVER_ERROR" };
  }

  try {
    const pool = await getPool();
    const rowResult = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId).query(`
        SELECT id, tableNumber, customerName, orderItemsJson, status, acknowledgedAt, createdAt
        FROM StaffTableCalls
        WHERE id = @id AND menuId = @menuId
      `);
    const row = rowResult.recordset[0] as
      | {
          tableNumber: string;
          customerName: string | null;
          status?: string | null;
          acknowledgedAt?: Date | null;
          createdAt: Date;
        }
      | undefined;
    if (!row) {
      return { ok: false, error: "NOT_FOUND" };
    }
    const st = normalizeStaffTableCallStatus(
      row.status,
      row.acknowledgedAt ?? null,
    );
    if (st === "cancelled" || st === "delivered") {
      return { ok: false, error: "NOT_EDITABLE" };
    }
    if (st !== "pending" && st !== "confirmed" && st !== "prepared") {
      return { ok: false, error: "NOT_EDITABLE" };
    }

    const idsForCheck = itemsIn
      .map((i) => i.menuItemId)
      .filter((id): id is number => typeof id === "number");
    const menuScope = await resolveOrderItemsMenuScope(menuId);
    if (idsForCheck.length > 0) {
      const okIds = await menuItemsExistForMenus(menuScope, idsForCheck);
      if (!okIds) {
        return { ok: false, error: "INVALID_ORDER_ITEMS" };
      }
    }

    let itemsResolved: StaffOrderItem[];
    try {
      itemsResolved = await enrichMenuItemsFromDb(menuScope, itemsIn);
    } catch (e) {
      logger.error("updateStaffTableCallItems enrich error:", e);
      return { ok: false, error: "SERVER_ERROR" };
    }

    const orderTotal = await computeOrderTotalWithMenuCharges(
      menuId,
      itemsResolved,
    );
    const orderJson =
      itemsResolved.length > 0 ? JSON.stringify(itemsResolved) : null;

    const schema = await getStaffTableCallsSchemaFlags();
    const hasLast = schema.lastEditedByStaffId && schema.lastEditedAt;

    const runItemsUpdate = async (withLastEdit: boolean) => {
      const req = pool
        .request()
        .input("id", sql.Int, callId)
        .input("menuId", sql.Int, menuId)
        .input("orderItemsJson", sql.NVarChar(sql.MAX), orderJson);
      if (withLastEdit) {
        req.input("editorStaffId", sql.Int, editorStaffId);
        return req.query(`
          UPDATE StaffTableCalls
          SET orderItemsJson = @orderItemsJson,
              lastEditedByStaffId = @editorStaffId,
              lastEditedAt = SYSUTCDATETIME()
          WHERE ${buildEditableRowWhereSql(schema)}
        `);
      }
      return req.query(`
        UPDATE StaffTableCalls
        SET orderItemsJson = @orderItemsJson
        WHERE ${buildEditableRowWhereSql(schema)}
      `);
    };

    let upd;
    try {
      upd = hasLast ? await runItemsUpdate(true) : await runItemsUpdate(false);
    } catch (updErr) {
      if (!hasLast) {
        throw updErr;
      }
      logger.warn(
        "updateStaffTableCallItems lastEdited columns failed, retrying without",
        updErr,
      );
      upd = await runItemsUpdate(false);
    }
    if ((upd.rowsAffected?.[0] ?? 0) === 0) {
      return { ok: false, error: "NOT_FOUND" };
    }

    return {
      ok: true,
      items: itemsResolved,
      orderTotal,
      tableNumber: String(row.tableNumber),
      customerName:
        row.customerName != null && String(row.customerName).trim() !== ""
          ? String(row.customerName).trim()
          : null,
      createdAt: row.createdAt,
      status: st,
    };
  } catch (error) {
    logger.error("updateStaffTableCallItems error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

export type UpdateStaffCallItemsAndStatusError = UpdateStaffCallItemsError;

/**
 * Replace order lines and optionally set lifecycle status.
 * While `pending`: `statusTarget` may confirm/cancel or replace items only.
 * While `confirmed`: `statusTarget` `pending` or `confirmed` replaces items only (PUT from staff app).
 */
export async function updateStaffTableCallItemsAndStatus(
  callId: number,
  menuId: number,
  itemsRaw: unknown,
  statusTarget: "pending" | "confirmed" | "cancelled",
): Promise<
  | {
      ok: true;
      items: StaffOrderItem[];
      orderTotal: number;
      status: StaffTableCallStatus;
    }
  | { ok: false; error: UpdateStaffCallItemsAndStatusError }
> {
  const parsed = parseOrderItemsInput(itemsRaw);
  if (!parsed.ok) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const itemsIn = parsed.items;

  try {
    const pool = await getPool();
    const rowResult = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId).query(`
        SELECT id, status, acknowledgedAt
        FROM StaffTableCalls
        WHERE id = @id AND menuId = @menuId
      `);
    const row = rowResult.recordset[0] as
      | {
          status?: string | null;
          acknowledgedAt?: Date | null;
        }
      | undefined;
    if (!row) {
      return { ok: false, error: "NOT_FOUND" };
    }
    const st = normalizeStaffTableCallStatus(
      row.status,
      row.acknowledgedAt ?? null,
    );
    if (st === "cancelled" || st === "delivered") {
      return { ok: false, error: "NOT_EDITABLE" };
    }

    const idsForCheck = itemsIn
      .map((i) => i.menuItemId)
      .filter((id): id is number => typeof id === "number");
    const menuScope = await resolveOrderItemsMenuScope(menuId);
    if (idsForCheck.length > 0) {
      const okIds = await menuItemsExistForMenus(menuScope, idsForCheck);
      if (!okIds) {
        return { ok: false, error: "INVALID_ORDER_ITEMS" };
      }
    }

    let itemsResolved: StaffOrderItem[];
    try {
      itemsResolved = await enrichMenuItemsFromDb(menuScope, itemsIn);
    } catch (e) {
      logger.error("updateStaffTableCallItemsAndStatus enrich error:", e);
      return { ok: false, error: "SERVER_ERROR" };
    }

    const orderTotal = await computeOrderTotalWithMenuCharges(
      menuId,
      itemsResolved,
    );
    const orderJson =
      itemsResolved.length > 0 ? JSON.stringify(itemsResolved) : null;

    const schema = await getStaffTableCallsSchemaFlags();
    const pendingWhere = buildPendingWhereSql(schema);

    let setSql: string;
    let whereSql: string;
    let outStatus: StaffTableCallStatus;

    if (st === "confirmed" || st === "prepared") {
      if (statusTarget === "cancelled") {
        return { ok: false, error: "NOT_PENDING" };
      }
      setSql =
        st === "confirmed"
          ? buildOrderItemsSetSql(schema, { confirm: true })
          : buildOrderItemsSetSql(schema);
      whereSql = buildEditableRowWhereSql(schema);
      outStatus = st;
    } else if (statusTarget === "pending") {
      setSql = buildOrderItemsSetSql(schema);
      whereSql = `${staffCallRowKeyWhereSql} AND ${pendingWhere}`;
      outStatus = "pending";
    } else if (statusTarget === "confirmed") {
      setSql = buildOrderItemsSetSql(schema, {
        confirm: true,
        setAcknowledgedNow: true,
      });
      whereSql = `${staffCallRowKeyWhereSql} AND ${pendingWhere}`;
      outStatus = "confirmed";
    } else {
      setSql = buildOrderItemsSetSql(schema, { cancel: true });
      whereSql = `${staffCallRowKeyWhereSql} AND ${pendingWhere}`;
      outStatus = "cancelled";
    }

    const upd = await pool
      .request()
      .input("id", sql.Int, callId)
      .input("menuId", sql.Int, menuId)
      .input("orderItemsJson", sql.NVarChar(sql.MAX), orderJson).query(`
        UPDATE StaffTableCalls
        SET ${setSql}
        WHERE ${whereSql}
      `);

    if ((upd.rowsAffected?.[0] ?? 0) === 0) {
      return {
        ok: false,
        error: st === "confirmed" ? "NOT_FOUND" : "NOT_PENDING",
      };
    }

    return {
      ok: true,
      items: itemsResolved,
      orderTotal,
      status: outStatus,
    };
  } catch (error) {
    logger.error("updateStaffTableCallItemsAndStatus error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

/**
 * Remove table/delivery staff calls (and matching MenuOrders) for all menus of a user.
 * Used when downgrading Pro → Free so pending order notifications disappear.
 */
export async function clearStaffTableAndDeliveryCallsForUser(
  userId: number,
): Promise<{ clearedCalls: number; clearedOrders: number }> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return { clearedCalls: 0, clearedOrders: 0 };
  }

  try {
    const pool = await getPool();

    const menusResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT id FROM Menus WHERE userId = @userId
      `);
    const menuIds = (menusResult.recordset as { id: number }[])
      .map((r) => Number(r.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (menuIds.length === 0) {
      return { clearedCalls: 0, clearedOrders: 0 };
    }

    const stcOid = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.StaffTableCalls', N'U') AS oid
    `);
    if (!stcOid.recordset[0]?.oid) {
      return { clearedCalls: 0, clearedOrders: 0 };
    }

    let clearedOrders = 0;
    const moOid = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.MenuOrders', N'U') AS oid
    `);
    if (moOid.recordset[0]?.oid) {
      const moDel = await pool.request().input("userId", sql.Int, userId)
        .query(`
          DELETE mo
          FROM dbo.MenuOrders mo
          INNER JOIN Menus m ON mo.menuId = m.id
          WHERE m.userId = @userId
            AND EXISTS (
              SELECT 1
              FROM dbo.StaffTableCalls stc
              WHERE stc.menuId = mo.menuId
                AND stc.id = mo.orderId
            )
        `);
      clearedOrders = Number(moDel.rowsAffected?.[0] ?? 0);
    }

    const callsDel = await pool.request().input("userId", sql.Int, userId)
      .query(`
        DELETE stc
        FROM dbo.StaffTableCalls stc
        INNER JOIN Menus m ON stc.menuId = m.id
        WHERE m.userId = @userId
      `);
    const clearedCalls = Number(callsDel.rowsAffected?.[0] ?? 0);

    for (const menuId of menuIds) {
      broadcastMenuActivityUpdated(menuId);
    }

    if (clearedCalls > 0 || clearedOrders > 0) {
      logger.info(
        `Cleared ${clearedCalls} StaffTableCalls and ${clearedOrders} MenuOrders for user ${userId} (Pro→Free)`,
      );
    }

    return { clearedCalls, clearedOrders };
  } catch (error) {
    logger.error(
      `clearStaffTableAndDeliveryCallsForUser error for user ${userId}:`,
      error,
    );
    throw error;
  }
}

export type GuestOpenTableOrderError =
  | "INVALID_PAYLOAD"
  | "MENU_NOT_FOUND"
  | "FEATURE_REQUIRES_PRO"
  | "INVALID_TABLE"
  | "NOT_FOUND"
  | "NOT_EDITABLE"
  | "INVALID_ORDER_ITEMS"
  | "SERVER_ERROR";

export type GuestOpenTableOrderCall = {
  id: number;
  menuId: number;
  tableNumber: string;
  customerName: string | null;
  items: StaffOrderItem[];
  orderTotal: number;
  status: StaffTableCallStatus;
  createdAt: Date;
  requestKind: StaffRequestKind;
};

async function assertGuestTableOrderAccess(
  menuId: number,
  tableNumber: string,
): Promise<{ ok: true; tableNumber: string } | { ok: false; error: GuestOpenTableOrderError }> {
  if (!Number.isFinite(menuId) || menuId <= 0) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }
  const safeTable = String(tableNumber ?? "")
    .trim()
    .slice(0, 50);
  if (!safeTable) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }

  try {
    const pool = await getPool();
    const menuCheck = await pool
      .request()
      .input("id", sql.Int, menuId)
      .query(`SELECT id, isActive, userId FROM Menus WHERE id = @id`);
    const m = menuCheck.recordset[0];
    if (!m || !m.isActive) {
      return { ok: false, error: "MENU_NOT_FOUND" };
    }
    const ownerId = m.userId as number;
    if (!(await hasCapability(ownerId, "tableOrderingQr"))) {
      return { ok: false, error: "FEATURE_REQUIRES_PRO" };
    }

    const tablesCount = await pool
      .request()
      .input("menuId", sql.Int, menuId)
      .query(`SELECT COUNT(*) as c FROM MenuTables WHERE menuId = @menuId`);
    const hasTables = Number(tablesCount.recordset[0]?.c) > 0;
    if (hasTables) {
      const tableMeta = await getMenuTablesColumnMeta();
      const activeSql = tableMeta.activeColumnQuoted
        ? ` AND ${tableMeta.activeColumnQuoted} = 1`
        : "";
      const match = await pool
        .request()
        .input("menuId", sql.Int, menuId)
        .input("tableNumber", sql.NVarChar, safeTable)
        .query(
          `SELECT id FROM MenuTables WHERE menuId = @menuId AND tableNumber = @tableNumber${activeSql}`,
        );
      if (match.recordset.length === 0) {
        return { ok: false, error: "INVALID_TABLE" };
      }
    }

    return { ok: true, tableNumber: safeTable };
  } catch (error) {
    logger.error("assertGuestTableOrderAccess error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

function toGuestOpenTableOrderCall(
  row: StaffTableCallRow,
): GuestOpenTableOrderCall {
  return {
    id: row.id,
    menuId: row.menuId,
    tableNumber: row.tableNumber,
    customerName: row.customerName,
    items: row.items,
    orderTotal: row.orderTotal,
    status: row.status,
    createdAt: row.createdAt,
    requestKind: row.requestKind,
  };
}

/**
 * Public: open table order for guest View (menuId + tableNumber).
 */
export async function getGuestOpenTableOrder(
  menuId: number,
  tableNumber: string,
): Promise<
  | { ok: true; call: GuestOpenTableOrderCall | null }
  | { ok: false; error: GuestOpenTableOrderError }
> {
  const access = await assertGuestTableOrderAccess(menuId, tableNumber);
  if (!access.ok) {
    return access;
  }
  try {
    const openCall = await findOpenTableCallForTable(menuId, access.tableNumber);
    return {
      ok: true,
      call: openCall ? toGuestOpenTableOrderCall(openCall) : null,
    };
  } catch (error) {
    logger.error("getGuestOpenTableOrder error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}

/**
 * Public: guest replaces pending open-table items (or cancels if items empty).
 * Confirmed/prepared orders are not editable.
 */
export async function replaceGuestPendingTableOrder(
  menuId: number,
  tableNumber: string,
  itemsRaw: unknown,
): Promise<
  | {
      ok: true;
      cancelled: boolean;
      call: GuestOpenTableOrderCall | null;
    }
  | { ok: false; error: GuestOpenTableOrderError }
> {
  const access = await assertGuestTableOrderAccess(menuId, tableNumber);
  if (!access.ok) {
    return access;
  }

  const parsed = parseOrderItemsInput(itemsRaw);
  if (!parsed.ok) {
    return { ok: false, error: "INVALID_PAYLOAD" };
  }

  try {
    const openCall = await findOpenTableCallForTable(menuId, access.tableNumber);
    if (!openCall) {
      return { ok: false, error: "NOT_FOUND" };
    }
    if (openCall.status !== "pending") {
      return { ok: false, error: "NOT_EDITABLE" };
    }

    const safeTable = access.tableNumber;

    if (parsed.items.length === 0) {
      const cancelled = await setStaffTableCallStatus(
        openCall.id,
        menuId,
        "cancelled",
      );
      if (!cancelled) {
        return { ok: false, error: "NOT_EDITABLE" };
      }
      await logMenuOrderEventSafe(
        menuId,
        openCall.id,
        {
          action: "TABLE_CALL_CANCELLED",
          targetType: "order",
          targetId: openCall.id,
          summaryAr: `إلغاء طلب طاولة ${safeTable} من الضيف`,
          summaryEn: `Guest cancelled table ${safeTable} order`,
          detailJson: JSON.stringify({
            status: "cancelled",
            cancelledByGuest: true,
            order: {
              type: "table",
              requestKind: "order",
              tableNumber: safeTable,
              customerName: openCall.customerName,
              items: [],
              orderTotal: 0,
              status: "cancelled",
            },
          }),
        },
        {
          actorName: openCall.customerName || "Guest",
          actorRole: "guest",
        },
      );
      broadcastMenuActivityUpdated(menuId);
      broadcastStaffTableCallChanged(menuId, {
        id: openCall.id,
        menuId,
        tableNumber: safeTable,
        at: openCall.createdAt.toISOString(),
        customerName: openCall.customerName,
        items: [],
        orderTotal: 0,
        status: "cancelled",
        requestKind: openCall.requestKind,
      });
      return { ok: true, cancelled: true, call: null };
    }

    const idsForCheck = parsed.items
      .map((i) => i.menuItemId)
      .filter((id): id is number => typeof id === "number");
    if (idsForCheck.length > 0) {
      const okIds = await menuItemsExistForMenu(menuId, idsForCheck);
      if (!okIds) {
        return { ok: false, error: "INVALID_ORDER_ITEMS" };
      }
    }

    let itemsResolved: StaffOrderItem[];
    try {
      itemsResolved = await enrichMenuItemsFromDb(menuId, parsed.items);
    } catch (e) {
      logger.error("replaceGuestPendingTableOrder enrich error:", e);
      return { ok: false, error: "SERVER_ERROR" };
    }

    const orderTotal = await computeOrderTotalWithMenuCharges(
      menuId,
      itemsResolved,
    );
    const orderJson = JSON.stringify(itemsResolved);
    const pool = await getPool();
    const schema = await getStaffTableCallsSchemaFlags();
    const upd = await pool
      .request()
      .input("id", sql.Int, openCall.id)
      .input("menuId", sql.Int, menuId)
      .input("orderItemsJson", sql.NVarChar(sql.MAX), orderJson).query(`
        UPDATE StaffTableCalls
        SET orderItemsJson = @orderItemsJson
        WHERE ${buildEditableRowWhereSql(schema)}
          AND (
            status IS NULL
            OR LOWER(LTRIM(RTRIM(status))) = N'pending'
          )
      `);
    if ((upd.rowsAffected?.[0] ?? 0) === 0) {
      return { ok: false, error: "NOT_EDITABLE" };
    }

    await logMenuOrderEventSafe(
      menuId,
      openCall.id,
      {
        action: "TABLE_CALL_ITEMS_UPDATED",
        targetType: "order",
        targetId: openCall.id,
        summaryAr: openCall.customerName
          ? `تعديل طلب ${openCall.customerName} — طاولة ${safeTable}`
          : `تعديل طلب طاولة ${safeTable}`,
        summaryEn: openCall.customerName
          ? `Order updated — ${openCall.customerName} — table ${safeTable}`
          : `Table ${safeTable} order updated`,
        detailJson: JSON.stringify({
          status: "pending",
          editedByGuest: true,
          order: await attachMenuChargeFieldsToOrder(menuId, itemsResolved, {
            type: "table",
            requestKind: "order",
            tableNumber: safeTable,
            customerName: openCall.customerName,
            items: itemsResolved,
            orderTotal,
            status: "pending",
            pendingGuestAddition: true,
          }),
        }),
      },
      {
        actorName: openCall.customerName || "Guest",
        actorRole: "guest",
      },
    );
    broadcastMenuActivityUpdated(menuId);
    broadcastStaffTableCallChanged(menuId, {
      id: openCall.id,
      menuId,
      tableNumber: safeTable,
      at: openCall.createdAt.toISOString(),
      customerName: openCall.customerName,
      items: itemsResolved,
      orderTotal,
      status: "pending",
      requestKind: openCall.requestKind,
    });

    return {
      ok: true,
      cancelled: false,
      call: {
        id: openCall.id,
        menuId,
        tableNumber: safeTable,
        customerName: openCall.customerName,
        items: itemsResolved,
        orderTotal,
        status: "pending",
        createdAt: openCall.createdAt,
        requestKind: openCall.requestKind,
      },
    };
  } catch (error) {
    logger.error("replaceGuestPendingTableOrder error:", error);
    return { ok: false, error: "SERVER_ERROR" };
  }
}
