import { Request, Response } from 'express';
import { getPool, sql } from '../config/database';

// Get all menu items for a specific menu
export const getMenuItems = async (req: Request, res: Response) => {
  try {
    const { menuId } = req.params;
    const { locale = 'en' } = req.query;

    const pool = await getPool();

    // Check if menu exists and belongs to user
    const menuResult = await pool.request()
      .input('menuId', sql.Int, menuId)
      .input('userId', sql.Int, req.user?.id)
      .query(`
        SELECT id FROM Menus 
        WHERE id = @menuId AND userId = @userId
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu not found or you do not have access to it' 
      });
    }

    // Get menu items with translations
    const result = await pool.request()
      .input('menuId', sql.Int, menuId)
      .input('locale', sql.NVarChar, locale)
      .query(`
        SELECT 
          mi.id,
          mi.menuId,
          mi.price,
          mi.image,
          mi.category,
          mi.available,
          mi.sortOrder,
          mi.createdAt,
          mi.updatedAt,
          mit.name,
          mit.description,
          mit.locale
        FROM MenuItems mi
        LEFT JOIN MenuItemTranslations mit ON mi.id = mit.menuItemId AND mit.locale = @locale
        WHERE mi.menuId = @menuId
        ORDER BY mi.sortOrder ASC, mi.createdAt DESC
      `);

    res.json({
      success: true,
      data: {
        items: result.recordset
      }
    });
  } catch (error: any) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch menu items',
      error: error.message 
    });
  }
};

// Get single menu item
export const getMenuItem = async (req: Request, res: Response) => {
  try {
    const { menuId, itemId } = req.params;

    const pool = await getPool();

    // Check if menu exists and belongs to user
    const menuResult = await pool.request()
      .input('menuId', sql.Int, menuId)
      .input('userId', sql.Int, req.user?.id)
      .query(`
        SELECT id FROM Menus 
        WHERE id = @menuId AND userId = @userId
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu not found or you do not have access to it' 
      });
    }

    // Get menu item with all translations
    const itemResult = await pool.request()
      .input('itemId', sql.Int, itemId)
      .input('menuId', sql.Int, menuId)
      .query(`
        SELECT 
          mi.id,
          mi.menuId,
          mi.price,
          mi.image,
          mi.category,
          mi.available,
          mi.sortOrder,
          mi.createdAt,
          mi.updatedAt
        FROM MenuItems mi
        WHERE mi.id = @itemId AND mi.menuId = @menuId
      `);

    if (itemResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu item not found' 
      });
    }

    // Get translations
    const translationsResult = await pool.request()
      .input('itemId', sql.Int, itemId)
      .query(`
        SELECT locale, name, description
        FROM MenuItemTranslations
        WHERE menuItemId = @itemId
      `);

    const item = itemResult.recordset[0];
    const translations: any = {};
    translationsResult.recordset.forEach((t: any) => {
      translations[t.locale] = {
        name: t.name,
        description: t.description
      };
    });

    res.json({
      success: true,
      data: {
        item: {
          ...item,
          translations
        }
      }
    });
  } catch (error: any) {
    console.error('Error fetching menu item:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch menu item',
      error: error.message 
    });
  }
};

