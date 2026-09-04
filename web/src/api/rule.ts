import type { Page, Rule, RuleTestResult } from '@/types/api'

import { action } from './client'

export interface ListRulesParams {
  PageNo?: number
  PageSize?: number
  RuleName?: string
  OrderBy?: string
  Asc?: boolean
}

export const listRules = (params: ListRulesParams) =>
  action<Page<Rule>>('rule', 'ListRules', params)

export interface AddRuleParams {
  RuleName: string
  ListenPort: number
  RemoteAddr: string
  NodeId: number
  ChainId?: number
  ChainType: 'TLS' | 'TCP' | ''
}

export const addRule = (params: AddRuleParams) => action<unknown>('rule', 'AddRule', params)

export interface ModifyRuleParams {
  ID: number
  RuleName?: string
  ListenPort?: number
  RemoteAddr?: string
  ChainId?: number
  ChainType?: 'TLS' | 'TCP' | ''
}

export const modifyRule = (params: ModifyRuleParams) =>
  action<unknown>('rule', 'ModifyRule', params)

export const deleteRule = (id: number, port: number) =>
  action<{ RuleId: number }>('rule', 'DeleteRule', { ID: id, Port: port })

/** Measures the round trip through a rule's inbound and outbound legs. */
export const testRule = (id: number) => action<RuleTestResult>('rule', 'TestRule', { ID: id })
