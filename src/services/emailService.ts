import { transporter } from '../config/email';
import { logger } from '../utils/logger';

const FROM_EMAIL = process.env.EMAIL_FROM || process.env.SMTP_USER!;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: `"ensmenu" <${FROM_EMAIL}>`,
      ...options,
    });
    logger.info(`Email sent to ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
}

// Email Template Wrapper
function emailTemplate(content: string, isArabic: boolean = false): string {
  return `
<!DOCTYPE html>
<html dir="${isArabic ? 'rtl' : 'ltr'}" lang="${isArabic ? 'ar' : 'en'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: ${isArabic ? "'Segoe UI', Tahoma, Arial" : "'Segoe UI', Roboto, Arial"}, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
        }
        .content {
            padding: 40px 30px;
            color: #333333;
            line-height: 1.6;
        }
        .button {
            display: inline-block;
            padding: 14px 32px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            margin: 20px 0;
            text-align: center;
        }
        .button:hover {
            opacity: 0.9;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666666;
            font-size: 14px;
            border-top: 1px solid #e9ecef;
        }
        .divider {
            height: 1px;
            background-color: #e9ecef;
            margin: 30px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ensmenu</h1>
        </div>
        <div class="content">
            ${content}
        </div>
        <div class="footer">
            <p>${isArabic ? '© 2024 ensmenu. جميع الحقوق محفوظة.' : '© 2024 ensmenu. All rights reserved.'}</p>
            <p>${isArabic ? 'إذا لم تطلب هذا البريد، يرجى تجاهله.' : 'If you didn\'t request this email, please ignore it.'}</p>
        </div>
    </div>
</body>
</html>
  `;
}

// Welcome Email
export async function sendWelcomeEmail(
  to: string,
  name: string,
  locale: 'ar' | 'en' = 'ar'
): Promise<boolean> {
  const isArabic = locale === 'ar';
  
  const content = isArabic ? `
    <h2>مرحباً ${name}! 👋</h2>
    <p>نشكرك على انضمامك إلى <strong>ensmenu</strong> - منصتك الرقمية لإنشاء منيو احترافي لمطعمك.</p>
    <p>يمكنك الآن البدء في إنشاء منيو رقمي جميل وعرض منتجاتك بشكل احترافي للعملاء.</p>
    <div class="divider"></div>
    <h3>خطواتك التالية:</h3>
    <ul>
        <li>✅ تأكيد بريدك الإلكتروني</li>
        <li>📱 إنشاء منيو جديد</li>
        <li>🍽️ إضافة منتجاتك</li>
        <li>🌐 مشاركة رابط منيوك مع العملاء</li>
    </ul>
    <p>نتمنى لك تجربة رائعة!</p>
  ` : `
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
    subject: isArabic ? 'مرحباً بك في ensmenu!' : 'Welcome to ensmenu!',
    html: emailTemplate(content, isArabic),
  });
}

// Email Verification
export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string,
  locale: 'ar' | 'en' = 'ar'
): Promise<boolean> {
  const isArabic = locale === 'ar';
  const verificationLink = `${FRONTEND_URL}/${locale}/verify-email?token=${token}`;

  const content = isArabic ? `
    <h2>مرحباً ${name}،</h2>
    <p>شكراً لتسجيلك في <strong>ensmenu</strong>!</p>
    <p>لإكمال تسجيلك وتفعيل حسابك، يرجى تأكيد بريدك الإلكتروني بالنقر على الزر أدناه:</p>
    <center>
        <a href="${verificationLink}" class="button">تأكيد البريد الإلكتروني</a>
    </center>
    <p style="color: #666; font-size: 14px; margin-top: 30px;">
        أو انسخ هذا الرابط والصقه في متصفحك:<br>
        <a href="${verificationLink}" style="color: #667eea; word-break: break-all;">${verificationLink}</a>
    </p>
    <div class="divider"></div>
    <p style="color: #999; font-size: 13px;">
        <strong>ملاحظة:</strong> هذا الرابط صالح لمدة 24 ساعة فقط.
    </p>
  ` : `
    <h2>Hello ${name},</h2>
    <p>Thank you for signing up for <strong>ensmenu</strong>!</p>
    <p>To complete your registration and activate your account, please verify your email by clicking the button below:</p>
    <center>
        <a href="${verificationLink}" class="button">Verify Email</a>
    </center>
    <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Or copy and paste this link into your browser:<br>
        <a href="${verificationLink}" style="color: #667eea; word-break: break-all;">${verificationLink}</a>
    </p>
    <div class="divider"></div>
    <p style="color: #999; font-size: 13px;">
        <strong>Note:</strong> This link is valid for 24 hours only.
    </p>
  `;

  return sendEmail({
    to,
    subject: isArabic ? 'تأكيد بريدك الإلكتروني' : 'Verify Your Email',
    html: emailTemplate(content, isArabic),
  });
}

