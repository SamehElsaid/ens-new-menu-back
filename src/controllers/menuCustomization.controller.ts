import { Request, Response } from 'express';
import sql from 'mssql';
import { getPool, executeTransaction } from '../config/database';
import { sendApiError } from '../utils/apiErrorResponse';
import { ApiErrors } from '../i18n/apiErrors';
import {
  buildDefaultCustomizationPayload,
  customizationIncludesHeroTextFields,
  getThemeCustomizationDefaults,
} from '../constants/menuThemes';
import { getMenuAccessForRequest } from '../utils/menuAccess';

const ERR_MENU_ACCESS = ApiErrors.menuNotFoundOrAccess.en;
const ERR_CUSTOM_PRO = ApiErrors.customizationsProOnly.en;

/** Settings/design section: owner or a staff role granting `settings:manage`. */
const SETTINGS_PERMISSION = 'settings:manage';

/**
 * Get menu customizations
 * GET /api/menus/:menuId/customizations
 */
export async function getCustomizations(req: Request, res: Response): Promise<void> {
  try {
    const { menuId } = req.params;

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      SETTINGS_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
      return;
    }

    const pool = await getPool();

    const menuResult = await pool
      .request()
      .input('menuId', sql.Int, parseInt(menuId))
      .query('SELECT theme FROM Menus WHERE id = @menuId');

    const menuTheme =
      menuResult.recordset.length > 0
        ? (menuResult.recordset[0].theme as string | null)
        : null;

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
      res.json(buildDefaultCustomizationPayload(parseInt(menuId), menuTheme));
      return;
    }

    res.json(result.recordset[0]);
  } catch (error) {
    console.error('Error getting customizations:', error);
    sendApiError(res, req, 500, ApiErrors.failedGetCustomizations);
  }
}

/**
 * Update or create menu customizations.
 * Colors: all menu owners. Hero copy: Pro subscribers only.
 * PUT /api/menus/:menuId/customizations
 */
export async function updateCustomizations(req: Request, res: Response): Promise<void> {
  try {
    const { menuId } = req.params;
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

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      SETTINGS_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
      return;
    }

    await executeTransaction(async (transaction) => {
      const menuResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .input('userId', sql.Int, access.ownerUserId)
        .query(`
          SELECT m.id, m.theme, s.billingCycle
          FROM Menus m
          JOIN Users u ON m.userId = u.id
          LEFT JOIN Subscriptions s ON u.id = s.userId 
            AND s.status = 'active' 
            AND (s.endDate IS NULL OR s.endDate > GETDATE())
          WHERE m.id = @menuId AND m.userId = @userId
        `);

      if (menuResult.recordset.length === 0) {
        throw new Error(ERR_MENU_ACCESS);
      }

      const menuTheme = menuResult.recordset[0].theme as string | null;
      const themeDefaults = getThemeCustomizationDefaults(menuTheme);
      const userBillingCycle = menuResult.recordset[0].billingCycle;
      const isFreeUser = !userBillingCycle || userBillingCycle === 'free';

      if (
        isFreeUser &&
        customizationIncludesHeroTextFields({
          heroTitleAr,
          heroSubtitleAr,
          heroTitleEn,
          heroSubtitleEn,
        })
      ) {
        throw new Error(ERR_CUSTOM_PRO);
      }

      const existingResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .query('SELECT id FROM MenuCustomizations WHERE menuId = @menuId');

      if (existingResult.recordset.length === 0) {
        await transaction
          .request()
          .input('menuId', sql.Int, parseInt(menuId))
          .input('primaryColor', sql.NVarChar(20), primaryColor ?? null)
          .input('secondaryColor', sql.NVarChar(20), secondaryColor ?? null)
          .input('backgroundColor', sql.NVarChar(20), backgroundColor ?? null)
          .input('textColor', sql.NVarChar(20), textColor ?? null)
          .input('heroTitleAr', sql.NVarChar(200), heroTitleAr ?? null)
          .input('heroSubtitleAr', sql.NVarChar(500), heroSubtitleAr ?? null)
          .input('heroTitleEn', sql.NVarChar(200), heroTitleEn ?? null)
          .input('heroSubtitleEn', sql.NVarChar(500), heroSubtitleEn ?? null)
          .input('defaultPrimaryColor', sql.NVarChar(20), themeDefaults.primaryColor)
          .input('defaultSecondaryColor', sql.NVarChar(20), themeDefaults.secondaryColor)
          .input('defaultBackgroundColor', sql.NVarChar(20), themeDefaults.backgroundColor)
          .input('defaultTextColor', sql.NVarChar(20), themeDefaults.textColor)
          .query(`
          INSERT INTO MenuCustomizations (
            menuId, primaryColor, secondaryColor, backgroundColor, textColor,
            heroTitleAr, heroSubtitleAr, heroTitleEn, heroSubtitleEn
          )
          VALUES (
            @menuId,
            ISNULL(@primaryColor, @defaultPrimaryColor),
            ISNULL(@secondaryColor, @defaultSecondaryColor),
            ISNULL(@backgroundColor, @defaultBackgroundColor),
            ISNULL(@textColor, @defaultTextColor),
            ISNULL(@heroTitleAr, N'استكشف قائمتنا'),
            ISNULL(@heroSubtitleAr, N'اختر من مجموعة متنوعة من الأطباق اللذيذة'),
            ISNULL(@heroTitleEn, 'Explore Our Menu'),
            ISNULL(@heroSubtitleEn, 'Choose from a variety of delicious dishes')
          )
        `);
      } else {
        const request = transaction
          .request()
          .input('menuId', sql.Int, parseInt(menuId));

        const updates: string[] = [];
        if (primaryColor) {
          request.input('primaryColor', sql.NVarChar(20), primaryColor);
          updates.push('primaryColor = @primaryColor');
        }
        if (secondaryColor) {
          request.input('secondaryColor', sql.NVarChar(20), secondaryColor);
          updates.push('secondaryColor = @secondaryColor');
        }
        if (backgroundColor) {
          request.input('backgroundColor', sql.NVarChar(20), backgroundColor);
          updates.push('backgroundColor = @backgroundColor');
        }
        if (textColor) {
          request.input('textColor', sql.NVarChar(20), textColor);
          updates.push('textColor = @textColor');
        }
        if (heroTitleAr) {
          request.input('heroTitleAr', sql.NVarChar(200), heroTitleAr);
          updates.push('heroTitleAr = @heroTitleAr');
        }
        if (heroSubtitleAr) {
          request.input('heroSubtitleAr', sql.NVarChar(500), heroSubtitleAr);
          updates.push('heroSubtitleAr = @heroSubtitleAr');
        }
        if (heroTitleEn) {
          request.input('heroTitleEn', sql.NVarChar(200), heroTitleEn);
          updates.push('heroTitleEn = @heroTitleEn');
        }
        if (heroSubtitleEn) {
          request.input('heroSubtitleEn', sql.NVarChar(500), heroSubtitleEn);
          updates.push('heroSubtitleEn = @heroSubtitleEn');
        }

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

    const access = await getMenuAccessForRequest(
      req,
      parseInt(menuId, 10),
      SETTINGS_PERMISSION,
    );
    if (!access.ok) {
      sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
      return;
    }

    await executeTransaction(async (transaction) => {
      const menuResult = await transaction
        .request()
        .input('menuId', sql.Int, parseInt(menuId))
        .input('userId', sql.Int, access.ownerUserId)
        .query('SELECT id FROM Menus WHERE id = @menuId AND userId = @userId');

      if (menuResult.recordset.length === 0) {
        throw new Error(ERR_MENU_ACCESS);
      }

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
