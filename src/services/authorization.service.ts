/**
 * Single authorization entry point for HTTP, Socket.IO, services and jobs.
 *
 * Identity comes from the JWT (staff carry `staffRoleId` only — never a
 * permission list). Permissions are resolved per role via `getRolePermissions`
 * which is backed by the in-process `permissionCache`.
 */
import { isNonGatingPermission } from "../config/staffPermissions.catalog";
import { getRolePermissions } from "./menuStaffRoles.service";

/**
 * Staff permissions are account-level: the role answers "what may they do",
 * while `MenuStaffGrants` answers "on which menu" — so `menuId` here is only
 * context for the current request, never the access decision itself.
 */
export type AuthActor =
  | { kind: "owner"; userId: number; menuId?: number }
  | {
      kind: "staff";
      staffId: number;
      staffRoleId: number;
      menuId?: number;
      ownerUserId?: number;
    }
  | { kind: "admin"; userId: number }
  | { kind: "system" };

export class AuthorizationError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "AuthorizationError";
  }
}

class AuthorizationService {
  /** All permissions the actor holds (owner/admin/system ⇒ effectively all). */
  async getPermissionsForActor(actor: AuthActor): Promise<string[] | "*"> {
    switch (actor.kind) {
      case "owner":
      case "admin":
      case "system":
        return "*";
      case "staff":
        return this.getPermissions(actor.staffRoleId);
      default:
        return [];
    }
  }

  /** Resolved permission keys for a staff role id (cached). */
  async getPermissions(staffRoleId: number): Promise<string[]> {
    return getRolePermissions(staffRoleId);
  }

  async can(actor: AuthActor, permission: string): Promise<boolean> {
    if (isNonGatingPermission(permission)) return true;
    const perms = await this.getPermissionsForActor(actor);
    if (perms === "*") return true;
    return perms.includes(permission);
  }

  async require(actor: AuthActor, permission: string): Promise<void> {
    if (!(await this.can(actor, permission))) {
      throw new AuthorizationError(permission);
    }
  }

  async hasAny(actor: AuthActor, permissions: string[]): Promise<boolean> {
    if (permissions.length === 0) return true;
    if (permissions.some(isNonGatingPermission)) return true;
    const perms = await this.getPermissionsForActor(actor);
    if (perms === "*") return true;
    return permissions.some((p) => perms.includes(p));
  }

  async hasAll(actor: AuthActor, permissions: string[]): Promise<boolean> {
    if (permissions.length === 0) return true;
    const gating = permissions.filter((p) => !isNonGatingPermission(p));
    if (gating.length === 0) return true;
    const perms = await this.getPermissionsForActor(actor);
    if (perms === "*") return true;
    return gating.every((p) => perms.includes(p));
  }

  async requireAny(actor: AuthActor, permissions: string[]): Promise<void> {
    if (!(await this.hasAny(actor, permissions))) {
      throw new AuthorizationError(permissions.join("|"));
    }
  }

  async requireAll(actor: AuthActor, permissions: string[]): Promise<void> {
    if (!(await this.hasAll(actor, permissions))) {
      throw new AuthorizationError(permissions.join("&"));
    }
  }
}

export const authorization = new AuthorizationService();
