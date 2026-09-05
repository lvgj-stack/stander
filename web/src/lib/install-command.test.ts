import { describe, expect, it } from 'vitest'

import { buildInstallCommand, shellQuote } from './install-command'

const SCRIPT = 'https://raw.githubusercontent.com/lvgj-stack/stander/main/scripts/install.sh'

describe('buildInstallCommand', () => {
  it('renders a command that runs as-is on a fresh box', () => {
    expect(
      buildInstallCommand({
        controllerAddr: 'controller.example.com:8123',
        nodeKey: 'b6f1c0de-0000-4000-8000-000000000001',
        scriptUrl: SCRIPT,
      }),
    ).toBe(
      `curl -fsSL ${SCRIPT} | sudo bash -s -- controller.example.com:8123 b6f1c0de-0000-4000-8000-000000000001`,
    )
  })

  it('passes --prefer-ipv6 through to the agent', () => {
    const command = buildInstallCommand({
      controllerAddr: '10.0.0.5:8123',
      nodeKey: 'key',
      scriptUrl: SCRIPT,
      preferIPv6: true,
    })
    expect(command.endsWith('-- 10.0.0.5:8123 key --prefer-ipv6')).toBe(true)
  })

  it('leaves an IPv6 controller address unquoted and bracketed', () => {
    const command = buildInstallCommand({
      controllerAddr: '[2001:db8::1]:8123',
      nodeKey: 'key',
      scriptUrl: SCRIPT,
    })
    expect(command).toContain('-- [2001:db8::1]:8123 key')
  })

  it('trims what an operator typed rather than quoting the whitespace', () => {
    const command = buildInstallCommand({
      controllerAddr: '  10.0.0.5:8123  ',
      nodeKey: ' key ',
      scriptUrl: SCRIPT,
    })
    expect(command).toContain('-- 10.0.0.5:8123 key')
  })

  // The address field is free text and the result is pasted into a root shell,
  // so an injected command separator must stay inside one argument.
  it('quotes an address carrying shell metacharacters', () => {
    const command = buildInstallCommand({
      controllerAddr: '10.0.0.5:8123; rm -rf /',
      nodeKey: 'key',
      scriptUrl: SCRIPT,
    })
    expect(command).toContain(`'10.0.0.5:8123; rm -rf /'`)
    expect(command).not.toContain('; rm -rf / key')
  })

  it('is empty until every part is known', () => {
    expect(buildInstallCommand({ controllerAddr: '', nodeKey: 'key', scriptUrl: SCRIPT })).toBe('')
    expect(buildInstallCommand({ controllerAddr: 'a:1', nodeKey: '', scriptUrl: SCRIPT })).toBe('')
    expect(buildInstallCommand({ controllerAddr: 'a:1', nodeKey: 'key', scriptUrl: '' })).toBe('')
  })
})

describe('shellQuote', () => {
  it('escapes an embedded single quote the POSIX way', () => {
    // 'it' + an escaped quote + 's' — what a POSIX shell reassembles as it's.
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
  })

  it('turns an empty value into an explicit empty argument', () => {
    expect(shellQuote('')).toBe("''")
  })
})
