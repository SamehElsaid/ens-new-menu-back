import slugify from 'slugify';
import { getPool, sql } from '../config/database';

export async function generateUniqueSlug(name: string): Promise<string> {
  // Transliterate and slugify
  const baseSlug = slugify(name, {
    replacement: '-',
    remove: /[*+~.()'"!:@]/g,
    lower: true,
    strict: true,
    locale: 'ar',
  });

  // Generate random alphanumeric string
  const generateRandomString = (length: number): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  let slug = baseSlug;
  let counter = 1;

  // Check for uniqueness
  while (await slugExists(slug)) {
    // If slug already exists, append random string instead of counter
    const randomString = generateRandomString(4);
    slug = `${baseSlug}-${randomString}`;
    counter++;
    
    // Prevent infinite loop
    if (counter > 100) {
      slug = `${baseSlug}-${generateRandomString(7)}`;
      break;
    }
  }

  return slug;
}

async function slugExists(slug: string): Promise<boolean> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('slug', sql.NVarChar, slug)
    .query('SELECT COUNT(*) as count FROM Menus WHERE slug = @slug');
  
  return result.recordset[0].count > 0;
}

export function validateSlug(slug: string): boolean {
  // Only alphanumeric and hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length >= 3 && slug.length <= 100;
}

// Generate random alphanumeric ID (minimum 7 characters)
export function generateRandomId(length: number = 7): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate unique menu ID (checks database for uniqueness)
export async function generateUniqueMenuId(length: number = 7): Promise<string> {
  const pool = await getPool();
  let menuId: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    menuId = generateRandomId(length);
    const result = await pool
      .request()
      .input('id', sql.NVarChar, menuId)
      .query('SELECT COUNT(*) as count FROM Menus WHERE id = @id');
    
    if (result.recordset[0].count === 0) {
      return menuId;
    }
    
    attempts++;
    
    // If too many attempts, increase length
    if (attempts >= maxAttempts) {
      length++;
      attempts = 0;
    }
  } while (attempts < maxAttempts * 10); // Prevent infinite loop

  // Fallback: return with timestamp
  return generateRandomId(length) + Date.now().toString(36).substring(0, 4);
}


