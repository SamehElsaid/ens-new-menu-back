import { getPool, sql } from "../config/database";
import { getResendClient, isEmailConfigured } from "../config/email";
import { logger } from "../utils/logger";

const INFO_INBOX = "info@ensmenu.com";
const DEFAULT_FORWARD_TO = "ensegypt20@gmail.com";
const FORWARD_FROM = "ENSMENU Support <info@ensmenu.com>";

export type InboundReceivedMeta = {
  email_id: string;
  from: string;
  to: string[];
  subject: string;
  message_id?: string;
  received_for?: string[];
  attachments?: Array<{
    id: string;
    filename: string | null;
    content_type?: string;
  }>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeAddress(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const named = trimmed.match(/<([^>]+)>/);
  return (named?.[1] || trimmed).trim();
}

function extractBareEmail(value: string): string {
  const named = value.trim().match(/<([^>]+)>/);
  return (named?.[1] || value).trim();
}

export function getInboundForwardTo(): string {
  return (
    process.env.INBOUND_FORWARD_TO?.trim() || DEFAULT_FORWARD_TO
  ).toLowerCase();
}

export function isAddressedToInfoInbox(meta: InboundReceivedMeta): boolean {
  const candidates = [...(meta.to || []), ...(meta.received_for || [])];
  return candidates.some((addr) => normalizeAddress(addr) === INFO_INBOX);
}

async function tryClaimForward(params: {
  resendEmailId: string;
  fromAddress: string;
  subject: string;
  forwardTo: string;
}): Promise<boolean> {
  const pool = await getPool();
  try {
    await pool
      .request()
      .input("resendEmailId", sql.NVarChar(100), params.resendEmailId)
      .input("fromAddress", sql.NVarChar(320), params.fromAddress)
      .input("subject", sql.NVarChar(998), params.subject.slice(0, 998))
      .input("forwardTo", sql.NVarChar(320), params.forwardTo).query(`
        INSERT INTO dbo.InboundEmailForwards
          (resendEmailId, fromAddress, subject, forwardTo, status)
        VALUES
          (@resendEmailId, @fromAddress, @subject, @forwardTo, N'processing')
      `);
    return true;
  } catch (error: unknown) {
    const number =
      typeof error === "object" && error && "number" in error
        ? Number((error as { number?: number }).number)
        : undefined;
    // SQL Server unique violation — may reclaim failed rows for Resend retries
    if (number === 2627 || number === 2601) {
      const reclaim = await pool
        .request()
        .input("resendEmailId", sql.NVarChar(100), params.resendEmailId)
        .input("fromAddress", sql.NVarChar(320), params.fromAddress)
        .input("subject", sql.NVarChar(998), params.subject.slice(0, 998))
        .input("forwardTo", sql.NVarChar(320), params.forwardTo).query(`
          UPDATE dbo.InboundEmailForwards
          SET status = N'processing',
              fromAddress = @fromAddress,
              subject = @subject,
              forwardTo = @forwardTo,
              outboundResendId = NULL,
              updatedAt = SYSUTCDATETIME()
          WHERE resendEmailId = @resendEmailId
            AND (
              status = N'failed'
              OR (
                status = N'processing'
                AND updatedAt < DATEADD(minute, -15, SYSUTCDATETIME())
              )
            )
        `);
      const rows = reclaim.rowsAffected?.[0] ?? 0;
      return rows > 0;
    }
    throw error;
  }
}

async function markForwardStatus(
  resendEmailId: string,
  status: "forwarded" | "failed" | "skipped",
  outboundResendId?: string | null,
): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("resendEmailId", sql.NVarChar(100), resendEmailId)
    .input("status", sql.NVarChar(20), status)
    .input("outboundResendId", sql.NVarChar(100), outboundResendId ?? null)
    .query(`
      UPDATE dbo.InboundEmailForwards
      SET status = @status,
          outboundResendId = COALESCE(@outboundResendId, outboundResendId),
          updatedAt = SYSUTCDATETIME()
      WHERE resendEmailId = @resendEmailId
    `);
}

