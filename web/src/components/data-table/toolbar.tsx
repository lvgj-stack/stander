import { SearchIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ToolbarProps {
  keyword: string
  onKeywordChange: (keyword: string) => void
  placeholder?: string
  children?: React.ReactNode
}

/**
 * Search box plus whatever actions a page passes as children.
 *
 * The input is uncontrolled between keystrokes and only commits on Enter or
 * blur: every list endpoint here is a round trip to MySQL, and firing one per
 * keystroke makes the table flicker through stale result sets.
 */
export function Toolbar({ keyword, onKeywordChange, placeholder = '搜索…', children }: ToolbarProps) {
  const [draft, setDraft] = useState(keyword)
  const [lastKeyword, setLastKeyword] = useState(keyword)

  // Keeps the box in step when the keyword changes from outside — the back
  // button, or a page reset. Adjusting during render rather than in an effect
  // means the corrected value is painted in the same pass.
  if (keyword !== lastKeyword) {
    setLastKeyword(keyword)
    setDraft(keyword)
  }

  const commit = () => {
    if (draft !== keyword) onKeywordChange(draft)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={draft}
          placeholder={placeholder}
          className="pl-8 pr-8"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit()
          }}
        />
        {draft && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0.5 top-1/2 size-8 -translate-y-1/2"
            onClick={() => {
              setDraft('')
              onKeywordChange('')
            }}
            aria-label="清除搜索"
          >
            <XIcon className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
