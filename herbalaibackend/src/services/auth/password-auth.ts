import * as userRepo from "../../repositories/user.repository.js";
import * as tokenRepo from "../../repositories/token.repository.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import { banMessage, isAccountBanned } from '../../domain/user-ban.js';
import { ENV } from "../../config/env.js";
import crypto from "crypto";
import { ensureMailReady, sendMail } from "../../lib/mailer.js";
import { notifySessionInvalidated } from "../../lib/session-invalidation.js";
import { passwordCapability } from '../../domain/password-capability.js';
import { escapeHtml } from '../../lib/escape-html.js';

import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";

export const login = async (data: { identifier?: string; email?: string; password: string }) => {
  const user = await userRepo.findUserByLoginIdentifier(data.identifier ?? data.email ?? '');
  if (!user) {
    throw { status: 401, message: "Invalid email/username or password." };
  }

  if (user.localPasswordSet === false) {
    throw { status: 401, message: "Invalid email/username or password." };
  }

  const isPasswordValid = await comparePassword(data.password, user.password);
  if (!isPasswordValid) {
    throw { status: 401, message: "Invalid email/username or password." };
  }

  if (isAccountBanned(user)) throw { status: 403, message: banMessage(user) };

  if (ENV.REQUIRE_EMAIL_VERIFICATION && user.emailVerificationRequired && !user.emailVerified) {
    throw { status: 403, message: "Please verify your email before logging in." };
  }

  if (user.localPasswordSet === null) {
    const confirmed = await userRepo.confirmLocalPassword(user.id, user.password, user.sessionVersion);
    if (!confirmed) throw { status: 409, message: 'Your account changed. Please sign in again.' };
    user.localPasswordSet = true;
  }

  // The login query already returned the current account state. Reuse only its
  // safe session fields for the immediate /auth/me request instead of paying a
  // second remote database round trip. Ban/profile mutations still invalidate it.
  userRepo.primeCachedUser(user);

  const tokenPayload = { userId: user.id, role: user.role, sessionVersion: user.sessionVersion };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Clean up old/expired/revoked tokens
  await tokenRepo.cleanupTokens(user.id);

  // Store refresh token in database (valid for 7 days)
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await tokenRepo.createToken({
    userId: user.id,
    type: "REFRESH",
    token: refreshToken,
    expiresAt,
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      joined: user.joined,
      ...passwordCapability(user),
    },
    accessToken,
    refreshToken,
  };
};
const requestPasswordResetLink = async (email: string): Promise<"missing" | "cooldown" | "failed" | "sent"> => {
  const user = await userRepo.findUserByEmail(email);

  if (!user || isAccountBanned(user)) {
    return "missing";
  }

  try { ensureMailReady(user.email); } catch {
    console.error('Password email delivery is not configured.');
    return 'failed';
  }

  const requestedAt = new Date();
  const cooldownStart = new Date(requestedAt.getTime() - 60 * 60 * 1000);
  const claimed = await userRepo.claimPasswordResetRequest(user.id, requestedAt, cooldownStart);
  if (!claimed) return "cooldown";

  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(requestedAt.getTime() + 60 * 60 * 1000);

  let resetTokenRecord: Awaited<ReturnType<typeof tokenRepo.createToken>>;
  try {
    resetTokenRecord = await tokenRepo.createToken({
      userId: user.id,
      type: "PASSWORD_RESET",
      token: resetToken,
      expiresAt,
    });
  } catch (error) {
    await userRepo.releasePasswordResetRequest(user.id, requestedAt);
    throw error;
  }

  const resetUrl = `${ENV.FRONTEND_URL}/reset-password?token=${resetToken}`;

  try {
    const delivery = await sendMail({
      to: user.email,
      subject: `${ENV.APP_NAME} - Reset Your Password`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #1b4332; text-align: center;">Set Your ${escapeHtml(ENV.APP_NAME)} Password</h2>
          <p>Hi <strong>${escapeHtml(user.name)}</strong>,</p>
          <p>We received a request to create or reset your ${escapeHtml(ENV.APP_NAME)} password. Click the button below to choose a password for this account:</p>
          <p>This does not change your Google password. If Google is linked to your account, you can still sign in with Google.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #40916c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Set ${escapeHtml(ENV.APP_NAME)} Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #40916c;">${resetUrl}</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">This link expires in 1 hour and can be used only once. Saving your password signs you out on all devices. If you did not request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    if (delivery?.suppressed) throw new Error("Password reset email was suppressed.");
  } catch {
    console.error("Failed to send password reset email.");
    const cleanup = await Promise.allSettled([
      tokenRepo.revokeToken(resetTokenRecord.id),
      userRepo.releasePasswordResetRequest(user.id, requestedAt),
    ]);
    for (const result of cleanup) {
      if (result.status === "rejected") console.error("Failed to clean up password reset request.");
    }
    return "failed";
  }

  try {
    await tokenRepo.revokeOtherUserTokensByType(user.id, "PASSWORD_RESET", resetTokenRecord.id);
  } catch (error) {
    console.error("Failed to revoke previous password reset links:", error);
  }

  return "sent";
};

export const forgotPassword = async (email: string) => {
  await requestPasswordResetLink(email);
  return {
    deliveryStatus: 'requested' as const,
    message: 'If this account is eligible, we will attempt to send a password reset link. Check your email and Spam folder; delivery may take a few minutes. If you requested one recently, wait an hour before trying again.',
  };
};

export const changePassword = async (
  userId: string, sessionVersion: number, currentPassword: string, newPassword: string,
) => {
  const user = await userRepo.findPasswordCredentials(userId);
  if (!user || user.sessionVersion !== sessionVersion) {
    throw { status: 401, message: "Your session has expired. Please sign in again." };
  }
  if (isAccountBanned(user)) throw { status: 403, message: banMessage(user) };
  if (user.localPasswordSet === false) {
    throw { status: 400, code: 'PASSWORD_SETUP_REQUIRED', message: 'Create your Herbal-Ai password using the email password link first. Your Google password is unchanged.' };
  }
  if (!await comparePassword(currentPassword, user.password)) {
    throw { status: 400, message: "Current password is incorrect." };
  }
  if (await comparePassword(newPassword, user.password)) {
    throw { status: 400, message: "Choose a password different from your current password." };
  }
  const passwordHash = await hashPassword(newPassword);
  if (!await userRepo.replacePassword(userId, user.password, sessionVersion, passwordHash)) {
    throw { status: 409, message: "Your account changed during this request. Please sign in again." };
  }
  userRepo.invalidateCachedUser(userId);
  notifySessionInvalidated(userId);
  return { message: "Password changed. Sign in again with your new password." };
};

export const requestPasswordSetup = async (userId: string) => {
  const user = await userRepo.findUserById(userId);
  if (!user) throw { status: 401, message: "Please sign in again." };
  if (isAccountBanned(user)) throw { status: 403, message: banMessage(user) };
  const outcome = await requestPasswordResetLink(user.email);
  if (outcome === "missing") throw { status: 401, message: "Please sign in again." };
  if (outcome === "cooldown") {
    throw { status: 429, message: "You can request one password link per hour. Check your email and Spam folder for the existing link, or wait before requesting another." };
  }
  if (outcome === "failed") {
    throw { status: 503, code: 'PASSWORD_EMAIL_UNAVAILABLE', message: "We could not send your password link. Please try again later." };
  }
  return { deliveryStatus: 'provider_accepted' as const, message: 'Your password message was accepted by the email provider. Check your inbox and Spam folder; delivery may take a few minutes. The link expires in one hour and works only once.' };
};

export const resetPassword = async (token: string, newPassword: string) => {
  const tokenRecord = await tokenRepo.findActiveTokenByValue(token, "PASSWORD_RESET");
  if (!tokenRecord) {
    throw { status: 400, message: "Invalid or expired password reset token." };
  }

  if (await comparePassword(newPassword, tokenRecord.user.password)) {
    throw { status: 400, message: "Choose a password different from your current password." };
  }

  const hashedPassword = await hashPassword(newPassword);

  const redeemed = await tokenRepo.redeemAccountToken({
    id: tokenRecord.id, userId: tokenRecord.userId,
    type: 'PASSWORD_RESET', passwordHash: hashedPassword,
  });
  if (!redeemed) throw { status: 400, message: "Invalid or expired password reset token." };
  userRepo.invalidateCachedUser(tokenRecord.userId);
  notifySessionInvalidated(tokenRecord.userId);

  return { message: "Password reset successful. You can now log in with your new password." };
};
