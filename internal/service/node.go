package service

import (
	"context"
	"errors"
	"strings"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/google/uuid"
	"github.com/thoas/go-funk"
	"gorm.io/gen"
	"gorm.io/gorm"

	"github.com/lvgj-stack/stander/internal/apperr"
	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
	"github.com/lvgj-stack/stander/internal/utils"
)

func checkUserNodePermission(ctx context.Context, nodeIds ...int64) error {
	if identity.FromContext(ctx).IsSuperAdmin() {
		return nil
	}
	var availableNodeIds []int64
	if err := dal.UserRoleNodeMapping.WithContext(ctx).Select(dal.UserRoleNodeMapping.NodeID).
		Where(dal.UserRoleNodeMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
		Scan(&availableNodeIds); err != nil {
		return err
	}

	for _, id := range nodeIds {
		if !funk.ContainsInt64(availableNodeIds, id) {
			return permissionDenyError
		}
	}
	return nil
}

// What a node's status column can say.
//
// It answers one question — has this node's agent ever called home? — and
// deliberately not "is it up right now". Nothing writes the column after
// registration, so a node whose agent has since died still reads registered;
// naming the value for the event rather than for a live condition is what
// keeps the console from claiming something it cannot know. Telling
// reachability apart from this needs a heartbeat or a last-seen time, and the
// deployment has neither.
//
// These strings are a contract with the console, which maps them to 未注册 /
// 已注册; the tests on both sides assert the literals. On what the column held
// before it had any writer at all, see sql/migrate-2026-09-05-node-status.sql.
const (
	nodeStatusUnregistered = "unregistered"
	nodeStatusRegistered   = "registered"
)

// validateAddNode checks a creation request and returns the node name with the
// whitespace around it removed.
//
// The rules live here rather than in `vd:` tags on the request struct, which is
// a deliberate departure from the rest of req.Request. A tag only runs when a
// request is bound over HTTP, so a table-driven test cannot reach one without
// standing up a server — and a name of only spaces, a zero rate and an unknown
// node type are exactly the boundaries that want a table. Writing the rules in
// both places instead would let the two drift.
//
// The rate carried no tag at all: until this existed, the admin console's form
// was the only thing between a typo and a node whose traffic never counts.
func validateAddNode(r *req.AddNodeReq) (string, error) {
	name := strings.TrimSpace(r.NodeName)
	if name == "" {
		return "", apperr.Invalidf("节点名称不能为空")
	}
	switch r.NodeType {
	case "inbound", "outbound":
	default:
		return "", apperr.Invalidf("节点类型只能是 inbound 或 outbound，收到的是 %q", r.NodeType)
	}
	// Zero is not "no multiplier" but traffic that never counts, and a negative
	// one hands quota back for using the node.
	if r.Rate <= 0 {
		return "", apperr.Invalidf("流量倍率必须大于 0")
	}
	return name, nil
}

// AddNode registers a node and returns the key its agent authenticates with.
//
// Administrators only. A node is shared infrastructure, and the branch this
// replaces let a forwarding account create one and, in the same call, write
// itself the user_role_node_mappings row granting access to it — which is the
// grant 转发用户 › 资源授权 exists to hand out, and the one thing a user must
// not issue to themselves. The user portal has no button for it; that never
// made it unreachable, because both sides are served by the same API.
//
// An administrator needs no mapping row (IsSuperAdmin bypasses every
// per-resource check), so creation is now a single insert. The two writes it
// replaces had no transaction around them, so a failed second one left a node
// with no owner and a retry left another; between them sat a re-read of the
// row by key whose error was discarded and whose nil result was dereferenced
// immediately.
func AddNode(ctx context.Context, r *req.AddNodeReq) (*resp.AddNodeResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}
	name, err := validateAddNode(r)
	if err != nil {
		return nil, err
	}

	key := uuid.New().String()
	status := nodeStatusUnregistered
	if err := dal.Q.Node.WithContext(ctx).Create(&entity.Node{
		NodeName: &name,
		Key:      &key,
		NodeType: &r.NodeType,
		Rate:     r.Rate,
		Status:   &status,
		// Stored rather than only handed to the install command shown right
		// now: that command gets reopened from the node list later, and
		// nothing else records which address the agent was told to register.
		PreferIpv6: r.DefaultIPv6,
	}); err != nil {
		return nil, err
	}

	return &resp.AddNodeResp{Key: key}, nil
}

