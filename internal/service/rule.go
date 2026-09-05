package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"gorm.io/gen"
	"gorm.io/gorm"

	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/client"
	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/forward/manager"
	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	req2 "github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
	"github.com/lvgj-stack/stander/internal/utils"
)

func TestRule(ctx context.Context, req *req2.TestRuleReq) (*resp.TestRuleResp, error) {
	if config.GetRole() == string(common.Agent) {
		ping, err := utils.HandleTcpping(req.Destination)
		if err != nil {
			return nil, err
		}
		return &resp.TestRuleResp{Ping: ping}, nil
	}

	res := &resp.TestRuleResp{}

	if err := checkRuleOwnership(ctx, req.ID); err != nil {
		return nil, err
	}

	rule, err := dal.Rule.WithContext(ctx).Where(dal.Rule.ID.Eq(req.ID)).Preload(dal.Rule.Chain, dal.Rule.Node).First()
	if err != nil {
		return nil, err
	}

	node := rule.Node
	// inbound ping chain
	if rule.Chain.IP != nil {
		chainInAddr := utils.GenIpAndPort(*rule.Chain.IP, *rule.Chain.Port)
		res.InboundName = *rule.Node.NodeName
		res.InboundTo = chainInAddr
		req.Destination = chainInAddr
		res1, err := client.DoRequest(fmt.Sprintf("%s:%d", node.ManagerIP, *node.Port), "rule", "TestRule", *node.Key, req)
		if err != nil {
			return nil, err
		}
		r := resp.RawResponse[resp.TestRuleResp]{}
		if err := json.Unmarshal([]byte(res1.(string)), &r); err != nil {
			return nil, err
		}
		if r.Error != nil {
			return nil, r.Error
		}
		res.InboundPing = r.Result.Ping

		chainNode, err := dal.Node.WithContext(ctx).Where(dal.Node.ID.Eq(rule.Chain.NodeID)).First()
		if err != nil {
			return nil, err
		}
		// chain ping destination
		destinationAddr := *rule.RemoteAddr
		req.Destination = destinationAddr
		res2, err := client.DoRequest(fmt.Sprintf("%s:%d", chainNode.ManagerIP, *chainNode.Port), "rule", "TestRule", *chainNode.Key, req)
		if err != nil {
			return nil, err
		}
		r2 := resp.RawResponse[resp.TestRuleResp]{}
		if err := json.Unmarshal([]byte(res2.(string)), &r2); err != nil {
			return nil, err
		}
		if r2.Error != nil {
			return nil, r2.Error
		}
		res.OutboundName = *chainNode.NodeName
		res.OutboundTo = destinationAddr
		res.OutboundPing = r2.Result.Ping
	} else {
		destinationAddr := *rule.RemoteAddr
		res.OutboundName = *rule.Node.NodeName
		res.OutboundTo = destinationAddr
		req.Destination = destinationAddr
		res1, err := client.DoRequest(fmt.Sprintf("%s:%d", node.ManagerIP, *node.Port), "rule", "TestRule", *node.Key, req)
		if err != nil {
			return nil, err
		}
		r := resp.RawResponse[resp.TestRuleResp]{}
		if err := json.Unmarshal([]byte(res1.(string)), &r); err != nil {
			return nil, err
		}
		if r.Error != nil {
			return nil, r.Error
		}
		res.OutboundPing = r.Result.Ping
	}
	return res, nil
}

func AddRule(ctx context.Context, req *req2.AddRuleReq) (*resp.AddRuleResp, error) {
	if req.ChainType == "" {
		req.ChainType = string(common.TCPConnector)
	}

	if config.GetRole() == string(common.Agent) {
		if err := manager.AddRule(config.GetAgentConfig().ListenIp+":"+strconv.Itoa(int(req.ListenPort)), req.ChainAddr, req.RemoteAddr, common.ConnectorType(req.ChainType)); err != nil {
			hlog.Errorf("add rule failed, err: %s", err.Error())
			return nil, err
		}
		return &resp.AddRuleResp{}, nil
	}
	uid := identity.FromContext(ctx).UserID

	// The rule form only offers nodes and chains the caller holds, but the
	// form is not the boundary — these ids arrive in a request body.
	if err := checkUserNodePermission(ctx, req.NodeId); err != nil {
		return nil, err
	}
	if req.ChainId != 0 {
		if err := checkUserChainPermission(ctx, req.ChainId); err != nil {
			return nil, err
		}
	}

	chain, err := dal.Q.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(req.ChainId)).First()
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	if chain != nil {
		req.ChainAddr = utils.GenIpAndPort(*chain.IP, *chain.Port)
	}
	hlog.Infof("add direct forward, listen port: %d, raddr: %s", req.ListenPort, req.RemoteAddr)
	node, err := dal.Q.Node.WithContext(ctx).Where(dal.Node.ID.Eq(req.NodeId)).First()
	if err != nil {
		return nil, err
	}
	// The admin console offers un-registered nodes in the rule form too, and a
	// node has no port or key until its agent registers. Guard rather than
	// dereference a nil pointer into a 500.
	if node.Port == nil || node.Key == nil {
		return nil, apperr.FailedPreconditionf("节点还没有注册，agent 尚未连上控制面")
	}
	_, err = client.DoRequest(fmt.Sprintf("%s:%d", node.ManagerIP, *node.Port), "rule", "AddRule", *node.Key, req)
	if err != nil {
		return nil, err
	}
	if err := dal.Q.Rule.WithContext(ctx).Create(&entity.Rule{
		RuleName:   &req.RuleName,
		ListenPort: &req.ListenPort,
		RemoteAddr: &req.RemoteAddr,
		NodeID:     &req.NodeId,
		ChainID:    &req.ChainId,
		Protocol:   &req.ChainType,
		UserID:     &uid,
	}); err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			return nil, apperr.Conflictf("该端口上已经有转发规则了")
		}
		return nil, err
	}
	return &resp.AddRuleResp{}, nil
}

