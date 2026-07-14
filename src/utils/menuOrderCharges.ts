import { normalizeOptionalEnabled, normalizePercent } from "./normalizeOptionalEnabled";

export type MenuOrderCharges = {
  taxEnabled: boolean;
  taxPercent: number | null;
  serviceEnabled: boolean;
  servicePercent: number | null;
};

export function applyMenuOrderCharges(
  subtotal: number,
  charges: MenuOrderCharges | null | undefined,
): {
  subtotal: number;
  taxAmount: number;
  serviceAmount: number;
  total: number;
} {
  const base = Math.round(subtotal * 100) / 100;
  const taxEnabled = normalizeOptionalEnabled(charges?.taxEnabled);
  const serviceEnabled = normalizeOptionalEnabled(charges?.serviceEnabled);
  const taxPercent = normalizePercent(charges?.taxPercent) ?? 0;
  const servicePercent = normalizePercent(charges?.servicePercent) ?? 0;

  const taxAmount =
    taxEnabled && taxPercent > 0
      ? Math.round(base * (taxPercent / 100) * 100) / 100
      : 0;
  const serviceAmount =
    serviceEnabled && servicePercent > 0
      ? Math.round(base * (servicePercent / 100) * 100) / 100
      : 0;

  return {
    subtotal: base,
    taxAmount,
    serviceAmount,
    total: Math.round((base + taxAmount + serviceAmount) * 100) / 100,
  };
}
