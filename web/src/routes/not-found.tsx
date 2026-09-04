import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">这个页面不存在，或者你没有访问它的权限。</p>
      <Button asChild variant="outline">
        <Link to="/">回到仪表盘</Link>
      </Button>
    </div>
  )
}