func DelRule(ctx context.Context, req *req2.DelRuleReq) (*resp.DelRuleResp, error) {

	if config.GetRole() == string(common.Agent) {
		hlog.Infof("del rule, port: %d", req.Port)
		if err := manager.DelPort(req.Port, manager.ServicePortType); err != nil {
			return nil, err
		}
		return &resp.DelRuleResp{}, nil
	}

	if err := checkRuleOwnership(ctx, req.ID); err != nil {
		return nil, err
	}

	rule, err := dal.Rule.WithContext(ctx).Where(dal.Rule.ID.Eq(req.ID)).First()
	if err != nil {
		return nil, err
	}

	node, err := dal.Q.Node.WithContext(ctx).Where(dal.Node.ID.Eq(*rule.NodeID)).First()
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if _, err := dal.Q.Rule.WithContext(ctx).Where(dal.Rule.ID.Eq(req.ID)).Delete(&entity.Rule{}); err != nil {
				return nil, err
			}
			return &resp.DelRuleResp{RuleId: req.ID}, nil
		}
		return nil, err
	}
	req.Port = *rule.ListenPort
	_, err = client.DoRequest(fmt.Sprintf("%s:%d", node.ManagerIP, *node.Port), "rule", "DeleteRule", *node.Key, req)
	if err != nil {
		if strings.Contains(err.Error(), "connection refused") {
			hlog.Infof("del rule failed, err: %s", err.Error())
		} else {
			return nil, err
		}
	}
	if _, err := dal.Q.Rule.WithContext(ctx).Where(dal.Rule.ID.Eq(req.ID)).Delete(&entity.Rule{}); err != nil {
		return nil, err
	}
	return &resp.DelRuleResp{RuleId: req.ID}, nil
}

func ListRule(ctx context.Context, req *req2.ListRuleReq) (*resp.ListRuleResp, error) {

	if config.GetRole() == string(common.Agent) {
		return &resp.ListRuleResp{}, nil
	}
	uid := identity.FromContext(ctx).UserID

	var q []gen.Condition
	if !identity.FromContext(ctx).IsSuperAdmin() {
		q = append(q, dal.Rule.UserID.Eq(uid))
	}
	if req.RuleName != "" {
		q = append(q, dal.Rule.RuleName.Like(fmt.Sprintf("%%%s%%", req.RuleName)))
	}
	if req.PageSize == 0 {
		req.PageSize = 10
	}
	if req.PageNo == 0 {
		req.PageNo = 1
	}
	if req.PageNo == -1 {
		req.PageSize = 1000
	}
	od := dal.Rule.UpdatedAt.Desc()
	if req.Asc {
		od = dal.Rule.UpdatedAt.Asc()
	}
	if req.OrderBy != "" {
		name, ok := dal.Rule.GetFieldByName(req.OrderBy)
		if ok {
			od = name.Desc()
			if req.Asc {
				od = name.Asc()
			}
		}
	}
	rules, cnt, err := dal.Rule.WithContext(ctx).Where(q...).
		Preload(dal.Rule.Node, dal.Rule.Chain).
		Order(od).
		FindByPage(int((req.PageNo-1)*req.PageSize), int(req.PageSize))
	if err != nil {
		return nil, err
	}
	// The preloaded node and chain carry their keys.
	redactForCaller(ctx, nil, nil, rules)

	return &resp.ListRuleResp{Rules: rules, TotalCount: cnt}, nil
}

