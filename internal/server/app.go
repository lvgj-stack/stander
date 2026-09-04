package server

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/cloudwego/hertz/pkg/common/hlog"

	"github.com/lvgj-stack/stander/api"
	"github.com/lvgj-stack/stander/internal/client"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/db"
	"github.com/lvgj-stack/stander/internal/forward/manager"
	"github.com/lvgj-stack/stander/internal/service"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
	"github.com/lvgj-stack/stander/internal/utils"
)

// RunServer starts the controller and the admin console in a single process on a
// single port. Admin routes live at the root, controller routes under /api/v1.
func RunServer(c *config.Config) error {
	if err := db.Init(c.Database); err != nil {
		return err
	}
	utils.SetJWTSigningKey(c.Admin.JWTSigningKey)

	if c.EnableRelay {
		go func() {
			mgr, err := manager.Init()
			if err != nil {
				hlog.Errorf("relay manager init failed: %v", err)
				return
			}
			defer mgr.Shutdown()
		}()
	}

	service.Setup(context.Background())

	h := newHertz(c)
	api.RegisterAdmin(h)
	api.RegisterController(h)
	h.Spin()
	return nil
}

// RunAgent registers this node with the controller, then serves the agent routes.
func RunAgent(c *config.Config) error {
	r := &req.RegisterNodeReq{}
	r.Port = 8123
	r.Ipv4 = utils.GetOutBoundIPv4()
	if utils.IsPrivateIP(r.Ipv4) {
		r.Ipv4 = utils.GetOutBoundIPv4V2()
	}
	r.Ipv6 = utils.GetOutBoundIPv6()
	r.IP = r.Ipv4
	r.PreferIpv6 = c.Agent.PreferIpv6

	if c.Agent.Port != 0 {
		r.Port = c.Agent.Port
	}
	if c.Agent.IP != "" {
		r.IP = c.Agent.IP
		r.Ipv4 = c.Agent.IP
	}
	if c.Agent.IPv6 != "" {
		r.Ipv6 = c.Agent.IPv6
	}
	if r.PreferIpv6 {
		r.IP = r.Ipv6
	}

	r.ManagerIp = r.IP
	if c.Agent.ManagerIp != "" {
		r.ManagerIp = c.Agent.ManagerIp
	}

	client.Init()
	res, err := client.DoRequest(c.Agent.ControllerAddr, "node", "RegisterNode", c.Agent.NodeKey, r)
	if err != nil {
		return fmt.Errorf("register node: %w", err)
	}
	hlog.Infof("response: %s", res)

	initInfo := resp.RawResponse[resp.RegisterNodeResp]{}
	if err := json.Unmarshal([]byte(res.(string)), &initInfo); err != nil {
		return fmt.Errorf("decode register response: %w", err)
	}
	manager.InitAgent(&initInfo.Result)

	h := newHertz(c)
	api.RegisterAgent(h)
	h.Spin()
	return nil
}
