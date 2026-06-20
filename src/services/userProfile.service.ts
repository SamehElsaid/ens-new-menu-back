import { getPool, sql } from '../config/database';
import { ensurePhoneVerifiedSchema } from '../schemas/phoneVerified.schema';
import { ensureRestaurantNameSchema } from '../schemas/restaurantName.schema';
import { ensureDeliverySchema } from '../schemas/delivery.schema';

const AUTH_USER_PROFILE_QUERY = `
  SELECT 
    u.id, u.email, u.name, u.restaurantName, u.role, u.phoneNumber, u.deliveryPhone, u.deliveryOn,
    u.country,
    u.dateOfBirth, u.gender, u.address, u.profileImage,
    u.isEmailVerified, u.isPhoneVerified, u.phoneVerifiedAt, u.createdAt,
    u.isSuspended, u.suspendedReason,
    s.planId, s.billingCycle, p.name as planName, p.maxMenus, p.maxProductsPerMenu
  FROM Users u
  LEFT JOIN Subscriptions s ON u.id = s.userId
    AND s.status = 'active'
    AND (s.endDate IS NULL OR s.endDate > GETDATE())
  LEFT JOIN Plans p ON s.planId = p.id
  WHERE u.id = @userId
`;

export function formatAuthUserProfile(profile: {
  id: number;
  email: string;
  name: string;
  restaurantName: string | null;
  role: string;
  phoneNumber: string | null;
  deliveryPhone: string | null;
  deliveryOn?: boolean | number | null;
  country: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  address: string | null;
  profileImage: string | null;
  isEmailVerified: boolean;
  isPhoneVerified?: boolean | number | null;
  phoneVerifiedAt?: Date | null;
  createdAt: Date;
  isSuspended?: boolean | number | null;
  suspendedReason?: string | null;
  planId?: number | null;
  billingCycle?: string | null;
  planName?: string | null;
  maxMenus?: number | null;
  maxProductsPerMenu?: number | null;
}) {
  const planType = profile.billingCycle || 'free';

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    restaurantName: profile.restaurantName ?? null,
    role: profile.role,
    phoneNumber: profile.phoneNumber,
    deliveryPhone: profile.deliveryPhone ?? null,
    deliveryOn: Boolean(profile.deliveryOn),
    country: profile.country,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    address: profile.address,
    profileImage: profile.profileImage,
    isEmailVerified: profile.isEmailVerified,
    isPhoneVerified: Boolean(profile.isPhoneVerified),
    phoneVerifiedAt: profile.phoneVerifiedAt ?? null,
    createdAt: profile.createdAt,
    isSuspended: Boolean(profile.isSuspended),
    note: profile.suspendedReason ?? null,
    planType,
    subscription: {
      planId: profile.planId ?? null,
      planName: profile.planName ?? 'Free',
      billingCycle: profile.billingCycle ?? 'free',
      maxMenus: profile.maxMenus ?? 1,
      maxProductsPerMenu: profile.maxProductsPerMenu ?? 50,
    },
  };
}

export async function getAuthUserProfile(userId: number) {
  await ensurePhoneVerifiedSchema();
  await ensureRestaurantNameSchema();
  await ensureDeliverySchema();

  const pool = await getPool();
  const profileResult = await pool
    .request()
    .input('userId', sql.Int, userId)
    .query(AUTH_USER_PROFILE_QUERY);

  if (profileResult.recordset.length === 0) {
    throw new Error('User not found');
  }

  return formatAuthUserProfile(profileResult.recordset[0]);
}
