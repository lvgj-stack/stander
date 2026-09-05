package service

import (
	"context"

	"github.com/google/uuid"

	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

// Chain groups are an administrative resource: ListChainGroup has always
// returned an empty list to anyone but the super admin, so the writes belong
// to the same side. Without the gate, a user-portal account could create and
// delete groups it cannot see.
func AddChainGroup(ctx context.Context, r *req.AddChainGroupReq) (*resp.AddChainGroupResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}

	chainIds := make([]int64, 0)
	chainMap := make(map[int64]req.ChainEntityForChainGroup)
	for _, chain := range r.Chains {
		chainMap[chain.ID] = chain
		chainIds = append(chainIds, chain.ID)
	}

	chains, err := dal.Chain.WithContext(ctx).Where(dal.Chain.ID.In(chainIds...)).Find()
	if err != nil {
		return nil, err
	}
	chainGroups := make([]*entity.ChainGroup, len(chains))
	groupId := uuid.New().String()
	for _, chain := range chains {
		cfg := chainMap[chain.ID]
		cg := &entity.ChainGroup{
			ChainID:        chain.ID,
			ChainGroupID:   groupId,
			ChainGroupName: &r.Name,
			Backup:         cfg.Backup,
			MaxFails:       &cfg.MaxFails,
			Timeout:        &cfg.Timeout,
			Weight:         &cfg.Weight,
			ChainName:      chain.ChainName,
		}
		chainGroups = append(chainGroups, cg)
	}
	if err := dal.ChainGroup.WithContext(ctx).CreateInBatches(chainGroups, 10); err != nil {
		return nil, err
	}
	return &resp.AddChainGroupResp{}, nil
}

func DelChainGroup(ctx context.Context, r *req.DelChainGroupReq) (*resp.EmptyResp, error) {
	if err := requireSuperAdmin(ctx); err != nil {
		return nil, err
	}

	if _, err := dal.ChainGroup.WithContext(ctx).Where(dal.ChainGroup.ChainGroupID.Eq(r.ChainGroupID)).Delete(&entity.ChainGroup{}); err != nil {
		return nil, err
	}
	return &resp.EmptyResp{}, nil
}

func ListChainGroup(ctx context.Context, _ *req.ListChainGroupReq) (*resp.ListChainGroupsResp, error) {
	if !identity.FromContext(ctx).IsSuperAdmin() {
		return &resp.ListChainGroupsResp{}, nil
	}

	groups, err := dal.ChainGroup.WithContext(ctx).Distinct(dal.ChainGroup.ChainGroupID, dal.ChainGroup.ChainGroupName).
		Select(dal.ChainGroup.ChainGroupID, dal.ChainGroup.ChainGroupName).Find()
	if err != nil {
		return nil, err
	}
	res := &resp.ListChainGroupsResp{}

	for _, group := range groups {
		cg := &resp.ChainGroupVO{
			ChainGroupID:   group.ChainGroupID,
			ChainGroupName: *group.ChainGroupName,
		}
		res.ChainGroups = append(res.ChainGroups, cg)
	}

	return res, nil
}

func EditChainGroup(ctx context.Context, r *req.EditChainReq) (*resp.EditChainResp, error) {

	return &resp.EditChainResp{}, nil
}
