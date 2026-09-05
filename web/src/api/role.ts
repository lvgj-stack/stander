import type { Role } from '@/types/api'

import { api } from './client'

/**
 * Every role.
 *
 * This is all that is left of the role API. A role used to carry a set of
 * permission rows that the frontend turned into menu entries and tabs at
 * runtime; the console now has two fixed sides, so the only thing a role still
 * decides is which side an account lands on — which is what the account form
 * uses this for.
 */
export const listRoles = () => api.get<Role[]>('/role')
