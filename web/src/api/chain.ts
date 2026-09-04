import type { Chain, Page } from '@/types/api'

import { action } from './client'

export interface ListChainsParams {
  PageNo?: number
  PageSize?: number
  ChainName?: string
  Protocol?: string
}

export const listChains = (params: ListChainsParams) =>
  action<Page<Chain>>('chain', 'ListChains', params)

export interface AddChainParams {
  Name: string
  Port: number
  NodeId: number
  ChainType: 'TLS' | 'TCP' | ''
  PreferIpv6: boolean
}

export const addChain = (params: AddChainParams) => action<null>('chain', 'AddChain', params)

export const editChain = (id: number, chainName: string) =>
  action<null>('chain', 'EditChain', { ID: id, ChainName: chainName })

export const deleteChain = (id: number, port: number) =>
  action<{ ChainId: number }>('chain', 'DeleteChain', { ID: id, Port: port })

/** Ids of the chains the signed-in user is allowed to act on. */
export const getChainPermissions = () => action<number[]>('chain', 'GetChainPermissions', {})