func DelNode(ctx context.Context, r *req.DelNodeReq) (*resp.DelNodeResp, error) {
	if !identity.FromContext(ctx).IsSuperAdmin() {
		nodeM, err := dal.UserRoleNodeMapping.WithContext(ctx).
			Where(dal.UserRoleNodeMapping.UserID.Eq(identity.FromContext(ctx).UserID), dal.UserRoleNodeMapping.NodeID.Eq(int32(r.ID))).
			Preload(dal.UserRoleNodeMapping.Node).First()
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, permissionDenyError
			}
			return nil, err
		}
		node := nodeM.Node
		_, err = dal.Q.Node.WithContext(ctx).Where(dal.Node.ID.Eq(node.ID)).Delete(&entity.Node{})
		if err != nil {
			return nil, err
		}
		if _, err := dal.UserRoleNodeMapping.WithContext(ctx).Where(dal.UserRoleNodeMapping.NodeID.Eq(int32(node.ID))).Delete(&entity.UserRoleNodeMapping{}); err != nil {
			return nil, err
		}
		return &resp.DelNodeResp{ID: r.ID}, nil
	}

	_, err := dal.Q.Node.WithContext(ctx).Where(dal.Node.ID.Eq(r.ID)).Delete(&entity.Node{})
	if err != nil {
		return nil, err
	}

	if _, err := dal.UserRoleNodeMapping.WithContext(ctx).Where(dal.UserRoleNodeMapping.NodeID.Eq(int32(r.ID))).Delete(&entity.UserRoleNodeMapping{}); err != nil {
		return nil, err
	}

	return &resp.DelNodeResp{ID: r.ID}, nil
}

