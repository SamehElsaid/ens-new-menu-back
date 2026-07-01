import { getPool, sql } from "../config/database";
import { ensureDeliverySchema } from "../schemas/delivery.schema";
import { haversineKm, parseGeoCoord } from "../utils/geoDistance";
import {
  buildSqlIntInList,
  getDeliveryGroupMenuIds,
} from "./menuGroup.service";

export const DEFAULT_BRANCH_RADIUS_KM = 10;
/** Minimum distance advantage before redirecting to another branch (avoids GPS jitter). */
export const MIN_BRANCH_REDIRECT_IMPROVEMENT_KM = 0.5;

export type NearbyBranchMenu = {
  menuId: number;
  slug: string;
  distanceKm: number;
};

export type NearbyBranchLookup = NearbyBranchMenu | null;

type BranchZoneRow = {
  menuId: number;
  slug: string;
  lat: number | null;
  lan: number | null;
};

function minDistanceByMenu(
  rows: BranchZoneRow[],
  userLat: number,
  userLng: number,
): Map<number, { slug: string; distanceKm: number }> {
  const bestByMenu = new Map<number, { slug: string; distanceKm: number }>();

  for (const row of rows) {
    const zoneLat = parseGeoCoord(row.lat);
    const zoneLng = parseGeoCoord(row.lan);
    if (zoneLat == null || zoneLng == null) continue;

    const distanceKm = haversineKm(userLat, userLng, zoneLat, zoneLng);
    const prev = bestByMenu.get(row.menuId);
    if (!prev || distanceKm < prev.distanceKm) {
      bestByMenu.set(row.menuId, {
        slug: String(row.slug ?? "").trim(),
        distanceKm,
      });
    }
  }

  return bestByMenu;
}

/** Closest group branch by delivery-zone coordinates; redirect if closer than current menu. */
export async function findNearestBranchMenu(
  currentMenuId: number,
  latRaw: unknown,
  lngRaw: unknown,
): Promise<NearbyBranchLookup> {
  const lat = parseGeoCoord(latRaw);
  const lng = parseGeoCoord(lngRaw);
  if (lat == null || lng == null) return null;

  await ensureDeliverySchema();
  const groupIds = await getDeliveryGroupMenuIds(currentMenuId);
  if (groupIds.length <= 1) return null;

  const inList = buildSqlIntInList(groupIds);
  if (!inList) return null;

  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT m.id AS menuId, m.slug, g.lat, g.lan
    FROM Menus m
    INNER JOIN MenuDeliveryGovernorates g ON g.menuId = m.id
    WHERE m.id IN (${inList})
      AND m.deliveryOn = 1
      AND g.lat IS NOT NULL
      AND g.lan IS NOT NULL
  `);

  const rows = r.recordset as BranchZoneRow[];
  if (rows.length === 0) return null;

  const bestByMenu = minDistanceByMenu(rows, lat, lng);
  if (bestByMenu.size === 0) return null;

  let nearest: NearbyBranchMenu | null = null;
  for (const [menuId, info] of bestByMenu) {
    if (!info.slug) continue;
    if (!nearest || info.distanceKm < nearest.distanceKm) {
      nearest = { menuId, slug: info.slug, distanceKm: info.distanceKm };
    }
  }

  if (!nearest || nearest.menuId === currentMenuId) return null;

  const currentBest = bestByMenu.get(currentMenuId);
  const currentDistanceKm =
    currentBest?.distanceKm ?? Number.POSITIVE_INFINITY;

  if (nearest.distanceKm >= currentDistanceKm) return null;

  const improvementKm = currentDistanceKm - nearest.distanceKm;
  if (improvementKm < MIN_BRANCH_REDIRECT_IMPROVEMENT_KM) return null;

  return nearest;
}
