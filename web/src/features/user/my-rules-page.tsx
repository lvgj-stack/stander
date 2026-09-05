import { RulesPage } from '@/features/rules/rules-page'

/**
 * The user portal's rules screen.
 *
 * Deliberately the same component the admin side mounts, rather than a second
 * parallel implementation that could drift from it.
 *
 * That is safe because the narrowing happens in the service layer, not in this
 * component: `ListRules` filters on the caller's `user_id`, the rule form's
 * node and chain pickers are fed by list actions scoped the same way, and
 * `AddRule` / `ModifyRule` / `DelRule` / `TestRule` each re-check ownership of
 * the ids they are handed — the dropdowns are a convenience, not the control.
 */
export function MyRulesPage() {
  return (
    <RulesPage
      title="我的转发规则"
      description="你创建的转发规则。入口端口收到的流量会按规则送到目标地址，可经链路中继。"
    />
  )
}
