import { Request, Response } from "express";
import { getPool, sql, executeTransaction } from "../config/database";
import {
  generateUniqueSlug,
  generateUniqueMenuId,
  validateSlug,
} from "../utils/slugGenerator";
import { logger } from "../utils/logger";

// Get user's menus
export async function getUserMenus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { locale = "ar" } = req.query;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("userId", sql.Int, userId).query(`
        SELECT 
          m.id, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt, m.updatedAt,
          mtAr.name as nameAr, 
          mtAr.description as descriptionAr,
          mtEn.name as nameEn,
          mtEn.description as descriptionEn
        FROM Menus m
        LEFT JOIN MenuTranslations mtAr ON m.id = mtAr.menuId AND mtAr.locale = 'ar'
        LEFT JOIN MenuTranslations mtEn ON m.id = mtEn.menuId AND mtEn.locale = 'en'
        WHERE m.userId = @userId
        ORDER BY m.createdAt DESC
      `);

    res.json({ menus: result.recordset });
  } catch (error) {
    logger.error("Get user menus error:", error);
    res.status(500).json({ error: "Failed to get menus" });
  }
}

// Create menu
export async function createMenu(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const {
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      slug: customSlug,
      logo,
      theme = "default",
      currency = "SAR",
    } = req.body;

    // Validate required fields
    if (!nameAr || !nameEn) {
      res
        .status(400)
        .json({ error: "Name is required in both Arabic and English" });
      return;
    }

    // Generate unique slug from custom slug or Arabic name
    const slug = customSlug
      ? await generateUniqueSlug(customSlug)
      : await generateUniqueSlug(nameAr);

    // Check if menu ID is INT or NVARCHAR
    const pool = await getPool();
    const columnCheck = await pool.request().query(`
        SELECT DATA_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Menus' AND COLUMN_NAME = 'id'
      `);

    const isIdString =
      columnCheck.recordset.length > 0 &&
      columnCheck.recordset[0].DATA_TYPE === "nvarchar";

    const menuId = await executeTransaction(async (transaction) => {
      let newMenuId: string | number;

      if (isIdString) {
        // Generate unique menu ID (7+ characters)
        newMenuId = await generateUniqueMenuId(7);

        // Insert menu with generated ID
        await transaction
          .request()
          .input("id", sql.NVarChar, newMenuId)
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo || null)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency).query(`
            INSERT INTO Menus (id, userId, slug, logo, theme, currency)
            VALUES (@id, @userId, @slug, @logo, @theme, @currency)
          `);
      } else {
        // Use IDENTITY (INT)
        const menuResult = await transaction
          .request()
          .input("userId", sql.Int, userId)
          .input("slug", sql.NVarChar, slug)
          .input("logo", sql.NVarChar, logo || null)
          .input("theme", sql.NVarChar, theme)
          .input("currency", sql.NVarChar(3), currency).query(`
            INSERT INTO Menus (userId, slug, logo, theme, currency)
            OUTPUT INSERTED.id
            VALUES (@userId, @slug, @logo, @theme, @currency)
          `);

        newMenuId = menuResult.recordset[0].id;
      }

      // Insert Arabic translation
      const arRequest = transaction.request();
      if (isIdString) {
        arRequest.input("menuId", sql.NVarChar, newMenuId);
      } else {
        arRequest.input("menuId", sql.Int, newMenuId);
      }

      await arRequest
        .input("locale", sql.NVarChar, "ar")
        .input("name", sql.NVarChar, nameAr)
        .input("description", sql.NVarChar, descriptionAr || null).query(`
          INSERT INTO MenuTranslations (menuId, locale, name, description)
          VALUES (@menuId, @locale, @name, @description)
        `);

      // Insert English translation
      const enRequest = transaction.request();
      if (isIdString) {
        enRequest.input("menuId", sql.NVarChar, newMenuId);
      } else {
        enRequest.input("menuId", sql.Int, newMenuId);
      }

      await enRequest
        .input("locale", sql.NVarChar, "en")
        .input("name", sql.NVarChar, nameEn)
        .input("description", sql.NVarChar, descriptionEn || null).query(`
          INSERT INTO MenuTranslations (menuId, locale, name, description)
          VALUES (@menuId, @locale, @name, @description)
        `);

      return newMenuId;
    });

    res.status(201).json({
      message: "Menu created successfully",
      menuId,
      slug,
    });
  } catch (error) {
    logger.error("Create menu error:", error);
    res.status(500).json({ error: "Failed to create menu" });
  }
}

