// Import environment variables first
require('dotenv').config();

const sql = require('mssql');

const config = {
  server: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'SasMenuDB',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  port: parseInt(process.env.DB_PORT || '1433'),
};

async function expireSubscriptions() {
  try {
    console.log('🔄 Connecting to database...');
    const pool = await sql.connect(config);
    
    console.log('✅ Connected to database');
    console.log('🔄 Expiring subscriptions...');

    // Update expired subscriptions
    const result = await pool.request().query(`
      UPDATE Subscriptions
      SET status = 'expired'
      OUTPUT DELETED.id, DELETED.userId, DELETED.endDate
      WHERE status = 'active'
        AND endDate IS NOT NULL
        AND endDate <= GETDATE()
    `);

    const expiredCount = result.recordset.length;
    
    console.log(`\n✅ Successfully expired ${expiredCount} subscription(s)`);
    
    if (expiredCount > 0) {
      console.log('\n📋 Expired subscriptions:');
      console.table(result.recordset.map(row => ({
        SubscriptionId: row.id,
        UserId: row.userId,
        EndDate: row.endDate.toISOString().split('T')[0]
      })));
    }

    // Show current subscription status
    const statusResult = await pool.request().query(`
      SELECT 
        s.status,
        COUNT(*) as count,
        COUNT(CASE WHEN s.endDate <= GETDATE() THEN 1 END) as shouldBeExpired
      FROM Subscriptions s
      GROUP BY s.status
    `);

    console.log('\n📊 Subscription Status Summary:');
    console.table(statusResult.recordset);

    await pool.close();
    console.log('\n✅ Done!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
expireSubscriptions();

