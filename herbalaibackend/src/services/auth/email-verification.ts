import * as userRepo from "../../repositories/user.repository.js";
import * as tokenRepo from "../../repositories/token.repository.js";
import { ENV } from "../../config/env.js";
import crypto from "crypto";
import { ensureMailReady, sendMail } from "../../lib/mailer.js";
import { escapeHtml } from '../../lib/escape-html.js';

export const verifyEmail = async (token: string) => {
  const tokenRecord = await tokenRepo.findActiveTokenByValue(token, "EMAIL_VERIFY");
  if (!tokenRecord) {
    throw { status: 400, message: "Invalid or expired verification token." };
  }

  const redeemed = await tokenRepo.redeemAccountToken({
    id: tokenRecord.id, userId: tokenRecord.userId, type: 'EMAIL_VERIFY',
  });
  if (!redeemed) throw { status: 400, message: "Invalid or expired verification token." };
  userRepo.invalidateCachedUser(tokenRecord.userId);

  return { message: "Email verified successfully. You can now log in." };
};

export const resendEmailVerification = async (email: string) => {
  if (!ENV.REQUIRE_EMAIL_VERIFICATION) {
    return { deliveryStatus: 'not_required' as const, message: "Email verification is temporarily disabled. If you already have an account, sign in." };
  }

  try { ensureMailReady(email); } catch {
    throw { status: 503, code: 'VERIFICATION_EMAIL_UNAVAILABLE' };
  }

  const user = await userRepo.findUserByEmail(email);

  // Security: always return neutral response to prevent email enumeration
  if (!user || user.emailVerified) {
    return { deliveryStatus: 'requested' as const, message: 'If this email is registered and unverified, we will attempt to send a verification link. Check your inbox and Spam folder; delivery may take a few minutes.' };
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const replacement = await tokenRepo.createToken({
    userId: user.id,
    type: "EMAIL_VERIFY",
    token: verificationToken,
    expiresAt,
  });

  const verificationUrl = `${ENV.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  try {
    const delivery = await sendMail({
      to: user.email,
      subject: `${ENV.APP_NAME} - Verify Your Email`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h2 style="color: #1b4332; text-align: center;">Welcome to ${escapeHtml(ENV.APP_NAME)}</h2>
        <p>Hi <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>Please click the button below to verify your email address:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #40916c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #40916c;">${verificationUrl}</p>
        <p style="color: #666; font-size: 12px; margin-top: 30px;">This link will expire in 24 hours.</p>
      </div>
      `,
    });
    if (delivery?.suppressed) throw new Error("Verification email was suppressed.");
  } catch {
    console.error("Verification email delivery failed");
    try {
      await tokenRepo.revokeToken(replacement.id);
    } catch {
      console.error("Failed to clean up undelivered verification link");
    }
    throw { status: 503, code: "VERIFICATION_EMAIL_UNAVAILABLE" };
  }
  try {
    await tokenRepo.revokeOlderUserTokensByType(user.id, "EMAIL_VERIFY", replacement.id, replacement.createdAt);
  } catch {
    console.error("Failed to retire previous verification links");
  }
  return { deliveryStatus: 'requested' as const, message: 'If this email is registered and unverified, we will attempt to send a verification link. Check your inbox and Spam folder; delivery may take a few minutes.' };
};
