import { getPool, sql } from "../config/database";
import { ApiError } from "../middleware/errorHandler";
import { ensureVoucherSchema } from "../schemas/voucher.schema";
import { notifySubscriptionCreated } from "./notificationService";

export type VoucherType = "discount" | "duration";
export type DiscountType = "percentage" | "fixed";
export type DurationUnit = "days" | "months";
export type VoucherBillingCycle = "monthly" | "yearly" | "both";

export interface Voucher {
  id: number;
  code: string;
  type: VoucherType;
  discountType: DiscountType | null;
  discountValue: number | null;
  durationUnit: DurationUnit | null;
  durationValue: number | null;
  billingCycle: VoucherBillingCycle | null;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoucherValidationResult {
  voucher: Omit<Voucher, "description"> & { remainingUses: number };
  originalPrice?: number;
  discountedPrice?: number;
  discountAmount?: number;
}

export interface CreateVoucherInput {
  code: string;
  type: VoucherType;
  discountType?: DiscountType;
  discountValue?: number;
  durationUnit?: DurationUnit;
  durationValue?: number;
  billingCycle?: VoucherBillingCycle;
  maxUses: number;
  isActive?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  description?: string | null;
}

export interface UpdateVoucherInput {
  code?: string;
  type?: VoucherType;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  durationUnit?: DurationUnit | null;
  durationValue?: number | null;
  billingCycle?: VoucherBillingCycle | null;
  maxUses?: number;
  isActive?: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  description?: string | null;
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function mapRow(row: Record<string, unknown>): Voucher {
  return {
    id: Number(row.id),
    code: String(row.code ?? ""),
    type: String(row.type) as VoucherType,
    discountType: row.discount_type
      ? (String(row.discount_type) as DiscountType)
      : null,
    discountValue:
      row.discount_value != null ? Number(row.discount_value) : null,
    durationUnit: row.duration_unit
      ? (String(row.duration_unit) as DurationUnit)
      : null,
    durationValue:
      row.duration_value != null ? Number(row.duration_value) : null,
    billingCycle: row.billing_cycle
      ? (String(row.billing_cycle) as VoucherBillingCycle)
      : null,
    maxUses: Number(row.max_uses ?? 0),
    usedCount: Number(row.used_count ?? 0),
    isActive: Boolean(row.is_active),
    validFrom:
      row.valid_from instanceof Date
        ? row.valid_from.toISOString()
        : row.valid_from != null
          ? String(row.valid_from)
          : null,
    validUntil:
      row.valid_until instanceof Date
        ? row.valid_until.toISOString()
        : row.valid_until != null
          ? String(row.valid_until)
          : null,
    description: row.description != null ? String(row.description) : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ""),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? ""),
  };
}

function publicVoucherView(v: Voucher): Omit<Voucher, "description"> & {
  remainingUses: number;
} {
  const { description: _d, ...rest } = v;
  return {
    ...rest,
    remainingUses: Math.max(0, v.maxUses - v.usedCount),
  };
}

function assertVoucherDates(v: Voucher): void {
  const now = new Date();
  if (v.validFrom) {
    const from = new Date(v.validFrom);
    if (now < from) {
      throw new ApiError(
        400,
        "Voucher is not yet valid",
        true,
        "كود الخصم غير متاح بعد",
      );
    }
  }
  if (v.validUntil) {
    const until = new Date(v.validUntil);
    if (now > until) {
      throw new ApiError(
        400,
        "Voucher has expired",
        true,
        "انتهت صلاحية كود الخصم",
      );
    }
  }
}

function assertVoucherCapacity(v: Voucher): void {
  if (v.usedCount >= v.maxUses) {
    throw new ApiError(
      400,
      "Voucher usage limit reached",
      true,
      "تم استخدام كود الخصم بالكامل",
    );
  }
}

async function assertUserNotRedeemed(
  pool: Awaited<ReturnType<typeof getPool>>,
  voucherId: number,
  userId: number,
): Promise<void> {
  const result = await pool
    .request()
    .input("voucherId", sql.Int, voucherId)
    .input("userId", sql.Int, userId).query(`
      SELECT TOP 1 id FROM VoucherRedemptions
      WHERE voucher_id = @voucherId AND user_id = @userId
    `);
  if (result.recordset.length > 0) {
    throw new ApiError(
      400,
      "You have already used this voucher",
      true,
      "لقد استخدمت هذا الكود من قبل",
    );
  }
}