// Get menu by ID
export async function getMenuById(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const pool = await getPool();

    // Get menu with both translations
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .input("userId", sql.Int, userId).query(`
        SELECT 
          m.id, m.userId, m.slug, m.logo, m.theme, m.isActive, m.createdAt,
          ISNULL(m.currency, 'SAR') as currency,
          m.footerLogo, m.footerDescriptionEn, m.footerDescriptionAr,
          m.socialFacebook, m.socialInstagram, m.socialTwitter, m.socialWhatsapp,
          m.addressEn, m.addressAr, m.phone, m.workingHours,
          ar.name as nameAr, ar.description as descriptionAr,
          en.name as nameEn, en.description as descriptionEn
        FROM Menus m
        LEFT JOIN MenuTranslations ar ON m.id = ar.menuId AND ar.locale = 'ar'
        LEFT JOIN MenuTranslations en ON m.id = en.menuId AND en.locale = 'en'
        WHERE m.id = @id AND m.userId = @userId
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: "Menu not found" });
      return;
    }

    let menu = result.recordset[0];

    // Parse workingHours if it's a JSON string
    if (menu.workingHours && typeof menu.workingHours === 'string') {
      try {
        menu.workingHours = JSON.parse(menu.workingHours);
      } catch (e) {
        // If parsing fails, set to null
        menu.workingHours = null;
      }
    }

    // Get statistics for the menu
    const statsResult = await pool
      .request()
      .input("menuId", sql.Int, parseInt(id)).query(`
        SELECT 
          (SELECT COUNT(*) FROM MenuItems WHERE menuId = @menuId) as totalItems,
          (SELECT COUNT(*) FROM MenuItems WHERE menuId = @menuId AND available = 1) as activeItems,
          (SELECT COUNT(*) FROM Categories WHERE menuId = @menuId) as categories
      `);

    const stats = statsResult.recordset[0];

    res.json({
      menu: menu,
      itemsCount: stats.totalItems || 0,
      activeItemsCount: stats.activeItems || 0,
      categoriesCount: stats.categories || 0,
      views: 0,
    });
  } catch (error) {
    logger.error("Get menu by ID error:", error);
    res.status(500).json({ error: "Failed to get menu" });
  }
}

// Update menu
export async function updateMenu(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const {
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      logo,
      theme,
      currency,
      isActive,
      footerLogo,
      footerDescriptionEn,
      footerDescriptionAr,
      socialFacebook,
      socialInstagram,
      socialTwitter,
      socialWhatsapp,
      addressEn,
      addressAr,
      phone,
      workingHours,
    } = req.body;

    await executeTransaction(async (transaction) => {
      // Verify ownership
      const checkResult = await transaction
        .request()
        .input("id", sql.Int, parseInt(id))
        .input("userId", sql.Int, userId)
        .query("SELECT id FROM Menus WHERE id = @id AND userId = @userId");

      if (checkResult.recordset.length === 0) {
        throw new Error("Menu not found or access denied");
      }

      // Update menu table fields individually
      const menuUpdates: string[] = [];
      const menuRequest = transaction
        .request()
        .input("id", sql.Int, parseInt(id));

      if (logo !== undefined) {
        menuUpdates.push("logo = @logo");
        menuRequest.input("logo", sql.NVarChar, logo || null);
      }

      if (theme !== undefined) {
        menuUpdates.push("theme = @theme");
        menuRequest.input("theme", sql.NVarChar, theme);
      }

      if (currency !== undefined) {
        menuUpdates.push("currency = @currency");
        menuRequest.input("currency", sql.NVarChar(3), currency);
      }

      if (isActive !== undefined) {
        menuUpdates.push("isActive = @isActive");
        menuRequest.input("isActive", sql.Bit, isActive ? 1 : 0);
      }

      if (footerLogo !== undefined) {
        menuUpdates.push("footerLogo = @footerLogo");
        menuRequest.input("footerLogo", sql.NVarChar, footerLogo || null);
      }

      if (footerDescriptionEn !== undefined) {
        menuUpdates.push("footerDescriptionEn = @footerDescriptionEn");
        menuRequest.input(
          "footerDescriptionEn",
          sql.NVarChar,
          footerDescriptionEn || null
        );
      }

      if (footerDescriptionAr !== undefined) {
        menuUpdates.push("footerDescriptionAr = @footerDescriptionAr");
        menuRequest.input(
          "footerDescriptionAr",
          sql.NVarChar,
          footerDescriptionAr || null
        );
      }

      if (socialFacebook !== undefined) {
        menuUpdates.push("socialFacebook = @socialFacebook");
        menuRequest.input(
          "socialFacebook",
          sql.NVarChar,
          socialFacebook || null
        );
      }

      if (socialInstagram !== undefined) {
        menuUpdates.push("socialInstagram = @socialInstagram");
        menuRequest.input(
          "socialInstagram",
          sql.NVarChar,
          socialInstagram || null
        );
      }

      if (socialTwitter !== undefined) {
        menuUpdates.push("socialTwitter = @socialTwitter");
        menuRequest.input("socialTwitter", sql.NVarChar, socialTwitter || null);
      }

      if (socialWhatsapp !== undefined) {
        menuUpdates.push("socialWhatsapp = @socialWhatsapp");
        menuRequest.input(
          "socialWhatsapp",
          sql.NVarChar,
          socialWhatsapp || null
        );
      }

      if (addressEn !== undefined) {
        menuUpdates.push("addressEn = @addressEn");
        menuRequest.input("addressEn", sql.NVarChar, addressEn || null);
      }

      if (addressAr !== undefined) {
        menuUpdates.push("addressAr = @addressAr");
        menuRequest.input("addressAr", sql.NVarChar, addressAr || null);
      }

      if (phone !== undefined) {
        menuUpdates.push("phone = @phone");
        menuRequest.input("phone", sql.NVarChar, phone || null);
      }

      if (workingHours !== undefined) {
        menuUpdates.push("workingHours = @workingHours");
        menuRequest.input(
          "workingHours",
          sql.NVarChar(sql.MAX),
          workingHours ? JSON.stringify(workingHours) : null
        );
      }

      if (menuUpdates.length > 0) {
        await menuRequest.query(`
          UPDATE Menus 
          SET ${menuUpdates.join(", ")}, updatedAt = GETDATE()
          WHERE id = @id
        `);
      }

      // Update Arabic translations individually
      if (nameAr !== undefined || descriptionAr !== undefined) {
        const arUpdates: string[] = [];
        const arRequest = transaction
          .request()
          .input("menuId", sql.Int, parseInt(id));

        if (nameAr !== undefined) {
          arUpdates.push("name = @name");
          arRequest.input("name", sql.NVarChar, nameAr);
        }

        if (descriptionAr !== undefined) {
          arUpdates.push("description = @description");
          arRequest.input("description", sql.NVarChar, descriptionAr || null);
        }

        if (arUpdates.length > 0) {
          await arRequest.query(`
            UPDATE MenuTranslations
            SET ${arUpdates.join(", ")}
            WHERE menuId = @menuId AND locale = 'ar'
          `);
        }
      }

      // Update English translations individually
      if (nameEn !== undefined || descriptionEn !== undefined) {
        const enUpdates: string[] = [];
        const enRequest = transaction
          .request()
          .input("menuId", sql.Int, parseInt(id));

        if (nameEn !== undefined) {
          enUpdates.push("name = @name");
          enRequest.input("name", sql.NVarChar, nameEn);
        }

        if (descriptionEn !== undefined) {
          enUpdates.push("description = @description");
          enRequest.input("description", sql.NVarChar, descriptionEn || null);
        }

        if (enUpdates.length > 0) {
          await enRequest.query(`
            UPDATE MenuTranslations
            SET ${enUpdates.join(", ")}
            WHERE menuId = @menuId AND locale = 'en'
          `);
        }
      }
    });

    res.json({ message: "Menu updated successfully" });
  } catch (error) {
    logger.error("Update menu error:", error);
    res.status(500).json({ error: "Failed to update menu" });
  }
}

// Toggle menu status
export async function toggleMenuStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { id } = req.params;
    const { isActive } = req.body;

    // Validate isActive value
    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be a boolean value" });
      return;
    }

    const pool = await getPool();

    // Admin can update any menu, regular users can only update their own
    let query;
    if (userRole === "admin") {
      query = `
        UPDATE Menus
        SET isActive = @isActive
        WHERE id = @id
      `;
    } else {
      query = `
        UPDATE Menus
        SET isActive = @isActive
        WHERE id = @id AND userId = @userId
      `;
    }

    // Update without OUTPUT (because of triggers)
    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .input("userId", sql.Int, userId)
      .input("isActive", sql.Bit, isActive)
      .query(query);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: "Menu not found" });
      return;
    }

    res.json({
      message: "Menu status updated",
      isActive: isActive, // Return the value we just set
    });
  } catch (error) {
    logger.error("Toggle menu status error:", error);
    res.status(500).json({ error: "Failed to update menu status" });
  }
}

// Delete menu
export async function deleteMenu(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, parseInt(id))
      .input("userId", sql.Int, userId)
      .query("DELETE FROM Menus WHERE id = @id AND userId = @userId");

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: "Menu not found" });
      return;
    }

    res.json({ message: "Menu deleted successfully" });
  } catch (error) {
    logger.error("Delete menu error:", error);
    res.status(500).json({ error: "Failed to delete menu" });
  }
}

// Check slug availability and get similar suggestions
export async function checkSlugAvailability(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { slug } = req.query;

    if (!slug || typeof slug !== "string") {
      res.status(400).json({ error: "Slug is required" });
      return;
    }

    const normalizedSlug = slug.toLowerCase().trim();

    // Validate slug format
    if (!validateSlug(normalizedSlug)) {
      res.status(400).json({
        error:
          "Invalid slug format. Use only lowercase letters, numbers, and hyphens.",
        available: false,
      });
      return;
    }

    const pool = await getPool();

    // Check if slug exists
    const checkResult = await pool
      .request()
      .input("slug", sql.NVarChar, normalizedSlug)
      .query("SELECT COUNT(*) as count FROM Menus WHERE slug = @slug");

    const exists = checkResult.recordset[0].count > 0;

    // If slug exists, find similar slugs
    let suggestions: string[] = [];
    if (exists) {
      const similarResult = await pool
        .request()
        .input("slug", sql.NVarChar, `${normalizedSlug}%`).query(`
          SELECT TOP 5 slug 
          FROM Menus 
          WHERE slug LIKE @slug 
          ORDER BY slug
        `);

      suggestions = similarResult.recordset.map((row: any) => row.slug);

      // Generate alternative suggestions
      const alternatives: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const altSlug = `${normalizedSlug}-${i}`;
        const altCheck = await pool
          .request()
          .input("altSlug", sql.NVarChar, altSlug)
          .query("SELECT COUNT(*) as count FROM Menus WHERE slug = @altSlug");

        if (altCheck.recordset[0].count === 0) {
          alternatives.push(altSlug);
        }
      }

      suggestions = [...alternatives, ...suggestions].slice(0, 5);
    }

    res.json({
      available: !exists,
      slug: normalizedSlug,
      suggestions: exists ? suggestions : [],
    });
  } catch (error) {
    logger.error("Check slug availability error:", error);
    res.status(500).json({ error: "Failed to check slug availability" });
  }
}
