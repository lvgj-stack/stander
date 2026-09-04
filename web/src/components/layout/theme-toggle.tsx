import { MoonIcon, SunIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label={resolved === 'dark' ? '切换到浅色' : '切换到深色'}
      onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
    >
      {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
