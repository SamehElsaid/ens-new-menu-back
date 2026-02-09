import { Request, Response } from 'express';
import { getPool, sql } from '../config/database';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

// Get user profile
export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id, email, name, phoneNumber, country, dateOfBirth, gender, address,
          role, isEmailVerified, createdAt, profileImage
        FROM Users
        WHERE id = @userId
      `);

    if (result.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.recordset[0] });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

// Update user profile
export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { name, phone, phoneNumber, country, dateOfBirth, gender, address, profileImage } = req.body;

    const pool = await getPool();

    const updates: string[] = [];
    const request = pool.request().input('userId', sql.Int, userId);

    if (name !== undefined) {
      updates.push('name = @name');
      request.input('name', sql.NVarChar, name);
    }
    
    // Accept both 'phone' and 'phoneNumber' for compatibility
    const phoneValue = phone || phoneNumber;
    if (phoneValue !== undefined) {
      updates.push('phoneNumber = @phoneNumber');
      request.input('phoneNumber', sql.NVarChar, phoneValue || null);
    }

    if (country !== undefined) {
      updates.push('country = @country');
      request.input('country', sql.NVarChar, country || null);
    }

    if (dateOfBirth !== undefined) {
      updates.push('dateOfBirth = @dateOfBirth');
      request.input('dateOfBirth', sql.Date, dateOfBirth || null);
    }

    if (gender !== undefined) {
      updates.push('gender = @gender');
      request.input('gender', sql.NVarChar, gender || null);
    }

    if (address !== undefined) {
      updates.push('address = @address');
      request.input('address', sql.NVarChar, address || null);
    }

    if (profileImage !== undefined) {
      updates.push('profileImage = @profileImage');
      request.input('profileImage', sql.NVarChar, profileImage || null);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    await request.query(`
      UPDATE Users 
      SET ${updates.join(', ')}
      WHERE id = @userId
    `);

    // Get updated user data
    const userResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id, email, name, phoneNumber, country, dateOfBirth, gender, address,
          role, isEmailVerified, createdAt, profileImage
        FROM Users
        WHERE id = @userId
      `);

    res.json({ 
      message: 'Profile updated successfully',
      user: userResult.recordset[0]
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

// Change password
export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body;

    const pool = await getPool();

    // Get current password hash
    const userResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query('SELECT password FROM Users WHERE id = @userId');

    if (userResult.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify current password
    const isValid = await bcrypt.compare(
      currentPassword,
      userResult.recordset[0].password
    );

    if (!isValid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await pool
      .request()
      .input('userId', sql.Int, userId)
      .input('password', sql.NVarChar, newPasswordHash)
      .query('UPDATE Users SET password = @password WHERE id = @userId');

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
}

// Get user statistics
export async function getStatistics(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const pool = await getPool();

    // Get menu count
    const menuResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query('SELECT COUNT(*) as count FROM Menus WHERE userId = @userId');

    // Get total items count
    const itemsResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT COUNT(*) as count 
        FROM MenuItems mi
        JOIN Menus m ON mi.menuId = m.id
        WHERE m.userId = @userId
      `);

    // Get total ratings count and average
    const ratingsResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          COUNT(*) as count,
          AVG(CAST(rating AS FLOAT)) as average
        FROM Ratings r
        JOIN Menus m ON r.menuId = m.id
        WHERE m.userId = @userId
      `);

    // Get active menus count
    const activeMenusResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT COUNT(*) as count 
        FROM Menus 
        WHERE userId = @userId AND isActive = 1
      `);

    res.json({
      statistics: {
        totalMenus: menuResult.recordset[0].count,
        activeMenus: activeMenusResult.recordset[0].count,
        totalItems: itemsResult.recordset[0].count,
        totalRatings: ratingsResult.recordset[0].count,
        averageRating: ratingsResult.recordset[0].average || 0,
      },
    });
  } catch (error) {
    logger.error('Get statistics error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
}

// Upgrade plan (for future payment integration)
export async function upgradePlan(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { planType } = req.body; // 'free', 'monthly', 'yearly'

    // Define plan limits
    const planLimits: Record<string, number> = {
      free: 1,
      monthly: 5,
      yearly: 20,
    };

    if (!planLimits[planType]) {
      res.status(400).json({ error: 'Invalid plan type' });
      return;
    }

    const pool = await getPool();

    await pool
      .request()
      .input('userId', sql.Int, userId)
      .input('planType', sql.NVarChar, planType)
      .input('menusLimit', sql.Int, planLimits[planType])
      .query(`
        UPDATE Users 
        SET planType = @planType, menusLimit = @menusLimit
        WHERE id = @userId
      `);

    res.json({
      message: 'Plan upgraded successfully',
      planType,
      menusLimit: planLimits[planType],
    });
  } catch (error) {
    logger.error('Upgrade plan error:', error);
    res.status(500).json({ error: 'Failed to upgrade plan' });
  }
}

// Get user subscription
export async function getSubscription(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT TOP 1
          s.id, s.userId, s.planId, s.status, s.startDate, s.endDate, 
          s.billingCycle, s.amount, s.createdAt,
          p.name as planName, p.maxMenus, p.maxProductsPerMenu
        FROM Subscriptions s
        LEFT JOIN Plans p ON s.planId = p.id
        WHERE s.userId = @userId 
          AND s.status = 'active' 
          AND (s.endDate IS NULL OR s.endDate > GETDATE())
        ORDER BY s.id DESC
      `);

    if (result.recordset.length === 0) {
      // Return default free subscription if no active subscription found
      // Get free plan limits
      const freePlanResult = await pool.request().query(`
        SELECT maxMenus, maxProductsPerMenu
        FROM Plans
        WHERE name = 'Free'
      `);
      const freePlan = freePlanResult.recordset[0] || { maxMenus: 1, maxProductsPerMenu: 20 };
      
      res.json({ 
        subscription: {
          plan: 'Free',
          planName: 'Free',
          status: 'active',
          billingCycle: 'free',
          startDate: null,
          endDate: null,
          amount: 0,
          maxMenus: freePlan.maxMenus,
          maxProductsPerMenu: freePlan.maxProductsPerMenu
        }
      });
      return;
    }

    const subscription = result.recordset[0];
    res.json({ 
      subscription: {
        ...subscription,
        plan: subscription.planName || 'Free'
      }
    });
  } catch (error) {
    logger.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
}

// Delete account
export async function deleteAccount(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { password } = req.body;

    const pool = await getPool();

    // Verify password
    const userResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query('SELECT password FROM Users WHERE id = @userId');

    if (userResult.recordset.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const isValid = await bcrypt.compare(
      password,
      userResult.recordset[0].password
    );

    if (!isValid) {
      res.status(401).json({ error: 'Password is incorrect' });
      return;
    }

    // Delete user (CASCADE will delete all related data)
    await pool
      .request()
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Users WHERE id = @userId');

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
}


