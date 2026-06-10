import { Request, Response } from "express";
import {
  updateUserProfile,
  toggleUserBlock,
  softDeleteUser,
  restoreSoftDeletedUser,
  sendUserPasswordResetLink,
  listUserAddresses,
  createUserAddress,
  updateUserAddress,
  deleteUserAddress,
  listUserInternalNotes,
  addUserInternalNote,
  deleteUserInternalNote,
  getUserActivityLog,
  getUserOrdersSummary,
  getUserVouchersInfo,
  blockVoucherForUser,
  unblockVoucherForUser,
  assignCustomVoucherToUser,
  listUserSupportCases,
  createUserSupportCase,
  updateUserSupportCaseStatus,
  getAdminDisplayName,
  logUserAdminActivity,
} from "../services/adminCustomer.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { ApiErrors } from "../i18n/apiErrors";
import { logger } from "../utils/logger";

async function adminContext(req: Request): Promise<{
  adminId: number | null;
  adminName: string;
}> {
  const adminId = req.user?.userId ?? null;
  const adminName = adminId ? await getAdminDisplayName(adminId) : "Admin";
  return { adminId, adminName };
}

function parseUserId(req: Request): number | null {
  const id = Number(req.params.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function handleServiceError(
  res: Response,
  req: Request,
  error: unknown,
  fallback: { en: string; ar: string },
): void {
  const code = error instanceof Error ? error.message : "";
  if (code === "USER_NOT_FOUND") {
    sendApiError(res, req, 404, ApiErrors.userNotFound);
    return;
  }
  if (code === "ADDRESS_NOT_FOUND") {
    sendApiError(res, req, 404, {
      en: "Address not found",
      ar: "العنوان غير موجود",
    });
    return;
  }
  if (code === "NOTE_NOT_FOUND") {
    sendApiError(res, req, 404, {
      en: "Note not found",
      ar: "الملاحظة غير موجودة",
    });
    return;
  }
  if (code === "CASE_NOT_FOUND") {
    sendApiError(res, req, 404, {
      en: "Support case not found",
      ar: "الشكوى غير موجودة",
    });
    return;
  }
  if (code === "VOUCHER_NOT_FOUND") {
    sendApiError(res, req, 404, {
      en: "Voucher not found",
      ar: "الكوبون غير موجود",
    });
    return;
  }
  if (code === "EMAIL_SEND_FAILED") {
    sendApiError(res, req, 500, ApiErrors.failedPasswordResetRequest);
    return;
  }
  logger.error(fallback.en, error);
  sendApiError(res, req, 500, fallback);
}

export async function patchAdminUserProfile(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    await updateUserProfile(userId, req.body, adminId, adminName);
    res.json({ success: true, message: "Profile updated" });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to update profile",
      ar: "فشل تحديث البيانات",
    });
  }
}

export async function patchAdminUserBlock(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const isBlocked = Boolean(req.body.isBlocked);
    const reason =
      typeof req.body.reason === "string" ? req.body.reason.trim() : null;
    const { adminId, adminName } = await adminContext(req);
    await toggleUserBlock(userId, isBlocked, reason, adminId, adminName);
    res.json({ success: true, isBlocked });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to update block status",
      ar: "فشل تحديث حالة الحظر",
    });
  }
}

export async function softDeleteAdminUser(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    await softDeleteUser(userId, adminId, adminName);
    res.json({ success: true, message: "User soft deleted" });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to delete user",
      ar: "فشل حذف المستخدم",
    });
  }
}

export async function restoreAdminUser(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    await restoreSoftDeletedUser(userId, adminId, adminName);
    res.json({ success: true, message: "User restored" });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to restore user",
      ar: "فشل استعادة المستخدم",
    });
  }
}

export async function postAdminUserResetPassword(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const locale = req.body.locale === "en" ? "en" : "ar";
    const { adminId, adminName } = await adminContext(req);
    await sendUserPasswordResetLink(userId, locale, adminId, adminName);
    res.json({ success: true, message: "Reset link sent" });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to send reset link",
      ar: "فشل إرسال رابط إعادة التعيين",
    });
  }
}

export async function getAdminUserAddresses(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const addresses = await listUserAddresses(userId);
    res.json({ addresses });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to load addresses",
      ar: "فشل تحميل العناوين",
    });
  }
}

export async function postAdminUserAddress(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    const address = await createUserAddress(userId, req.body, adminId, adminName);
    res.status(201).json({ address });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to create address",
      ar: "فشل إضافة العنوان",
    });
  }
}

export async function patchAdminUserAddress(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    const addressId = Number(req.params.addressId);
    if (!userId || !Number.isFinite(addressId)) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    const address = await updateUserAddress(
      userId,
      addressId,
      req.body,
      adminId,
      adminName,
    );
    res.json({ address });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to update address",
      ar: "فشل تحديث العنوان",
    });
  }
}