func ModifyRule(ctx context.Context, req *req2.ModifyRuleReq) (*resp.ModifyRuleResp, error) {

	var needCallAgent bool

	if config.GetRole() == string(common.Agent) {
		if err := manager.DelPort(req.OldListenPort, manager.ServicePortType); err != nil {
			hlog.Errorf("del rule failed, port: %d, err: %s", req.OldListenPort, err.Error())
		}
		if err := manager.AddRule(config.GetAgentConfig().ListenIp+":"+strconv.Itoa(int(req.ListenPort)), req.ChainAddr, req.RemoteAddr, common.ConnectorType(req.ChainType)); err != nil {
			return nil, err
		}
		return &resp.ModifyRuleResp{}, nil
	}

	if err := checkRuleOwnership(ctx, req.ID); err != nil {
		return nil, err
	}

	rule, err := dal.Rule.WithContext(ctx).Where(dal.Rule.ID.Eq(req.ID)).Preload(dal.Rule.Node, dal.Rule.Chain).First()
	if err != nil {
		return nil, err
	}
	node := rule.Node
	originChain := rule.Chain

	// A user may move their rule onto another chain, but only one they hold.
	if req.ChainId != 0 && req.ChainId != originChain.ID {
		if err := checkUserChainPermission(ctx, req.ChainId); err != nil {
			return nil, err
		}
	}

	updateRule := entity.Rule{}
	agentModifyReq := req2.ModifyRuleReq{
		ListenPort:    *rule.ListenPort,
		OldListenPort: *rule.ListenPort,
		RemoteAddr:    *rule.RemoteAddr,
		ChainType:     *rule.Protocol,
	}

	if originChain.IP != nil && originChain.Port != nil {
		agentModifyReq.ChainAddr = utils.GenIpAndPort(*originChain.IP, *originChain.Port)
	}

	if req.ChainId != 0 && req.ChainId != originChain.ID {
		needCallAgent = true
		chain, err := dal.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(req.ChainId)).First()
		if err != nil {
			return nil, err
		}
		agentModifyReq.ChainAddr = utils.GenIpAndPort(*chain.IP, *chain.Port)
		agentModifyReq.ChainType = *chain.Protocol
		updateRule.ChainID = &req.ChainId
	}
	if req.ListenPort != 0 && req.ListenPort != *rule.ListenPort {
		needCallAgent = true
		agentModifyReq.ListenPort = req.ListenPort
		updateRule.ListenPort = &req.ListenPort
	}

	if req.RuleName != "" {
		updateRule.RuleName = &req.RuleName
	}
	if req.RemoteAddr != "" && req.RemoteAddr != *rule.RemoteAddr {
		needCallAgent = true
		agentModifyReq.RemoteAddr = req.RemoteAddr
		updateRule.RemoteAddr = &req.RemoteAddr
	}

	if needCallAgent {
		_, err = client.DoRequest(utils.GenIpAndPort(node.ManagerIP, *node.Port), "rule", "ModifyRule", *node.Key, agentModifyReq)
		if err != nil {
			return nil, err
		}
	}
	_, err = dal.Rule.WithContext(ctx).Where(dal.Rule.ID.Eq(req.ID)).Updates(updateRule)
	if err != nil {
		return nil, err
	}

	return &resp.ModifyRuleResp{}, nil
}

// ModifyRules rewrites the destination host of several rules at once.
//
// Scoped like every other rule action: a non-admin's selection is intersected
// with the rules they own, so ids they do not hold are silently dropped rather
// than repointed. Without that, one request repoints an arbitrary set of other
// tenants' forwards at a host of the caller's choosing.
func ModifyRules(ctx context.Context, req *req2.ModifyRulesReq) (*resp.EmptyResp, error) {
	q := []gen.Condition{dal.Rule.ID.In(req.RuleIDs...)}
	if !identity.FromContext(ctx).IsSuperAdmin() {
		q = append(q, dal.Rule.UserID.Eq(identity.FromContext(ctx).UserID))
	}

	rules, err := dal.Rule.WithContext(ctx).Where(q...).Preload(dal.Rule.Node, dal.Rule.Chain).Find()
	if err != nil {
		return nil, err
	}

	for _, rule := range rules {
		node := rule.Node
		updateRule := entity.Rule{}
		agentModifyReq := req2.ModifyRuleReq{
			ListenPort:    *rule.ListenPort,
			OldListenPort: *rule.ListenPort,
			RemoteAddr:    *rule.RemoteAddr,
			ChainType:     *rule.Protocol,
		}

		if req.RemoteIp != "" {
			ss := strings.Split(agentModifyReq.RemoteAddr, ":")
			agentModifyReq.RemoteAddr = fmt.Sprintf("%s:%s", req.RemoteIp, ss[1])
			updateRule.RemoteAddr = &agentModifyReq.RemoteAddr
		}

		_, err = client.DoRequest(utils.GenIpAndPort(node.ManagerIP, *node.Port), "rule", "ModifyRule", *node.Key, agentModifyReq)
		if err != nil {
			return nil, err
		}
		_, err = dal.Rule.WithContext(ctx).Where(dal.Rule.ID.Eq(rule.ID)).Updates(updateRule)
		if err != nil {
			return nil, err
		}
	}

	return &resp.EmptyResp{}, nil
}