// RegisterNode is called by an agent on start-up.
//
// clientIP is the address the registration arrived from, supplied by the
// transport layer. It is deliberately a parameter rather than a field on
// RegisterNodeReq: a bindable field would let an agent claim any address it
// likes, and the node's address is exactly what the controller later dials.
func RegisterNode(ctx context.Context, r *req.RegisterNodeReq, peerIP string) (*resp.RegisterNodeResp, error) {
	res := &resp.RegisterNodeResp{
		Chains: []*resp.ChainVO{},
		Rules:  []*resp.RuleVO{},
	}
	key := identity.FromContext(ctx).NodeKey
	node, err := dal.Q.Node.WithContext(ctx).Where(dal.Node.Key.Eq(key)).First()
	if err != nil {
		return nil, err
	}
	clientIP := r.Ipv4
	port := r.Port
	ipv4 := r.Ipv4
	ipv6 := r.Ipv6
	managerIp := r.ManagerIp

	if r.PreferIpv6 {
		clientIP = ipv6
	}

	hlog.Infof("Node: RegisterNode, ClientIP: %s, Port: %d", clientIP, port)
	if r.Port == 0 {
		port = int32(8123)
	}
	if clientIP == "" {
		clientIP = peerIP
	}

	if managerIp == "" {
		managerIp = clientIP
	}
	rules, err := dal.Rule.WithContext(ctx).Where(dal.Rule.NodeID.Eq(node.ID)).Find()
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	chains, err := dal.Chain.WithContext(ctx).Where(dal.Chain.NodeID.Eq(node.ID)).Find()
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	for _, chain := range chains {
		res.Chains = append(res.Chains, &resp.ChainVO{
			ChainType: *chain.Protocol,
			Port:      *chain.Port,
		})
	}
	for _, rule := range rules {
		ruleVo := &resp.RuleVO{
			ListenPort: *rule.ListenPort,
			RemoteAddr: *rule.RemoteAddr,
			ChainType:  *rule.Protocol,
		}
		chain, err := dal.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(*rule.ChainID)).First()
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		if chain != nil {
			ruleVo.ChainAddr = utils.GenIpAndPort(*chain.IP, *chain.Port)
		}
		res.Rules = append(res.Rules, ruleVo)
	}
	// The agent has just called home, which is the whole of what the status
	// column claims to know.
	status := nodeStatusRegistered
	_, err = dal.Q.Node.WithContext(ctx).Where(dal.Node.Key.Eq(key)).Updates(entity.Node{
		IP:        &clientIP,
		Port:      &port,
		Ipv4:      &ipv4,
		Ipv6:      &ipv6,
		ManagerIP: managerIp,
		Status:    &status,
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

func ListNode(ctx context.Context, r *req.ListNodeReq) (*resp.ListNodeResp, error) {
	if config.GetRole() == string(common.Agent) {
		return &resp.ListNodeResp{}, nil
	}

	var nodeIds []int64
	if r.Scene == "" || identity.FromContext(ctx).IsSuperAdmin() {
		if err := dal.UserRoleNodeMapping.WithContext(ctx).Select(dal.UserRoleNodeMapping.NodeID).
			Where(dal.UserRoleNodeMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
			Or(dal.UserRoleNodeMapping.RoleCode.Eq(identity.FromContext(ctx).RoleCode)).Scan(&nodeIds); err != nil {
			return nil, err
		}
	} else if r.Scene == req.AddChainScene {
		if err := dal.UserRoleNodeMapping.WithContext(ctx).Select(dal.UserRoleNodeMapping.NodeID).
			Where(dal.UserRoleNodeMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
			Scan(&nodeIds); err != nil {
			return nil, err
		}
	}

	var q []gen.Condition
	if !identity.FromContext(ctx).IsSuperAdmin() {
		q = append(q, dal.Node.ID.In(nodeIds...))
	}
	if r.NodeType != "" {
		q = append(q, dal.Node.NodeType.Eq(r.NodeType))
	}
	if r.NodeName != "" {
		q = append(q, dal.Node.NodeName.Like("%"+r.NodeName+"%"))
	}
	if r.PageSize == 0 {
		r.PageSize = 10
	}
	if r.PageNo == 0 {
		r.PageNo = 1
	}
	if r.PageNo == -1 {
		r.PageSize = 1000
	}
	nodes, cnt, err := dal.Node.WithContext(ctx).
		Where(q...).Order(dal.Node.UpdatedAt.Desc()).
		FindByPage(int((r.PageNo-1)*r.PageSize), int(r.PageSize))
	if err != nil {
		return nil, err
	}
	redactForCaller(ctx, nodes, nil, nil)

	return &resp.ListNodeResp{Nodes: nodes, TotalCount: cnt}, nil
}

func EditNode(ctx context.Context, r *req.EditNodeReq) (*resp.EditNodeResp, error) {
	if config.GetRole() == string(common.Agent) {
		return &resp.EditNodeResp{}, nil
	}

	if err := checkUserNodePermission(ctx, r.ID); err != nil {
		return nil, err
	}

	updateFields := make(map[string]any)
	if r.NodeName != "" {
		updateFields["node_name"] = r.NodeName
	}
	if r.Rate >= 0 {
		updateFields["rate"] = r.Rate
	}

	_, err := dal.Node.WithContext(ctx).Where(dal.Node.ID.Eq(r.ID)).Updates(updateFields)
	if err != nil {
		return nil, err
	}
	return &resp.EditNodeResp{}, nil
}

func ListNodeChainRelationShips(ctx context.Context, r *req.ListNodeChainRelationShipsReq) (*resp.ListNodeChainRelationShipsResp, error) {

	node, err := dal.Node.WithContext(ctx).Where(dal.Node.ID.Eq(r.NodeId)).First()
	if err != nil {
		return nil, err
	}
	if node.Iepl != 0 {
		return &resp.ListNodeChainRelationShipsResp{}, err
	}

	var availableChainIds []int64
	if err := dal.UserRoleChainMapping.WithContext(ctx).Select(dal.UserRoleChainMapping.ChainID).
		Where(dal.UserRoleChainMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
		Or(dal.UserRoleChainMapping.RoleCode.Eq(identity.FromContext(ctx).RoleCode)).Scan(&availableChainIds); err != nil {
		return nil, err
	}

	var nodeAvailableChainIds []int64
	if err := dal.NodeChainMapping.WithContext(ctx).Select(dal.NodeChainMapping.ChainID).Where(
		dal.NodeChainMapping.NodeID.Eq(r.NodeId)).Scan(&nodeAvailableChainIds); err != nil {
		return nil, err
	}

	var userSelfChainIds []int64
	if err := dal.UserRoleChainMapping.WithContext(ctx).Select(dal.UserRoleChainMapping.ChainID).
		Where(dal.UserRoleChainMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
		Scan(&userSelfChainIds); err != nil {
		return nil, err
	}

	chains, err := dal.Chain.WithContext(ctx).Where(dal.Chain.ID.In(availableChainIds...),
		dal.Chain.ID.In(nodeAvailableChainIds...)).
		Or(dal.Chain.ID.In(userSelfChainIds...)).Find()
	if err != nil {
		return nil, err
	}
	redactForCaller(ctx, nil, chains, nil)

	return &resp.ListNodeChainRelationShipsResp{
		Chains: chains,
	}, nil
}

func GetNodePermissions(ctx context.Context, r *req.EmptyReq) ([]int64, error) {
	var availableNodeIds []int64
	if identity.FromContext(ctx).IsSuperAdmin() {
		if err := dal.Node.WithContext(ctx).Select(dal.Node.ID).Scan(&availableNodeIds); err != nil {
			return nil, err
		}
	} else {
		if err := dal.UserRoleNodeMapping.WithContext(ctx).Select(dal.UserRoleNodeMapping.NodeID).
			Where(dal.UserRoleNodeMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
			Scan(&availableNodeIds); err != nil {
			return nil, err
		}
	}
	return availableNodeIds, nil
}
