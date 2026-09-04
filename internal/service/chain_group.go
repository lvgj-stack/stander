package service

import (
	"context"
	"errors"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/google/uuid"

	"github.com/lvgj-stack/stander/internal/common"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/model/entity"
	error2 "github.com/lvgj-stack/stander/internal/service/error"
	"github.com/lvgj-stack/stander/internal/service/req"
	"github.com/lvgj-stack/stander/internal/service/resp"
)

func ChainGroupSrv(c context.Context, ctx *app.RequestContext) {
	action := ctx.Query("Action")
	switch action {
	case "ListChainGroups":
		resp, err := ListChainGroup(c, ctx)
		error2.WriteResponse(ctx, err, resp)
	case "AddChainGroup":
		resp, err := AddChainGroup(c, ctx)
		error2.WriteResponse(ctx, err, resp)
	case "DeleteChainGroup":
		resp, err := DelChainGroup(c, ctx)
		error2.WriteResponse(ctx, err, resp)
	case "EditChainGroup":
		resp, err := EditChainGroup(c, ctx)
		error2.WriteResponse(ctx, err, resp)
	default:
		error2.WriteResponse(ctx, errors.New("action not found"), nil)
	}
}

func AddChainGroup(c context.Context, ctx *app.RequestContext) (*resp.AddChainGroupResp, error) {
	r := req.AddChainGroupReq{}
	if err := ctx.BindAndValidate(&r); err != nil {
		return nil, err
	}

	chainIds := make([]int64, 0)
	chainMap := make(map[int64]req.ChainEntityForChainGroup)
	for _, chain := range r.Chains {
		chainMap[chain.ID] = chain
		chainIds = append(chainIds, chain.ID)
	}

	chains, err := dal.Chain.WithContext(c).Where(dal.Chain.ID.In(chainIds...)).Find()
	if err != nil {
		return nil, err
	}
	chainGroups := make([]*entity.ChainGroup, len(chains))
	groupId := uuid.New().String()
	for _, chain := range chains {
		c := chainMap[chain.ID]
		cg := &entity.ChainGroup{
			ChainID:        chain.ID,
			ChainGroupID:   groupId,
			ChainGroupName: &r.Name,
			Backup:         c.Backup,
			MaxFails:       &c.MaxFails,
			Timeout:        &c.Timeout,
			Weight:         &c.Weight,
			ChainName:      chain.ChainName,
		}
		chainGroups = append(chainGroups, cg)
	}
	if err := dal.ChainGroup.WithContext(c).CreateInBatches(chainGroups, 10); err != nil {
		return nil, err
	}
	return &resp.AddChainGroupResp{}, nil
}

func DelChainGroup(c context.Context, ctx *app.RequestContext) (*resp.EmptyResp, error) {
	r := req.DelChainGroupReq{}
	if err := ctx.BindAndValidate(&r); err != nil {
		return nil, err
	}

	if _, err := dal.ChainGroup.WithContext(c).Where(dal.ChainGroup.ChainGroupID.Eq(r.ChainGroupID)).Delete(&entity.ChainGroup{}); err != nil {
		return nil, err
	}
	return &resp.EmptyResp{}, nil
}

func ListChainGroup(c context.Context, ctx *app.RequestContext) (*resp.ListChainGroupsResp, error) {
	req := req.ListChainGroupReq{}
	if err := ctx.BindAndValidate(&req); err != nil {
		return nil, err
	}
	if ctx.GetString(common.HeaderRoleKey) != common.SUPER_ADMIN {
		return &resp.ListChainGroupsResp{}, nil
	}

	groups, err := dal.ChainGroup.WithContext(c).Distinct(dal.ChainGroup.ChainGroupID, dal.ChainGroup.ChainGroupName).
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

func EditChainGroup(ctx context.Context, c *app.RequestContext) (*resp.EditChainResp, error) {
	r := req.EditChainReq{}
	if err := c.BindAndValidate(&r); err != nil {
		return nil, err
	}

	return &resp.EditChainResp{}, nil
}
