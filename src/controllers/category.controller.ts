import { Request, Response } from "express";
import { getPool, sql } from "../config/database";
import { logger } from "../utils/logger";
import { normalizeImageUrls } from "../utils/urlHelper";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { getMenuAccessForRequest } from "../utils/menuAccess";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";

async function requireMenuAccess(
  req: Request,
  res: Response,
  menuId: string,
): Promise<boolean> {
  const access = await getMenuAccessForRequest(req, parseInt(menuId, 10));
  if (!access.ok) {
    sendApiError(res, req, 404, ApiErrors.menuNotFoundOrAccess);
    return false;
  }
  return true;
}

// Get all categories for a menu (with pagination)
export async function getCategories(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId } = req.params;
    const { locale = "ar", page = "1", limit = "10" } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const offset = (pageNum - 1) * limitNum;

    const pool = await getPool();

    if (!(await requireMenuAccess(req, res, menuId))) return;

    // Get total count for pagination
    const countResult = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .query("SELECT COUNT(*) as total FROM Categories WHERE menuId = @menuId");
    const total = countResult.recordset[0].total;

    // Get categories with translations (all languages for forms and display)
    const result = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("locale", sql.NVarChar, locale as string)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, limitNum)
      .query(`
        SELECT 
          c.id,
          c.image,
          c.sortOrder,
          c.isActive,
          c.createdAt,
          ct.name,
          ar.name as nameAr,
          en.name as nameEn
        FROM Categories c
        LEFT JOIN CategoryTranslations ct ON c.id = ct.categoryId AND ct.locale = @locale
        LEFT JOIN CategoryTranslations ar ON c.id = ar.categoryId AND ar.locale = 'ar'
        LEFT JOIN CategoryTranslations en ON c.id = en.categoryId AND en.locale = 'en'
        WHERE c.menuId = @menuId
        ORDER BY c.sortOrder ASC, c.createdAt DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);

    // Normalize image URLs to absolute paths
    const categories = normalizeImageUrls(result.recordset);

    res.json({
      categories,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error("Get categories error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetCategories);
  }
}

// Get category by ID with both translations
export async function getCategoryById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId, categoryId } = req.params;

    const pool = await getPool();

    if (!(await requireMenuAccess(req, res, menuId))) return;

    // Get category with both translations
    const result = await pool
      .request()
      .input("categoryId", sql.Int, parseInt(categoryId))
      .input("menuId", sql.Int, parseInt(menuId)).query(`
        SELECT 
          c.id,
          c.menuId,
          c.image,
          c.sortOrder,
          c.isActive,
          c.createdAt,
          ar.name as nameAr,
          en.name as nameEn
        FROM Categories c
        LEFT JOIN CategoryTranslations ar ON c.id = ar.categoryId AND ar.locale = 'ar'
        LEFT JOIN CategoryTranslations en ON c.id = en.categoryId AND en.locale = 'en'
        WHERE c.id = @categoryId AND c.menuId = @menuId
      `);

    if (result.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.categoryNotFound);
      return;
    }

    res.json({ category: result.recordset[0] });
  } catch (error) {
    logger.error("Get category by ID error:", error);
    sendApiError(res, req, 500, ApiErrors.failedGetCategory);
  }
}

// Create category
export async function createCategory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId } = req.params;
    const { nameAr, nameEn, imageUrl, image, sortOrder = 0 } = req.body;

    // Support both 'imageUrl' and 'image' for backward compatibility
    const categoryImage = imageUrl || image;

    // Validate required fields
    if (!nameAr || !nameEn) {
      sendApiError(res, req, 400, ApiErrors.nameRequiredArEn);
      return;
    }

    const pool = await getPool();

    if (!(await requireMenuAccess(req, res, menuId))) return;

    // Insert category
    const categoryResult = await pool
      .request()
      .input("menuId", sql.Int, parseInt(menuId))
      .input("image", sql.NVarChar, categoryImage || null)
      .input("sortOrder", sql.Int, sortOrder).query(`
        INSERT INTO Categories (menuId, image, sortOrder)
        VALUES (@menuId, @image, @sortOrder);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const categoryId = categoryResult.recordset[0].id;

    // Insert Arabic translation
    await pool
      .request()
      .input("categoryId", sql.Int, categoryId)
      .input("locale", sql.NVarChar, "ar")
      .input("name", sql.NVarChar, nameAr).query(`
        INSERT INTO CategoryTranslations (categoryId, locale, name)
        VALUES (@categoryId, @locale, @name)
      `);

    // Insert English translation
    await pool
      .request()
      .input("categoryId", sql.Int, categoryId)
      .input("locale", sql.NVarChar, "en")
      .input("name", sql.NVarChar, nameEn).query(`
        INSERT INTO CategoryTranslations (categoryId, locale, name)
        VALUES (@categoryId, @locale, @name)
      `);

    // Get the created category with image to return
    const createdCategory = await pool
      .request()
      .input("categoryId", sql.Int, categoryId)
      .input("menuId", sql.Int, parseInt(menuId)).query(`
        SELECT 
          c.id,
          c.menuId,
          c.image,
          c.sortOrder,
          c.isActive,
          c.createdAt,
          ar.name as nameAr,
          en.name as nameEn
        FROM Categories c
        LEFT JOIN CategoryTranslations ar ON c.id = ar.categoryId AND ar.locale = 'ar'
        LEFT JOIN CategoryTranslations en ON c.id = en.categoryId AND en.locale = 'en'
        WHERE c.id = @categoryId AND c.menuId = @menuId
      `);

    res.status(201).json({
      message: "Category created successfully",
      categoryId,
      category: createdCategory.recordset[0],
    });
    void logMenuActivitySafe(req, parseInt(menuId, 10), {
      action: "CATEGORY_CREATED",
      targetType: "category",
      targetId: Number(categoryId),
      summaryAr: `إضافة تصنيف: ${String(nameAr)}`,
      summaryEn: `Added category: ${String(nameEn)}`,
    });
  } catch (error) {
    logger.error("Create category error:", error);
    sendApiError(res, req, 500, ApiErrors.failedCreateCategory);
  }
}

