import { Request, Response } from "express";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import {
  listVouchers,
  getVoucherById,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  listVoucherRedemptions,
  type CreateVoucherInput,
  type UpdateVoucherInput,
} from "../services/voucher.service";

export const getAdminVouchers = asyncHandler(
  async (_req: Request, res: Response) => {
    const vouchers = await listVouchers();
    res.json({ vouchers });
  },
);

export const getAdminVoucherById = asyncHandler(
  async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new ApiError(400, "Invalid voucher id");
    }
    const voucher = await getVoucherById(id);
    if (!voucher) {
      throw new ApiError(404, "Voucher not found", true, "الكود غير موجود");
    }
    res.json({ voucher });
  },
);

export const postAdminVoucher = asyncHandler(
  async (req: Request, res: Response) => {
    const body = req.body as CreateVoucherInput;
    const voucher = await createVoucher(body);
    res.status(201).json({ voucher });
  },
);

export const putAdminVoucher = asyncHandler(
  async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new ApiError(400, "Invalid voucher id");
    }
    const body = req.body as UpdateVoucherInput;
    const voucher = await updateVoucher(id, body);
    res.json({ voucher });
  },
);

export const deleteAdminVoucher = asyncHandler(
  async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new ApiError(400, "Invalid voucher id");
    }
    await deleteVoucher(id);
    res.json({ message: "Voucher deleted" });
  },
);

export const getAdminVoucherRedemptions = asyncHandler(
  async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      throw new ApiError(400, "Invalid voucher id");
    }
    const voucher = await getVoucherById(id);
    if (!voucher) {
      throw new ApiError(404, "Voucher not found", true, "الكود غير موجود");
    }
    const redemptions = await listVoucherRedemptions(id);
    res.json({ redemptions });
  },
);
