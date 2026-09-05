import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { Loader2Icon } from 'lucide-react'

import { ADMIN_SIDE } from '@/app/admin/admin-nav'
import { USER_SIDE } from '@/app/user/user-nav'
import { ConsoleShell } from '@/components/layout/console-shell'
import { LoginPage } from '@/features/auth/login-page'

import { NotFoundPage } from './not-found'
import { RequireAuth } from './require-auth'
import { RequireSide, SideRedirect } from './require-side'

/**
 * The route table — the whole of it, in one file.
 *
 * There are two sides and nothing else: `/admin/*` for SUPER_ADMIN,
 * `/portal/*` for everyone else, and `/` redirects to whichever the signed-in
 * account belongs to. The user side is not at `/user` because that prefix
 * already belongs to the account API — `/user`, `/user/detail`,
 * `/user/profile/:id` — which both the dev proxy and nginx route to the
 * backend, so `/user/profile` would have reached the API instead of the app.
 *
 * Routes used to be half here and half in the database: the backend returned a
 * tree of permission rows carrying paths and Vue component files, and the menu
 * was assembled from it at runtime, so adding a page meant adding a row and a
 * page that could disagree. The two sides' menus are now
 * `app/admin/admin-nav.tsx` and `app/user/user-nav.tsx`, next to this table.
 *
 * Every page is code-split, so a forwarding user never downloads the admin
 * screens and vice versa.
 */
const DashboardPage = lazy(() =>
  import('@/features/dashboard/dashboard-page').then((m) => ({ default: m.DashboardPage })),
)
const NodesPage = lazy(() =>
  import('@/features/nodes/nodes-page').then((m) => ({ default: m.NodesPage })),
)
const ChainsPage = lazy(() =>
  import('@/features/chains/chains-page').then((m) => ({ default: m.ChainsPage })),
)
const ChainGroupsPage = lazy(() =>
  import('@/features/chain-groups/chain-groups-page').then((m) => ({
    default: m.ChainGroupsPage,
  })),
)
const RulesPage = lazy(() =>
  import('@/features/rules/rules-page').then((m) => ({ default: m.RulesPage })),
)
const PlansPage = lazy(() =>
  import('@/features/plans/plans-page').then((m) => ({ default: m.PlansPage })),
)
const ForwardUsersPage = lazy(() =>
  import('@/features/forward-users/forward-users-page').then((m) => ({
    default: m.ForwardUsersPage,
  })),
)
const AccountsPage = lazy(() =>
  import('@/features/accounts/accounts-page').then((m) => ({ default: m.AccountsPage })),
)
const ProfilePage = lazy(() =>
  import('@/features/profile/profile-page').then((m) => ({ default: m.ProfilePage })),
)
const UserOverviewPage = lazy(() =>
  import('@/features/user/overview-page').then((m) => ({ default: m.UserOverviewPage })),
)
const MyNodesPage = lazy(() =>
  import('@/features/user/my-nodes-page').then((m) => ({ default: m.MyNodesPage })),
)
const MyRulesPage = lazy(() =>
  import('@/features/user/my-rules-page').then((m) => ({ default: m.MyRulesPage })),
)

function LazyBoundary() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-64 items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { index: true, element: <SideRedirect /> },
      {
        path: 'admin',
        element: <RequireSide admin />,
        children: [
          {
            element: <ConsoleShell side={ADMIN_SIDE} />,
            children: [
              {
                element: <LazyBoundary />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: 'nodes', element: <NodesPage /> },
                  { path: 'chains', element: <ChainsPage /> },
                  { path: 'chain-groups', element: <ChainGroupsPage /> },
                  { path: 'rules', element: <RulesPage /> },
                  { path: 'plans', element: <PlansPage /> },
                  { path: 'forward-users', element: <ForwardUsersPage /> },
                  { path: 'accounts', element: <AccountsPage /> },
                  { path: 'profile', element: <ProfilePage /> },
                  { path: '*', element: <NotFoundPage home="/admin" /> },
                ],
              },
            ],
          },
        ],
      },
      {
        path: 'portal',
        element: <RequireSide admin={false} />,
        children: [
          {
            element: <ConsoleShell side={USER_SIDE} />,
            children: [
              {
                element: <LazyBoundary />,
                children: [
                  { index: true, element: <UserOverviewPage /> },
                  { path: 'rules', element: <MyRulesPage /> },
                  { path: 'nodes', element: <MyNodesPage /> },
                  { path: 'profile', element: <ProfilePage /> },
                  { path: '*', element: <NotFoundPage home="/portal" /> },
                ],
              },
            ],
          },
        ],
      },
      // Anything outside the two sides belongs to whichever one the account is
      // on; sending it there beats a 404 for a URL that is merely stale.
      { path: '*', element: <SideRedirect /> },
    ],
  },
])
