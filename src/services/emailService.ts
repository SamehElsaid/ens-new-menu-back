import fs from "fs";
import path from "path";
import { getResendClient, isEmailConfigured } from "../config/email";
import { logger } from "../utils/logger";
import { getImageUrl } from "../utils/urlHelper";

function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}
const EMAIL_LOGO_CID = "ensmenu-logo";
const EMAIL_LOGO_CANDIDATE_PATHS = [
  path.join(process.cwd(), "assets", "email", "mail.png"),
  path.join(__dirname, "..", "assets", "email", "mail.png"),
  path.join(process.cwd(), "uploads", "mail.png"),
];
const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveEmailLogoPath(): string | null {
  for (const candidate of EMAIL_LOGO_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getEmailFromAddress(): string {
  const raw = (process.env.EMAIL_FROM || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!raw) return "";

  const namedMatch = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (namedMatch) {
    const name = namedMatch[1].trim();
    const email = namedMatch[2].trim();
    if (!EMAIL_ADDRESS_RE.test(email)) return "";
    return `${name} <${email}>`;
  }

  if (EMAIL_ADDRESS_RE.test(raw)) {
    return `ENSMENU <${raw}>`;
  }

  return "";
}

function getEmailLogoSrc(): string {
  const custom = process.env.EMAIL_LOGO_URL?.trim();
  if (custom) return custom;
  if (resolveEmailLogoPath()) {
    return `cid:${EMAIL_LOGO_CID}`;
  }
  return getImageUrl("/uploads/mail.png") || "";
}

function emailBrandHeader(isArabic: boolean): string {
  const logoSrc = getEmailLogoSrc();
  const logoAttr = logoSrc.startsWith("cid:") ? logoSrc : escapeHtml(logoSrc);
  const homeUrl = escapeHtml(getFrontendUrl());

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" dir="${isArabic ? "rtl" : "ltr"}">
      <tr>
        <td align="center">
          <a href="${homeUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
            <img
              src="${logoAttr}"
              width="180"
              height="201"
              alt="ensmenu"
              style="display:block; width:180px; max-width:100%; height:auto; border:0;"
            />
          </a>
        </td>
      </tr>
    </table>
  `;
}

const BRAND = {
  accent: "#7c3aed",
  accentDark: "#5b21b6",
  royal: "#1a0b2e",
  text: "#334155",
  muted: "#64748b",
  border: "#e2e8f0",
  surface: "#f8fafc",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailButton(href: string, label: string, isArabic: boolean): string {
  const align = isArabic ? "right" : "left";

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0 8px;">
      <tr>
        <td align="${align}">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="18%" strokecolor="${BRAND.accentDark}" fillcolor="${BRAND.accent}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Segoe UI,Tahoma,Arial,sans-serif;font-size:16px;font-weight:bold;">
              ${label}
            </center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,${BRAND.accent} 0%,${BRAND.accentDark} 100%);color:#ffffff !important;text-decoration:none;border-radius:12px;font-size:16px;font-weight:700;line-height:1.2;box-shadow:0 10px 24px -8px rgba(124,58,237,0.45);">
            ${label}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  `;
}

function emailInfoBox(
  content: string,
  isArabic: boolean,
  tone: "neutral" | "warning" = "neutral",
): string {
  const borderSide = isArabic ? "border-right" : "border-left";
  const borderColor =
    tone === "warning" ? "rgba(245,158,11,0.45)" : "rgba(124,58,237,0.35)";
  const background =
    tone === "warning"
      ? "background-color:#fffbeb;"
      : "background-color:#f5f3ff;";

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;">
      <tr>
        <td style="${background} ${borderSide}:4px solid ${borderColor}; border-radius:${isArabic ? "12px 0 0 12px" : "0 12px 12px 0"}; padding:14px 16px; color:${BRAND.text}; font-size:13px; line-height:1.7; text-align:${isArabic ? "right" : "left"};">
          ${content}
        </td>
      </tr>
    </table>
  `;
}

function emailLinkFallback(
  href: string,
  isArabic: boolean,
  label: string,
): string {
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;">
      <tr>
        <td style="padding:0; color:${BRAND.muted}; font-size:13px; line-height:1.7; text-align:${isArabic ? "right" : "left"};">
          ${label}
        </td>
      </tr>
      <tr>
        <td style="padding-top:10px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.surface}; border:1px solid ${BRAND.border}; border-radius:10px;">
            <tr>
              <td dir="ltr" style="padding:12px 14px; font-family:Consolas,Monaco,monospace; font-size:12px; line-height:1.6; color:${BRAND.accent}; word-break:break-all; text-align:left;">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:${BRAND.accent}; text-decoration:underline;">
                  ${href}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!isEmailConfigured()) {
    logger.error(
      "Email not configured: RESEND_API_KEY and EMAIL_FROM are required",
    );
    return false;
  }

  const resend = getResendClient();
  if (!resend) {
    return false;
  }

  const from = getEmailFromAddress();
  if (!from) {
    logger.error(
      "EMAIL_FROM is missing or invalid. Set EMAIL_FROM=noreply@yourdomain.com in .env",
    );
    return false;
  }

  try {
    const attachments: Array<{
      content: Buffer;
      filename: string;
      contentId: string;
      contentType: string;
    }> = [];

    const logoPath = resolveEmailLogoPath();
    if (!process.env.EMAIL_LOGO_URL?.trim() && logoPath) {
      attachments.push({
        content: fs.readFileSync(logoPath),
        filename: "mail.png",
        contentId: EMAIL_LOGO_CID,
        contentType: "image/png",
      });
    } else if (!process.env.EMAIL_LOGO_URL?.trim() && !logoPath) {
      logger.warn(
        "Email logo not found. Expected assets/email/mail.png on the server.",
      );
    }

    const { data, error } = await resend.emails.send({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) {
      logger.error("Failed to send email:", error);
      return false;
    }

    logger.info(
      `Email sent to ${options.to}: ${options.subject}${data?.id ? ` (id: ${data.id})` : ""}`,
    );
    return true;
  } catch (error) {
    logger.error("Failed to send email:", error);
    return false;
  }
}

// Email Template Wrapper
function emailTemplate(content: string, isArabic: boolean = false): string {
  const direction = isArabic ? "rtl" : "ltr";
  const textAlign = isArabic ? "right" : "left";
  const fontFamily = isArabic
    ? "'Segoe UI', Tahoma, 'Noto Sans Arabic', Arial, sans-serif"
    : "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html dir="${direction}" lang="${isArabic ? "ar" : "en"}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>ensmenu</title>
    <!--[if mso]>
    <noscript>
      <xml>
        <o:OfficeDocumentSettings>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    </noscript>
    <![endif]-->
    <style>
        body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
        img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
        a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
        @media only screen and (max-width: 620px) {
            .email-shell { width: 100% !important; }
            .email-body { padding: 24px 18px !important; }
            .email-header { padding: 28px 18px !important; }
        }
        .email-body h2 { margin: 0 0 12px; font-size: 22px; font-weight: 800; color: ${BRAND.royal}; line-height: 1.4; }
        .email-body h3 { margin: 0 0 10px; font-size: 17px; font-weight: 700; color: ${BRAND.text}; }
        .email-body p { margin: 0 0 14px; font-size: 15px; color: ${BRAND.text}; line-height: 1.75; }
        .email-body ul { margin: 0 0 14px; font-size: 15px; color: ${BRAND.text}; line-height: 1.8; }
        .email-body[dir="rtl"] ul { padding: 0 20px 0 0; }
        .email-body[dir="ltr"] ul { padding: 0 0 0 20px; }
        .email-body .button {
            display: inline-block;
            padding: 14px 28px;
            background: linear-gradient(135deg, ${BRAND.accent} 0%, ${BRAND.accentDark} 100%);
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 700;
            font-size: 15px;
            margin: 18px 0;
        }
        .email-body .divider {
            height: 1px;
            background-color: ${BRAND.border};
            margin: 24px 0;
            border: 0;
        }
    </style>
</head>
<body style="margin:0; padding:0; background-color:#eef2f7; direction:${direction};">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eef2f7;">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table role="presentation" class="email-shell" border="0" cellpadding="0" cellspacing="0" width="600" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 12px 40px -16px rgba(26,11,46,0.12);">
                    <tr>
                        <td class="email-header" align="center" style="padding:32px 32px 24px; background-color:#ffffff;">
                            ${emailBrandHeader(isArabic)}
                        </td>
                    </tr>
                    <tr>
                        <td class="email-body" dir="${direction}" style="padding:36px 32px; font-family:${fontFamily}; color:${BRAND.text}; line-height:1.75; text-align:${textAlign}; direction:${direction}; background-color:#ffffff;">
                            ${content}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 32px 28px;">
                            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="border-top:1px solid ${BRAND.border}; font-size:0; line-height:0;">&nbsp;</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    <tr>
                        <td dir="${direction}" style="padding:0 32px 28px; font-family:${fontFamily}; text-align:${textAlign}; color:${BRAND.muted}; font-size:12px; line-height:1.7; background-color:#ffffff;">
                            <p style="margin:0 0 8px;">© ${year} ensmenu. ${isArabic ? "جميع الحقوق محفوظة." : "All rights reserved."}</p>
                            <p style="margin:0;">${isArabic ? "إذا لم تطلب هذا البريد، يمكنك تجاهله بأمان." : "If you did not request this email, you can safely ignore it."}</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
}

// Welcome Email
export async function sendWelcomeEmail(
  to: string,
  name: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const isArabic = locale === "ar";

  const content = isArabic
    ? `
    <h2>مرحباً ${name}! 👋</h2>
    <p>نشكرك على انضمامك إلى <strong>ensmenu</strong> - منصتك الرقمية لإنشاء منيو احترافي لمطعمك.</p>
    <p>يمكنك الآن البدء في إنشاء منيو رقمي جميل وعرض منتجاتك بشكل احترافي للعملاء.</p>
    <div class="divider"></div>
    <h3>خطواتك التالية:</h3>
    <ul>
        <li>✅ تأكيد بريدك الإلكتروني</li>
        <li>📱 إنشاء منيو جديد</li>
        <li>🍽️ إضافة منتجاتك</li>
        <li>🌐 مشاركة رابط المنيو مع العملاء</li>
    </ul>
    <p>نتمنى لك تجربة رائعة!</p>
  `
    : `
    <h2>Welcome ${name}! 👋</h2>
    <p>Thank you for joining <strong>ensmenu</strong> - your digital platform to create professional menus for your restaurant.</p>
    <p>You can now start creating a beautiful digital menu and showcase your products professionally to customers.</p>
    <div class="divider"></div>
    <h3>Your next steps:</h3>
    <ul>
        <li>✅ Verify your email</li>
        <li>📱 Create a new menu</li>
        <li>🍽️ Add your products</li>
        <li>🌐 Share your menu link with customers</li>
    </ul>
    <p>We wish you a great experience!</p>
  `;

  return sendEmail({
    to,
    subject: isArabic ? "مرحباً بك في ensmenu!" : "Welcome to ensmenu!",
    html: emailTemplate(content, isArabic),
  });
}

// Email Verification
export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const isArabic = locale === "ar";
  const safeName = escapeHtml(name);
  const verificationLink = `${getFrontendUrl()}/${locale}/auth/verify-email?token=${token}`;
  const textAlign = isArabic ? "right" : "left";

  const content = isArabic
    ? `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="${textAlign}" style="padding-bottom:18px;">
          <span style="display:inline-block; width:52px; height:52px; line-height:52px; border-radius:14px; background-color:#f5f3ff; color:${BRAND.accent}; font-size:24px; text-align:center;">✉️</span>
        </td>
      </tr>
      <tr>
        <td align="${textAlign}" style="font-size:24px; font-weight:800; color:${BRAND.royal}; line-height:1.4; padding-bottom:10px;">
          مرحباً ${safeName}،
        </td>
      </tr>
      <tr>
        <td align="${textAlign}" style="font-size:15px; color:${BRAND.text}; line-height:1.8; padding-bottom:6px;">
          شكراً لتسجيلك في <strong style="color:${BRAND.accentDark};">ensmenu</strong>.
        </td>
      </tr>
      <tr>
        <td align="${textAlign}" style="font-size:15px; color:${BRAND.text}; line-height:1.8;">
          لإكمال إنشاء حسابك وتفعيله، يرجى تأكيد بريدك الإلكتروني بالضغط على الزر أدناه.
        </td>
      </tr>
    </table>
    ${emailButton(verificationLink, "تأكيد البريد الإلكتروني", isArabic)}
    ${emailLinkFallback(
      verificationLink,
      isArabic,
      "إذا لم يعمل الزر، انسخ الرابط التالي والصقه في متصفحك:",
    )}
    ${emailInfoBox(
      "<strong>ملاحظة:</strong> هذا الرابط صالح لمدة <strong>24 ساعة</strong> فقط. بعد انتهاء المدة يمكنك طلب رابط تأكيد جديد من صفحة تسجيل الدخول.",
      isArabic,
      "warning",
    )}
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;">
      <tr>
        <td align="${textAlign}" style="font-size:13px; color:${BRAND.muted}; line-height:1.7;">
          إذا لم تقم بإنشاء حساب على ensmenu، يمكنك تجاهل هذه الرسالة ولن يتم تفعيل أي حساب.
        </td>
      </tr>
    </table>
  `
    : `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="${textAlign}" style="padding-bottom:18px;">
          <span style="display:inline-block; width:52px; height:52px; line-height:52px; border-radius:14px; background-color:#f5f3ff; color:${BRAND.accent}; font-size:24px; text-align:center;">✉️</span>
        </td>
      </tr>
      <tr>
        <td align="${textAlign}" style="font-size:24px; font-weight:800; color:${BRAND.royal}; line-height:1.4; padding-bottom:10px;">
          Hello ${safeName},
        </td>
      </tr>
      <tr>
        <td align="${textAlign}" style="font-size:15px; color:${BRAND.text}; line-height:1.8; padding-bottom:6px;">
          Thank you for signing up for <strong style="color:${BRAND.accentDark};">ensmenu</strong>.
        </td>
      </tr>
      <tr>
        <td align="${textAlign}" style="font-size:15px; color:${BRAND.text}; line-height:1.8;">
          To complete your registration and activate your account, please verify your email address using the button below.
        </td>
      </tr>
    </table>
    ${emailButton(verificationLink, "Verify Email Address", isArabic)}
    ${emailLinkFallback(
      verificationLink,
      isArabic,
      "If the button does not work, copy and paste this link into your browser:",
    )}
    ${emailInfoBox(
      "<strong>Note:</strong> This link is valid for <strong>24 hours</strong> only. After it expires, you can request a new verification link from the login page.",
      isArabic,
      "warning",
    )}
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:22px;">
      <tr>
        <td align="${textAlign}" style="font-size:13px; color:${BRAND.muted}; line-height:1.7;">
          If you did not create an ensmenu account, you can safely ignore this email and no account will be activated.
        </td>
      </tr>
    </table>
  `;

  return sendEmail({
    to,
    subject: isArabic
      ? "تأكيد بريدك الإلكتروني — ensmenu"
      : "Verify your email — ensmenu",
    html: emailTemplate(content, isArabic),
  });
}

// Password Reset
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const isArabic = locale === "ar";
  const resetLink = `${getFrontendUrl()}/${locale}/auth/reset-password?token=${token}`;

  const content = isArabic
    ? `
    <h2>مرحباً ${name}،</h2>
    <p>تلقينا طلباً لإعادة تعيين كلمة مرور حسابك في <strong>ensmenu</strong>.</p>
    <p>لإنشاء كلمة مرور جديدة، انقر على الزر أدناه:</p>
    <center>
        <a href="${resetLink}" class="button">إعادة تعيين كلمة المرور</a>
    </center>
    <p style="color: #666; font-size: 14px; margin-top: 30px;">
        أو انسخ هذا الرابط والصقه في متصفحك:<br>
        <a href="${resetLink}" style="color: #667eea; word-break: break-all;">${resetLink}</a>
    </p>
    <div class="divider"></div>
    <p style="color: #999; font-size: 13px;">
        <strong>ملاحظة:</strong> هذا الرابط صالح لمدة ساعة واحدة فقط.
    </p>
    <p style="color: #dc3545; font-size: 13px;">
        إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد. حسابك آمن.
    </p>
  `
    : `
    <h2>Hello ${name},</h2>
    <p>We received a request to reset your password for your <strong>ensmenu</strong> account.</p>
    <p>To create a new password, click the button below:</p>
    <center>
        <a href="${resetLink}" class="button">Reset Password</a>
    </center>
    <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Or copy and paste this link into your browser:<br>
        <a href="${resetLink}" style="color: #667eea; word-break: break-all;">${resetLink}</a>
    </p>
    <div class="divider"></div>
    <p style="color: #999; font-size: 13px;">
        <strong>Note:</strong> This link is valid for 1 hour only.
    </p>
    <p style="color: #dc3545; font-size: 13px;">
        If you didn't request a password reset, please ignore this email. Your account is safe.
    </p>
  `;

  return sendEmail({
    to,
    subject: isArabic ? "إعادة تعيين كلمة المرور" : "Reset Your Password",
    html: emailTemplate(content, isArabic),
  });
}

// Password Changed Confirmation
export async function sendPasswordChangedEmail(
  to: string,
  name: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const isArabic = locale === "ar";

  const content = isArabic
    ? `
    <h2>مرحباً ${name}،</h2>
    <p>تم تغيير كلمة مرور حسابك في <strong>ensmenu</strong> بنجاح.</p>
    <p>إذا لم تقم بهذا التغيير، يرجى الاتصال بدعمنا فوراً.</p>
    <div class="divider"></div>
    <p style="color: #28a745; font-weight: bold;">✓ تم تأمين حسابك</p>
    <p>تاريخ التغيير: ${new Date().toLocaleString("ar-EG")}</p>
  `
    : `
    <h2>Hello ${name},</h2>
    <p>Your <strong>ensmenu</strong> account password has been successfully changed.</p>
    <p>If you didn't make this change, please contact our support immediately.</p>
    <div class="divider"></div>
    <p style="color: #28a745; font-weight: bold;">✓ Your account is secure</p>
    <p>Change date: ${new Date().toLocaleString("en-US")}</p>
  `;

  return sendEmail({
    to,
    subject: isArabic ? "تم تغيير كلمة المرور" : "Password Changed",
    html: emailTemplate(content, isArabic),
  });
}

// Subscription Confirmation
export async function sendSubscriptionEmail(
  to: string,
  name: string,
  planName: string,
  billingCycle: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const isArabic = locale === "ar";

  const content = isArabic
    ? `
    <h2>مرحباً ${name}،</h2>
    <p>شكراً لاشتراكك في خطة <strong>${planName}</strong>!</p>
    <p>تفاصيل الاشتراك:</p>
    <ul>
        <li><strong>الخطة:</strong> ${planName}</li>
        <li><strong>دورة الدفع:</strong> ${billingCycle === "monthly" ? "شهري" : billingCycle === "yearly" ? "سنوي" : "مجاني"}</li>
        <li><strong>تاريخ البدء:</strong> ${new Date().toLocaleDateString("ar-EG")}</li>
    </ul>
    <center>
        <a href="${getFrontendUrl()}/${locale}/user/dashboard" class="button">انتقل إلى لوحة التحكم</a>
    </center>
    <p>يمكنك الآن الاستفادة من جميع ميزات خطتك!</p>
  `
    : `
    <h2>Hello ${name},</h2>
    <p>Thank you for subscribing to the <strong>${planName}</strong> plan!</p>
    <p>Subscription details:</p>
    <ul>
        <li><strong>Plan:</strong> ${planName}</li>
        <li><strong>Billing cycle:</strong> ${billingCycle}</li>
        <li><strong>Start date:</strong> ${new Date().toLocaleDateString("en-US")}</li>
    </ul>
    <center>
        <a href="${getFrontendUrl()}/${locale}/user/dashboard" class="button">Go to Dashboard</a>
    </center>
    <p>You can now enjoy all features of your plan!</p>
  `;

  return sendEmail({
    to,
    subject: isArabic ? "تأكيد الاشتراك" : "Subscription Confirmation",
    html: emailTemplate(content, isArabic),
  });
}

function messageToHtml(message: string): string {
  return message
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 14px; font-size:15px; line-height:1.75;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

export async function sendAdminMessageEmail(
  to: string,
  name: string,
  subject: string,
  message: string,
  locale: "ar" | "en" = "ar",
): Promise<boolean> {
  const isArabic = locale === "ar";
  const safeName = escapeHtml(name);
  const bodyHtml = messageToHtml(message);

  const content = isArabic
    ? `
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:800; color:${BRAND.royal};">مرحباً ${safeName}،</h2>
    ${bodyHtml}
  `
    : `
    <h2 style="margin:0 0 12px; font-size:22px; font-weight:800; color:${BRAND.royal};">Hello ${safeName},</h2>
    ${bodyHtml}
  `;

  return sendEmail({
    to,
    subject,
    html: emailTemplate(content, isArabic),
  });
}
