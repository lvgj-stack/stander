package main

// tzdata is embedded in the binary because the runtime image is distroless and
// carries no zoneinfo. Without it time.LoadLocation("Asia/Shanghai") fails and
// timestamps silently fall back to UTC.
import (
	_ "time/tzdata"

	"github.com/lvgj-stack/stander/cmd"
)

func main() {
	cmd.Execute()
}
