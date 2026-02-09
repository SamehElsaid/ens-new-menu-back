const bcrypt = require("bcryptjs");

const password = "Test1234";

async function generateHash() {
  const hash = await bcrypt.hash(password, 10);
  console.log("\n🔐 Password Hash Generated:\n");
  console.log(`Password: ${password}`);
  console.log(`Hash: ${hash}\n`);
  console.log("Copy this hash and use it in your SQL script!\n");
}

generateHash();

