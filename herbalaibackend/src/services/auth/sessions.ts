import * as userRepo from "../../repositories/user.repository.js";
import * as tokenRepo from "../../repositories/token.repository.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";

import { isAccountBanned } from '../../domain/user-ban.js';

export const refreshToken = async (token: string) => {
  const tokenRecord = await tokenRepo.findActiveRefreshToken(token);
  const payload = verifyRefreshToken(token);
  if (!tokenRecord || !payload || payload.userId !== tokenRecord.userId ||
      (payload.sessionVersion ?? 0) !== tokenRecord.user.sessionVersion) {
    throw { status: 401, message: "Invalid or expired refresh token." };
  }

  const user = await userRepo.findUserById(tokenRecord.userId);
  if (!user || isAccountBanned(user)) {
    throw { status: 403, message: "Account banned or does not exist." };
  }

  // Generate new tokens
  const tokenPayload = { userId: tokenRecord.userId, role: tokenRecord.user.role, sessionVersion: tokenRecord.user.sessionVersion };
  const newAccessToken = generateAccessToken(tokenPayload);
  const newRefreshToken = generateRefreshToken(tokenPayload);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const rotated = await tokenRepo.rotateRefreshToken(tokenRecord.id, {
    userId: tokenRecord.userId,
    token: newRefreshToken,
    expiresAt,
  });
  if (!rotated) {
    throw { status: 401, message: "Invalid or expired refresh token." };
  }

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

export const logout = async (token: string) => {
  const tokenRecord = await tokenRepo.findActiveRefreshToken(token);
  if (tokenRecord) {
    await tokenRepo.revokeToken(tokenRecord.id);
  }
  return { message: "Logged out successfully." };
};
