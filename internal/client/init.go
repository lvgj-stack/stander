package client

import (
	"context"

	"github.com/lvgj-stack/stander/internal/config"
)

func Init() {
	if config.GetAgentConfig().EnableGost {
		InitGostCli(context.Background())
	}
}
