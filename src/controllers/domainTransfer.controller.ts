import { Request, Response } from "express";
import {
  adminCompleteDomainTransfer,
  adminSendDomainTransferMessage,
  createDomainTransferRequest,
  getActiveRequestForUser,
  getDomainTransferRequestById,
  listAllDomainTransferRequests,
  listUserDomainTransferHistory,
  userConfirmDomainTransferSteps,
  userCancelDomainTransfer,
  adminCancelDomainTransfer,
} from "../services/domainTransfer.service";
import { getAdminDisplayName } from "../services/adminCustomer.service";
import { sendApiError } from "../utils/apiErrorResponse";
import { logger } from "../utils/logger";

async function adminContext(req: Request): Promise<{
  adminId: number | null;
  adminName: string;
}> {
  const adminId = req.user?.userId ?? null;
  const adminName = adminId ? await getAdminDisplayName(adminId) : "Admin";
  return { adminId, adminName };
}

export async function getUserDomainTransfer(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendApiError(res, req, 401, {
        en: "Unauthorized",
        ar: "غير مصرح",
      });
      return;
    }

    const request = await getActiveRequestForUser(userId);
    const history = await listUserDomainTransferHistory(userId);
    res.json({ request, history });
  } catch (error) {
    logger.error("Get user domain transfer error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load domain transfer request",
      ar: "فشل تحميل طلب نقل الدومين",
    });
  }
}

export async function postUserDomainTransfer(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendApiError(res, req, 401, {
        en: "Unauthorized",
        ar: "غير مصرح",
      });
      return;
    }

    const domainUrl = String(req.body?.domainUrl ?? "");
    if (!domainUrl.trim()) {
      sendApiError(res, req, 400, {
        en: "Domain URL is required",
        ar: "رابط الدومين مطلوب",
      });
      return;
    }

    const request = await createDomainTransferRequest(userId, domainUrl);
    res.status(201).json({ request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Invalid domain URL") {
      sendApiError(res, req, 400, {
        en: "Please enter a valid domain URL",
        ar: "يرجى إدخال رابط دومين صالح",
      });
      return;
    }
    if (msg === "Active request exists") {
      sendApiError(res, req, 409, {
        en: "You already have an active domain transfer request",
        ar: "لديك بالفعل طلب نقل دومين قيد المعالجة",
      });
      return;
    }
    logger.error("Post user domain transfer error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to submit domain transfer request",
      ar: "فشل إرسال طلب نقل الدومين",
    });
  }
}

export async function postUserDomainTransferConfirm(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendApiError(res, req, 401, {
        en: "Unauthorized",
        ar: "غير مصرح",
      });
      return;
    }

    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      sendApiError(res, req, 400, {
        en: "Invalid request id",
        ar: "معرّف الطلب غير صالح",
      });
      return;
    }

    const request = await userConfirmDomainTransferSteps(requestId, userId);
    res.json({ request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Request not found") {
      sendApiError(res, req, 404, {
        en: "Request not found",
        ar: "الطلب غير موجود",
      });
      return;
    }
    if (msg === "Cannot confirm") {
      sendApiError(res, req, 400, {
        en: "No pending steps to confirm",
        ar: "لا توجد خطوات بانتظار التأكيد",
      });
      return;
    }
    logger.error("Post user domain transfer confirm error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to confirm steps",
      ar: "فشل تأكيد الخطوات",
    });
  }
}

export async function postUserDomainTransferCancel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      sendApiError(res, req, 401, {
        en: "Unauthorized",
        ar: "غير مصرح",
      });
      return;
    }

    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      sendApiError(res, req, 400, {
        en: "Invalid request id",
        ar: "معرّف الطلب غير صالح",
      });
      return;
    }

    await userCancelDomainTransfer(requestId, userId);
    res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Request not found") {
      sendApiError(res, req, 404, {
        en: "Request not found",
        ar: "الطلب غير موجود",
      });
      return;
    }
    if (msg === "Request closed") {
      sendApiError(res, req, 400, {
        en: "This request cannot be cancelled",
        ar: "لا يمكن إلغاء هذا الطلب",
      });
      return;
    }
    logger.error("Post user domain transfer cancel error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to cancel request",
      ar: "فشل إلغاء الطلب",
    });
  }
}

