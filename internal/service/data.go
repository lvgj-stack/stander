package service

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"gorm.io/gorm/clause"

	"github.com/lvgj-stack/stander/internal/client"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

var nodeTrafficMap = sync.Map{}

func ObserverNetworkTraffic(ctx context.Context, r *req.ObserverNetworkTrafficReq) (*resp.ReportNetworkTrafficResp, error) {
	hlog.Infof("[ObserverNetworkTraffic] req: %v", r)

	cfg := config.GetAgentConfig()
	for _, event := range r.Events {
		if strings.Contains(event.Service, "udp") ||
			strings.Contains(event.Service, "chain") {
			continue
		}
		//var preTraffic int64
		//v, ok := nodeTrafficMap.Load(event.Service)
		//if ok {
		//	preTraffic = v.(int64)
		//}
		ss := strings.Split(event.Service, "-")
		port, _ := strconv.Atoi(ss[len(ss)-1])
		_, err := client.DoRequest(cfg.ControllerAddr, "data", "ReportNetworkTraffic", cfg.NodeKey, &req.ReportNetworkTrafficReq{
			Port:    int32(port),
			Traffic: event.Stats.InputBytes + event.Stats.OutputBytes,
		})
		if err != nil {
			hlog.Errorf("[ObserverNetworkTraffic] ReportNetworkTraffic err: %v", err)
			return nil, err
		}
		//nodeTrafficMap.Store(event.Service, event.Stats.InputBytes+event.Stats.OutputBytes)
	}
	return &resp.ReportNetworkTrafficResp{}, nil
}

func ReportNetworkTraffic(ctx context.Context, r *req.ReportNetworkTrafficReq) (*resp.ReportNetworkTrafficResp, error) {
	k := identity.FromContext(ctx).NodeKey
	if k == "" {
		return nil, errors.New("header key not found")
	}
	node, err := dal.Node.WithContext(ctx).Where(dal.Node.Key.Eq(k)).First()
	if err != nil {
		return nil, err
	}

	rate := node.Rate
	var (
		rule *entity.Rule
	)
	rule, err = dal.Rule.WithContext(ctx).
		Where(dal.Rule.NodeID.Eq(node.ID), dal.Rule.ListenPort.Eq(r.Port)).
		First()
	if err != nil {
		return nil, err
	}

	if *rule.ChainID != 0 {
		chain, err := dal.Chain.WithContext(ctx).Preload(dal.Chain.Node).Where(dal.Chain.ID.Eq(*rule.ChainID)).First()
		if err != nil {
			return nil, err
		}
		rate += chain.Node.Rate
	}
	addTraffic := int64(float32(r.Traffic) * rate)
	hlog.Infof("report traffic, ruleName: %s, rate: %.2f, addtraffic: %d", *rule.RuleName, rate, addTraffic)
	_, err = dal.Rule.WithContext(ctx).
		Where(dal.Rule.NodeID.Eq(node.ID), dal.Rule.ListenPort.Eq(r.Port)).
		UpdateColumn(dal.Rule.Traffic, dal.Rule.Traffic.Add(addTraffic))
	if err != nil {
		return nil, err
	}

	today, _ := time.Parse(time.DateOnly, time.Now().Format(time.DateOnly))
	if err := dal.UserDailyTraffic.WithContext(ctx).Clauses(
		clause.OnConflict{
			DoUpdates: clause.Assignments(map[string]interface{}{"total_traffic": dal.UserDailyTraffic.TotalTraffic.Add(addTraffic)}),
		},
	).Create(&entity.UserDailyTraffic{
		Date:         today,
		TotalTraffic: r.Traffic,
		UserID:       *rule.UserID,
	}); err != nil {
		return nil, err
	}
	return &resp.ReportNetworkTrafficResp{}, nil
}
