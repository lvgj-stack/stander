/**
 * Builds the one-liner an operator pastes on a fresh node.
 *
 * The command is assembled here rather than on the backend because the
 * controller address is editable in the dialog: a deployment whose agents
 * reach the controller by a different name than the browser does can correct
 * it and see the command update, with no round trip.
 *
 * The shape matches what `scripts/install.sh` documents at its top — the
 * script downloads the release binary for the box's architecture, writes a
 * systemd unit pointing at `stander agent -a <addr> -k <key>`, and starts it.
 * Anything after the key is forwarded to the agent verbatim.
 */

export interface InstallCommandOptions {
  /** Where the agent dials back to, `host:port`. */
  controllerAddr: string
  /** The key the controller issued for this node. */
  nodeKey: string
  /** The installer to download; the backend supplies the deployment's. */
  scriptUrl: string
  /** Adds `--prefer-ipv6`, so the agent registers its IPv6 address. */
  preferIPv6?: boolean
}

/**
 * Characters that need no quoting in a POSIX shell word. Everything the three
 * inputs normally contain — a UUID, a `host:port`, an `https://` URL, an IPv6
 * literal in brackets — is in here.
 */
const SHELL_SAFE = /^[A-Za-z0-9@%_+=:,./[\]-]+$/

/**
 * Quotes a value for a shell word.
 *
 * The values come from the backend and from an operator typing into a field,
 * and the result is a command that gets pasted into a root shell. Anything
 * outside the safe set is single-quoted, with embedded single quotes broken
 * out the standard `'\''` way, so a stray space or semicolon stays one
 * argument instead of becoming a second command.
 */
export function shellQuote(value: string): string {
  if (value === '') return "''"
  if (SHELL_SAFE.test(value)) return value
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * Renders the install command, or an empty string when the controller address
 * or the node key is missing — a command with a hole in it is worse than none,
 * because it looks copyable.
 */
export function buildInstallCommand({
  controllerAddr,
  nodeKey,
  scriptUrl,
  preferIPv6 = false,
}: InstallCommandOptions): string {
  const addr = controllerAddr.trim()
  const key = nodeKey.trim()
  const url = scriptUrl.trim()
  if (!addr || !key || !url) return ''

  const args = [shellQuote(addr), shellQuote(key)]
  if (preferIPv6) args.push('--prefer-ipv6')

  // `sudo bash` rather than the script's own `bash`: the installer requires
  // root, and an operator who is not root should not have to notice that.
  return `curl -fsSL ${shellQuote(url)} | sudo bash -s -- ${args.join(' ')}`
}
