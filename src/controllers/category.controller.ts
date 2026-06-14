import { Request, Response } from "express";
import { getPool, sql, executeTransaction } from "../config/database";
import { logger } from "../utils/logger";
import { normalizeImageUrls } from "../utils/urlHelper";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { getMenuAccessForRequest } from "../utils/menuAccess";
import { logMenuActivitySafe } from "../services/menuActivityLog.service";
import {
  assertAndRecordBulkImportUsage,
  BulkImportLimitError,
  canUserBulkImport,
} from "../services/bulkImportUsage.service";

type BulkImportVariantInput = {
  id?: string;
  label?: string;
  labelEn?: string;
  price?: number | null;
  flags?: unknown[];
};

type BulkImportItemInput = {
  id?: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  price?: number | null;
  isAvailable?: boolean;
  available?: boolean;
  image?: string;
  imageUrl?: string;
  sortOrder?: number;
  variants?: BulkImportVariantInput[];
  flags?: unknown[];
};

type BulkImportCategoryInput = {
  id?: string;
  nameAr: string;
  nameEn: string;
  items?: BulkImportItemInput[];
  image?: string;
  imageUrl?: string;
  sortOrder?: number;
  flags?: unknown[];
  isCollapsed?: boolean;
};

type BulkImportResultCategory = {
  id: number;
  clientId?: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  items: Array<{
    id: number;
    clientId?: string;
    nameAr: string;
    nameEn: string;
    descriptionAr?: string | null;
    descriptionEn?: string | null;
    price: number;
    isAvailable: boolean;
    sortOrder: number;
  }>;
};

function resolveItemPrice(item: BulkImportItemInput): number | null {
  if (item.price !== null && item.price !== undefined) {
    const price = Number(item.price);
    if (!Number.isNaN(price) && price >= 0) return price;
  }

  const variants = item.variants;
  if (!Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  const variantPrices = variants
    .map((variant) => Number(variant.price))
    .filter((price) => !Number.isNaN(price) && price >= 0);

  if (variantPrices.length === 0) {
    return null;
  }

  return Math.min(...variantPrices);
}

function normalizeBulkCategoriesPayload(
  body: unknown,
): BulkImportCategoryInput[] | null {
  if (Array.isArray(body)) {
    return body as BulkImportCategoryInput[];
  }
  if (
    body &&
    typeof body === "object" &&
    Array.isArray((body as { categories?: unknown }).categories)
  ) {
    return (body as { categories: BulkImportCategoryInput[] }).categories;
  }
  return null;
}

function validateBulkCategoriesPayload(
  categories: BulkImportCategoryInput[],
): string | null {
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    if (!category?.nameAr?.trim() || !category?.nameEn?.trim()) {
      return `Category at index ${i} must have nameAr and nameEn`;
    }
    if (category.items !== undefined && !Array.isArray(category.items)) {
      return `Category at index ${i}: items must be an array`;
    }
    const items = category.items ?? [];
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      if (!item?.nameAr?.trim() || !item?.nameEn?.trim()) {
        return `Item at category index ${i}, item index ${j} must have nameAr and nameEn`;
      }
      const resolvedPrice = resolveItemPrice(item);
      if (resolvedPrice === null) {
        return `Item at category index ${i}, item index ${j} must have a valid price or variants with prices`;
      }
    }
  }
  return null;
}

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