export async function deleteAdminUserAddress(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    const addressId = Number(req.params.addressId);
    if (!userId || !Number.isFinite(addressId)) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    await deleteUserAddress(userId, addressId, adminId, adminName);
    res.json({ success: true });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to delete address",
      ar: "فشل حذف العنوان",
    });
  }
}

export async function getAdminUserNotes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const notes = await listUserInternalNotes(userId);
    res.json({ notes });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to load notes",
      ar: "فشل تحميل الملاحظات",
    });
  }
}

export async function postAdminUserNote(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const note =
      typeof req.body.note === "string" ? req.body.note.trim() : "";
    if (!note) {
      sendApiError(res, req, 400, {
        en: "Note is required",
        ar: "الملاحظة مطلوبة",
      });
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    const created = await addUserInternalNote(userId, note, adminId, adminName);
    res.status(201).json({ note: created });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to add note",
      ar: "فشل إضافة الملاحظة",
    });
  }
}

export async function deleteAdminUserNote(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    const noteId = Number(req.params.noteId);
    if (!userId || !Number.isFinite(noteId)) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    await deleteUserInternalNote(userId, noteId, adminId, adminName);
    res.json({ success: true });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to delete note",
      ar: "فشل حذف الملاحظة",
    });
  }
}

export async function getAdminUserActivityLog(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const data = await getUserActivityLog(userId);
    res.json(data);
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to load activity log",
      ar: "فشل تحميل سجل النشاط",
    });
  }
}

export async function getAdminUserOrders(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const data = await getUserOrdersSummary(userId);
    res.json(data);
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to load orders",
      ar: "فشل تحميل الطلبات",
    });
  }
}

export async function getAdminUserVouchers(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const data = await getUserVouchersInfo(userId);
    res.json(data);
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to load vouchers",
      ar: "فشل تحميل الكوبونات",
    });
  }
}

export async function postAdminUserVoucherAssign(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    const code = typeof req.body.code === "string" ? req.body.code : "";
    if (!userId || !code.trim()) {
      sendApiError(res, req, 400, {
        en: "Voucher code is required",
        ar: "كود الكوبون مطلوب",
      });
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    const result = await assignCustomVoucherToUser(
      userId,
      code,
      adminId,
      adminName,
    );
    res.status(201).json(result);
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to assign voucher",
      ar: "فشل تعيين الكوبون",
    });
  }
}

export async function postAdminUserVoucherBlock(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    const voucherId = Number(req.params.voucherId);
    if (!userId || !Number.isFinite(voucherId)) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    await blockVoucherForUser(userId, voucherId, adminId, adminName);
    res.json({ success: true });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to block voucher",
      ar: "فشل حظر الكوبون",
    });
  }
}

export async function deleteAdminUserVoucherBlock(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    const voucherId = Number(req.params.voucherId);
    if (!userId || !Number.isFinite(voucherId)) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    await unblockVoucherForUser(userId, voucherId, adminId, adminName);
    res.json({ success: true });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to unblock voucher",
      ar: "فشل إلغاء حظر الكوبون",
    });
  }
}

export async function getAdminUserSupport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const cases = await listUserSupportCases(userId);
    res.json({ cases });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to load support cases",
      ar: "فشل تحميل الشكاوى",
    });
  }
}

export async function postAdminUserSupport(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const subject =
      typeof req.body.subject === "string" ? req.body.subject.trim() : "";
    const message =
      typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!subject || !message) {
      sendApiError(res, req, 400, {
        en: "Subject and message are required",
        ar: "الموضوع والرسالة مطلوبان",
      });
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    const created = await createUserSupportCase(
      userId,
      {
        subject,
        message,
        ticketRef: req.body.ticketRef,
      },
      adminId,
      adminName,
    );
    res.status(201).json({ case: created });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to create support case",
      ar: "فشل إنشاء الشكوى",
    });
  }
}

export async function patchAdminUserSupportStatus(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = parseUserId(req);
    const caseId = Number(req.params.caseId);
    const status = typeof req.body.status === "string" ? req.body.status : "";
    if (!userId || !Number.isFinite(caseId) || !status) {
      sendApiError(res, req, 400, ApiErrors.invalidUserId);
      return;
    }
    const { adminId, adminName } = await adminContext(req);
    const updated = await updateUserSupportCaseStatus(
      userId,
      caseId,
      status,
      adminId,
      adminName,
    );
    res.json({ case: updated });
  } catch (error) {
    handleServiceError(res, req, error, {
      en: "Failed to update support case",
      ar: "فشل تحديث الشكوى",
    });
  }
}

export { logUserAdminActivity };
