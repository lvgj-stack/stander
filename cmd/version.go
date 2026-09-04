package cmd

import (
	"fmt"
	"runtime"

	"github.com/spf13/cobra"
)

// Injected at build time with -ldflags "-X github.com/lvgj-stack/stander/cmd.version=..."
var (
	version = "dev"
	commit  = "unknown"
)

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "打印版本信息",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("stander %s (commit %s, %s, %s/%s)\n",
			version, commit, runtime.Version(), runtime.GOOS, runtime.GOARCH)
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}
