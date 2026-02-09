/**
 * Migration Script: Add menu customizations table
 */

const path = require('path');
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

    const migrationPath = path.join(__dirname, '../database/migrations/016_add_menu_customizations.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔄 Running migration: Add menu customizations...');
    
    await pool.request().query(migrationSQL);
    
    console.log('✅ Migration completed successfully');
    
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

