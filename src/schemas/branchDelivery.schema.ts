import { getPool } from "../config/database";

/** Adds distance-based delivery pricing fields on Branches (idempotent). */
export async function ensureBranchDeliverySchema(): Promise<void> {
  const pool = await getPool();

  await pool.request().query(`
    IF COL_LENGTH('Branches', 'deliveryBasePrice') IS NULL
    BEGIN
      ALTER TABLE Branches ADD deliveryBasePrice DECIMAL(10, 2) NULL;
    END

    IF COL_LENGTH('Branches', 'deliveryPricePerKm') IS NULL
    BEGIN
      ALTER TABLE Branches ADD deliveryPricePerKm DECIMAL(10, 2) NULL;
    END

    IF COL_LENGTH('Branches', 'maxDeliveryRadiusKm') IS NULL
    BEGIN
      ALTER TABLE Branches ADD maxDeliveryRadiusKm DECIMAL(6, 2) NULL;
    END
  `);
}
