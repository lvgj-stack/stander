package cmd

import (
	"github.com/spf13/cobra"

	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/server"
)

var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "启动控制面 + 管理后台（同进程、单端口）",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := config.InitConfig(configPath)
		if err != nil {
			return err
		}
		if cmd.Flags().Changed("log-level") {
			c.Server.LogLevel = logLevel
		}
		startPprof()
		return server.RunServer(c)
	},
}

func init() {
	rootCmd.AddCommand(serverCmd)
}
