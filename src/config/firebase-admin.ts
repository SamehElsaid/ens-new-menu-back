/**
 * Firebase Admin — credentials via environment only (never commit JSON keys to git).
 *
 * Set one of:
 * - FIREBASE_SERVICE_ACCOUNT_JSON — full service-account JSON as an inline string (highest priority)
 * - FIREBASE_SERVICE_ACCOUNT_PATH — path to the downloaded service-account JSON (relative to cwd or absolute)
 * - GOOGLE_APPLICATION_CREDENTIALS — standard GCP env var (path to the same JSON)
 *
 * Store the JSON outside the repository (e.g. a secrets folder) and reference it by path.
 * See `.env.example` for variable names.
 *
 * SenderId mismatch: the app client must use the same Firebase project as this credential.
 */

import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

let resolvedProjectId: string | undefined;

function readCertJson(resolvedPath: string): admin.ServiceAccount {
  const raw = fs.readFileSync(resolvedPath, "utf8");
  return JSON.parse(raw) as admin.ServiceAccount;
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

/**
 * Resolve credential JSON from cwd-relative or absolute path.
 */
function resolveCredentialFilePath(spec: string): string {
  const trimmed = spec.trim();
  const candidates: string[] = [];
  const push = (p: string): void => {
    const n = path.normalize(p);
    if (!candidates.includes(n)) candidates.push(n);
  };

  push(resolvePath(trimmed));

  if (!path.isAbsolute(trimmed)) {
    push(path.join(__dirname, trimmed));
  }

  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;
  throw new Error(
    `Credential JSON not found for "${trimmed}". Tried:\n  - ${candidates.join("\n  - ")}`,
  );
}

function loadServiceAccount(): admin.ServiceAccount {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    return JSON.parse(inlineJson) as admin.ServiceAccount;
  }

  const firebasePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (firebasePath) {
    return readCertJson(resolveCredentialFilePath(firebasePath));
  }

  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (gac) {
    try {
      return readCertJson(resolveCredentialFilePath(gac));
    } catch {
      // fall through
    }
  }

  throw new Error(
    "Firebase Admin is not configured: set FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON string), " +
      "FIREBASE_SERVICE_ACCOUNT_PATH, or GOOGLE_APPLICATION_CREDENTIALS " +
      "to a service-account JSON file path (do not commit that file to git).",
  );
}

function projectIdFromAccount(
  account: admin.ServiceAccount,
): string | undefined {
  const o = account as unknown as { project_id?: string };
  return o.project_id ?? account.projectId;
}

function ensureInitialized(): void {
  if (admin.apps.length > 0) return;
  const serviceAccount = loadServiceAccount();
  resolvedProjectId = projectIdFromAccount(serviceAccount);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/** Firebase `project_id` used by the loaded Admin SDK credential (after first init). */
export function getFirebaseAdminProjectId(): string | undefined {
  ensureInitialized();
  return resolvedProjectId;
}

/** Messaging client; initializes the default app once. */
export function getFirebaseMessaging(): admin.messaging.Messaging {
  ensureInitialized();
  return admin.messaging();
}
