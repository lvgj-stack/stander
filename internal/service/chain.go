package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/cloudwego/hertz/pkg/common/hlog"
	"github.com/thoas/go-funk"
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
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

var permissionDenyError = apperr.Forbiddenf("没有权限操作该资源")

func checkUserChainPermission(ctx context.Context, chainIds ...int64) error {
	if identity.FromContext(ctx).IsSuperAdmin() {
		return nil
	}
	var availableChainIds []int64
	if err := dal.UserRoleChainMapping.WithContext(ctx).Select(dal.UserRoleChainMapping.ChainID).
		Where(dal.UserRoleChainMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
		Scan(&availableChainIds); err != nil {
		return permissionDenyError
	}

	for _, id := range chainIds {
		if !funk.ContainsInt64(availableChainIds, id) {
			return permissionDenyError
		}
	}

	return nil
}

func AddChain(ctx context.Context, r *req.AddChainReq) (*resp.AddChainResp, error) {
	if r.ChainType == "" {
		r.ChainType = string(common.TCPConnector)
	}
	if config.GetRole() == common.Agent.String() {
		if err := manager.AddChain(r.Port, common.ConnectorType(r.ChainType)); err != nil {
			hlog.Errorf("add chain failed, err: %s", err.Error())
			return nil, err
		}
		return &resp.AddChainResp{}, nil
	}
	if err := checkUserNodePermission(ctx, r.NodeId); err != nil {
		return nil, err
	}
	node, err := dal.Q.Node.WithContext(ctx).Where(dal.Node.ID.Eq(r.NodeId)).First()
	if err != nil {
		return nil, err
	}

	// A node only has an IP, port and key once its agent has registered. The
	// admin console lists un-registered nodes in the "add chain" picker too, so
	// guard here rather than dereferencing a nil pointer into a 500.
	if node.IP == nil || node.Port == nil || node.Key == nil {
		return nil, apperr.FailedPreconditionf("节点还没有注册，agent 尚未连上控制面")
	}
	if r.PreferIpv6 && node.Ipv6 == nil {
		return nil, apperr.FailedPreconditionf("该节点没有 IPv6 地址")
	}

	chainIp := *node.IP
	if r.PreferIpv6 {
		chainIp = *node.Ipv6
	}

	_, err = dal.Chain.WithContext(ctx).Where(
		dal.Chain.Port.Eq(r.Port),
		dal.Chain.NodeID.Eq(r.NodeId),
		dal.Chain.IP.Eq(chainIp)).First()
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apperr.Conflictf("该端口上已经有链路了")
	}
	cnt, err := dal.Q.Chain.WithContext(ctx).Where(dal.Chain.NodeID.Eq(node.ID), dal.Chain.Port.Eq(r.Port)).Count()
	if err != nil {
		return nil, err
	}
	if cnt == 0 {
		_, err = client.DoRequest(fmt.Sprintf("%s:%d", node.ManagerIP, *node.Port), "chain", "AddChain", *node.Key, r)
		if err != nil {
			return nil, err
		}
	}

	if err := dal.Q.Chain.WithContext(ctx).Create(&entity.Chain{
		ChainName: &r.Name,
		Port:      &r.Port,
		IP:        &chainIp,
		NodeID:    r.NodeId,
		Protocol:  &r.ChainType,
	}); err != nil {
		if strings.Contains(err.Error(), "Duplicate entry") {
			return nil, apperr.Conflictf("链路已存在")
		}
		return nil, err
	}
	chain, _ := dal.Chain.WithContext(ctx).Where(dal.Chain.NodeID.Eq(r.NodeId), dal.Chain.Port.Eq(r.Port), dal.Chain.IP.Eq(chainIp)).First()
	userId := identity.FromContext(ctx).UserID
	if err := dal.UserRoleChainMapping.WithContext(ctx).Create(&entity.UserRoleChainMapping{
		UserID:  &userId,
		ChainID: int32(chain.ID),
	}); err != nil {
		return nil, err
	}

	return &resp.AddChainResp{}, nil
}

