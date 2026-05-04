import { Request, Response } from 'express';
import sql from 'mssql';
import { getPool, executeTransaction } from '../config/database';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';
import { getMenuAccessForRequest } from '../utils/menuAccess';

const ERR_MENU_ACCESS = ApiErrors.menuNotFoundOrAccess.en;
const ERR_CUSTOM_PRO = ApiErrors.customizationsProOnly.en;

/**
 * Get menu customizations
 * GET /api/menus/:menuId/customizations
 */
export async function getCustomizations(req: Request, res: Response): Promise<void> {
  try {
    const { menuId } = req.params;
    const access = await getMenuAccessForRequest(req, parseInt(menuId, 10), {
      requiredPageKey: 'settings',
    });
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
      return;
    }

    const pool = await getPool();

    const result = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .query(`
        SELECT 
          id, menuId, primaryColor, secondaryColor, backgroundColor, textColor,
          heroTitleAr, heroSubtitleAr, heroTitleEn, heroSubtitleEn,
          createdAt, updatedAt
        FROM MenuCustomizations
        WHERE menuId = @menuId
      `);

    if (result.recordset.length === 0) {
      // Return default values if no customizations exist
      res.json({
        menuId: parseInt(menuId),
        primaryColor: '#14b8a6',
        secondaryColor: '#06b6d4',
        backgroundColor: '#ffffff',
        textColor: '#0f172a',
        heroTitleAr: 'استكشف قائمتنا',
        heroSubtitleAr: 'اختر من مجموعة متنوعة من الأطباق اللذيذة',
        heroTitleEn: 'Explore Our Menu',
        heroSubtitleEn: 'Choose from a variety of delicious dishes',
      });
      return;
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error getting customizations:', error);
    sendApiError(res, req, 500, ApiErrors.failedGetCustomizations);
  }
}

/**
 * Update or create menu customizations (Pro users only)
 * PUT /api/menus/:menuId/customizations
 */
