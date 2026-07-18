/**
 * Permission cache keyed by staff `roleId` → permission keys.
 *
 * Phase 1 uses an in-process Map. The interface is intentionally small so a
 * Redis-backed provider can replace it later without touching business logic.
 */
export interface PermissionCacheProvider {
  get(roleId: number): string[] | null;
  set(roleId: number, permissions: string[]): void;
  invalidate(roleId: number): void;
  clear(): void;
}

class MemoryPermissionCache implements PermissionCacheProvider {
  private readonly store = new Map<number, string[]>();

  get(roleId: number): string[] | null {
    const value = this.store.get(roleId);
    return value ? [...value] : null;
  }

  set(roleId: number, permissions: string[]): void {
    this.store.set(roleId, [...permissions]);
  }

  invalidate(roleId: number): void {
    this.store.delete(roleId);
  }

  clear(): void {
    this.store.clear();
  }
}

/** Singleton cache instance shared across the process. */
export const permissionCache: PermissionCacheProvider =
  new MemoryPermissionCache();
