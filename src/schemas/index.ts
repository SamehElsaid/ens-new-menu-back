import { logger } from "../utils/logger";
import { ensureAdminActivityLogSchema } from "./adminActivityLog.schema";
import { ensureAdminCustomerSchema } from "./adminCustomer.schema";
import { ensureAnalyticsSchema } from "./analytics.schema";
import { ensureAppVersionSchema } from "./appVersion.schema";
import { ensureBulkImportUsageSchema } from "./bulkImportUsage.schema";
import { ensureHomepageFeaturedLogosSchema } from "./homepageFeaturedLogos.schema";
import { ensureMenuItemSizesSchema } from "./menuItemSizes.schema";
import { ensureMenuItemVariantsSchema } from "./menuItemVariants.schema";
import { ensureMenuAuditLogSchema } from "./menuAuditLog.schema";
import { ensureMenuChatbotSchema } from "./menuChatbot.schema";
import { ensureMenuStaffSchema } from "./menuStaff.schema";
import { ensureMenuTablesSchema } from "./menuTables.schema";
import { ensureMenuUuidSchema } from "./menuUuid.schema";
import { ensurePhoneVerifiedSchema } from "./phoneVerified.schema";
import { ensurePromoSchema } from "./promo.schema";
import { ensureRestaurantNameSchema } from "./restaurantName.schema";
import { ensureDeliverySchema } from "./delivery.schema";
import { ensureStaffTableCallsOrderTypeSchema } from "./staffTableCallsOrderType.schema";
import { ensureSearchInformationSchema } from "./searchInformation.schema";
import { ensureVoucherSchema } from "./voucher.schema";
import { migrateDeprecatedMenuThemes } from "./deprecatedMenuThemes.schema";
import { ensureDomainTransferSchema } from "./domainTransfer.schema";

export { ensureAdminActivityLogSchema } from "./adminActivityLog.schema";
export { ensureAdminCustomerSchema } from "./adminCustomer.schema";
export { ensureAnalyticsSchema } from "./analytics.schema";
export { ensureAppVersionSchema } from "./appVersion.schema";
export { ensureBulkImportUsageSchema } from "./bulkImportUsage.schema";
export { ensureHomepageFeaturedLogosSchema } from "./homepageFeaturedLogos.schema";
export { ensureMenuItemSizesSchema } from "./menuItemSizes.schema";
export { ensureMenuItemVariantsSchema } from "./menuItemVariants.schema";
export { ensureMenuAuditLogSchema } from "./menuAuditLog.schema";
export { ensureMenuChatbotSchema } from "./menuChatbot.schema";
export { ensureMenuStaffSchema } from "./menuStaff.schema";
export { ensureMenuTablesSchema } from "./menuTables.schema";
export { ensureMenuUuidSchema } from "./menuUuid.schema";
export { ensurePhoneVerifiedSchema } from "./phoneVerified.schema";
export { ensurePromoSchema } from "./promo.schema";
export { ensureRestaurantNameSchema } from "./restaurantName.schema";
export { ensureDeliverySchema } from "./delivery.schema";
export { ensureStaffTableCallsOrderTypeSchema } from "./staffTableCallsOrderType.schema";
export { ensureSearchInformationSchema } from "./searchInformation.schema";
export { ensureVoucherSchema } from "./voucher.schema";
export { migrateDeprecatedMenuThemes } from "./deprecatedMenuThemes.schema";
export { ensureDomainTransferSchema } from "./domainTransfer.schema";

/** Runs all idempotent DB schema migrations on startup (after pool is connected). */
export async function ensureDatabaseSchemas(): Promise<void> {
  const steps: Array<{ name: string; run: () => Promise<void> }> = [
    { name: "appVersion", run: ensureAppVersionSchema },
    { name: "promo", run: ensurePromoSchema },
    { name: "voucher", run: ensureVoucherSchema },
    { name: "phoneVerified", run: ensurePhoneVerifiedSchema },
    { name: "restaurantName", run: ensureRestaurantNameSchema },
    { name: "delivery", run: ensureDeliverySchema },
    { name: "staffTableCallsOrderType", run: ensureStaffTableCallsOrderTypeSchema },
    { name: "searchInformation", run: ensureSearchInformationSchema },
    { name: "analytics", run: ensureAnalyticsSchema },
    { name: "menuUuid", run: ensureMenuUuidSchema },
    { name: "menuTables", run: ensureMenuTablesSchema },
    { name: "menuStaff", run: ensureMenuStaffSchema },
    { name: "bulkImportUsage", run: ensureBulkImportUsageSchema },
    { name: "homepageFeaturedLogos", run: ensureHomepageFeaturedLogosSchema },
    { name: "adminCustomer", run: ensureAdminCustomerSchema },
    { name: "adminActivityLog", run: ensureAdminActivityLogSchema },
    { name: "menuItemSizes", run: ensureMenuItemSizesSchema },
    { name: "menuItemVariants", run: ensureMenuItemVariantsSchema },
    { name: "menuAuditLog", run: ensureMenuAuditLogSchema },
    { name: "menuChatbot", run: ensureMenuChatbotSchema },
    { name: "deprecatedMenuThemes", run: migrateDeprecatedMenuThemes },
    { name: "domainTransfer", run: ensureDomainTransferSchema },
  ];

  for (const step of steps) {
    await step.run();
    logger.debug(`Schema ensured: ${step.name}`);
  }

  logger.info("✅ Database schemas ensured");
}
