export type AnalyticsPeriod = "7d" | "30d" | "90d";

export function parseAnalyticsPeriod(
  raw: unknown,
  fallback: AnalyticsPeriod = "30d",
): AnalyticsPeriod {
  const p = String(raw ?? fallback);
  if (p === "7d" || p === "30d" || p === "90d") return p;
  return fallback;
}

export function periodToDays(period: AnalyticsPeriod): number {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  return 30;
}

export function computeCtr(clicks: number, impressions: number): number {
  if (impressions <= 0) return 0;
  return Math.round((clicks / impressions) * 1000) / 10;
}
