#!/usr/bin/env node
/**
 * Validates OpenAPI spec builds without YAML errors (development only).
 * Usage: npm run swagger:validate (from backend/)
 */
process.env.NODE_ENV = "development";
require("ts-node/register");

const { getSwaggerSpec } = require("../src/config/swagger");

try {
  const spec = getSwaggerSpec();
  if (!spec) {
    console.error("FAIL: Swagger disabled (NODE_ENV !== development)");
    process.exit(1);
  }

  const paths = Object.keys(spec.paths || {});
  let opCount = 0;
  for (const p of Object.values(spec.paths || {})) {
    for (const m of Object.keys(p)) {
      if (["get", "post", "put", "patch", "delete"].includes(m)) opCount++;
    }
  }

  const schemas = Object.keys(spec.components?.schemas || {});
  console.log(`OK: ${paths.length} paths, ${opCount} operations, ${schemas.length} schemas`);
} catch (err) {
  console.error("FAIL:", err.message || err);
  process.exit(1);
}
