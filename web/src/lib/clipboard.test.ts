import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from './clipboard'

/** Installs a `navigator.clipboard` for one test and removes it afterwards. */
function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  })
}

afterEach(() => {
  stubClipboard(undefined)
  // happy-dom has no execCommand, so each test that needs one installs it.
  Reflect.deleteProperty(document, 'execCommand')
})

describe('copyText', () => {
  it('uses the clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)

    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  // The console is routinely reached over plain http, where the clipboard
  // object is missing entirely; without the fallback the copy button would be
  // dead on exactly those deployments.
  it('falls back to execCommand when there is no clipboard API', async () => {
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    await expect(copyText('hello')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('falls back when the clipboard API rejects', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    const execCommand = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })

    await expect(copyText('hello')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalled()
  })

  it('reports failure rather than throwing when nothing works', async () => {
    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('leaves no scratch element behind', async () => {
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
    })

    await copyText('hello')
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
  })
})
