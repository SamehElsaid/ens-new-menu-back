const sql = require("mssql");
const bcrypt = require("bcryptjs");
require("dotenv").config();

// Monthly User Data
const monthlyUserData = {
  email: "monthly@test.com",
  password: "Test1234",
  name: "Monthly Subscriber",
  phoneNumber: "+966501234567",
  planId: 2, // Monthly plan
  billingCycle: "monthly",
};

async function createMonthlyUser() {
  try {
    // Validate environment variables
    console.log("🔍 Checking environment variables...");
    const requiredEnvVars = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName]
    );

    if (missingVars.length > 0) {
      console.error("❌ Missing required environment variables:");
      missingVars.forEach((varName) => console.error(`   - ${varName}`));
      console.error("\n💡 Please check your .env file in the back-end folder");
      console.error(
        "   Required variables: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD"
      );
      process.exit(1);
    }

    console.log("✅ Environment variables found");
    console.log(`   DB_HOST: ${process.env.DB_HOST}`);
    console.log(`   DB_NAME: ${process.env.DB_NAME}`);
    console.log(`   DB_USER: ${process.env.DB_USER}\n`);

    console.log("🚀 Creating Monthly User...\n");

    // Hash password
    console.log("🔒 Hashing password...");
    const hashedPassword = await bcrypt.hash(monthlyUserData.password, 10);
    console.log("✅ Password hashed!\n");

    // Database configuration
    console.log("📡 Connecting to database...");
    const pool = await sql.connect({
      server: process.env.DB_HOST,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: parseInt(process.env.DB_PORT || "1433"),
      options: {
        encrypt: true,
        trustServerCertificate: true,
      },
    });
    console.log("✅ Connected to database!\n");

    // Check if user already exists
    console.log("🔍 Checking if user already exists...");
    const existingUser = await pool
      .request()
      .input("email", sql.NVarChar, monthlyUserData.email)
      .query("SELECT id, email FROM Users WHERE email = @email");

    if (existingUser.recordset.length > 0) {
      console.log("⚠️  User already exists!");
      console.log(`   Email: ${monthlyUserData.email}`);
      console.log(`   User ID: ${existingUser.recordset[0].id}\n`);
      
      // Update subscription to monthly if exists
      console.log("📝 Updating subscription to monthly...");
      await pool
        .request()
        .input("userId", sql.Int, existingUser.recordset[0].id)
        .input("planId", sql.Int, monthlyUserData.planId)
        .input("billingCycle", sql.NVarChar, monthlyUserData.billingCycle)
        .query(`
          UPDATE Subscriptions 
          SET planId = @planId, 
              billingCycle = @billingCycle,
              status = 'active',
              updatedAt = GETDATE()
          WHERE userId = @userId
        `);
      console.log("✅ Subscription updated to monthly!\n");
    } else {
      // Create new monthly user
      console.log("👤 Creating new monthly user...");
      const userResult = await pool
        .request()
        .input("email", sql.NVarChar, monthlyUserData.email)
        .input("password", sql.NVarChar, hashedPassword)
        .input("name", sql.NVarChar, monthlyUserData.name)
        .input("phoneNumber", sql.NVarChar, monthlyUserData.phoneNumber)
        .input("role", sql.NVarChar, "user")
        .query(`
          INSERT INTO Users (email, password, name, phoneNumber, role, isEmailVerified, createdAt)
          OUTPUT INSERTED.id
          VALUES (@email, @password, @name, @phoneNumber, @role, 1, GETDATE())
        `);

      const userId = userResult.recordset[0].id;
      console.log("✅ User created successfully!");
      console.log(`   User ID: ${userId}`);
      console.log(`   Email: ${monthlyUserData.email}`);
      console.log(`   Name: ${monthlyUserData.name}\n`);

      // Create monthly subscription
      console.log("💳 Creating monthly subscription...");
      await pool
        .request()
        .input("userId", sql.Int, userId)
        .input("planId", sql.Int, monthlyUserData.planId)
        .input("billingCycle", sql.NVarChar, monthlyUserData.billingCycle)
        .query(`
          INSERT INTO Subscriptions (userId, planId, billingCycle, status, startDate, createdAt)
          VALUES (@userId, @planId, @billingCycle, 'active', GETDATE(), GETDATE())
        `);
      console.log("✅ Monthly subscription created!\n");
    }

    await pool.close();
    console.log("🎉 Done! Monthly user is ready!\n");
    console.log("📧 Login credentials:");
    console.log(`   Email: ${monthlyUserData.email}`);
    console.log(`   Password: ${monthlyUserData.password}`);
    console.log(`   Plan: Monthly (Pro)`);
    console.log("\n🔗 Login at: http://localhost:3000/authentication/sign-in");
    console.log("\n✨ Features:");
    console.log("   ✅ Up to 3 menus");
    console.log("   ✅ Up to 100 products per menu");
    console.log("   ✅ No ads");
    console.log("   ✅ Custom logo upload");
    console.log("   ✅ Pro badge on profile");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

createMonthlyUser();