func DelChain(ctx context.Context, r *req.DelChainReq) (*resp.DelChainResp, error) {
	if config.GetRole() == common.Agent.String() {
		if err := manager.DelPort(r.Port, manager.ChainPortType); err != nil {
			hlog.Errorf("delete port failed, err: %s", err.Error())
			return nil, err
		}
		return &resp.DelChainResp{}, nil
	}
	if !identity.FromContext(ctx).IsSuperAdmin() {
		chainM, err := dal.UserRoleChainMapping.WithContext(ctx).
			Where(dal.UserRoleChainMapping.UserID.Eq(identity.FromContext(ctx).UserID), dal.UserRoleChainMapping.ChainID.Eq(int32(r.ID))).
			Preload(dal.UserRoleChainMapping.Chain).First()
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, permissionDenyError
			}
			return nil, err
		}
		chain := chainM.Chain
		cnt, err := dal.Q.Chain.WithContext(ctx).Where(dal.Chain.NodeID.Eq(chain.NodeID), dal.Chain.Port.Eq(*chain.Port)).Count()
		if err != nil {
			return nil, err
		}
		node, _ := dal.Node.WithContext(ctx).Where(dal.Node.ID.Eq(chain.NodeID)).First()
		// may ipv4 ipv6 all use one port, so only count == 1, delete port
		if cnt == 1 {
			r.Port = *chain.Port
			_, err = client.DoRequest(fmt.Sprintf("%s:%d", node.ManagerIP, *node.Port), "chain", "DeleteChain", *node.Key, r)
			if err != nil {
				return nil, err
			}
		} else {
			return nil, permissionDenyError
		}
		_, err = dal.Q.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(r.ID)).Delete(&entity.Chain{})
		if err != nil {
			return nil, err
		}
		if _, err := dal.UserRoleChainMapping.WithContext(ctx).Where(dal.UserRoleChainMapping.UserID.Eq(identity.FromContext(ctx).UserID), dal.UserRoleChainMapping.ChainID.Eq(int32(r.ID))).Delete(&entity.UserRoleChainMapping{}); err != nil {
			return nil, err
		}
		return &resp.DelChainResp{ChainId: int64(chainM.ChainID)}, nil
	}
	chain, err := dal.Q.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(r.ID)).Preload(dal.Chain.Node).First()
	if err != nil {
		return nil, err
	}
	cnt, err := dal.Q.Chain.WithContext(ctx).Where(dal.Chain.NodeID.Eq(chain.NodeID), dal.Chain.Port.Eq(*chain.Port)).Count()
	if err != nil {
		return nil, err
	}
	// may ipv4 ipv6 all use one port, so only count == 1, delete port
	if cnt == 1 && chain.Node.Key != nil {
		r.Port = *chain.Port
		_, err = client.DoRequest(fmt.Sprintf("%s:%d", chain.Node.ManagerIP, *chain.Node.Port), "chain", "DeleteChain", *chain.Node.Key, r)
		if err != nil {
			return nil, err
		}
	}
	_, err = dal.Q.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(r.ID)).Delete(&entity.Chain{})
	if err != nil {
		return nil, err
	}
	_, err = dal.UserRoleChainMapping.WithContext(ctx).Where(dal.UserRoleChainMapping.ChainID.Eq(int32(r.ID))).Delete(&entity.UserRoleChainMapping{})
	if err != nil {
		return nil, err
	}

	return &resp.DelChainResp{ChainId: chain.ID}, nil
}

func ListChain(ctx context.Context, req *req.ListChainReq) (*resp.ListChainResp, error) {

	if config.GetRole() == string(common.Agent) {
		return &resp.ListChainResp{}, nil
	}

	var chainIds []int64
	if err := dal.UserRoleChainMapping.WithContext(ctx).Select(dal.UserRoleChainMapping.ChainID).
		Where(dal.UserRoleChainMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
		Or(dal.UserRoleChainMapping.RoleCode.Eq(identity.FromContext(ctx).RoleCode)).Scan(&chainIds); err != nil {
		return nil, err
	}

	var q []gen.Condition
	if !identity.FromContext(ctx).IsSuperAdmin() {
		q = append(q, dal.Chain.ID.In(chainIds...))
	}
	if req.Protocol != "" {
		q = append(q, dal.Chain.Protocol.Eq(req.Protocol))
	}
	if req.ChainName != "" {
		q = append(q, dal.Chain.ChainName.Like("%"+req.ChainName+"%"))
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
	chains, cnt, err := dal.Chain.WithContext(ctx).
		Where(q...).Preload(dal.Chain.Node).Order(dal.Chain.UpdatedAt.Desc()).FindByPage(int((req.PageNo-1)*req.PageSize), int(req.PageSize))
	if err != nil {
		return nil, err
	}
	// The chain's own key, and the preloaded node's.
	redactForCaller(ctx, nil, chains, nil)

	return &resp.ListChainResp{Chains: chains, TotalCount: cnt}, nil
}

func EditChain(ctx context.Context, r *req.EditChainReq) (*resp.EditChainResp, error) {

	if config.GetRole() == string(common.Agent) {
		return &resp.EditChainResp{}, nil
	}
	if err := checkUserChainPermission(ctx, r.ID); err != nil {
		return nil, err
	}
	_, err := dal.Chain.WithContext(ctx).Where(dal.Chain.ID.Eq(r.ID)).Update(dal.Chain.ChainName, r.ChainName)
	if err != nil {
		return nil, err
	}
	return &resp.EditChainResp{}, nil
}

func GetChainPermissions(ctx context.Context, r *req.EmptyReq) ([]int64, error) {
	var availableChainIds []int64
	if identity.FromContext(ctx).IsSuperAdmin() {
		if err := dal.Chain.WithContext(ctx).Select(dal.Chain.ID).Scan(&availableChainIds); err != nil {
			return nil, err
		}
	} else {
		if err := dal.UserRoleChainMapping.WithContext(ctx).Select(dal.UserRoleChainMapping.ChainID).
			Where(dal.UserRoleChainMapping.UserID.Eq(identity.FromContext(ctx).UserID)).
			Scan(&availableChainIds); err != nil {
			return nil, err
		}
	}
	return availableChainIds, nil
}