// Bulk import categories with nested menu items (products)
export async function bulkImportCategories(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId } = req.params;
    const menuIdNum = parseInt(menuId, 10);
    const categoriesInput = normalizeBulkCategoriesPayload(req.body);

    if (!categoriesInput || categoriesInput.length === 0) {
      sendApiError(res, req, 400, ApiErrors.bulkImportInvalidPayload);
      return;
    }

    const validationError = validateBulkCategoriesPayload(categoriesInput);
    if (validationError) {
      sendApiError(res, req, 400, {
        en: validationError,
        ar: validationError,
      });
      return;
    }

    if (!(await requireMenuAccess(req, res, menuId))) return;

    const userId = req.user!.userId;

    const result = await executeTransaction(async (transaction) => {
      await assertAndRecordBulkImportUsage(
        transaction,
        userId,
        menuIdNum,
      );

      const columnCheck = await transaction.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'MenuItems'
        AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent')
      `);

      const existingColumns = columnCheck.recordset.map(
        (r: { COLUMN_NAME: string }) => r.COLUMN_NAME,
      );
      const hasCategoryId = existingColumns.includes("categoryId");
      const hasOriginalPrice = existingColumns.includes("originalPrice");
      const hasDiscountPercent = existingColumns.includes("discountPercent");

      const importedCategories: BulkImportResultCategory[] = [];

      for (let catIndex = 0; catIndex < categoriesInput.length; catIndex++) {
        const categoryInput = categoriesInput[catIndex];
        const categoryImage =
          categoryInput.imageUrl ?? categoryInput.image ?? null;
        const categorySortOrder =
          categoryInput.sortOrder !== undefined
            ? categoryInput.sortOrder
            : catIndex;

        const categoryResult = await transaction
          .request()
          .input("menuId", sql.Int, menuIdNum)
          .input("image", sql.NVarChar, categoryImage)
          .input("sortOrder", sql.Int, categorySortOrder).query(`
            INSERT INTO Categories (menuId, image, sortOrder)
            OUTPUT INSERTED.id
            VALUES (@menuId, @image, @sortOrder)
          `);

        const categoryId = categoryResult.recordset[0].id as number;

        await transaction
          .request()
          .input("categoryId", sql.Int, categoryId)
          .input("name", sql.NVarChar, categoryInput.nameAr.trim()).query(`
            INSERT INTO CategoryTranslations (categoryId, locale, name)
            VALUES (@categoryId, 'ar', @name)
          `);

        await transaction
          .request()
          .input("categoryId", sql.Int, categoryId)
          .input("name", sql.NVarChar, categoryInput.nameEn.trim()).query(`
            INSERT INTO CategoryTranslations (categoryId, locale, name)
            VALUES (@categoryId, 'en', @name)
          `);

        const importedItems: BulkImportResultCategory["items"] = [];
        const items = categoryInput.items ?? [];

        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
          const itemInput = items[itemIndex];
          const itemIsAvailable =
            itemInput.isAvailable !== undefined
              ? itemInput.isAvailable
              : itemInput.available !== undefined
                ? itemInput.available
                : true;
          const itemImage = itemInput.imageUrl ?? itemInput.image ?? null;
          const itemSortOrder =
            itemInput.sortOrder !== undefined
              ? itemInput.sortOrder
              : itemIndex;
          const categoryLabel = categoryInput.nameEn.trim() || "main";
          const itemPrice = resolveItemPrice(itemInput)!;
          const descriptionAr = itemInput.descriptionAr?.trim() || null;
          const descriptionEn = itemInput.descriptionEn?.trim() || null;

          const itemRequest = transaction
            .request()
            .input("menuId", sql.Int, menuIdNum)
            .input("category", sql.NVarChar, categoryLabel)
            .input("price", sql.Decimal(10, 2), itemPrice)
            .input("image", sql.NVarChar, itemImage)
            .input("available", sql.Bit, itemIsAvailable ? 1 : 0)
            .input("sortOrder", sql.Int, itemSortOrder);

          const itemColumns = [
            "menuId",
            "category",
            "price",
            "image",
            "available",
            "sortOrder",
          ];
          const itemValues = [
            "@menuId",
            "@category",
            "@price",
            "@image",
            "@available",
            "@sortOrder",
          ];

          if (hasCategoryId) {
            itemColumns.push("categoryId");
            itemValues.push("@categoryId");
            itemRequest.input("categoryId", sql.Int, categoryId);
          }

          if (hasOriginalPrice) {
            itemColumns.push("originalPrice");
            itemValues.push("@originalPrice");
            itemRequest.input("originalPrice", sql.Decimal(10, 2), null);
          }

          if (hasDiscountPercent) {
            itemColumns.push("discountPercent");
            itemValues.push("@discountPercent");
            itemRequest.input("discountPercent", sql.Int, null);
          }

          const itemResult = await itemRequest.query(`
            INSERT INTO MenuItems (${itemColumns.join(", ")})
            OUTPUT INSERTED.id
            VALUES (${itemValues.join(", ")})
          `);

          const itemId = itemResult.recordset[0].id as number;

          await transaction
            .request()
            .input("menuItemId", sql.Int, itemId)
            .input("name", sql.NVarChar, itemInput.nameAr.trim())
            .input("description", sql.NVarChar, descriptionAr).query(`
              INSERT INTO MenuItemTranslations (menuItemId, locale, name, description)
              VALUES (@menuItemId, 'ar', @name, @description)
            `);

          await transaction
            .request()
            .input("menuItemId", sql.Int, itemId)
            .input("name", sql.NVarChar, itemInput.nameEn.trim())
            .input("description", sql.NVarChar, descriptionEn).query(`
              INSERT INTO MenuItemTranslations (menuItemId, locale, name, description)
              VALUES (@menuItemId, 'en', @name, @description)
            `);

          importedItems.push({
            id: itemId,
            clientId: itemInput.id,
            nameAr: itemInput.nameAr.trim(),
            nameEn: itemInput.nameEn.trim(),
            descriptionAr,
            descriptionEn,
            price: itemPrice,
            isAvailable: itemIsAvailable,
            sortOrder: itemSortOrder,
          });
        }

        importedCategories.push({
          id: categoryId,
          clientId: categoryInput.id,
          nameAr: categoryInput.nameAr.trim(),
          nameEn: categoryInput.nameEn.trim(),
          sortOrder: categorySortOrder,
          items: importedItems,
        });
      }

      return importedCategories;
    });

    const itemsCreated = result.reduce(
      (sum, category) => sum + category.items.length,
      0,
    );

    const bulkImportUsage = await canUserBulkImport(userId);

    res.status(201).json({
      message: "Bulk import completed successfully",
      categoriesCreated: result.length,
      itemsCreated,
      categories: result,
      ...(bulkImportUsage.limit !== -1 && {
        bulkImportUsage: {
          used: bulkImportUsage.used,
          limit: bulkImportUsage.limit,
          remaining: Math.max(0, bulkImportUsage.limit - bulkImportUsage.used),
        },
      }),
    });

    void logMenuActivitySafe(req, menuIdNum, {
      action: "MENU_BULK_IMPORT",
      targetType: "menu",
      targetId: menuIdNum,
      summaryAr: `استيراد ${result.length} تصنيف و ${itemsCreated} منتج`,
      summaryEn: `Imported ${result.length} categories and ${itemsCreated} items`,
    });
  } catch (error) {
    if (error instanceof BulkImportLimitError) {
      sendApiError(res, req, 403, ApiErrors.bulkImportUsageLimitExceeded, {
        code: "BULK_IMPORT_LIMIT",
        used: error.used,
        limit: error.limit,
        remaining: 0,
      });
      return;
    }
    logger.error("Bulk import categories error:", error);
    sendApiError(res, req, 500, ApiErrors.failedBulkImportCategories);
  }
}

// Check if the user can use bulk category import
export async function checkBulkImportCanUse(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { menuId } = req.params;
    if (!(await requireMenuAccess(req, res, menuId))) return;

    const userId = req.user!.userId;
    const { allowed, used, limit } = await canUserBulkImport(userId);
    res.json({
      canuse: allowed,
      used,
      limit,
      remaining: limit === -1 ? -1 : Math.max(0, limit - used),
    });
  } catch (error) {
    logger.error("Check bulk import canuse error:", error);
    sendApiError(res, req, 500, ApiErrors.internalServerError);
  }
}