// Password Reset
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
  locale: 'ar' | 'en' = 'ar'
): Promise<boolean> {
  const isArabic = locale === 'ar';
  const resetLink = `${FRONTEND_URL}/${locale}/reset-password?token=${token}`;

  const content = isArabic ? `
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
  ` : `
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
    subject: isArabic ? 'إعادة تعيين كلمة المرور' : 'Reset Your Password',
    html: emailTemplate(content, isArabic),
  });
}

// Password Changed Confirmation
export async function sendPasswordChangedEmail(
  to: string,
  name: string,
  locale: 'ar' | 'en' = 'ar'
): Promise<boolean> {
  const isArabic = locale === 'ar';

  const content = isArabic ? `
    <h2>مرحباً ${name}،</h2>
    <p>تم تغيير كلمة مرور حسابك في <strong>ensmenu</strong> بنجاح.</p>
    <p>إذا لم تقم بهذا التغيير، يرجى الاتصال بدعمنا فوراً.</p>
    <div class="divider"></div>
    <p style="color: #28a745; font-weight: bold;">✓ تم تأمين حسابك</p>
    <p>تاريخ التغيير: ${new Date().toLocaleString('ar-EG')}</p>
  ` : `
    <h2>Hello ${name},</h2>
    <p>Your <strong>ensmenu</strong> account password has been successfully changed.</p>
    <p>If you didn't make this change, please contact our support immediately.</p>
    <div class="divider"></div>
    <p style="color: #28a745; font-weight: bold;">✓ Your account is secure</p>
    <p>Change date: ${new Date().toLocaleString('en-US')}</p>
  `;

  return sendEmail({
    to,
    subject: isArabic ? 'تم تغيير كلمة المرور' : 'Password Changed',
    html: emailTemplate(content, isArabic),
  });
}

// Subscription Confirmation
export async function sendSubscriptionEmail(
  to: string,
  name: string,
  planName: string,
  billingCycle: string,
  locale: 'ar' | 'en' = 'ar'
): Promise<boolean> {
  const isArabic = locale === 'ar';

  const content = isArabic ? `
    <h2>مرحباً ${name}،</h2>
    <p>شكراً لاشتراكك في خطة <strong>${planName}</strong>!</p>
    <p>تفاصيل الاشتراك:</p>
    <ul>
        <li><strong>الخطة:</strong> ${planName}</li>
        <li><strong>دورة الدفع:</strong> ${billingCycle === 'monthly' ? 'شهري' : billingCycle === 'yearly' ? 'سنوي' : 'مجاني'}</li>
        <li><strong>تاريخ البدء:</strong> ${new Date().toLocaleDateString('ar-EG')}</li>
    </ul>
    <center>
        <a href="${FRONTEND_URL}/${locale}/user/dashboard" class="button">انتقل إلى لوحة التحكم</a>
    </center>
    <p>يمكنك الآن الاستفادة من جميع ميزات خطتك!</p>
  ` : `
    <h2>Hello ${name},</h2>
    <p>Thank you for subscribing to the <strong>${planName}</strong> plan!</p>
    <p>Subscription details:</p>
    <ul>
        <li><strong>Plan:</strong> ${planName}</li>
        <li><strong>Billing cycle:</strong> ${billingCycle}</li>
        <li><strong>Start date:</strong> ${new Date().toLocaleDateString('en-US')}</li>
    </ul>
    <center>
        <a href="${FRONTEND_URL}/${locale}/user/dashboard" class="button">Go to Dashboard</a>
    </center>
    <p>You can now enjoy all features of your plan!</p>
  `;

  return sendEmail({
    to,
    subject: isArabic ? 'تأكيد الاشتراك' : 'Subscription Confirmation',
    html: emailTemplate(content, isArabic),
  });
}


