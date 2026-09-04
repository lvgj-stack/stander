package cmd

import (
	"github.com/spf13/cobra"

	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/server"
)

var withWorker bool

var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "启动控制面 + 管理后台（同进程、单端口）",
	Long: `启动 HTTP API：管理后台挂在根路径，控制面挂在 /api/v1。

默认在同进程内跑后台任务，适合单机部署。扩到多副本时必须加 --worker=false，
再单独部署一个 stander worker，否则每个副本都会重复推进用户流量周期。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := config.InitConfig(configPath, cmd.Flags().Changed("config-path"))
		if err != nil {
			return err
		}
		if cmd.Flags().Changed("log-level") {
			c.Server.LogLevel = logLevel
		}
		startPprof()
		return server.RunServer(cmd.Context(), c, withWorker)
	},
}

func init() {
	serverCmd.Flags().BoolVar(&withWorker, "worker", true,
		"在同进程内运行后台任务；API 多副本时必须设为 false")
	rootCmd.AddCommand(serverCmd)
}
