package cmd

import (
	"github.com/spf13/cobra"

	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/server"
)

var workerCmd = &cobra.Command{
	Use:   "worker",
	Short: "只运行后台任务（流量周期推进、转发链下发）",
	Long: `运行 stander 的单例后台任务，不提供业务 API，只暴露 /healthz 与 /readyz。

同一个数据库同时只能有一个 worker 在跑。在 Kubernetes 上把它部署成
replicas: 1 的独立 Deployment，API 那个 Deployment 用 --worker=false 启动。`,
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := config.InitConfig(configPath, cmd.Flags().Changed("config-path"))
		if err != nil {
			return err
		}
		if cmd.Flags().Changed("log-level") {
			c.Server.LogLevel = logLevel
		}
		startPprof()
		return server.RunWorker(cmd.Context(), c)
	},
}

func init() {
	rootCmd.AddCommand(workerCmd)
}
