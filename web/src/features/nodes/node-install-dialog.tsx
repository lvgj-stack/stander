import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'

import { getAgentInstallInfo } from '@/api/node'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { copyText } from '@/lib/clipboard'
import { buildInstallCommand } from '@/lib/install-command'

/** The node an install command is being shown for. */
export interface NodeInstallTarget {
  nodeName?: string | null
  nodeKey: string
  /** The node was just created, so the key is news rather than a lookup. */
  issued?: boolean
  /** Mirrors the "默认走 IPv6" switch on the create form. */
  preferIPv6?: boolean
}

/**
 * Where an operator's corrected controller address is kept.
 *
 * The backend can only guess the address when the deployment has not set
 * `Server.ControllerAddr` — behind an ingress the console's host is not the one
 * agents dial. Remembering the correction means it is typed once per browser
 * rather than once per node.
 */
const ADDR_KEY = 'stander.controllerAddr'

function rememberedAddr(): string {
  try {
    return localStorage.getItem(ADDR_KEY) ?? ''
  } catch {
    // Private-mode browsers can throw on access rather than return null.
    return ''
  }
}

function rememberAddr(addr: string) {
  try {
    localStorage.setItem(ADDR_KEY, addr)
  } catch {
    /* Not remembering it is a smaller problem than crashing the dialog. */
  }
}

/**
 * Hands the operator a command they can paste on the new box, unedited.
 *
 * The node key alone was never enough to act on: it had to be married to the
 * controller address, the release download and a systemd unit by hand, which is
 * what `scripts/install.sh` already automates. This dialog is the missing half
 * — it says which address to dial and renders the whole one-liner.
 */
export function NodeInstallDialog({
  target,
  onClose,
}: {
  target: NodeInstallTarget | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {/* Keyed on the node so each open starts from the remembered address
            rather than from whatever the previous node's dialog was left at. */}
        {target ? <InstallDialogBody key={target.nodeKey} target={target} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function InstallDialogBody({ target }: { target: NodeInstallTarget }) {
  const info = useQuery({
    queryKey: ['agent-install-info'],
    queryFn: getAgentInstallInfo,
    // Deployment-wide and effectively static; refetching it per dialog open
    // would only add a spinner.
    staleTime: Infinity,
  })

  // `null` means "nobody has overridden the backend's guess", which is what
  // lets the guess appear as soon as the query resolves without an effect
  // racing the operator's typing for the field.
  const [override, setOverride] = useState<string | null>(() => rememberedAddr() || null)
  const addr = override ?? info.data?.controllerAddr ?? ''

  const command = buildInstallCommand({
    controllerAddr: addr,
    nodeKey: target.nodeKey,
    scriptUrl: info.data?.scriptUrl ?? '',
    preferIPv6: target.preferIPv6,
  })

  const copy = async (text: string, what: string) => {
    if (!text) return
    if (await copyText(text)) toast.success(`${what}已复制`)
    else toast.error('复制失败，请手动选择文本')
  }

  const copyCommand = async () => {
    // Copying is where the operator has settled on an address, so that is what
    // gets remembered — not every keystroke.
    rememberAddr(addr.trim())
    await copy(command, '安装命令')
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {target.issued ? '节点已创建' : `「${target.nodeName ?? ''}」的安装命令`}
        </DialogTitle>
        <DialogDescription>
          在这台机器上执行下面的命令，它会下载 agent、写好 systemd 服务并启动，之后节点自己就连上来了。
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="controller-addr">控制面地址</Label>
          <Input
            id="controller-addr"
            value={addr}
            placeholder="controller.example.com:8123"
            onChange={(event) => setOverride(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            agent 回连的地址。默认是服务端的推测值；若 agent 实际要走另一个地址（内网 IP、另一个
            端口），改这里，下面的命令会跟着变，并记住供下次使用。
          </p>
        </div>

        <div className="space-y-2">
          <Label>安装命令</Label>
          {info.isPending ? (
            <p className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : info.error ? (
            <p className="rounded-md border px-3 py-6 text-center text-sm text-destructive">
              {info.error.message}
            </p>
          ) : (
            <>
              <pre className="max-h-40 overflow-auto rounded-md bg-muted px-3 py-2 text-xs">
                <code className="break-all whitespace-pre-wrap">
                  {command || '填写控制面地址后生成命令'}
                </code>
              </pre>
              <Button className="w-full" disabled={!command} onClick={copyCommand}>
                <CopyIcon />
                复制安装命令
              </Button>
            </>
          )}
        </div>

        <div className="space-y-2">
          <Label>节点密钥</Label>
          <code className="block rounded-md bg-muted px-3 py-2 text-sm break-all">
            {target.nodeKey}
          </code>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => copy(target.nodeKey, '节点密钥')}
          >
            <CopyIcon />
            只复制密钥
          </Button>
          <p className="text-xs text-muted-foreground">
            机器上已经装过 agent 的话不必重跑安装脚本，用这个密钥直接启动即可：
            <code className="ml-1 break-all">
              stander agent -a {addr || '<控制面地址>'} -k &lt;密钥&gt;
            </code>
          </p>
        </div>
      </div>
    </>
  )
}
