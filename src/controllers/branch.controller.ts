import { Request, Response } from 'express';
import { getPool, sql, executeTransaction } from '../config/database';
import { logger } from '../utils/logger';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';

// Get menu branches
export async function getBranches(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;

    const pool = await getPool();

    // Verify menu ownership
    const menuCheck = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Menus WHERE id = @menuId AND userId = @userId');

    if (menuCheck.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    // Match legacy Branches / BranchTranslations columns (name + address only)
    const result = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .query(`
        SELECT 
          b.id,
          b.phone,
          b.latitude,
          b.longitude,
          b.deliveryBasePrice,
          b.deliveryPricePerKm,
          b.maxDeliveryRadiusKm,
          btAr.name AS nameAr,
          btEn.name AS nameEn,
          btAr.address AS addressAr,
          btEn.address AS addressEn
        FROM Branches b
        LEFT JOIN BranchTranslations btAr ON b.id = btAr.branchId AND btAr.locale = 'ar'
        LEFT JOIN BranchTranslations btEn ON b.id = btEn.branchId AND btEn.locale = 'en'
        WHERE b.menuId = @menuId
        ORDER BY b.id
      `);

    res.json({ branches: result.recordset });
  } catch (error) {
    logger.error('Get branches error:', error);
    sendApiError(res, req, 500, ApiErrors.failedGetBranches);
  }
}

// Create branch
export async function createBranch(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const {
      nameAr,
      nameEn,
      addressAr,
      addressEn,
      phone,
      latitude,
      longitude,
      deliveryBasePrice,
      deliveryPricePerKm,
      maxDeliveryRadiusKm,
    } = req.body;

    const pool = await getPool();

    // Verify menu ownership
    const menuCheck = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Menus WHERE id = @menuId AND userId = @userId');

    if (menuCheck.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.menuNotFound);
      return;
    }

    const branchId = await executeTransaction(async (transaction) => {
      const branchResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .input('phone', sql.NVarChar, phone || null)
        .input('latitude', sql.Decimal(10, 8), latitude || null)
        .input('longitude', sql.Decimal(11, 8), longitude || null)
        .input('deliveryBasePrice', sql.Decimal(10, 2), deliveryBasePrice ?? null)
        .input('deliveryPricePerKm', sql.Decimal(10, 2), deliveryPricePerKm ?? null)
        .input('maxDeliveryRadiusKm', sql.Decimal(6, 2), maxDeliveryRadiusKm ?? null)
        .query(`
          INSERT INTO Branches (
            menuId, phone, latitude, longitude,
            deliveryBasePrice, deliveryPricePerKm, maxDeliveryRadiusKm
          )
          OUTPUT INSERTED.id
          VALUES (
            @menuId, @phone, @latitude, @longitude,
            @deliveryBasePrice, @deliveryPricePerKm, @maxDeliveryRadiusKm
          )
        `);

      const newBranchId = branchResult.recordset[0].id;

      await transaction
        .request()
        .input('branchId', sql.Int, newBranchId)
        .input('locale', sql.NVarChar, 'ar')
        .input('name', sql.NVarChar, nameAr)
        .input('address', sql.NVarChar, addressAr || null)
        .query(`
          INSERT INTO BranchTranslations (branchId, locale, name, address)
          VALUES (@branchId, @locale, @name, @address)
        `);

      await transaction
        .request()
        .input('branchId', sql.Int, newBranchId)
        .input('locale', sql.NVarChar, 'en')
        .input('name', sql.NVarChar, nameEn)
        .input('address', sql.NVarChar, addressEn || null)
        .query(`
          INSERT INTO BranchTranslations (branchId, locale, name, address)
          VALUES (@branchId, @locale, @name, @address)
        `);

      return newBranchId;
    });

    res.status(201).json({
      message: 'Branch created successfully',
      branchId,
    });
  } catch (error) {
    logger.error('Create branch error:', error);
    sendApiError(res, req, 500, ApiErrors.failedCreateBranch);
  }
}