// Create menu item
export const createMenuItem = async (req: Request, res: Response) => {
  try {
    const { menuId } = req.params;
    const { 
      price, 
      image, 
      category, 
      available = true, 
      sortOrder = 0,
      translations // { ar: { name, description }, en: { name, description } }
    } = req.body;

    // Validation
    if (!translations || !translations.ar || !translations.en) {
      return res.status(400).json({ 
        success: false, 
        message: 'Translations for both Arabic and English are required' 
      });
    }

    if (!translations.ar.name || !translations.en.name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required in both languages' 
      });
    }

    if (price === undefined || price < 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid price is required' 
      });
    }

    if (!category) {
      return res.status(400).json({ 
        success: false, 
        message: 'Category is required' 
      });
    }

    const pool = await getPool();

    // Check if menu exists and belongs to user
    const menuResult = await pool.request()
      .input('menuId', sql.Int, menuId)
      .input('userId', sql.Int, req.user?.id)
      .query(`
        SELECT id FROM Menus 
        WHERE id = @menuId AND userId = @userId
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu not found or you do not have access to it' 
      });
    }

    // TODO: Check subscription limits
    // For now, we'll skip this check

    // Create menu item
    const itemResult = await pool.request()
      .input('menuId', sql.Int, menuId)
      .input('price', sql.Decimal(10, 2), price)
      .input('image', sql.NVarChar, image || null)
      .input('category', sql.NVarChar, category)
      .input('available', sql.Bit, available ? 1 : 0)
      .input('sortOrder', sql.Int, sortOrder)
      .query(`
        INSERT INTO MenuItems (menuId, price, image, category, available, sortOrder)
        OUTPUT INSERTED.id
        VALUES (@menuId, @price, @image, @category, @available, @sortOrder)
      `);

    const itemId = itemResult.recordset[0].id;

    // Insert translations
    for (const [locale, data] of Object.entries(translations)) {
      const trans = data as any;
      await pool.request()
        .input('menuItemId', sql.Int, itemId)
        .input('locale', sql.NVarChar, locale)
        .input('name', sql.NVarChar, trans.name)
        .input('description', sql.NVarChar, trans.description || null)
        .query(`
          INSERT INTO MenuItemTranslations (menuItemId, locale, name, description)
          VALUES (@menuItemId, @locale, @name, @description)
        `);
    }

    // Get the created item with translations
    const createdItem = await pool.request()
      .input('itemId', sql.Int, itemId)
      .query(`
        SELECT 
          mi.*,
          (SELECT locale, name, description FROM MenuItemTranslations WHERE menuItemId = @itemId FOR JSON PATH) as translations
        FROM MenuItems mi
        WHERE mi.id = @itemId
      `);

    res.status(201).json({
      success: true,
      message: 'Menu item created successfully',
      data: {
        item: createdItem.recordset[0]
      }
    });
  } catch (error: any) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create menu item',
      error: error.message 
    });
  }
};

// Update menu item
export const updateMenuItem = async (req: Request, res: Response) => {
  try {
    const { menuId, itemId } = req.params;
    const { 
      price, 
      image, 
      category, 
      available, 
      sortOrder,
      translations
    } = req.body;

    const pool = await getPool();

    // Check if menu exists and belongs to user
    const menuResult = await pool.request()
      .input('menuId', sql.Int, menuId)
      .input('userId', sql.Int, req.user?.id)
      .query(`
        SELECT id FROM Menus 
        WHERE id = @menuId AND userId = @userId
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu not found or you do not have access to it' 
      });
    }

    // Check if item exists
    const itemCheck = await pool.request()
      .input('itemId', sql.Int, itemId)
      .input('menuId', sql.Int, menuId)
      .query(`
        SELECT id FROM MenuItems 
        WHERE id = @itemId AND menuId = @menuId
      `);

    if (itemCheck.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu item not found' 
      });
    }

    // Update menu item
    let updateQuery = 'UPDATE MenuItems SET ';
    const updates: string[] = [];
    const request = pool.request().input('itemId', sql.Int, itemId);

    if (price !== undefined) {
      updates.push('price = @price');
      request.input('price', sql.Decimal(10, 2), price);
    }
    if (image !== undefined) {
      updates.push('image = @image');
      request.input('image', sql.NVarChar, image);
    }
    if (category !== undefined) {
      updates.push('category = @category');
      request.input('category', sql.NVarChar, category);
    }
    if (available !== undefined) {
      updates.push('available = @available');
      request.input('available', sql.Bit, available ? 1 : 0);
    }
    if (sortOrder !== undefined) {
      updates.push('sortOrder = @sortOrder');
      request.input('sortOrder', sql.Int, sortOrder);
    }

    if (updates.length > 0) {
      updateQuery += updates.join(', ') + ' WHERE id = @itemId';
      await request.query(updateQuery);
    }

    // Update translations if provided
    if (translations) {
      for (const [locale, data] of Object.entries(translations)) {
        const trans = data as any;
        
        // Check if translation exists
        const transCheck = await pool.request()
          .input('menuItemId', sql.Int, itemId)
          .input('locale', sql.NVarChar, locale)
          .query(`
            SELECT id FROM MenuItemTranslations 
            WHERE menuItemId = @menuItemId AND locale = @locale
          `);

        if (transCheck.recordset.length > 0) {
          // Update existing translation
          await pool.request()
            .input('menuItemId', sql.Int, itemId)
            .input('locale', sql.NVarChar, locale)
            .input('name', sql.NVarChar, trans.name)
            .input('description', sql.NVarChar, trans.description || null)
            .query(`
              UPDATE MenuItemTranslations 
              SET name = @name, description = @description
              WHERE menuItemId = @menuItemId AND locale = @locale
            `);
        } else {
          // Insert new translation
          await pool.request()
            .input('menuItemId', sql.Int, itemId)
            .input('locale', sql.NVarChar, locale)
            .input('name', sql.NVarChar, trans.name)
            .input('description', sql.NVarChar, trans.description || null)
            .query(`
              INSERT INTO MenuItemTranslations (menuItemId, locale, name, description)
              VALUES (@menuItemId, @locale, @name, @description)
            `);
        }
      }
    }

    res.json({
      success: true,
      message: 'Menu item updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update menu item',
      error: error.message 
    });
  }
};

// Delete menu item
export const deleteMenuItem = async (req: Request, res: Response) => {
  try {
    const { menuId, itemId } = req.params;

    const pool = await getPool();

    // Check if menu exists and belongs to user
    const menuResult = await pool.request()
      .input('menuId', sql.Int, menuId)
      .input('userId', sql.Int, req.user?.id)
      .query(`
        SELECT id FROM Menus 
        WHERE id = @menuId AND userId = @userId
      `);

    if (menuResult.recordset.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu not found or you do not have access to it' 
      });
    }

    // Delete menu item (cascade will delete translations)
    const result = await pool.request()
      .input('itemId', sql.Int, itemId)
      .input('menuId', sql.Int, menuId)
      .query(`
        DELETE FROM MenuItems 
        WHERE id = @itemId AND menuId = @menuId
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu item not found' 
      });
    }

    res.json({
      success: true,
      message: 'Menu item deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete menu item',
      error: error.message 
    });
  }
};

