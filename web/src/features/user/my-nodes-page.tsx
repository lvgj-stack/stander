import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'

import { listNodes } from '@/api/node'
import { DataTable } from '@/components/data-table/data-table'
import { Pagination } from '@/components/data-table/pagination'
import { Toolbar } from '@/components/data-table/toolbar'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { useTableParams } from '@/hooks/use-table-params'
import { NodeStatusBadge } from '@/components/node-status-badge'
import { orEmpty } from '@/lib/format'
import type { Node } from '@/types/api'

/**
 * The nodes this account may build rules on.
 *
 * `ListNodes` narrows the result to the caller's `user_role_node_mappings`
 * rows unless they are the super admin, and blanks the fields only an
 * administrator may see — the node key, which authenticates an agent, and the
 * manager IP. Both are columns of the serialised entity, so leaving them out
 * of this table would have hidden them from the page and not from the
 * response; the stripping has to happen server-side, and does.
 */
export function MyNodesPage() {
  const params = useTableParams()

  const query = useQuery({
    queryKey: ['me', 'nodes', params.pageNo, params.pageSize, params.keyword],
    queryFn: () =>
      listNodes({
        PageNo: params.pageNo,
        PageSize: params.pageSize,
        NodeName: params.keyword || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const columns: ColumnDef<Node, unknown>[] = [
    {
      accessorKey: 'nodeName',
      header: '名称',
      cell: ({ row }) => <div className="font-medium">{orEmpty(row.original.nodeName)}</div>,
    },
    {
      accessorKey: 'nodeType',
      header: '类型',
      cell: ({ row }) => (
        <Badge variant={row.original.nodeType === 'inbound' ? 'default' : 'secondary'}>
          {row.original.nodeType === 'inbound' ? '入口' : '出口'}
        </Badge>
      ),
    },
    {
      accessorKey: 'protocol',
      header: '协议',
      // The entity stores 0 = TLS, 1 = TCP.
      cell: ({ row }) => (
        <span className="tabular">{row.original.protocol === 1 ? 'TCP' : 'TLS'}</span>
      ),
    },
    {
      accessorKey: 'rate',
      header: '流量倍率',
      cell: ({ row }) => <span className="tabular">×{row.original.rate}</span>,
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => <NodeStatusBadge status={row.original.status} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="可用节点"
        description="你被授权使用的转发节点。倍率决定这个节点上的流量按几倍计入你的套餐。"
      />

      <Toolbar
        keyword={params.keyword}
        onKeywordChange={params.setKeyword}
        placeholder="按节点名称搜索"
      />

      <DataTable
        columns={columns}
        data={query.data?.pageData}
        loading={query.isPending}
        error={query.error}
        emptyMessage={
          params.keyword ? '没有匹配的节点' : '还没有可用节点，联系管理员为你的账号授权'
        }
      />

      <Pagination
        pageNo={params.pageNo}
        pageSize={params.pageSize}
        total={query.data?.total ?? 0}
        onPageChange={params.setPage}
        onPageSizeChange={params.setPageSize}
      />
    </>
  )
}
