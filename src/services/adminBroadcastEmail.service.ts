import { sql, getPool } from "../config/database";
import { sendAdminMessageEmail } from "./emailService";
import { logger } from "../utils/logger";
import {
  USER_LIST_SUBSCRIPTION_JOIN,
  applyBroadcastAudienceFilter,
  getBaseBroadcastUserConditions,
  type BroadcastAudience,
} from "../utils/adminUserFilters";

const MAX_BROADCAST_RECIPIENTS = 500;
const MAX_TEST_RECIPIENTS = 20;
const SEND_DELAY_MS = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type BroadcastRecipient = {
  id: number;
  name: string;
  email: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUserIds(userIds: unknown): number[] {
  if (!Array.isArray(userIds)) return [];
  return [...new Set(userIds.map((id) => Number(id)).filter((id) => id > 0))];
}

export function parseBroadcastEmails(value: unknown): {
  emails: string[];
  invalid: string[];
} {
  const rawParts: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      rawParts.push(...String(item ?? "").split(/[\s,;]+/));
    }
  } else if (typeof value === "string" && value.trim()) {
    rawParts.push(...value.split(/[\s,;]+/));
  }

  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const part of rawParts) {
    const email = part.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) {
      invalid.push(part.trim());
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
    if (emails.length >= MAX_TEST_RECIPIENTS) break;
  }

  return { emails, invalid };
}

function recipientsFromEmails(emails: string[]): BroadcastRecipient[] {
  return emails.map((email, index) => ({
    id: index + 1,
    name: email.split("@")[0] || "Test",
    email,
  }));
}

export async function getBroadcastRecipients(options: {
  audience: BroadcastAudience;
  userIds?: number[];
  emails?: string[];
  limit?: number;
}): Promise<BroadcastRecipient[]> {
  if (options.audience === "test") {
    const emails = (options.emails ?? [])
      .map((email) => String(email).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, MAX_TEST_RECIPIENTS);
    return recipientsFromEmails(emails);
  }

  const pool = await getPool();
  const whereConditions = getBaseBroadcastUserConditions();
  const request = pool.request();

  if (options.audience === "selected") {
    const ids = normalizeUserIds(options.userIds);
    if (!ids.length) return [];
    const idParams = ids.map((id, index) => {
      const key = `userId${index}`;
      request.input(key, sql.Int, id);
      return `@${key}`;
    });
    whereConditions.push(`u.id IN (${idParams.join(", ")})`);
  } else {
    applyBroadcastAudienceFilter(options.audience, whereConditions);
  }

  const top =
    options.limit && options.limit > 0
      ? `TOP (${Math.min(options.limit, MAX_BROADCAST_RECIPIENTS)})`
      : "";

  const result = await request.query(`
    SELECT ${top}
      u.id,
      u.name,
      u.email
    FROM Users u
    ${USER_LIST_SUBSCRIPTION_JOIN}
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY u.createdAt DESC
  `);

  return result.recordset.map((row) => ({
    id: row.id,
    name: row.name,
    email: String(row.email).trim().toLowerCase(),
  }));
}

export async function previewBroadcastRecipients(options: {
  audience: BroadcastAudience;
  userIds?: number[];
  emails?: string[];
}) {
  const maxRecipients =
    options.audience === "test" ? MAX_TEST_RECIPIENTS : MAX_BROADCAST_RECIPIENTS;
  const recipients = await getBroadcastRecipients({
    ...options,
    limit: maxRecipients,
  });

  return {
    count: recipients.length,
    sample: recipients.slice(0, 8),
    capped: recipients.length >= maxRecipients,
    maxRecipients,
  };
}

export async function sendBroadcastEmail(options: {
  audience: BroadcastAudience;
  userIds?: number[];
  emails?: string[];
  subject: string;
  message: string;
  locale: "ar" | "en";
}) {
  const maxRecipients =
    options.audience === "test" ? MAX_TEST_RECIPIENTS : MAX_BROADCAST_RECIPIENTS;
  const recipients = await getBroadcastRecipients({
    audience: options.audience,
    userIds: options.userIds,
    emails: options.emails,
    limit: maxRecipients,
  });

  if (!recipients.length) {
    return { total: 0, sent: 0, failed: 0, failures: [] as string[] };
  }

  let sent = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const recipient of recipients) {
    const ok = await sendAdminMessageEmail(
      recipient.email,
      recipient.name,
      options.subject,
      options.message,
      options.locale,
    );

    if (ok) {
      sent += 1;
    } else {
      failed += 1;
      failures.push(recipient.email);
    }

    if (SEND_DELAY_MS > 0) {
      await sleep(SEND_DELAY_MS);
    }
  }

  logger.info(
    `Admin broadcast (${options.audience}): sent=${sent}, failed=${failed}, total=${recipients.length}`,
  );

  return {
    total: recipients.length,
    sent,
    failed,
    failures: failures.slice(0, 10),
    capped: recipients.length >= maxRecipients,
    maxRecipients,
  };
}
