import { haversineKm } from "../utils/geoDistance";

export type BranchDeliveryPricing = {
  latitude: number | null;
  longitude: number | null;
  deliveryBasePrice: number | null;
  deliveryPricePerKm: number | null;
  maxDeliveryRadiusKm: number | null;
};

export type BranchDeliveryQuote = {
  inRange: boolean;
  distanceKm: number;
  deliveryFee: number | null;
  maxDeliveryRadiusKm: number | null;
};

function parseNullableNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Fee for distance ≤ 1 km = base price; each extra km (rounded up) adds pricePerKm. */
export function calculateDeliveryFeeFromDistance(
  distanceKm: number,
  basePrice: number,
  pricePerKm: number,
): number {
  if (distanceKm <= 1) {
    return basePrice;
  }
  const extraKm = Math.ceil(distanceKm - 1);
  return basePrice + extraKm * pricePerKm;
}

export function quoteBranchDelivery(
  pricing: BranchDeliveryPricing,
  customerLat: number,
  customerLng: number,
): BranchDeliveryQuote {
  const branchLat = parseNullableNumber(pricing.latitude);
  const branchLng = parseNullableNumber(pricing.longitude);
  const basePrice = parseNullableNumber(pricing.deliveryBasePrice);
  const pricePerKm = parseNullableNumber(pricing.deliveryPricePerKm);
  const maxRadius = parseNullableNumber(pricing.maxDeliveryRadiusKm);

  if (
    branchLat === null ||
    branchLng === null ||
    basePrice === null ||
    pricePerKm === null ||
    maxRadius === null
  ) {
    return {
      inRange: false,
      distanceKm: 0,
      deliveryFee: null,
      maxDeliveryRadiusKm: maxRadius,
    };
  }

  const distanceKm = haversineKm(branchLat, branchLng, customerLat, customerLng);
  const roundedDistance = Math.round(distanceKm * 100) / 100;

  if (distanceKm > maxRadius) {
    return {
      inRange: false,
      distanceKm: roundedDistance,
      deliveryFee: null,
      maxDeliveryRadiusKm: maxRadius,
    };
  }

  const deliveryFee = calculateDeliveryFeeFromDistance(
    distanceKm,
    basePrice,
    pricePerKm,
  );

  return {
    inRange: true,
    distanceKm: roundedDistance,
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    maxDeliveryRadiusKm: maxRadius,
  };
}
