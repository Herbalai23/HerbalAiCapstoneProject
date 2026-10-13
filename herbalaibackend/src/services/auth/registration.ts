import * as userRepo from "../../repositories/user.repository.js";
import * as tokenRepo from "../../repositories/token.repository.js";
import { ENV } from "../../config/env.js";
import crypto from "crypto";
import { ensureMailReady, sendMail } from "../../lib/mailer.js";
import { escapeHtml } from '../../lib/escape-html.js';
import { signupSchema, type SignupRequest } from '../../schema/auth.schema.js';

import { hashPassword } from "../../utils/password.js";

export const signup = async (request: SignupRequest) => {
  const data = signupSchema.parse({ body: request }).body;
  const email = data.email.trim().toLowerCase();
  const username = data.username.trim().toLowerCase();
  const existingEmail = await userRepo.findUserByEmail(email);
  if (existingEmail) {
    throw {
      status: 409,
      message: ENV.REQUIRE_EMAIL_VERIFICATION
        ? "A user with this email already exists."
        : "An account with this email already exists. Try signing in.",
      verificationRequired: ENV.REQUIRE_EMAIL_VERIFICATION,
    };
  }

  const existingUsername = await userRepo.findUserByUsername(username);
  if (existingUsername) {
    throw { status: 409, message: "A user with this username already exists." };
  }

  if (ENV.REQUIRE_EMAIL_VERIFICATION) {
    try {
      ensureMailReady(email);
    } catch {
      throw { status: 503, code: 'EMAIL_DELIVERY_UNAVAILABLE', message: "Email delivery is temporarily unavailable." };
    }
  }

  const hashedPassword = await hashPassword(data.password);

  const user = await userRepo.createUser({
    username,
    email,
    password: hashedPassword,
    localPasswordSet: true,
    name: data.name,
    avatar: data.avatar || null,
    emailVerificationRequired: ENV.REQUIRE_EMAIL_VERIFICATION,
  });

  if (!ENV.REQUIRE_EMAIL_VERIFICATION) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      verificationRequired: false,
      verificationEmailSent: false,
      verificationEmailStatus: 'not_required' as const,
      message: "Account created. You can sign in now.",
    };
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await tokenRepo.createToken({
    userId: user.id,
    type: "EMAIL_VERIFY",
    token: verificationToken,
    expiresAt,
  });

  const verificationUrl = `${ENV.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  let verificationEmailSent: boolean;
  let verificationEmailStatus: 'provider_accepted' | 'suppressed' | 'unavailable';
  try {
    const delivery = await sendMail({
      to: user.email,
      subject: `${ENV.APP_NAME} - Verify Your Email`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #1b4332; text-align: center;">Welcome to ${escapeHtml(ENV.APP_NAME)}</h2>
          <p>Hi <strong>${escapeHtml(user.name)}</strong>,</p>
          <p>Thank you for signing up! Please verify your email address to activate your account by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #40916c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #40916c;">${verificationUrl}</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours.</p>
        </div>
      `,
    });
    verificationEmailSent = delivery?.suppressed !== true;
    verificationEmailStatus = verificationEmailSent ? 'provider_accepted' : 'suppressed';
  } catch {
    console.error("Failed to send verification email.");
    verificationEmailSent = false;
    verificationEmailStatus = 'unavailable';
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    verificationRequired: true,
    verificationEmailSent,
    verificationEmailStatus,
    message: verificationEmailSent
      ? "Account created. Your verification message was accepted by the email provider. Check your inbox and Spam folder; delivery may take a few minutes."
      : "Account created, but the verification email could not be sent. Request a new verification link.",
  };
};
