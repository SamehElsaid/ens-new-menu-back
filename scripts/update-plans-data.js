// Import environment variables first
require("dotenv").config();

const sql = require("mssql");

const config = {
  server: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "SaaSMenuDB",
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate: process.env.DB_TRUST_CERT !== "false",
  },
  port: parseInt(process.env.DB_PORT || "1433"),
};

// بيانات الخطط الكاملة
const plansData = [
  {
    name: "Free",
    description: "خطة مجانية",
    descriptionEn: "Free plan",
    priceMonthly: 0,
    priceYearly: 0,
    maxMenus: 1,
    maxProductsPerMenu: 50,
    hasAds: true,
    allowCustomDomain: false,
    isActive: true,
    features: ["منيو واحد", "50 منتج", "إعلانات", "بدون تعديلات"],
    featuresEn: ["1 Menu", "50 products", "With ads", "No customization"],
  },
  {
    name: "Pro",
    oldName: "Monthly", // للبحث بالاسم القديم
    description: "خطة احترافية",
    descriptionEn: "Professional plan",
    priceMonthly: 29.99, // يمكن تعديل السعر حسب الحاجة
    priceYearly: 299.99, // يمكن تعديل السعر حسب الحاجة
    maxMenus: 3,
    maxProductsPerMenu: 200,
    hasAds: false,
    allowCustomDomain: false,
    isActive: true,
    features: [
      "3 منيو",
      "200 منتج لكل قائمة",
      "تحكم في الإعلانات",
      "شامل التعديلات",
    ],
    featuresEn: [
      "3 Menus",
      "200 products per menu",
      "Control ads",
      "Full customization",
    ],
  },
  {
    name: "Customize",
    oldName: "Yearly", // للبحث بالاسم القديم
    description: "قريباً - خطة مخصصة حسب احتياجاتك",
    descriptionEn: "Coming Soon - Custom plan for your needs",
    priceMonthly: 0,
    priceYearly: 0,
    maxMenus: -1,
    maxProductsPerMenu: -1,
    hasAds: false,
    allowCustomDomain: true,
    isActive: false, // Coming soon - غير نشط
    features: ["قريباً", "اتصل بنا للمزيد من التفاصيل"],
    featuresEn: ["Coming Soon", "Contact us for more details"],
  },
];

async function updatePlansData() {
  let pool;
  try {
    console.log("🔄 Connecting to database...");
    pool = await sql.connect(config);
    console.log("✅ Connected to database\n");

    // Get current plans
    console.log("📋 Current plans in database:");
    const currentPlans = await pool.request().query(`
      SELECT id, name, priceMonthly, priceYearly, features, description
      FROM Plans
      ORDER BY priceMonthly ASC
    `);

    console.table(
      currentPlans.recordset.map((p) => ({
        ID: p.id,
        Name: p.name,
        "Price (M)": p.priceMonthly,
        "Price (Y)": p.priceYearly,
        "Has Features": p.features ? "✅" : "❌",
        "Has Description": p.description ? "✅" : "❌",
      }))
    );

    console.log("\n🔄 Updating plans with features and descriptions...\n");

    for (const planData of plansData) {
      const featuresJson = JSON.stringify(planData.features);

      // Try to update by current name or old name
      const result = await pool
        .request()
        .input("name", sql.NVarChar, planData.name)
        .input("oldName", sql.NVarChar, planData.oldName || planData.name)
        .input("description", sql.NVarChar, planData.description)
        .input("features", sql.NVarChar, featuresJson)
        .input("priceMonthly", sql.Decimal(10, 2), planData.priceMonthly || 0)
        .input("priceYearly", sql.Decimal(10, 2), planData.priceYearly || 0)
        .input("maxMenus", sql.Int, planData.maxMenus)
        .input("maxProductsPerMenu", sql.Int, planData.maxProductsPerMenu)
        .input("hasAds", sql.Bit, planData.hasAds ? 1 : 0)
        .input("allowCustomDomain", sql.Bit, planData.allowCustomDomain ? 1 : 0)
        .input("isActive", sql.Bit, planData.isActive ? 1 : 0).query(`
          UPDATE Plans
          SET 
            name = @name,
            description = @description,
            features = @features,
            priceMonthly = @priceMonthly,
            priceYearly = @priceYearly,
            maxMenus = @maxMenus,
            maxProductsPerMenu = @maxProductsPerMenu,
            hasAds = @hasAds,
            allowCustomDomain = @allowCustomDomain,
            isActive = @isActive
          WHERE name = @name OR name = @oldName
        `);

      if (result.rowsAffected[0] > 0) {
        console.log(`✅ Updated plan: ${planData.name}`);
        console.log(`   Description: ${planData.description}`);
        if (planData.priceMonthly !== undefined) {
          console.log(`   Price (Monthly): ${planData.priceMonthly}`);
        }
        if (planData.priceYearly !== undefined) {
          console.log(`   Price (Yearly): ${planData.priceYearly}`);
        }
        console.log(
          `   Max Menus: ${
            planData.maxMenus === -1 ? "Unlimited" : planData.maxMenus
          }`
        );
        console.log(
          `   Max Products: ${
            planData.maxProductsPerMenu === -1
              ? "Unlimited"
              : planData.maxProductsPerMenu
          }`
        );
        console.log(`   Features: ${planData.features.length} items`);
        console.log(
          `   Active: ${planData.isActive ? "Yes" : "No (Coming Soon)"}`
        );
      } else {
        console.log(`⚠️  Plan not found: ${planData.name}`);
      }
    }

    // Show updated plans
    console.log("\n📋 Updated plans:");
    const updatedPlans = await pool.request().query(`
      SELECT 
        id, 
        name, 
        description,
        priceMonthly, 
        priceYearly,
        maxMenus,
        maxProductsPerMenu,
        allowCustomDomain,
        hasAds,
        isActive,
        LEN(features) as featuresLength
      FROM Plans
      ORDER BY priceMonthly ASC
    `);

    console.table(
      updatedPlans.recordset.map((p) => ({
        ID: p.id,
        Name: p.name,
        Description: p.description
          ? p.description.substring(0, 30) + "..."
          : "N/A",
        "Price (Monthly)": p.priceMonthly,
        "Price (Yearly)": p.priceYearly,
        "Max Menus": p.maxMenus,
        "Max Items": p.maxProductsPerMenu === -1 ? "∞" : p.maxProductsPerMenu,
        "Custom Domain": p.allowCustomDomain ? "✅" : "❌",
        "Has Ads": p.hasAds ? "✅" : "❌",
        Active: p.isActive ? "✅" : "❌",
        "Features Size": p.featuresLength + " chars",
      }))
    );

    // Test JSON parsing
    console.log("\n🧪 Testing features JSON parsing:");
    const testPlans = await pool.request().query(`
      SELECT id, name, features
      FROM Plans
      WHERE features IS NOT NULL
      ORDER BY priceMonthly ASC
    `);

    testPlans.recordset.forEach((plan) => {
      try {
        const features = JSON.parse(plan.features);
        console.log(`\n${plan.name}:`);
        features.forEach((feature, index) => {
          console.log(`  ${index + 1}. ${feature}`);
        });
      } catch (error) {
        console.log(
          `❌ Error parsing features for ${plan.name}:`,
          error.message
        );
      }
    });

    console.log("\n✅ All plans updated successfully!");
    console.log("\n💡 You can now use the /api/public/plans endpoint");
    console.log("   Example: http://localhost:5000/api/public/plans");
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log("\n🔌 Database connection closed");
    }
  }
}

// Run the script
console.log("🚀 Starting plans data update script...\n");
updatePlansData();