export async function getAdminDomainTransfers(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const requests = await listAllDomainTransferRequests();
    res.json({ requests });
  } catch (error) {
    logger.error("Get admin domain transfers error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load domain transfer requests",
      ar: "فشل تحميل طلبات نقل الدومين",
    });
  }
}

export async function getAdminDomainTransferById(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      sendApiError(res, req, 400, {
        en: "Invalid request id",
        ar: "معرّف الطلب غير صالح",
      });
      return;
    }

    const request = await getDomainTransferRequestById(requestId);
    if (!request) {
      sendApiError(res, req, 404, {
        en: "Request not found",
        ar: "الطلب غير موجود",
      });
      return;
    }

    res.json({ request });
  } catch (error) {
    logger.error("Get admin domain transfer by id error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to load domain transfer request",
      ar: "فشل تحميل طلب نقل الدومين",
    });
  }
}

export async function postAdminDomainTransferMessage(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      sendApiError(res, req, 400, {
        en: "Invalid request id",
        ar: "معرّف الطلب غير صالح",
      });
      return;
    }

    const message = String(req.body?.message ?? "");
    const { adminId, adminName } = await adminContext(req);
    const request = await adminSendDomainTransferMessage(
      requestId,
      message,
      adminId,
      adminName,
    );
    res.json({ request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Request not found") {
      sendApiError(res, req, 404, {
        en: "Request not found",
        ar: "الطلب غير موجود",
      });
      return;
    }
    if (msg === "Message required") {
      sendApiError(res, req, 400, {
        en: "Message is required",
        ar: "الرسالة مطلوبة",
      });
      return;
    }
    if (msg === "Request completed") {
      sendApiError(res, req, 400, {
        en: "This request is already completed",
        ar: "هذا الطلب مكتمل بالفعل",
      });
      return;
    }
    logger.error("Post admin domain transfer message error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to send message",
      ar: "فشل إرسال الرسالة",
    });
  }
}

export async function postAdminDomainTransferComplete(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      sendApiError(res, req, 400, {
        en: "Invalid request id",
        ar: "معرّف الطلب غير صالح",
      });
      return;
    }

    const { adminId, adminName } = await adminContext(req);
    const request = await adminCompleteDomainTransfer(
      requestId,
      adminId,
      adminName,
    );
    res.json({ request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Request not found") {
      sendApiError(res, req, 404, {
        en: "Request not found",
        ar: "الطلب غير موجود",
      });
      return;
    }
    if (msg === "Request completed") {
      sendApiError(res, req, 400, {
        en: "This request is already completed",
        ar: "هذا الطلب مكتمل بالفعل",
      });
      return;
    }
    logger.error("Post admin domain transfer complete error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to complete domain transfer",
      ar: "فشل تأكيد نقل الدومين",
    });
  }
}

export async function postAdminDomainTransferCancel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      sendApiError(res, req, 400, {
        en: "Invalid request id",
        ar: "معرّف الطلب غير صالح",
      });
      return;
    }

    const request = await adminCancelDomainTransfer(requestId);
    res.json({ request });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "Request not found") {
      sendApiError(res, req, 404, {
        en: "Request not found",
        ar: "الطلب غير موجود",
      });
      return;
    }
    if (msg === "Request closed") {
      sendApiError(res, req, 400, {
        en: "This request cannot be cancelled",
        ar: "لا يمكن إلغاء هذا الطلب",
      });
      return;
    }
    logger.error("Post admin domain transfer cancel error:", error);
    sendApiError(res, req, 500, {
      en: "Failed to cancel request",
      ar: "فشل إلغاء الطلب",
    });
  }
}
