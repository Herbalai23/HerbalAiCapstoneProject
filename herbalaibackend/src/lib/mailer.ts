import nodemailer from "nodemailer";
import { ENV } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: ENV.SMTP_HOST,
  port: ENV.SMTP_PORT,
  secure: ENV.SMTP_PORT === 465,
  connectionTimeout: 8_000,
  greetingTimeout: 8_000,
  socketTimeout: 10_000,
  dnsTimeout: 8_000,
  auth: {
    user: ENV.SMTP_USER,
    pass: ENV.SMTP_PASSWORD,
  },
});

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

type MailReceipt = { id?: string; messageId?: string; suppressed?: boolean };

const gmailAuthorizationErrors = new Set([
  "invalid_grant", "invalid_client", "invalid_request", "invalid_scope",
  "unauthorized_client", "unsupported_grant_type", "access_denied",
]);

const readGmailAccessToken = async (response: Response): Promise<string> => {
  const payload: unknown = await response.json().catch(() => null);
  const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  if (!response.ok) {
    const reason = data && "error" in data && typeof data.error === "string"
      && gmailAuthorizationErrors.has(data.error) ? `; ${data.error}` : "";
    throw new Error(`Gmail authorization failed (HTTP ${response.status}${reason}).`);
  }
  if (!data || !("access_token" in data) || typeof data.access_token !== "string"
    || !data.access_token.trim()) {
    throw new Error("Gmail authorization returned no access token.");
  }
  return data.access_token;
};

export const ensureMailReady = (recipient?: string) => {
  const deliveryMode = ENV.EMAIL_DELIVERY_MODE.toLowerCase();
  if (!['live', 'allowlist', 'log'].includes(deliveryMode)) throw new Error('Unsupported email delivery mode.');
  if (deliveryMode === "log") return;
  if (deliveryMode === "allowlist" && recipient && !ENV.EMAIL_ALLOWED_RECIPIENTS.includes(recipient.trim().toLowerCase())) return;
  if (ENV.EMAIL_PROVIDER === "resend" && ENV.RESEND_API_KEY && ENV.RESEND_FROM_EMAIL) return;
  if (ENV.EMAIL_PROVIDER === "gmail" && ENV.GMAIL_CLIENT_ID && ENV.GMAIL_CLIENT_SECRET && ENV.GMAIL_REFRESH_TOKEN && ENV.GMAIL_SENDER_EMAIL) return;
  if (ENV.EMAIL_PROVIDER === "smtp" && ENV.SMTP_USER && ENV.SMTP_PASSWORD && ENV.SMTP_FROM) return;
  throw new Error("Email delivery is not configured.");
};

const readAcceptedMessage = async (response: Response): Promise<{ id: string }> => {
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('id' in payload)
    || typeof payload.id !== 'string' || !payload.id.trim()) {
    throw new Error('Email provider returned no message identifier.');
  }
  return { id: payload.id };
};

const deliverMail = async ({ to, subject, html }: SendMailOptions): Promise<MailReceipt> => {
  const normalizedRecipient = to.trim().toLowerCase();
  const deliveryMode = ENV.EMAIL_DELIVERY_MODE.toLowerCase();
  const recipientIsAllowed = ENV.EMAIL_ALLOWED_RECIPIENTS.includes(normalizedRecipient);

  if (deliveryMode === "log" || (deliveryMode === "allowlist" && !recipientIsAllowed)) {
    const maskedRecipient = normalizedRecipient.replace(/^[^@]+/, "***");
    console.info(JSON.stringify({
      event: "email_suppressed",
      mode: deliveryMode,
      recipient: maskedRecipient,
      subject,
    }));
    return { messageId: "suppressed-local-email", suppressed: true };
  }

  if (deliveryMode !== "live" && deliveryMode !== "allowlist") {
    throw new Error(`Unsupported EMAIL_DELIVERY_MODE: ${ENV.EMAIL_DELIVERY_MODE}`);
  }

  ensureMailReady(to);

  if (ENV.EMAIL_PROVIDER === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `"${ENV.APP_NAME}" <${ENV.RESEND_FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Email provider rejected the request (HTTP ${response.status}).`);
    }
    return readAcceptedMessage(response);
  }

  if (ENV.EMAIL_PROVIDER === "gmail") {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: ENV.GMAIL_CLIENT_ID,
        client_secret: ENV.GMAIL_CLIENT_SECRET,
        refresh_token: ENV.GMAIL_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const accessToken = await readGmailAccessToken(tokenResponse);

    const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const composed = await composer.sendMail({
      from: `"${ENV.APP_NAME}" <${ENV.GMAIL_SENDER_EMAIL}>`,
      to,
      subject,
      html,
    });
    if (!Buffer.isBuffer(composed.message)) {
      throw new Error("Gmail message could not be composed.");
    }

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: composed.message.toString("base64url") }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Gmail rejected the message (HTTP ${response.status}).`);
    }
    return readAcceptedMessage(response);
  }

  const mailOptions = {
    from: `"${ENV.APP_NAME}" <${ENV.SMTP_FROM}>`,
    to,
    subject,
    html,
  };

  const receipt = await transporter.sendMail(mailOptions);
  const accepted = receipt.accepted?.some(recipient => recipient.trim().toLowerCase() === normalizedRecipient);
  if (!accepted || !receipt.messageId) throw new Error('SMTP did not accept the recipient.');
  return { messageId: receipt.messageId };
};

export const sendMail = async (options: SendMailOptions) => {
  const provider = ['gmail', 'resend', 'smtp'].includes(ENV.EMAIL_PROVIDER) ? ENV.EMAIL_PROVIDER : 'unknown';
  try {
    const receipt = await deliverMail({ ...options, to: options.to.trim().toLowerCase() });
    if (!('suppressed' in receipt) || !receipt.suppressed) {
      const messageId = 'id' in receipt ? receipt.id : receipt.messageId;
      console.info(JSON.stringify({
        event: 'email_provider_accepted', provider,
        ...(typeof messageId === 'string' && /^[a-zA-Z0-9_-]{1,256}$/.test(messageId) ? { messageId } : {}),
        inboxDeliveryConfirmed: false,
      }));
    }
    return receipt;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const authorizationReason = /Gmail authorization failed \(HTTP \d{3}; ([a-z_]+)\)/.exec(message)?.[1];
    const smtpCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    console.error(JSON.stringify({
      event: 'email_provider_failed', provider,
      category: authorizationReason || smtpCode === 'EAUTH' ? 'authorization'
        : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) || smtpCode === 'ETIMEDOUT' ? 'timeout'
          : message.includes('not configured') || message.includes('delivery mode') ? 'configuration' : 'provider_or_transport',
      ...(authorizationReason && gmailAuthorizationErrors.has(authorizationReason) ? { authorizationReason } : {}),
    }));
    throw error;
  }
};