async function fetchVoucherByCode(code: string): Promise<Voucher | null> {
  await ensureVoucherSchema();
  const pool = await getPool();
  const normalized = normalizeCode(code);
  const result = await pool
    .request()
    .input("code", sql.NVarChar(50), normalized).query(`
      SELECT *
      FROM Vouchers
      WHERE code = @code
    `);
  if (result.recordset.length === 0) {
    return null;
  }
  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export function applyDiscountToPrice(
  originalPrice: number,
  discountType: DiscountType,
  discountValue: number,
): { discountedPrice: number; discountAmount: number } {
  let discountAmount = 0;
  if (discountType === "percentage") {
    discountAmount = (originalPrice * discountValue) / 100;
  } else {
    discountAmount = discountValue;
  }
  discountAmount = Math.min(originalPrice, Math.max(0, discountAmount));
  const discountedPrice =
    Math.round((originalPrice - discountAmount) * 100) / 100;
  return { discountedPrice, discountAmount };
}

function addDuration(
  base: Date,
  unit: DurationUnit,
  value: number,
): Date {
  const end = new Date(base);
  if (unit === "days") {
    end.setDate(end.getDate() + value);
  } else {
    end.setMonth(end.getMonth() + value);
  }
  return end;
}

async function fetchActiveProPlan(pool: Awaited<ReturnType<typeof getPool>>) {
  const planResult = await pool.request().query(`
    SELECT TOP 1 id, name
    FROM Plans
    WHERE isActive = 1 AND LOWER(LTRIM(RTRIM(name))) = N'pro'
  `);
  if (planResult.recordset.length === 0) {
    throw new ApiError(404, "Pro plan not found", true, "خطة Pro غير موجودة");
  }
  return planResult.recordset[0] as { id: number; name: string };
}

async function fetchActiveUserSubscription(
  pool: Awaited<ReturnType<typeof getPool>>,
  userId: number,
) {
  const result = await pool.request().input("userId", sql.Int, userId).query(`
    SELECT TOP 1 s.id, s.planId, s.billingCycle, s.endDate, s.status, p.name AS planName
    FROM Subscriptions s
    INNER JOIN Plans p ON p.id = s.planId
    WHERE s.userId = @userId AND s.status = 'active'
    ORDER BY s.endDate DESC
  `);
  if (result.recordset.length === 0) {
    return null;
  }
  const row = result.recordset[0];
  return {
    id: Number(row.id),
    planId: Number(row.planId),
    billingCycle: String(row.billingCycle ?? ""),
    endDate: row.endDate ? new Date(row.endDate) : null,
    planName: String(row.planName ?? ""),
  };
}

function validateCreateInput(input: CreateVoucherInput): void {
  const code = normalizeCode(input.code);
  if (!code || code.length < 3) {
    throw new ApiError(
      400,
      "Voucher code must be at least 3 characters",
      true,
      "كود الخصم يجب أن يكون 3 أحرف على الأقل",
    );
  }
  if (!Number.isFinite(input.maxUses) || input.maxUses < 1) {
    throw new ApiError(
      400,
      "maxUses must be at least 1",
      true,
      "عدد الاستخدامات يجب أن يكون 1 على الأقل",
    );
  }
  if (input.type === "discount") {
    if (!input.discountType || input.discountValue == null) {
      throw new ApiError(
        400,
        "Discount type and value are required",
        true,
        "نوع وقيمة الخصم مطلوبان",
      );
    }
    if (
      input.discountType === "percentage" &&
      (input.discountValue <= 0 || input.discountValue > 100)
    ) {
      throw new ApiError(
        400,
        "Percentage must be between 1 and 100",
        true,
        "النسبة يجب أن تكون بين 1 و 100",
      );
    }
    if (input.discountType === "fixed" && input.discountValue <= 0) {
      throw new ApiError(
        400,
        "Fixed discount must be greater than 0",
        true,
        "قيمة الخصم يجب أن تكون أكبر من 0",
      );
    }
    const cycle = input.billingCycle ?? "both";
    if (!["monthly", "yearly", "both"].includes(cycle)) {
      throw new ApiError(
        400,
        "Invalid billing cycle for discount voucher",
        true,
        "دورة الفوترة غير صالحة",
      );
    }
  } else if (input.type === "duration") {
    if (!input.durationUnit || !input.durationValue) {
      throw new ApiError(
        400,
        "Duration unit and value are required",
        true,
        "مدة الاشتراك المجانية مطلوبة",
      );
    }
    if (input.durationValue < 1) {
      throw new ApiError(
        400,
        "Duration value must be at least 1",
        true,
        "مدة الاشتراك يجب أن تكون يوم واحد على الأقل",
      );
    }
  } else {
    throw new ApiError(
      400,
      "Invalid voucher type",
      true,
      "نوع الكود غير صالح",
    );
  }
}

export async function validateVoucherForUser(
  code: string,
  userId: number,
  originalPrice?: number,
  checkoutBillingCycle?: "monthly" | "yearly",
): Promise<VoucherValidationResult> {
  const voucher = await fetchVoucherByCode(code);
  if (!voucher || !voucher.isActive) {
    throw new ApiError(
      404,
      "Invalid voucher code",
      true,
      "كود الخصم غير صالح",
    );
  }

  assertVoucherDates(voucher);
  assertVoucherCapacity(voucher);

  const pool = await getPool();
  await assertUserNotRedeemed(pool, voucher.id, userId);

  if (voucher.type === "discount") {
    const allowedCycle = voucher.billingCycle ?? "both";
    if (
      allowedCycle !== "both" &&
      checkoutBillingCycle &&
      allowedCycle !== checkoutBillingCycle
    ) {
      throw new ApiError(
        400,
        "This voucher is not valid for the selected billing cycle",
        true,
        allowedCycle === "monthly"
          ? "هذا الكود صالح للاشتراك الشهري فقط"
          : "هذا الكود صالح للاشتراك السنوي فقط",
      );
    }
    if (originalPrice == null || !Number.isFinite(originalPrice)) {
      throw new ApiError(
        400,
        "Original price is required for discount vouchers",
        true,
        "السعر مطلوب لتطبيق خصم",
      );
    }
    const { discountedPrice, discountAmount } = applyDiscountToPrice(
      originalPrice,
      voucher.discountType!,
      voucher.discountValue!,
    );
    return {
      voucher: publicVoucherView(voucher),
      originalPrice,
      discountedPrice,
      discountAmount,
    };
  }

  return { voucher: publicVoucherView(voucher) };
}

export async function redeemDurationVoucher(
  code: string,
  userId: number,
): Promise<{ subscriptionId: number; endDate: string; extended: boolean }> {
  const validation = await validateVoucherForUser(code, userId);
  const voucher = validation.voucher;

  if (voucher.type !== "duration") {
    throw new ApiError(
      400,
      "This voucher is not a duration voucher",
      true,
      "هذا الكود ليس كود مدة مجانية",
    );
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const lockResult = await new sql.Request(transaction)
      .input("id", sql.Int, voucher.id).query(`
        SELECT used_count, max_uses, duration_unit, duration_value, is_active
        FROM Vouchers WITH (UPDLOCK, ROWLOCK)
        WHERE id = @id
      `);

    if (lockResult.recordset.length === 0) {
      throw new ApiError(404, "Voucher not found", true, "الكود غير موجود");
    }

    const locked = lockResult.recordset[0];
    if (!locked.is_active) {
      throw new ApiError(404, "Invalid voucher code", true, "كود الخصم غير صالح");
    }
    if (Number(locked.used_count) >= Number(locked.max_uses)) {
      throw new ApiError(
        400,
        "Voucher usage limit reached",
        true,
        "تم استخدام كود الخصم بالكامل",
      );
    }

    const dupCheck = await new sql.Request(transaction)
      .input("voucherId", sql.Int, voucher.id)
      .input("userId", sql.Int, userId).query(`
        SELECT TOP 1 id FROM VoucherRedemptions
        WHERE voucher_id = @voucherId AND user_id = @userId
      `);
    if (dupCheck.recordset.length > 0) {
      throw new ApiError(
        400,
        "You have already used this voucher",
        true,
        "لقد استخدمت هذا الكود من قبل",
      );
    }

    const durationUnit = String(locked.duration_unit) as DurationUnit;
    const durationValue = Number(locked.duration_value);
    const proPlan = await fetchActiveProPlan(pool);
    const activeSub = await fetchActiveUserSubscription(pool, userId);
    const now = new Date();
    let subscriptionId: number;
    let endDate: Date;
    let extended = false;

    const isActivePro =
      activeSub &&
      !/^free$/i.test(activeSub.planName) &&
      activeSub.endDate &&
      activeSub.endDate > now;

    if (isActivePro && activeSub) {
      const baseDate =
        activeSub.endDate && activeSub.endDate > now
          ? activeSub.endDate
          : now;
      endDate = addDuration(baseDate, durationUnit, durationValue);
      extended = true;

      await new sql.Request(transaction)
        .input("subId", sql.Int, activeSub.id)
        .input("endDate", sql.DateTime2, endDate).query(`
          UPDATE Subscriptions
          SET endDate = @endDate, notificationSent = 0, expiryNotificationSent = 0
          WHERE id = @subId
        `);
      subscriptionId = activeSub.id;
    } else {
      await new sql.Request(transaction)
        .input("userId", sql.Int, userId).query(`
          UPDATE Subscriptions
          SET status = 'expired', endDate = GETDATE()
          WHERE userId = @userId AND status = 'active'
        `);

      const start = new Date();
      endDate = addDuration(start, durationUnit, durationValue);

      const insertResult = await new sql.Request(transaction)
        .input("userId", sql.Int, userId)
        .input("planId", sql.Int, proPlan.id)
        .input("billingCycle", sql.NVarChar(20), "monthly")
        .input("startDate", sql.DateTime2, start)
        .input("endDate", sql.DateTime2, endDate)
        .input("status", sql.NVarChar(20), "active").query(`
          INSERT INTO Subscriptions (
            userId, planId, billingCycle, startDate, endDate, status,
            notificationSent, paymentStatus, paidAt, amount
          )
          OUTPUT INSERTED.id
          VALUES (
            @userId, @planId, @billingCycle, @startDate, @endDate, @status,
            1, 'completed', GETDATE(), 0
          )
        `);
      subscriptionId = Number(insertResult.recordset[0].id);
    }

    await new sql.Request(transaction)
      .input("voucherId", sql.Int, voucher.id)
      .input("userId", sql.Int, userId)
      .input("subscriptionId", sql.Int, subscriptionId).query(`
        INSERT INTO VoucherRedemptions (voucher_id, user_id, subscription_id)
        VALUES (@voucherId, @userId, @subscriptionId)
      `);

    await new sql.Request(transaction)
      .input("id", sql.Int, voucher.id).query(`
        UPDATE Vouchers
        SET used_count = used_count + 1, updated_at = SYSUTCDATETIME()
        WHERE id = @id
      `);

    await transaction.commit();

    try {
      await notifySubscriptionCreated(userId, proPlan.name, endDate);
    } catch {
      // non-blocking
    }

    return {
      subscriptionId,
      endDate: endDate.toISOString(),
      extended,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function recordDiscountVoucherRedemption(
  voucherId: number,
  userId: number,
  orderId: string,
  subscriptionId?: number,
): Promise<void> {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const lockResult = await new sql.Request(transaction)
      .input("id", sql.Int, voucherId).query(`
        SELECT used_count, max_uses FROM Vouchers WITH (UPDLOCK, ROWLOCK) WHERE id = @id
      `);

    if (lockResult.recordset.length === 0) {
      throw new Error("Voucher not found");
    }
    if (
      Number(lockResult.recordset[0].used_count) >=
      Number(lockResult.recordset[0].max_uses)
    ) {
      throw new Error("Voucher usage limit reached");
    }

    const dupCheck = await new sql.Request(transaction)
      .input("voucherId", sql.Int, voucherId)
      .input("userId", sql.Int, userId).query(`
        SELECT TOP 1 id FROM VoucherRedemptions
        WHERE voucher_id = @voucherId AND user_id = @userId
      `);
    if (dupCheck.recordset.length > 0) {
      throw new Error("User already redeemed this voucher");
    }

    await new sql.Request(transaction)
      .input("voucherId", sql.Int, voucherId)
      .input("userId", sql.Int, userId)
      .input("orderId", sql.UniqueIdentifier, orderId)
      .input("subscriptionId", sql.Int, subscriptionId ?? null).query(`
        INSERT INTO VoucherRedemptions (voucher_id, user_id, order_id, subscription_id)
        VALUES (@voucherId, @userId, @orderId, @subscriptionId)
      `);

    await new sql.Request(transaction)
      .input("id", sql.Int, voucherId).query(`
        UPDATE Vouchers SET used_count = used_count + 1, updated_at = SYSUTCDATETIME() WHERE id = @id
      `);

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

export async function listVouchers(): Promise<Voucher[]> {
  await ensureVoucherSchema();
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT * FROM Vouchers ORDER BY created_at DESC
  `);
  return result.recordset.map((row) =>
    mapRow(row as Record<string, unknown>),
  );
}

export async function getVoucherById(id: number): Promise<Voucher | null> {
  await ensureVoucherSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.Int, id).query(`
      SELECT * FROM Vouchers WHERE id = @id
    `);
  if (result.recordset.length === 0) {
    return null;
  }
  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export async function createVoucher(input: CreateVoucherInput): Promise<Voucher> {
  validateCreateInput(input);
  await ensureVoucherSchema();
  const pool = await getPool();
  const code = normalizeCode(input.code);

  const dup = await pool
    .request()
    .input("code", sql.NVarChar(50), code).query(`
      SELECT id FROM Vouchers WHERE code = @code
    `);
  if (dup.recordset.length > 0) {
    throw new ApiError(
      409,
      "Voucher code already exists",
      true,
      "كود الخصم موجود بالفعل",
    );
  }

  const result = await pool
    .request()
    .input("code", sql.NVarChar(50), code)
    .input("type", sql.NVarChar(20), input.type)
    .input(
      "discountType",
      sql.NVarChar(20),
      input.type === "discount" ? input.discountType! : null,
    )
    .input(
      "discountValue",
      sql.Decimal(12, 2),
      input.type === "discount" ? input.discountValue! : null,
    )
    .input(
      "durationUnit",
      sql.NVarChar(20),
      input.type === "duration" ? input.durationUnit! : null,
    )
    .input(
      "durationValue",
      sql.Int,
      input.type === "duration" ? input.durationValue! : null,
    )
    .input(
      "billingCycle",
      sql.NVarChar(20),
      input.type === "discount" ? (input.billingCycle ?? "both") : null,
    )
    .input("maxUses", sql.Int, input.maxUses)
    .input("isActive", sql.Bit, input.isActive !== false ? 1 : 0)
    .input(
      "validFrom",
      sql.DateTime2,
      input.validFrom ? new Date(input.validFrom) : null,
    )
    .input(
      "validUntil",
      sql.DateTime2,
      input.validUntil ? new Date(input.validUntil) : null,
    )
    .input(
      "description",
      sql.NVarChar(500),
      input.description?.trim() || null,
    ).query(`
      INSERT INTO Vouchers (
        code, type, discount_type, discount_value, duration_unit, duration_value,
        billing_cycle, max_uses, is_active, valid_from, valid_until, description
      )
      OUTPUT INSERTED.*
      VALUES (
        @code, @type, @discountType, @discountValue, @durationUnit, @durationValue,
        @billingCycle, @maxUses, @isActive, @validFrom, @validUntil, @description
      )
    `);

  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export async function updateVoucher(
  id: number,
  input: UpdateVoucherInput,
): Promise<Voucher> {
  const existing = await getVoucherById(id);
  if (!existing) {
    throw new ApiError(404, "Voucher not found", true, "الكود غير موجود");
  }

  const merged: CreateVoucherInput = {
    code: input.code ?? existing.code,
    type: input.type ?? existing.type,
    discountType:
      (input.discountType ?? existing.discountType) ?? undefined,
    discountValue:
      (input.discountValue ?? existing.discountValue) ?? undefined,
    durationUnit: (input.durationUnit ?? existing.durationUnit) ?? undefined,
    durationValue:
      (input.durationValue ?? existing.durationValue) ?? undefined,
    billingCycle:
      input.billingCycle !== undefined && input.billingCycle !== null
        ? input.billingCycle
        : (existing.billingCycle ?? "both"),
    maxUses: input.maxUses ?? existing.maxUses,
    isActive: input.isActive ?? existing.isActive,
    validFrom: input.validFrom !== undefined ? input.validFrom : existing.validFrom,
    validUntil:
      input.validUntil !== undefined ? input.validUntil : existing.validUntil,
    description:
      input.description !== undefined ? input.description : existing.description,
  };

  if (merged.maxUses < existing.usedCount) {
    throw new ApiError(
      400,
      "maxUses cannot be less than current used count",
      true,
      "عدد الاستخدامات لا يمكن أن يكون أقل من عدد مرات الاستخدام الحالية",
    );
  }

  validateCreateInput(merged);

  const pool = await getPool();
  const code = normalizeCode(merged.code);

  if (code !== existing.code) {
    const dup = await pool
      .request()
      .input("code", sql.NVarChar(50), code)
      .input("id", sql.Int, id).query(`
        SELECT id FROM Vouchers WHERE code = @code AND id <> @id
      `);
    if (dup.recordset.length > 0) {
      throw new ApiError(
        409,
        "Voucher code already exists",
        true,
        "كود الخصم موجود بالفعل",
      );
    }
  }

  const result = await pool
    .request()
    .input("id", sql.Int, id)
    .input("code", sql.NVarChar(50), code)
    .input("type", sql.NVarChar(20), merged.type)
    .input(
      "discountType",
      sql.NVarChar(20),
      merged.type === "discount" ? merged.discountType! : null,
    )
    .input(
      "discountValue",
      sql.Decimal(12, 2),
      merged.type === "discount" ? merged.discountValue! : null,
    )
    .input(
      "durationUnit",
      sql.NVarChar(20),
      merged.type === "duration" ? merged.durationUnit! : null,
    )
    .input(
      "durationValue",
      sql.Int,
      merged.type === "duration" ? merged.durationValue! : null,
    )
    .input(
      "billingCycle",
      sql.NVarChar(20),
      merged.type === "discount" ? (merged.billingCycle ?? "both") : null,
    )
    .input("maxUses", sql.Int, merged.maxUses)
    .input("isActive", sql.Bit, merged.isActive ? 1 : 0)
    .input(
      "validFrom",
      sql.DateTime2,
      merged.validFrom ? new Date(merged.validFrom) : null,
    )
    .input(
      "validUntil",
      sql.DateTime2,
      merged.validUntil ? new Date(merged.validUntil) : null,
    )
    .input(
      "description",
      sql.NVarChar(500),
      merged.description?.trim() || null,
    ).query(`
      UPDATE Vouchers SET
        code = @code,
        type = @type,
        discount_type = @discountType,
        discount_value = @discountValue,
        duration_unit = @durationUnit,
        duration_value = @durationValue,
        billing_cycle = @billingCycle,
        max_uses = @maxUses,
        is_active = @isActive,
        valid_from = @validFrom,
        valid_until = @validUntil,
        description = @description,
        updated_at = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @id
    `);

  return mapRow(result.recordset[0] as Record<string, unknown>);
}

export async function deleteVoucher(id: number): Promise<void> {
  await ensureVoucherSchema();
  const pool = await getPool();
  const existing = await getVoucherById(id);
  if (!existing) {
    throw new ApiError(404, "Voucher not found", true, "الكود غير موجود");
  }
  await pool.request().input("id", sql.Int, id).query(`
    DELETE FROM Vouchers WHERE id = @id
  `);
}

export async function listVoucherRedemptions(voucherId: number) {
  await ensureVoucherSchema();
  const pool = await getPool();
  const result = await pool
    .request()
    .input("voucherId", sql.Int, voucherId).query(`
      SELECT vr.id, vr.user_id AS userId, vr.order_id AS orderId,
             vr.subscription_id AS subscriptionId, vr.redeemed_at AS redeemedAt,
             u.name AS userName, u.email AS userEmail
      FROM VoucherRedemptions vr
      LEFT JOIN Users u ON u.id = vr.user_id
      WHERE vr.voucher_id = @voucherId
      ORDER BY vr.redeemed_at DESC
    `);
  return result.recordset.map((row) => ({
    id: Number(row.id),
    userId: Number(row.userId),
    userName: row.userName != null ? String(row.userName) : null,
    userEmail: row.userEmail != null ? String(row.userEmail) : null,
    orderId: row.orderId != null ? String(row.orderId) : null,
    subscriptionId:
      row.subscriptionId != null ? Number(row.subscriptionId) : null,
    redeemedAt:
      row.redeemedAt instanceof Date
        ? row.redeemedAt.toISOString()
        : String(row.redeemedAt ?? ""),
  }));
}

export { fetchVoucherByCode, normalizeCode };
