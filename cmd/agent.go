package cmd

import (
	"errors"
	"strconv"

	"github.com/spf13/cobra"

	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/server"
)

var (
	controllerAddr string
	nodeKey        string
	agentIP        string
	agentIPv6      string
	managerIP      string
	listenIP       string
	agentPort      int32
	preferIpv6     bool
	enableUdp      bool
	enableGost     bool
)

var agentCmd = &cobra.Command{
	Use:   "agent",
	Short: "启动转发节点 agent",
	RunE: func(cmd *cobra.Command, args []string) error {
		if controllerAddr == "" {
			return errors.New("--controller-addr 不能为空")
		}
		if nodeKey == "" {
			return errors.New("--node-key 不能为空")
		}

		c := &config.Config{
			Server: &config.Server{
				NodeRole: string(common.Agent),
				Port:     strconv.Itoa(int(agentPort)),
				LogLevel: logLevel,
			},
			Agent: &config.Agent{
				ControllerAddr: controllerAddr,
				NodeKey:        nodeKey,
				IP:             agentIP,
				IPv6:           agentIPv6,
				ManagerIp:      managerIP,
				ListenIp:       listenIP,
				Port:           agentPort,
				PreferIpv6:     preferIpv6,
				EnableUdp:      enableUdp,
				EnableGost:     enableGost,
			},
		}
		config.SetConfig(c)
		startPprof()
		return server.RunAgent(c)
	},
}

func init() {
	f := agentCmd.Flags()
	f.StringVarP(&controllerAddr, "controller-addr", "a", "", "控制面地址 ip:port")
	f.StringVarP(&nodeKey, "node-key", "k", "", "节点密钥")
	f.StringVar(&agentIP, "ip", "", "对外 IPv4")
	f.StringVar(&agentIPv6, "ipv6", "", "对外 IPv6")
	f.StringVar(&managerIP, "manager-ip", "", "控制节点下发规则的 ip")
	f.StringVar(&listenIP, "listen-ip", "", "监听 ip")
	f.Int32VarP(&agentPort, "port", "p", 18123, "http 端口")
	f.BoolVar(&preferIpv6, "prefer-ipv6", false, "优先使用 IPv6")
	f.BoolVar(&enableUdp, "enable-udp", true, "开启 udp 转发")
	f.BoolVar(&enableGost, "enable-gost", false, "开启 gost")
	rootCmd.AddCommand(agentCmd)
}