// Update category
export async function updateCategory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId, categoryId } = req.params;
    const { nameAr, nameEn, imageUrl, image, sortOrder, isActive } = req.body;

    // Support both 'imageUrl' and 'image' for backward compatibility
    const categoryImage = imageUrl !== undefined ? imageUrl : image;

    const pool = await getPool();

    if (!(await requireMenuAccess(req, res, menuId))) return;

    // Verify category belongs to menu
    const categoryCheck = await pool
      .request()
      .input("categoryId", sql.Int, parseInt(categoryId))
      .input("menuId", sql.Int, parseInt(menuId))
      .query(
        "SELECT id FROM Categories WHERE id = @categoryId AND menuId = @menuId"
      );

    if (categoryCheck.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.categoryNotFound);
      return;
    }

    // Update category - build dynamic update query
    const updates: string[] = [];
    const request = pool
      .request()
      .input("categoryId", sql.Int, parseInt(categoryId));

    if (categoryImage !== undefined) {
      updates.push("image = @image");
      request.input("image", sql.NVarChar, categoryImage || null);
    }

    if (sortOrder !== undefined) {
      updates.push("sortOrder = @sortOrder");
      request.input("sortOrder", sql.Int, sortOrder);
    }

    if (isActive !== undefined) {
      updates.push("isActive = @isActive");
      request.input("isActive", sql.Bit, isActive);
    }

    if (updates.length > 0) {
      await request.query(`
        UPDATE Categories
        SET ${updates.join(", ")}
        WHERE id = @categoryId
      `);
    }

    // Update translations
    if (nameAr !== undefined) {
      await pool
        .request()
        .input("categoryId", sql.Int, parseInt(categoryId))
        .input("name", sql.NVarChar, nameAr).query(`
          UPDATE CategoryTranslations
          SET name = @name
          WHERE categoryId = @categoryId AND locale = 'ar'
        `);
    }

    if (nameEn !== undefined) {
      await pool
        .request()
        .input("categoryId", sql.Int, parseInt(categoryId))
        .input("name", sql.NVarChar, nameEn).query(`
          UPDATE CategoryTranslations
          SET name = @name
          WHERE categoryId = @categoryId AND locale = 'en'
        `);
    }

    res.json({ message: "Category updated successfully" });

    const nameLog = await pool
      .request()
      .input("categoryId", sql.Int, parseInt(categoryId, 10))
      .query(`
        SELECT ar.name AS nameAr, en.name AS nameEn
        FROM Categories c
        LEFT JOIN CategoryTranslations ar ON c.id = ar.categoryId AND ar.locale = 'ar'
        LEFT JOIN CategoryTranslations en ON c.id = en.categoryId AND en.locale = 'en'
        WHERE c.id = @categoryId
      `);
    const cn = nameLog.recordset[0] as
      | { nameAr?: string | null; nameEn?: string | null }
      | undefined;
    const labelAr = String(cn?.nameAr ?? "").trim() || "تصنيف";
    const labelEn = String(cn?.nameEn ?? "").trim() || "Category";
    void logMenuActivitySafe(req, parseInt(menuId, 10), {
      action: "CATEGORY_UPDATED",
      targetType: "category",
      targetId: parseInt(categoryId, 10),
      summaryAr: `تعديل تصنيف: ${labelAr}`,
      summaryEn: `Updated category: ${labelEn}`,
    });
  } catch (error) {
    logger.error("Update category error:", error);
    sendApiError(res, req, 500, ApiErrors.failedUpdateCategory);
  }
}

