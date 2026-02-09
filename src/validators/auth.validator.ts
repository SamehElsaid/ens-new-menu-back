import { z } from 'zod';

// Phone number regex - يقبل أرقام الهواتف بصيغ مختلفة
const phoneRegex = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;

// Strong Password regex - يجب أن يحتوي على:
// - حرف كبير واحد على الأقل
// - حرف صغير واحد على الأقل
// - رقم واحد على الأقل
// - رمز خاص واحد على الأقل
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=\-\[\]{};:'",.<>\/\\|`~])[A-Za-z\d@$!%*?&#^()_+=\-\[\]{};:'",.<>\/\\|`~]{8,}$/;

/**
 * Schema for user signup validation
 * - Email: must be a valid email format
 * - Password: minimum 8 characters, must contain letters and numbers
 * - Name: required, max 255 characters
 * - Phone Number: required, must match phone number format
 */
export const signupSchema = z.object({
  email: z
    .string({ message: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  
  password: z
    .string({ message: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(
      passwordRegex,
      'Password must contain: uppercase letter, lowercase letter, number, and special character (@$!%*?&#...)'
    ),
  
  name: z
    .string({ message: 'Name is required' })
    .trim()
    .min(1, 'Name cannot be empty')
    .max(255, 'Name is too long'),
  
  phoneNumber: z
    .string({ message: 'Phone number is required' })
    .trim()
    .regex(phoneRegex, 'Invalid phone number format')
    .min(8, 'Phone number is too short')
    .max(50, 'Phone number is too long'),
  
  locale: z
    .enum(['ar', 'en'])
    .optional()
    .default('ar'),
});

/**
 * Schema for email/phone availability check
 * Note: We use minimal validation here to allow partial inputs while typing
 */
export const checkAvailabilitySchema = z.object({
  email: z
    .string()
    .optional()
    .transform(val => val || undefined),
  
  phoneNumber: z
    .string()
    .optional()
    .transform(val => val || undefined),
}).refine(
  (data) => data.email || data.phoneNumber,
  {
    message: 'Either email or phoneNumber must be provided',
  }
);

/**
 * Schema for login validation
 */
export const loginSchema = z.object({
  email: z
    .string({ message: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase()
    .trim(),
  
  password: z
    .string({ message: 'Password is required' })
    .min(1, 'Password is required'),
});

/**
 * Types inferred from schemas
 */
export type SignupInput = z.infer<typeof signupSchema>;
export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;
export type LoginInput = z.infer<typeof loginSchema>;

