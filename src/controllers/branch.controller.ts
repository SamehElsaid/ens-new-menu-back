import { Request, Response } from 'express';
import { getPool, sql, executeTransaction } from '../config/database';
import { logger } from '../utils/logger';

// Get menu branches
export async function getBranches(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const { locale = 'ar' } = req.query;

    const pool = await getPool();

    // Verify menu ownership
    const menuCheck = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Menus WHERE id = @menuId AND userId = @userId');

    if (menuCheck.recordset.length === 0) {
      res.status(404).json({ error: 'Menu not found' });
      return;
    }

    // Get branches with translations
    const result = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .input('locale', sql.NVarChar, locale as string)
      .query(`
        SELECT 
          b.id, b.phone, b.email, b.workingHours, b.latitude, b.longitude, b.isActive,
          bt.name, bt.address, bt.city, bt.country
        FROM Branches b
        LEFT JOIN BranchTranslations bt ON b.id = bt.branchId AND bt.locale = @locale
        WHERE b.menuId = @menuId
        ORDER BY b.id
      `);

    res.json({ branches: result.recordset });
  } catch (error) {
    logger.error('Get branches error:', error);
    res.status(500).json({ error: 'Failed to get branches' });
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
      cityAr,
      cityEn,
      countryAr,
      countryEn,
      phone,
      email,
      workingHours,
      latitude,
      longitude,
      isActive = true,
    } = req.body;

    const pool = await getPool();

    // Verify menu ownership
    const menuCheck = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Menus WHERE id = @menuId AND userId = @userId');

    if (menuCheck.recordset.length === 0) {
      res.status(404).json({ error: 'Menu not found' });
      return;
    }

    const branchId = await executeTransaction(async (transaction) => {
      // Insert branch
      const branchResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .input('phone', sql.NVarChar, phone || null)
        .input('email', sql.NVarChar, email || null)
        .input('workingHours', sql.NVarChar, workingHours || null)
        .input('latitude', sql.Decimal(10, 8), latitude || null)
        .input('longitude', sql.Decimal(11, 8), longitude || null)
        .input('isActive', sql.Bit, isActive)
        .query(`
          INSERT INTO Branches (menuId, phone, email, workingHours, latitude, longitude, isActive)
          OUTPUT INSERTED.id
          VALUES (@menuId, @phone, @email, @workingHours, @latitude, @longitude, @isActive)
        `);

      const newBranchId = branchResult.recordset[0].id;

      // Insert Arabic translation
      await transaction
        .request()
        .input('branchId', sql.Int, newBranchId)
        .input('locale', sql.NVarChar, 'ar')
        .input('name', sql.NVarChar, nameAr)
        .input('address', sql.NVarChar, addressAr || null)
        .input('city', sql.NVarChar, cityAr || null)
        .input('country', sql.NVarChar, countryAr || null)
        .query(`
          INSERT INTO BranchTranslations (branchId, locale, name, address, city, country)
          VALUES (@branchId, @locale, @name, @address, @city, @country)
        `);

      // Insert English translation
      await transaction
        .request()
        .input('branchId', sql.Int, newBranchId)
        .input('locale', sql.NVarChar, 'en')
        .input('name', sql.NVarChar, nameEn)
        .input('address', sql.NVarChar, addressEn || null)
        .input('city', sql.NVarChar, cityEn || null)
        .input('country', sql.NVarChar, countryEn || null)
        .query(`
          INSERT INTO BranchTranslations (branchId, locale, name, address, city, country)
          VALUES (@branchId, @locale, @name, @address, @city, @country)
        `);

      return newBranchId;
    });

    res.status(201).json({
      message: 'Branch created successfully',
      branchId,
    });
  } catch (error) {
    logger.error('Create branch error:', error);
    res.status(500).json({ error: 'Failed to create branch' });
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
      cityAr,
      cityEn,
      countryAr,
      countryEn,
      phone,
      email,
      workingHours,
      latitude,
      longitude,
      isActive,
    } = req.body;

    await executeTransaction(async (transaction) => {
      // Verify ownership
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

      // Update branch
      const updates: string[] = [];
      const request = transaction.request().input('branchId', sql.Int, parseInt(branchId));

      if (phone !== undefined) {
        updates.push('phone = @phone');
        request.input('phone', sql.NVarChar, phone || null);
      }
      if (email !== undefined) {
        updates.push('email = @email');
        request.input('email', sql.NVarChar, email || null);
      }
      if (workingHours !== undefined) {
        updates.push('workingHours = @workingHours');
        request.input('workingHours', sql.NVarChar, workingHours || null);
      }
      if (latitude !== undefined) {
        updates.push('latitude = @latitude');
        request.input('latitude', sql.Decimal(10, 8), latitude || null);
      }
      if (longitude !== undefined) {
        updates.push('longitude = @longitude');
        request.input('longitude', sql.Decimal(11, 8), longitude || null);
      }
      if (isActive !== undefined) {
        updates.push('isActive = @isActive');
        request.input('isActive', sql.Bit, isActive);
      }

      if (updates.length > 0) {
        await request.query(`
          UPDATE Branches 
          SET ${updates.join(', ')}
          WHERE id = @branchId
        `);
      }

      // Update Arabic translation
      if (nameAr !== undefined || addressAr !== undefined || cityAr !== undefined || countryAr !== undefined) {
        await transaction
          .request()
          .input('branchId', sql.Int, parseInt(branchId))
          .input('name', sql.NVarChar, nameAr)
          .input('address', sql.NVarChar, addressAr)
          .input('city', sql.NVarChar, cityAr)
          .input('country', sql.NVarChar, countryAr)
          .query(`
            UPDATE BranchTranslations
            SET name = COALESCE(@name, name),
                address = COALESCE(@address, address),
                city = COALESCE(@city, city),
                country = COALESCE(@country, country)
            WHERE branchId = @branchId AND locale = 'ar'
          `);
      }

      // Update English translation
      if (nameEn !== undefined || addressEn !== undefined || cityEn !== undefined || countryEn !== undefined) {
        await transaction
          .request()
          .input('branchId', sql.Int, parseInt(branchId))
          .input('name', sql.NVarChar, nameEn)
          .input('address', sql.NVarChar, addressEn)
          .input('city', sql.NVarChar, cityEn)
          .input('country', sql.NVarChar, countryEn)
          .query(`
            UPDATE BranchTranslations
            SET name = COALESCE(@name, name),
                address = COALESCE(@address, address),
                city = COALESCE(@city, city),
                country = COALESCE(@country, country)
            WHERE branchId = @branchId AND locale = 'en'
          `);
      }
    });

    res.json({ message: 'Branch updated successfully' });
  } catch (error) {
    logger.error('Update branch error:', error);
    res.status(500).json({ error: 'Failed to update branch' });
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
      res.status(404).json({ error: 'Branch not found' });
      return;
    }

    res.json({ message: 'Branch deleted successfully' });
  } catch (error) {
    logger.error('Delete branch error:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
}