export async function updateCustomizations(req: Request, res: Response): Promise<void> {
  try {
    const { menuId } = req.params;
    const access = await getMenuAccessForRequest(req, parseInt(menuId, 10), {
      requiredPageKey: 'settings',
    });
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
      return;
    }
    const ownerUserId = access.ownerUserId;

    const {
      primaryColor,
      secondaryColor,
      backgroundColor,
      textColor,
      heroTitleAr,
      heroSubtitleAr,
      heroTitleEn,
      heroSubtitleEn,
    } = req.body;

    await executeTransaction(async (transaction) => {
      // Verify menu ownership and Pro plan
      const menuResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .input('ownerUserId', sql.Int, ownerUserId)
        .query(`
          SELECT m.id, s.billingCycle
          FROM Menus m
          JOIN Users u ON m.userId = u.id
          LEFT JOIN Subscriptions s ON u.id = s.userId 
            AND s.status = 'active' 
            AND (s.endDate IS NULL OR s.endDate > GETDATE())
          WHERE m.id = @menuId AND m.userId = @ownerUserId
        `);

      if (menuResult.recordset.length === 0) {
        throw new Error(ERR_MENU_ACCESS);
      }

      const userBillingCycle = menuResult.recordset[0].billingCycle;
      if (!userBillingCycle || userBillingCycle === 'free') {
        throw new Error(ERR_CUSTOM_PRO);
      }

      // Check if customizations exist
      const existingResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .query('SELECT id FROM MenuCustomizations WHERE menuId = @menuId');

      const request = transaction.request().input('menuId', sql.Int, parseInt(menuId));

      if (primaryColor) request.input('primaryColor', sql.NVarChar(20), primaryColor);
      if (secondaryColor) request.input('secondaryColor', sql.NVarChar(20), secondaryColor);
      if (backgroundColor) request.input('backgroundColor', sql.NVarChar(20), backgroundColor);
      if (textColor) request.input('textColor', sql.NVarChar(20), textColor);
      if (heroTitleAr) request.input('heroTitleAr', sql.NVarChar(200), heroTitleAr);
      if (heroSubtitleAr) request.input('heroSubtitleAr', sql.NVarChar(500), heroSubtitleAr);
      if (heroTitleEn) request.input('heroTitleEn', sql.NVarChar(200), heroTitleEn);
      if (heroSubtitleEn) request.input('heroSubtitleEn', sql.NVarChar(500), heroSubtitleEn);

      if (existingResult.recordset.length === 0) {
        // Insert new customizations
        await request.query(`
          INSERT INTO MenuCustomizations (
            menuId, primaryColor, secondaryColor, backgroundColor, textColor,
            heroTitleAr, heroSubtitleAr, heroTitleEn, heroSubtitleEn
          )
          VALUES (
            @menuId,
            ISNULL(@primaryColor, '#14b8a6'),
            ISNULL(@secondaryColor, '#06b6d4'),
            ISNULL(@backgroundColor, '#ffffff'),
            ISNULL(@textColor, '#0f172a'),
            ISNULL(@heroTitleAr, N'استكشف قائمتنا'),
            ISNULL(@heroSubtitleAr, N'اختر من مجموعة متنوعة من الأطباق اللذيذة'),
            ISNULL(@heroTitleEn, 'Explore Our Menu'),
            ISNULL(@heroSubtitleEn, 'Choose from a variety of delicious dishes')
          )
        `);
      } else {
        // Update existing customizations
        const updates: string[] = [];
        if (primaryColor) updates.push('primaryColor = @primaryColor');
        if (secondaryColor) updates.push('secondaryColor = @secondaryColor');
        if (backgroundColor) updates.push('backgroundColor = @backgroundColor');
        if (textColor) updates.push('textColor = @textColor');
        if (heroTitleAr) updates.push('heroTitleAr = @heroTitleAr');
        if (heroSubtitleAr) updates.push('heroSubtitleAr = @heroSubtitleAr');
        if (heroTitleEn) updates.push('heroTitleEn = @heroTitleEn');
        if (heroSubtitleEn) updates.push('heroSubtitleEn = @heroSubtitleEn');

        if (updates.length > 0) {
          updates.push('updatedAt = GETDATE()');
          await request.query(`
            UPDATE MenuCustomizations
            SET ${updates.join(', ')}
            WHERE menuId = @menuId
          `);
        }
      }
    });

    res.json({ success: true, message: 'Customizations updated successfully' });
  } catch (error: any) {
    console.error('Error updating customizations:', error);
    if (error.message === ERR_CUSTOM_PRO) {
      sendApiError(res, req, 403, ApiErrors.customizationsProOnly);
    } else if (error.message === ERR_MENU_ACCESS) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
    } else {
      sendApiError(res, req, 500, ApiErrors.failedUpdateCustomizations);
    }
  }
}

/**
 * Reset menu customizations to default
 * DELETE /api/menus/:menuId/customizations
 */
export async function resetCustomizations(req: Request, res: Response): Promise<void> {
  try {
    const { menuId } = req.params;
    const access = await getMenuAccessForRequest(req, parseInt(menuId, 10), {
      requiredPageKey: 'settings',
    });
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
      return;
    }
    const ownerUserId = access.ownerUserId;

    await executeTransaction(async (transaction) => {
      // Verify menu ownership
      const menuResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .input('ownerUserId', sql.Int, ownerUserId)
        .query('SELECT id FROM Menus WHERE id = @menuId AND userId = @ownerUserId');

      if (menuResult.recordset.length === 0) {
        throw new Error(ERR_MENU_ACCESS);
      }

      // Delete customizations
      await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .query('DELETE FROM MenuCustomizations WHERE menuId = @menuId');
    });

    res.json({ success: true, message: 'Customizations reset to default' });
  } catch (error: any) {
    console.error('Error resetting customizations:', error);
    if (error.message === ERR_MENU_ACCESS) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
    } else {
      sendApiError(res, req, 500, ApiErrors.failedResetCustomizations);
    }
  }
}

