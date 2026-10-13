import * as userRepo from "../../repositories/user.repository.js";
import * as tokenRepo from "../../repositories/token.repository.js";
import { OAuth2Client } from "google-auth-library";
import { ENV } from "../../config/env.js";
import crypto from "crypto";
import { banMessage, isAccountBanned } from '../../domain/user-ban.js';
import { passwordCapability } from '../../domain/password-capability.js';

import { hashPassword } from "../../utils/password.js";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";

const googleClient = new OAuth2Client(
  ENV.GOOGLE_CLIENT_ID,
  ENV.GOOGLE_CLIENT_SECRET,
  ENV.GOOGLE_REDIRECT_URI
);
export const getGoogleAuthUrl = (state: string): string => {
  return googleClient.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });
};

export const googleLogin = async (code: string) => {
  // Exchange the authorization code for tokens
  const { tokens } = await googleClient.getToken(code);
  if (!tokens.id_token) {
    throw { status: 400, message: "Google did not provide a sign-in token." };
  }

  // Verify the ID token and extract user info
  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: ENV.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.email || payload.email_verified !== true) {
    throw { status: 400, message: "Google did not provide a verified email address." };
  }

  const { email, name, picture } = payload;

  // Check if user already exists by email
  const foundUser = await userRepo.findUserByEmail(email);

  if (!foundUser) {
    // Auto-create an account for first-time Google users
    const emailLocalPart = email.split("@")[0] as string;
    const baseUsername = (name ?? emailLocalPart)
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const uniqueSuffix = crypto.randomBytes(3).toString("hex");
    const username = `${baseUsername}_${uniqueSuffix}`;

    // Generate a secure random password (they'll use Google to log in, not this)
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const hashedPassword = await hashPassword(randomPassword);

    await userRepo.createUser({
      username,
      email,
      password: hashedPassword,
      localPasswordSet: false,
      name: name ?? emailLocalPart,
      avatar: picture ?? null,
      emailVerified: new Date(),
    });

  }

  // Re-fetch user (consistent type whether new or existing)
  const user = await userRepo.findUserByEmail(email);
  if (!user) {
    throw { status: 500, message: "Failed to resolve user after Google login." };
  }

  if (isAccountBanned(user)) throw { status: 403, message: banMessage(user) };

  userRepo.primeCachedUser(user);

  // Issue JWT tokens (same flow as regular login)
  const tokenPayload = { userId: user.id, role: user.role, sessionVersion: user.sessionVersion };
  const accessToken = generateAccessToken(tokenPayload);
  const refreshToken = generateRefreshToken(tokenPayload);

  // Clean up old/expired/revoked tokens
  await tokenRepo.cleanupTokens(user.id);

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
