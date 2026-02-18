import { Request, Response } from 'express';
import { getPool, sql, executeTransaction } from '../config/database';
import { logger } from '../utils/logger';
import { normalizeImageUrls } from '../utils/urlHelper';
import { getLocaleFromAcceptLanguage } from '../utils/localeHelper';

// Get menu items (with pagination, search by name, filter by category name)
export async function getMenuItems(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const localeParam = (req.query.locale as string)?.toLowerCase();
    const locale =
      localeParam === 'en' || localeParam === 'ar'
        ? localeParam
        : getLocaleFromAcceptLanguage(req, 'ar');
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const search = (req.query.search as string)?.trim() || '';
    const categoryIdParam = req.query.categoryId;
    const categoryId = categoryIdParam !== undefined && categoryIdParam !== '' ? parseInt(categoryIdParam as string, 10) : undefined;
    const category = (req.query.category as string)?.trim() || '';
    const availableParam = req.query.available as string | undefined;
    const availableFilter = availableParam === undefined ? undefined : availableParam === 'true';

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

    // Check which columns exist
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'MenuItems' 
        AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent')
      `);
    
    const existingColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);
    const hasCategoryId = existingColumns.includes('categoryId');
    const hasOriginalPrice = existingColumns.includes('originalPrice');
    const hasDiscountPercent = existingColumns.includes('discountPercent');
    
    const categoriesTableCheck = await pool
      .request()
      .query(`
        SELECT COUNT(*) as count 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_NAME = 'Categories'
      `);
    
    const hasCategoriesTable = categoriesTableCheck.recordset[0].count > 0;

    const baseRequest = pool.request()
      .input('menuId', sql.Int, parseInt(menuId))
      .input('locale', sql.NVarChar, locale);

    if (categoryId !== undefined && !Number.isNaN(categoryId)) {
      baseRequest.input('categoryIdFilter', sql.Int, categoryId);
    }
    if (category) {
      baseRequest.input('categoryFilter', sql.NVarChar, category);
    }
    if (search) {
      baseRequest.input('searchPattern', sql.NVarChar, `%${search}%`);
    }
    if (availableFilter !== undefined) {
      baseRequest.input('availableFilter', sql.Bit, availableFilter);
    }

    // Build SELECT fields dynamically based on available columns
    const selectFields: string[] = ['mi.id'];
    
    if (hasCategoryId) {
      selectFields.push('mi.categoryId');
    }
    selectFields.push('mi.category', 'mi.price');
    
    if (hasOriginalPrice) {
      selectFields.push('mi.originalPrice');
    }
    if (hasDiscountPercent) {
      selectFields.push('mi.discountPercent');
    }
    
    selectFields.push(
      'mi.image',
      'mi.available',
      'mi.sortOrder',
      'mit.name',
      'mit.description',
      'mit_ar.description as description_ar',
      'mit_en.description as description_en',
      'mit_ar.name as name_ar',
      'mit_en.name as name_en'
    );
    
    if (hasCategoriesTable && hasCategoryId) {
      selectFields.push('ct.name as categoryName');
    }

    // Build JOIN clauses
    let joinClause = `
          LEFT JOIN MenuItemTranslations mit ON mi.id = mit.menuItemId AND mit.locale = @locale
          LEFT JOIN MenuItemTranslations mit_ar ON mi.id = mit_ar.menuItemId AND mit_ar.locale = 'ar'
          LEFT JOIN MenuItemTranslations mit_en ON mi.id = mit_en.menuItemId AND mit_en.locale = 'en'`;
    if (hasCategoriesTable && hasCategoryId) {
      joinClause += '\n          LEFT JOIN Categories c ON mi.categoryId = c.id\n          LEFT JOIN CategoryTranslations ct ON c.id = ct.categoryId AND ct.locale = @locale';
    }

    // Build WHERE conditions
    const whereParts: string[] = ['mi.menuId = @menuId'];
    if (categoryId !== undefined && !Number.isNaN(categoryId) && hasCategoryId) {
      whereParts.push('mi.categoryId = @categoryIdFilter');
    } else if (category) {
      if (hasCategoriesTable && hasCategoryId) {
        whereParts.push('ct.name LIKE @categoryFilterPattern');
        baseRequest.input('categoryFilterPattern', sql.NVarChar, `%${category}%`);
      } else {
        whereParts.push('mi.category = @categoryFilter');
      }
    }
    if (search) {
      whereParts.push('mit.name LIKE @searchPattern');
    }
    if (availableFilter !== undefined) {
      whereParts.push('mi.available = @availableFilter');
    }
    const whereClause = 'WHERE ' + whereParts.join(' AND ');
    const orderByClause = categoryId !== undefined || category
      ? 'ORDER BY mi.sortOrder, mi.id'
      : 'ORDER BY mi.category, mi.sortOrder, mi.id';

    // Count total matching rows (same params, no offset/limit)
    const countSelect = hasCategoriesTable && hasCategoryId
      ? 'COUNT(DISTINCT mi.id) as total'
      : 'COUNT(*) as total';
    const countQuery = `
      SELECT ${countSelect}
      FROM MenuItems mi
      ${joinClause}
      ${whereClause}
    `;
    const countResult = await baseRequest.query(countQuery);
    const total = countResult.recordset[0]?.total ?? 0;

    // Data query with pagination (new request with same params + offset, limit)
    const dataRequest = pool.request()
      .input('menuId', sql.Int, parseInt(menuId))
      .input('locale', sql.NVarChar, locale)
      .input('offset', sql.Int, (page - 1) * limit)
      .input('limit', sql.Int, limit);
    if (categoryId !== undefined && !Number.isNaN(categoryId)) {
      dataRequest.input('categoryIdFilter', sql.Int, categoryId);
    }
    if (category) {
      if (hasCategoriesTable && hasCategoryId) {
        dataRequest.input('categoryFilterPattern', sql.NVarChar, `%${category}%`);
      } else {
        dataRequest.input('categoryFilter', sql.NVarChar, category);
      }
    }
    if (search) {
      dataRequest.input('searchPattern', sql.NVarChar, `%${search}%`);
    }
    if (availableFilter !== undefined) {
      dataRequest.input('availableFilter', sql.Bit, availableFilter);
    }

    const dataQuery = `
      SELECT 
        ${selectFields.join(',\n            ')}
      FROM MenuItems mi
      ${joinClause}
      ${whereClause}
      ${orderByClause}
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `;

    const result = await dataRequest.query(dataQuery);

    // Normalize image URLs to absolute paths
    const items = normalizeImageUrls(result.recordset);

    const totalPages = Math.ceil(total / limit);

    res.setHeader('Content-Language', locale);
    res.json({
      locale,
      items,
      pagination: {
        total: Number(total),
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    logger.error('Get menu items error:', error);
    res.status(500).json({ error: 'Failed to get menu items' });
  }
}

// Create menu item
export async function createMenuItem(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const {
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      categoryId,           // ← جديد
      category,             // keep for backward compatibility
      price,
      originalPrice,        // ← جديد
      discountPercent,      // ← جديد
      image,
      isAvailable,          // from backend
      available,            // from frontend
      sortOrder,
    } = req.body;

    // Handle both 'isAvailable' and 'available' for backward compatibility
    const itemIsAvailable = isAvailable !== undefined ? isAvailable : (available !== undefined ? available : true);

    // Validation
    if (!nameAr || !nameEn) {
      res.status(400).json({ error: 'Name is required in both Arabic and English' });
      return;
    }

    if (!price || parseFloat(price) < 0) {
      res.status(400).json({ error: 'Valid price is required' });
      return;
    }

    const pool = await getPool();

    // Check if new columns exist for proper validation
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'MenuItems' 
        AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent')
      `);
    
    const hasNewColumns = columnCheck.recordset.length > 0;

    // Category validation - must have either categoryId or category
    if (hasNewColumns) {
      // With new columns, categoryId is preferred but category is acceptable
      if (!categoryId && !category) {
        res.status(400).json({ error: 'Category is required (either categoryId or category)' });
        return;
      }
    } else {
      // Without new columns, category is required
      if (!category) {
        res.status(400).json({ error: 'Category is required' });
        return;
      }
    }

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

    const itemId = await executeTransaction(async (transaction) => {
      // Check which columns exist
      const columnCheck = await transaction
        .request()
        .query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'MenuItems' 
          AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent')
        `);
      
      const existingColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);
      const hasCategoryId = existingColumns.includes('categoryId');
      const hasOriginalPrice = existingColumns.includes('originalPrice');
      const hasDiscountPercent = existingColumns.includes('discountPercent');

      // Build INSERT statement dynamically based on available columns
      const request = transaction.request()
        .input('menuId', sql.Int, parseInt(menuId))
        .input('category', sql.NVarChar, category || 'main')
        .input('price', sql.Decimal(10, 2), price)
        .input('image', sql.NVarChar, image || null)
        .input('available', sql.Bit, itemIsAvailable)
        .input('sortOrder', sql.Int, sortOrder || 0);

      let columns = ['menuId', 'category', 'price', 'image', 'available', 'sortOrder'];
      let values = ['@menuId', '@category', '@price', '@image', '@available', '@sortOrder'];

      if (hasCategoryId) {
        columns.push('categoryId');
        values.push('@categoryId');
        request.input('categoryId', sql.Int, categoryId || null);
      }

      if (hasOriginalPrice) {
        columns.push('originalPrice');
        values.push('@originalPrice');
        request.input('originalPrice', sql.Decimal(10, 2), originalPrice || null);
      }

      if (hasDiscountPercent) {
        columns.push('discountPercent');
        values.push('@discountPercent');
        request.input('discountPercent', sql.Int, discountPercent || null);
      }

      const itemResult = await request.query(`
        INSERT INTO MenuItems (${columns.join(', ')})
        OUTPUT INSERTED.id
        VALUES (${values.join(', ')})
      `);

      const newItemId = itemResult.recordset[0].id;

      // Insert Arabic translation
      await transaction
        .request()
        .input('menuItemId', sql.Int, newItemId)
        .input('locale', sql.NVarChar, 'ar')
        .input('name', sql.NVarChar, nameAr)
        .input('description', sql.NVarChar, descriptionAr || null)
        .query(`
          INSERT INTO MenuItemTranslations (menuItemId, locale, name, description)
          VALUES (@menuItemId, @locale, @name, @description)
        `);

      // Insert English translation
      await transaction
        .request()
        .input('menuItemId', sql.Int, newItemId)
        .input('locale', sql.NVarChar, 'en')
        .input('name', sql.NVarChar, nameEn)
        .input('description', sql.NVarChar, descriptionEn || null)
        .query(`
          INSERT INTO MenuItemTranslations (menuItemId, locale, name, description)
          VALUES (@menuItemId, @locale, @name, @description)
        `);

      return newItemId;
    });

    res.status(201).json({
      message: 'Menu item created successfully',
      itemId,
    });
  } catch (error) {
    logger.error('Create menu item error:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
}

// Update menu item
export async function updateMenuItem(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, itemId } = req.params;
    const {
      nameAr,
      nameEn,
      descriptionAr,
      descriptionEn,
      categoryId,           // ← جديد
      category,
      price,
      originalPrice,        // ← جديد
      discountPercent,      // ← جديد
      image,
      isAvailable,
      available,            // Add this for compatibility
      sortOrder,
    } = req.body;

    await executeTransaction(async (transaction) => {
      // Verify ownership
      const checkResult = await transaction
        .request()
        .input('itemId', sql.Int, parseInt(itemId))
        .input('menuId', sql.Int, parseInt(menuId))
        .input('userId', sql.Int, userId)
        .query(`
          SELECT mi.id 
          FROM MenuItems mi
          JOIN Menus m ON mi.menuId = m.id
          WHERE mi.id = @itemId AND mi.menuId = @menuId AND m.userId = @userId
        `);

      if (checkResult.recordset.length === 0) {
        throw new Error('Menu item not found or access denied');
      }

      // Check which columns exist
      const columnCheck = await transaction
        .request()
        .query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'MenuItems' 
          AND COLUMN_NAME IN ('categoryId', 'originalPrice', 'discountPercent')
        `);
      
      const existingColumns = columnCheck.recordset.map((r: any) => r.COLUMN_NAME);
      const hasCategoryId = existingColumns.includes('categoryId');
      const hasOriginalPrice = existingColumns.includes('originalPrice');
      const hasDiscountPercent = existingColumns.includes('discountPercent');

      // Update menu item
      const updates: string[] = [];
      const request = transaction.request().input('itemId', sql.Int, parseInt(itemId));

      if (hasCategoryId && categoryId !== undefined) {
        updates.push('categoryId = @categoryId');
        request.input('categoryId', sql.Int, categoryId || null);
      }
      if (category !== undefined) {
        updates.push('category = @category');
        request.input('category', sql.NVarChar, category);
      }
      if (price !== undefined) {
        updates.push('price = @price');
        request.input('price', sql.Decimal(10, 2), price);
      }
      if (hasOriginalPrice && originalPrice !== undefined) {
        updates.push('originalPrice = @originalPrice');
        request.input('originalPrice', sql.Decimal(10, 2), originalPrice || null);
      }
      if (hasDiscountPercent && discountPercent !== undefined) {
        updates.push('discountPercent = @discountPercent');
        request.input('discountPercent', sql.Int, discountPercent || null);
      }
      if (image !== undefined) {
        updates.push('image = @image');
        request.input('image', sql.NVarChar, image || null);
      }
      if (isAvailable !== undefined || available !== undefined) {
        const itemAvailable = isAvailable !== undefined ? isAvailable : available;
        updates.push('available = @available');
        request.input('available', sql.Bit, itemAvailable);
      }
      if (sortOrder !== undefined) {
        updates.push('sortOrder = @sortOrder');
        request.input('sortOrder', sql.Int, sortOrder);
      }

      if (updates.length > 0) {
        await request.query(`
          UPDATE MenuItems 
          SET ${updates.join(', ')}
          WHERE id = @itemId
        `);
      }

      // Update Arabic translation
      if (nameAr !== undefined || descriptionAr !== undefined) {
        await transaction
          .request()
          .input('itemId', sql.Int, parseInt(itemId))
          .input('name', sql.NVarChar, nameAr)
          .input('description', sql.NVarChar, descriptionAr || null)
          .query(`
            UPDATE MenuItemTranslations
            SET name = COALESCE(@name, name),
                description = COALESCE(@description, description)
            WHERE menuItemId = @itemId AND locale = 'ar'
          `);
      }

      // Update English translation
      if (nameEn !== undefined || descriptionEn !== undefined) {
        await transaction
          .request()
          .input('itemId', sql.Int, parseInt(itemId))
          .input('name', sql.NVarChar, nameEn)
          .input('description', sql.NVarChar, descriptionEn || null)
          .query(`
            UPDATE MenuItemTranslations
            SET name = COALESCE(@name, name),
                description = COALESCE(@description, description)
            WHERE menuItemId = @itemId AND locale = 'en'
          `);
      }
    });

    res.json({ message: 'Menu item updated successfully' });
  } catch (error) {
    logger.error('Update menu item error:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
}

// Delete menu item
export async function deleteMenuItem(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId, itemId } = req.params;

    const pool = await getPool();

    const result = await pool
      .request()
      .input('itemId', sql.Int, parseInt(itemId))
      .input('menuId', sql.Int, parseInt(menuId))
      .input('userId', sql.Int, userId)
      .query(`
        DELETE mi
        FROM MenuItems mi
        JOIN Menus m ON mi.menuId = m.id
        WHERE mi.id = @itemId AND mi.menuId = @menuId AND m.userId = @userId
      `);

    if (result.rowsAffected[0] === 0) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }

    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    logger.error('Delete menu item error:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
}

// Bulk update sort order
export async function updateDisplayOrder(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { menuId } = req.params;
    const { items } = req.body; // Array of { id, sortOrder }

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

    await executeTransaction(async (transaction) => {
      for (const item of items) {
        await transaction
          .request()
          .input('itemId', sql.Int, item.id)
          .input('menuId', sql.Int, parseInt(menuId))
          .input('sortOrder', sql.Int, item.sortOrder)
          .query(`
            UPDATE MenuItems
            SET sortOrder = @sortOrder
            WHERE id = @itemId AND menuId = @menuId
          `);
      }
    });

    res.json({ message: 'Display order updated successfully' });
  } catch (error) {
    logger.error('Update display order error:', error);
    res.status(500).json({ error: 'Failed to update display order' });
  }
}


