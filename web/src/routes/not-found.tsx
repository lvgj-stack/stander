import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

/** `home` is the side this 404 was rendered inside, so "back" stays on it. */
export function NotFoundPage({ home = '/' }: { home?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <p className="text-sm text-muted-foreground">这个页面不存在。</p>
      <Button asChild variant="outline">
        <Link to={home}>返回首页</Link>
      </Button>
    </div>
  )
}
