package service

import (
	"context"
	"errors"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/google/uuid"
	"github.com/thoas/go-funk"
	"gorm.io/gen"
	"gorm.io/gorm"

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

func AddNode(ctx context.Context, r *req.AddNodeReq) (*resp.AddNodeResp, error) {
	uid := uuid.New().String()
	if !identity.FromContext(ctx).IsSuperAdmin() {
		if err := dal.Q.Node.WithContext(ctx).Create(&entity.Node{
			NodeName: &r.NodeName,
			Key:      &uid,
			NodeType: &r.NodeType,
			Rate:     r.Rate,
		}); err != nil {
			return nil, err
		}
		node, _ := dal.Node.WithContext(ctx).Where(dal.Node.Key.Eq(uid)).First()
		userId := identity.FromContext(ctx).UserID
		if err := dal.UserRoleNodeMapping.WithContext(ctx).Create(&entity.UserRoleNodeMapping{
			UserID: &userId,
			NodeID: int32(node.ID),
		}); err != nil {
			return nil, err
		}
	} else {
		if err := dal.Q.Node.WithContext(ctx).Create(&entity.Node{
			NodeName: &r.NodeName,
			Key:      &uid,
			NodeType: &r.NodeType,
			Rate:     r.Rate,
		}); err != nil {
			return nil, err
		}
		node, _ := dal.Node.WithContext(ctx).Where(dal.Node.Key.Eq(uid)).First()
		roleCode := identity.FromContext(ctx).RoleCode
		if err := dal.UserRoleNodeMapping.WithContext(ctx).Create(&entity.UserRoleNodeMapping{
			RoleCode: &roleCode,
			NodeID:   int32(node.ID),
		}); err != nil {
			return nil, err
		}
	}

	return &resp.AddNodeResp{Key: uid}, nil
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
	_, err = dal.Q.Node.WithContext(ctx).Where(dal.Node.Key.Eq(key)).Updates(entity.Node{
		IP:        &clientIP,
		Port:      &port,
		Ipv4:      &ipv4,
		Ipv6:      &ipv6,
		ManagerIP: managerIp,
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
