import type { ChainGroup, Page } from '@/types/api'

import { action } from './client'

export interface ChainGroupMemberInput {
  ID: number
  Backup: boolean
  MaxFails: number
  Timeout: number
  Weight: number
}

/**
 * Lists the chain groups.
 *
 * The backend's `ListChainGroup` selects only the id and name columns, so the
 * `Chains` array always comes back empty — group membership is not readable
 * over the API today. The UI reflects that rather than pretending otherwise.
 *
 * It also returns an empty list for anyone who is not SUPER_ADMIN.
 */
export const listChainGroups = () =>
  action<Page<ChainGroup>>('chain-group', 'ListChainGroups', {})

export interface AddChainGroupParams {
  Name: string
  Chains: ChainGroupMemberInput[]
}

export const addChainGroup = (params: AddChainGroupParams) =>
  action<null>('chain-group', 'AddChainGroup', params)

export const deleteChainGroup = (chainGroupId: string) =>
  action<null>('chain-group', 'DeleteChainGroup', { ChainGroupID: chainGroupId })