function buildHeaderBlock(params: {
  from: string;
  to: string[];
  subject: string;
  messageId?: string;
  attachmentLines: string[];
}): string {
  const toLine = params.to.join(", ") || INFO_INBOX;
  const attachmentsHtml =
    params.attachmentLines.length > 0
      ? `<p><strong>Attachments:</strong></p><ul>${params.attachmentLines
          .map((line) => `<li>${line}</li>`)
          .join("")}</ul>`
      : "";

  return `
    <div style="font-family:Arial,sans-serif;font-size:13px;color:#334155;border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:0 0 16px;background:#f8fafc;">
      <p style="margin:0 0 6px;"><strong>Forwarded inbound email</strong> for ${escapeHtml(INFO_INBOX)}</p>
      <p style="margin:0 0 4px;"><strong>From:</strong> ${escapeHtml(params.from)}</p>
      <p style="margin:0 0 4px;"><strong>To:</strong> ${escapeHtml(toLine)}</p>
      <p style="margin:0 0 4px;"><strong>Subject:</strong> ${escapeHtml(params.subject || "(no subject)")}</p>
      ${
        params.messageId
          ? `<p style="margin:0 0 4px;"><strong>Message-ID:</strong> ${escapeHtml(params.messageId)}</p>`
          : ""
      }
      ${attachmentsHtml}
      <p style="margin:10px 0 0;color:#64748b;">Reply to this email to respond to the original sender.</p>
    </div>
  `;
}

/**
 * Forward a Resend inbound email addressed to info@ensmenu.com to INBOUND_FORWARD_TO.
 */
export async function forwardInboundEmailToGmail(
  meta: InboundReceivedMeta,
): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  if (!isAddressedToInfoInbox(meta)) {
    logger.info("Skipping inbound email (not addressed to info@ensmenu.com)", {
      emailId: meta.email_id,
      to: meta.to,
      received_for: meta.received_for,
    });
    return { ok: true, skipped: true, reason: "not_info_inbox" };
  }

  if (!isEmailConfigured()) {
    logger.error("Cannot forward inbound email: Resend not configured");
    return { ok: false, reason: "email_not_configured" };
  }

  const resend = getResendClient();
  if (!resend) {
    return { ok: false, reason: "email_not_configured" };
  }

  const forwardTo = getInboundForwardTo();
  const claimed = await tryClaimForward({
    resendEmailId: meta.email_id,
    fromAddress: meta.from,
    subject: meta.subject || "",
    forwardTo,
  });

  if (!claimed) {
    logger.info("Skipping inbound email (already claimed/forwarded)", {
      emailId: meta.email_id,
    });
    return { ok: true, skipped: true, reason: "duplicate" };
  }

  try {
    const { data: email, error: getError } = await resend.emails.receiving.get(
      meta.email_id,
    );

    if (getError || !email) {
      logger.error("Failed to fetch received email content", {
        emailId: meta.email_id,
        error: getError,
      });
      await markForwardStatus(meta.email_id, "failed");
      return { ok: false, reason: "fetch_failed" };
    }

    const attachmentLines: string[] = [];
    try {
      const { data: attachmentsList } =
        await resend.emails.receiving.attachments.list({
          emailId: meta.email_id,
        });
      for (const att of attachmentsList?.data || []) {
        const name = escapeHtml(att.filename || att.id);
        const url = att.download_url
          ? `<a href="${escapeHtml(att.download_url)}">${name}</a>`
          : name;
        const expires = att.expires_at
          ? ` <span style="color:#94a3b8">(expires ${escapeHtml(att.expires_at)})</span>`
          : "";
        attachmentLines.push(`${url}${expires}`);
      }
    } catch (attErr) {
      logger.warn("Could not list inbound attachments", {
        emailId: meta.email_id,
        error: attErr,
      });
      for (const att of email.attachments || meta.attachments || []) {
        attachmentLines.push(escapeHtml(att.filename || att.id));
      }
    }

    const originalSubject = email.subject || meta.subject || "(no subject)";
    const header = buildHeaderBlock({
      from: email.from || meta.from,
      to: email.to?.length ? email.to : meta.to,
      subject: originalSubject,
      messageId: email.message_id || meta.message_id,
      attachmentLines,
    });

    const bodyHtml =
      email.html ||
      (email.text
        ? `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(email.text)}</pre>`
        : "<p><em>(empty body)</em></p>");

    const replyTo = extractBareEmail(email.from || meta.from);

    const { data: sent, error: sendError } = await resend.emails.send({
      from: FORWARD_FROM,
      to: [forwardTo],
      replyTo: [replyTo],
      subject: `[EnsMenu] ${originalSubject}`,
      html: header + bodyHtml,
    });

    if (sendError || !sent?.id) {
      logger.error("Failed to forward inbound email", {
        emailId: meta.email_id,
        error: sendError,
      });
      await markForwardStatus(meta.email_id, "failed");
      return { ok: false, reason: "send_failed" };
    }

    await markForwardStatus(meta.email_id, "forwarded", sent.id);
    logger.info("Inbound email forwarded", {
      emailId: meta.email_id,
      outboundId: sent.id,
      forwardTo,
    });
    return { ok: true };
  } catch (error) {
    logger.error("Inbound email forward threw", {
      emailId: meta.email_id,
      error,
    });
    try {
      await markForwardStatus(meta.email_id, "failed");
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "exception" };
  }
}
