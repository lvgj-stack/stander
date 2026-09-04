// Package cmd wires the stander binary's subcommands. A single binary serves
// three entrypoints: the server (controller + admin console), a forwarding
// agent, and the gorm-gen code generator.
package cmd

import (
	"log"
	"net/http"
	_ "net/http/pprof" // registers /debug/pprof on the default mux
	"os"

	"github.com/spf13/cobra"
)

var (
	configPath string
	logLevel   int
	pprofAddr  string
)

var rootCmd = &cobra.Command{
	Use:   "stander",
	Short: "Stander 转发控制面与管理后台",
	Long: `Stander 是一个端口转发系统。

同一个二进制通过子命令决定入口：
  stander server   控制面 + 管理后台（同进程、单端口）
  stander agent    部署在转发节点上的 agent
  stander gen      从数据库生成 gorm-gen 代码`,
	SilenceUsage: true,
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&configPath, "config-path", "c", "stander.yaml", "配置文件路径")
	rootCmd.PersistentFlags().IntVar(&logLevel, "log-level", 2, "日志级别 (0=trace 1=debug 2=info 3=notice 4=warn 5=error)")
	rootCmd.PersistentFlags().StringVar(&pprofAddr, "pprof-addr", ":48123", "pprof 监听地址，置空则不启动")
}

// startPprof serves net/http/pprof on its own port, as the pre-merge binary did.
func startPprof() {
	if pprofAddr == "" {
		return
	}
	go func() {
		if err := http.ListenAndServe(pprofAddr, nil); err != nil {
			log.Printf("pprof listener stopped: %v", err)
		}
	}()
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
