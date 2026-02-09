// Script to create admin user
// Run with: node scripts/create-admin.js

require("dotenv").config(); // Load environment variables
const bcrypt = require("bcryptjs");
const sql = require("mssql");

const adminData = {
  email: "ens@admin.com",
  password: "12301230Aa",
  name: "Admin User",
  role: "admin",
};

async function createAdmin() {
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
    console.log(`   DB_USER: ${process.env.DB_USER}`);

    console.log("\n🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash(adminData.password, 10);
    console.log("✅ Password hashed successfully");

    console.log("\n📡 Connecting to database...");
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
    console.log("✅ Connected to database");

    // Check if user already exists
    console.log("🔍 Checking if user already exists...");
    const existingUser = await pool
      .request()
      .input("email", sql.NVarChar, adminData.email)
      .query("SELECT id, role FROM Users WHERE email = @email");

    if (existingUser.recordset.length > 0) {
      const user = existingUser.recordset[0];
      if (user.role === "admin") {
        console.log("⚠️  User already exists and is already an admin!");
        console.log(`   Email: ${adminData.email}`);
        console.log(`   User ID: ${user.id}`);
      } else {
        // Update existing user to admin
        console.log("📝 User exists but is not admin. Updating role...");
        await pool
          .request()
          .input("email", sql.NVarChar, adminData.email)
          .query("UPDATE Users SET role = 'admin' WHERE email = @email");
        console.log("✅ User role updated to admin!");
      }
    } else {
      // Create new admin user
      console.log("👤 Creating new admin user...");
      const result = await pool
        .request()
        .input("email", sql.NVarChar, adminData.email)
        .input("password", sql.NVarChar, hashedPassword)
        .input("name", sql.NVarChar, adminData.name)
        .input("role", sql.NVarChar, adminData.role).query(`
          INSERT INTO Users (email, password, name, role, isEmailVerified, createdAt)
          OUTPUT INSERTED.id
          VALUES (@email, @password, @name, @role, 1, GETDATE())
        `);

      const userId = result.recordset[0].id;
      console.log("✅ Admin user created successfully!");
      console.log(`   User ID: ${userId}`);
      console.log(`   Email: ${adminData.email}`);
      console.log(`   Name: ${adminData.name}`);
      console.log(`   Role: ${adminData.role}`);
    }

    await pool.close();
    console.log("\n🎉 Done! You can now login with:");
    console.log(`   Email: ${adminData.email}`);
    console.log(`   Password: ${adminData.password}`);
    console.log("\n🔗 Admin Panel: http://localhost:3000/admin");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

createAdmin();
