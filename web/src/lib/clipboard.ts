/**
 * Copying text to the clipboard, in the browsers this console actually runs in.
 *
 * `navigator.clipboard` only exists in a secure context. A self-hosted console
 * reached at `http://10.0.0.5:8080` is not one, so on the deployment where the
 * install command matters most the modern API is simply absent — hence the
 * `execCommand` fallback, deprecated but still the only thing that works there.
 */

/** Copies `text`, resolving to whether it landed on the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Denied permission, or a non-secure context that exposes the object but
      // rejects the call. Fall through and try the old way.
    }
  }
  return legacyCopy(text)
}

/**
 * The pre-Clipboard-API route: a selected off-screen textarea plus
 * `document.execCommand('copy')`.
 *
 * The element is positioned rather than hidden because a `display:none` or
 * `hidden` node cannot hold a selection, and it is placed at the current scroll
 * offset so focusing it does not jump the page.
 */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = `${window.scrollY}px`
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)

  try {
    textarea.select()
    textarea.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
