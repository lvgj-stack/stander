/**
 * The two roles.
 *
 * They mirror `identity.RoleSuperAdmin` / `identity.RoleUser` in the Go
 * service layer, and there are deliberately only two: a role decides which side
 * of the console an account lands on and nothing else, so the backend has a
 * single authorization boundary (`identity.Principal.IsSuperAdmin`) and the
 * console has two fixed sides rather than a menu assembled per role at runtime.
 *
 * The names live here rather than coming down the wire. A role is not a row the
 * console renders whatever the database happens to say about it — it is one of
 * two known things, and the labels are UI copy like every other label.
 */

export const ADMIN_ROLE = 'SUPER_ADMIN'
export const USER_ROLE = 'USER'

export type RoleCode = typeof ADMIN_ROLE | typeof USER_ROLE

export const ROLE_LABELS: Record<RoleCode, string> = {
  [ADMIN_ROLE]: '管理员',
  [USER_ROLE]: '普通用户',
}

/**
 * How to label a role code, tolerating one the backend should never send.
 *
 * `identity.NormalizeRole` already collapses anything else onto USER before it
 * reaches us, so this is a display fallback, not a second normalisation.
 */
export function roleLabel(code: string | null | undefined): string {
  return ROLE_LABELS[code as RoleCode] ?? ROLE_LABELS[USER_ROLE]
}
