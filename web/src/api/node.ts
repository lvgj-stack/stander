import type { Chain, Node, Page } from '@/types/api'

import { action } from './client'

export interface ListNodesParams {
  PageNo?: number
  PageSize?: number
  NodeName?: string
  nodeType?: string
  /** "AddChainScene" narrows the list to nodes a chain may be attached to. */
  Scene?: '' | 'AddChainScene'
}

export const listNodes = (params: ListNodesParams) =>
  action<Page<Node>>('node', 'ListNodes', params)

export interface AddNodeParams {
  NodeName: string
  NodeType: 'inbound' | 'outbound'
  Rate: number
  DefaultIPv6: boolean
}

/** Returns the node key, which the agent needs. It is shown only once. */
export const addNode = (params: AddNodeParams) => action<string>('node', 'AddNode', params)

export interface EditNodeParams {
  ID: number
  NodeName?: string
  Rate?: number
}

export const editNode = (params: EditNodeParams) => action<null>('node', 'EditNode', params)

export const deleteNode = (id: number) => action<number>('node', 'DeleteNode', { ID: id })

export const listNodeChains = (nodeId: number) =>
  action<Chain[]>('node', 'ListNodeChainRelationShips', { NodeId: nodeId })

/** Ids of the nodes the signed-in user is allowed to act on. */
export const getNodePermissions = () => action<number[]>('node', 'GetNodePermissions', {})
