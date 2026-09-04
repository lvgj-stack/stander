import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet } from 'react-router-dom'
import { Loader2Icon } from 'lucide-react'

import { AppLayout } from '@/components/layout/app-layout'
import { LoginPage } from '@/features/auth/login-page'

import { NotFoundPage } from './not-found'
import { RequireAuth } from './require-auth'

/**
 * The route table.
 *
 * Routes are declared here rather than derived from the backend's permission
 * tree — that tree's `component` column points at Vue files from the previous
 * frontend. Permission codes still decide what appears in the sidebar; see
 * `routes/nav.tsx`.
 *
 * Every page is code-split, so a user who only ever opens the rules page never
 * downloads the RBAC screens.
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
const UsersPage = lazy(() =>
  import('@/features/pms/users-page').then((m) => ({ default: m.UsersPage })),
)
const RolesPage = lazy(() =>
  import('@/features/pms/roles-page').then((m) => ({ default: m.RolesPage })),
)
const PermissionsPage = lazy(() =>
  import('@/features/pms/permissions-page').then((m) => ({ default: m.PermissionsPage })),
)
const ProfilePage = lazy(() =>
  import('@/features/profile/profile-page').then((m) => ({ default: m.ProfilePage })),
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
      {
        element: <AppLayout />,
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
              { path: 'pms/user', element: <UsersPage /> },
              { path: 'pms/role', element: <RolesPage /> },
              { path: 'pms/permission', element: <PermissionsPage /> },
              { path: 'profile', element: <ProfilePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