// Delete category
export async function deleteCategory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { menuId, categoryId } = req.params;

    const pool = await getPool();

    if (!(await requireMenuAccess(req, res, menuId))) return;

    // Check if category has items
    const itemsCheck = await pool
      .request()
      .input("categoryId", sql.Int, parseInt(categoryId))
      .query(
        "SELECT COUNT(*) as count FROM MenuItems WHERE categoryId = @categoryId"
      );

    if (itemsCheck.recordset[0].count > 0) {
      res.status(400).json({
        error:
          "Cannot delete category with items. Please delete or move items first.",
      });
      return;
    }

    const namesBefore = await pool
      .request()
      .input("categoryId", sql.Int, parseInt(categoryId, 10))
      .input("menuId", sql.Int, parseInt(menuId, 10))
      .query(`
        SELECT ar.name AS nameAr, en.name AS nameEn
        FROM Categories c
        LEFT JOIN CategoryTranslations ar ON c.id = ar.categoryId AND ar.locale = 'ar'
        LEFT JOIN CategoryTranslations en ON c.id = en.categoryId AND en.locale = 'en'
        WHERE c.id = @categoryId AND c.menuId = @menuId
      `);

    if (namesBefore.recordset.length === 0) {
      sendApiError(res, req, 404, ApiErrors.categoryNotFound);
      return;
    }

    const cn = namesBefore.recordset[0] as {
      nameAr?: string | null;
      nameEn?: string | null;
    };
    const labelAr = String(cn?.nameAr ?? "").trim() || "تصنيف";
    const labelEn = String(cn?.nameEn ?? "").trim() || "Category";

    const result = await pool
      .request()
      .input("categoryId", sql.Int, parseInt(categoryId))
      .input("menuId", sql.Int, parseInt(menuId))
      .query(
        "DELETE FROM Categories WHERE id = @categoryId AND menuId = @menuId"
      );

    if (result.rowsAffected[0] === 0) {
      sendApiError(res, req, 404, ApiErrors.categoryNotFound);
      return;
    }

    res.json({ message: "Category deleted successfully" });
    void logMenuActivitySafe(req, parseInt(menuId, 10), {
      action: "CATEGORY_DELETED",
      targetType: "category",
      targetId: parseInt(categoryId, 10),
      summaryAr: `حذف تصنيف: ${labelAr}`,
      summaryEn: `Deleted category: ${labelEn}`,
    });
  } catch (error) {
    logger.error("Delete category error:", error);
    sendApiError(res, req, 500, ApiErrors.failedDeleteCategory);
  }
}
