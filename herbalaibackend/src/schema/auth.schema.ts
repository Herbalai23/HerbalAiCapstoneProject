import { z } from "zod";
import { banInputSchema } from '../lib/user-ban.js';

export const banUserSchema = z.object({ body: banInputSchema });

const newPasswordSchema = z.string().min(8, "Password must be at least 8 characters")
  .refine(password => Buffer.byteLength(password, "utf8") <= 72, "Password must be at most 72 UTF-8 bytes");

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: newPasswordSchema,
  }).strict(),
});

export const passwordSetupSchema = z.object({ body: z.object({}).strict() });

export const registrationNameSchema = z.string().trim().transform(value => value.normalize('NFC'))
  .pipe(z.string().max(50, 'Each name must be at most 50 characters')
    .regex(/^(?:\p{L}\p{M}*)+$/u, 'Names must contain letters only; numbers and punctuation are not allowed')
    .refine(value => Array.from(value).filter(character => /\p{L}/u.test(character)).length >= 5,
      'Each name must contain at least 5 letters'));

export const signupSchema = z.object({
  body: z.object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain alphanumeric characters and underscores"),
    email: z.string().trim().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: registrationNameSchema.optional(),
    lastName: registrationNameSchema.optional(),
    name: z.string().trim().max(100, 'Name is too long').optional(),
    avatar: z.string().optional(),
  }).superRefine((body, context) => {
    if (body.firstName !== undefined || body.lastName !== undefined) {
      if (body.firstName === undefined) context.addIssue({ code: 'custom', path: ['firstName'], message: 'First name is required' });
      if (body.lastName === undefined) context.addIssue({ code: 'custom', path: ['lastName'], message: 'Last name is required' });
      if (body.firstName && body.lastName && body.name !== undefined
        && body.name.normalize('NFC') !== `${body.firstName} ${body.lastName}`) {
        context.addIssue({ code: 'custom', path: ['name'], message: 'Name must match the first and last names' });
      }
      return;
    }
    const parts = body.name?.split(' ');
    if (!parts || parts.length !== 2 || !parts.every(part => registrationNameSchema.safeParse(part).success)) {
      context.addIssue({ code: 'custom', path: ['name'], message: 'Provide first and last names containing at least 5 letters each, without numbers or punctuation' });
    }
  }).transform(body => ({
    ...body,
    name: body.firstName && body.lastName ? `${body.firstName} ${body.lastName}` : body.name!.normalize('NFC'),
  })).refine(body => body.name.length <= 100, { message: 'Full name must be at most 100 characters', path: ['name'] }),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().trim().min(1).max(254).optional(),
    email: z.string().trim().email("Invalid email address").optional(),
    password: z.string().min(1, "Password is required"),
  }).refine((body) => Boolean(body.identifier) !== Boolean(body.email), "Provide email or username"),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email address"),
  }),
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, "Token is required"),
    password: newPasswordSchema,
  }),
});

const updateProfileBodySchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be at most 100 characters").optional(),
    avatar: z.string().trim().max(500, "Avatar must be at most 500 characters").nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one profile field");

export const updateProfileSchema = z.object({
  body: updateProfileBodySchema,
});

export type SignupInput = z.infer<typeof signupSchema>;
export type SignupRequest = z.input<typeof signupSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileBodySchema>;
