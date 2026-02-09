/**
 * Migration Script: Rename theme 'classic' to 'neon'
 * Run this script to update existing menus from 'classic' theme to 'neon' theme
 */

const path = require('path');

// تحميل env من ملف .env.development
const envPath = path.join(__dirname, '../.env.development');
require('dotenv').config({ path: envPath });

const sql = require('mssql');
const fs = require('fs');

const config = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'SaaSMenuDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
  },
  port: parseInt(process.env.DB_PORT || '1433'),
};

async function runMigration() {
  let pool;
  try {
    console.log('🔄 Connecting to database...');
    pool = await sql.connect(config);
    console.log('✅ Connected to database');

    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations/015_rename_classic_to_neon.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔄 Running migration: Rename classic to neon...');
    
    // Execute migration
    const result = await pool.request().query(migrationSQL);
    
    console.log('✅ Migration completed successfully');
    console.log(`📊 Rows affected: ${result.rowsAffected[0] || 0}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run migration
console.log('🚀 Starting migration script...');
runMigration()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

