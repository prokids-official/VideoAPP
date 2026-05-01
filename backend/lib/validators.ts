import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.string().email());

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .refine((value) => /[A-Za-z]/.test(value), 'Must contain a letter')
  .refine((value) => /[0-9]/.test(value), 'Must contain a digit');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Display name required')
  .max(32, 'Display name at most 32 characters');

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: displayNameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const logoutSchema = z.object({
  refresh_token: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