// Update branch
export async function updateBranch(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, branchId } = req.params;
    const {
      nameAr,
      nameEn,
      addressAr,
      addressEn,
      phone,
      latitude,
      longitude,
      deliveryBasePrice,
      deliveryPricePerKm,
      maxDeliveryRadiusKm,
    } = req.body;

    await executeTransaction(async (transaction) => {
      const checkResult = await transaction
        .request()
        .input('branchId', sql.Int, parseInt(branchId))
        .input('menuId', sql.Int, parseInt(menuId))
        .input('userId', sql.Int, userId)
        .query(`
          SELECT b.id 
          FROM Branches b
          JOIN Menus m ON b.menuId = m.id
          WHERE b.id = @branchId AND b.menuId = @menuId AND m.userId = @userId
        `);

      if (checkResult.recordset.length === 0) {
        throw new Error('Branch not found or access denied');
      }

      const updates: string[] = [];
      const request = transaction.request().input('branchId', sql.Int, parseInt(branchId));

      if (phone !== undefined) {
        updates.push('phone = @phone');
        request.input('phone', sql.NVarChar, phone || null);
      }
      if (latitude !== undefined) {
        updates.push('latitude = @latitude');
        request.input('latitude', sql.Decimal(10, 8), latitude || null);
      }
      if (longitude !== undefined) {
        updates.push('longitude = @longitude');
        request.input('longitude', sql.Decimal(11, 8), longitude || null);
      }
      if (deliveryBasePrice !== undefined) {
        updates.push('deliveryBasePrice = @deliveryBasePrice');
        request.input('deliveryBasePrice', sql.Decimal(10, 2), deliveryBasePrice ?? null);
      }
      if (deliveryPricePerKm !== undefined) {
        updates.push('deliveryPricePerKm = @deliveryPricePerKm');
        request.input('deliveryPricePerKm', sql.Decimal(10, 2), deliveryPricePerKm ?? null);
      }
      if (maxDeliveryRadiusKm !== undefined) {
        updates.push('maxDeliveryRadiusKm = @maxDeliveryRadiusKm');
        request.input('maxDeliveryRadiusKm', sql.Decimal(6, 2), maxDeliveryRadiusKm ?? null);
      }

      if (updates.length > 0) {
        await request.query(`
          UPDATE Branches 
          SET ${updates.join(', ')}
          WHERE id = @branchId
        `);
      }

      if (nameAr !== undefined || addressAr !== undefined) {
        await transaction
          .request()
          .input('branchId', sql.Int, parseInt(branchId))
          .input('name', sql.NVarChar, nameAr)
          .input('address', sql.NVarChar, addressAr)
          .query(`
            UPDATE BranchTranslations
            SET name = COALESCE(@name, name),
                address = COALESCE(@address, address)
            WHERE branchId = @branchId AND locale = 'ar'
          `);
      }

      if (nameEn !== undefined || addressEn !== undefined) {
        await transaction
          .request()
          .input('branchId', sql.Int, parseInt(branchId))
          .input('name', sql.NVarChar, nameEn)
          .input('address', sql.NVarChar, addressEn)
          .query(`
            UPDATE BranchTranslations
            SET name = COALESCE(@name, name),
                address = COALESCE(@address, address)
            WHERE branchId = @branchId AND locale = 'en'
          `);
      }
    });

    res.json({ message: 'Branch updated successfully' });
  } catch (error) {
    logger.error('Update branch error:', error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateBranch);
  }
}

// Delete branch
export async function deleteBranch(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, branchId } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input('branchId', sql.Int, parseInt(branchId))
      .input('menuId', sql.Int, parseInt(menuId))
      .input('userId', sql.Int, userId)
      .query(`
        DELETE b
        FROM Branches b
        JOIN Menus m ON b.menuId = m.id
        WHERE b.id = @branchId AND b.menuId = @menuId AND m.userId = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.branchNotFound);
      return;
    }

    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    logger.error('Delete branch error:', error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteBranch);
  }
}
