package api

import (
	"context"
	"errors"
	"net/http"

	"github.com/cloudwego/hertz/pkg/app"

	"github.com/lvgj-stack/stander/internal/service"
	"github.com/lvgj-stack/stander/internal/service/req"
)

// errActionNotFound is returned for an unrecognised Action query parameter.
var errActionNotFound = errors.New("action not found")

// writeResponse renders the controller API's envelope. This used to live in
// internal/service/error, which forced the whole service layer to import Hertz.
func writeResponse(ctx *app.RequestContext, err error, data any) {
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, map[string]any{
			"Error": err.Error(),
		})
		return
	}
	ctx.JSON(http.StatusOK, map[string]any{
		"Result": data,
	})
}

// call binds the request body into T and invokes a service action with it.
//
// This is the only place the controller API touches Hertz's binder; every
// service action below is a plain func(context.Context, *T) (R, error).
func call[T, R any](c context.Context, ctx *app.RequestContext, action func(context.Context, *T) (R, error)) (any, error) {
	var r T
	if err := ctx.BindAndValidate(&r); err != nil {
		return nil, err
	}
	return action(c, &r)
}

func nodeSrv(c context.Context, ctx *app.RequestContext) {
	var res any
	var err error
	switch action := ctx.Query("Action"); action {
	case "AddNode":
		res, err = call(c, ctx, service.AddNode)
	case "RegisterNode":
		// RegisterNode also needs the address the call arrived from, which is a
		// transport fact rather than part of the request body.
		var r req.RegisterNodeReq
		if err = ctx.BindAndValidate(&r); err == nil {
			res, err = service.RegisterNode(c, &r, ctx.ClientIP())
		}
	case "ListNodes":
		res, err = call(c, ctx, service.ListNode)
	case "GetNodePermissions":
		res, err = call(c, ctx, service.GetNodePermissions)
	case "ListNodeChainRelationShips":
		res, err = call(c, ctx, service.ListNodeChainRelationShips)
	case "DeleteNode":
		res, err = call(c, ctx, service.DelNode)
	case "EditNode":
		res, err = call(c, ctx, service.EditNode)
	default:
		err = errActionNotFound
	}
	writeResponse(ctx, err, res)
}

func chainSrv(c context.Context, ctx *app.RequestContext) {
	var res any
	var err error
	switch ctx.Query("Action") {
	case "ListChains":
		res, err = call(c, ctx, service.ListChain)
	case "AddChain":
		res, err = call(c, ctx, service.AddChain)
	case "DeleteChain":
		res, err = call(c, ctx, service.DelChain)
	case "GetChainPermissions":
		res, err = call(c, ctx, service.GetChainPermissions)
	case "EditChain":
		res, err = call(c, ctx, service.EditChain)
	default:
		err = errActionNotFound
	}
	writeResponse(ctx, err, res)
}

func chainGroupSrv(c context.Context, ctx *app.RequestContext) {
	var res any
	var err error
	switch ctx.Query("Action") {
	case "ListChainGroups":
		res, err = call(c, ctx, service.ListChainGroup)
	case "AddChainGroup":
		res, err = call(c, ctx, service.AddChainGroup)
	case "DeleteChainGroup":
		res, err = call(c, ctx, service.DelChainGroup)
	case "EditChainGroup":
		res, err = call(c, ctx, service.EditChainGroup)
	default:
		err = errActionNotFound
	}
	writeResponse(ctx, err, res)
}

func ruleSrv(c context.Context, ctx *app.RequestContext) {
	var res any
	var err error
	switch ctx.Query("Action") {
	case "AddRule":
		res, err = call(c, ctx, service.AddRule)
	case "DeleteRule":
		res, err = call(c, ctx, service.DelRule)
	case "ListRules":
		res, err = call(c, ctx, service.ListRule)
	case "ModifyRule":
		res, err = call(c, ctx, service.ModifyRule)
	case "ModifyRules":
		res, err = call(c, ctx, service.ModifyRules)
	case "TestRule":
		res, err = call(c, ctx, service.TestRule)
	default:
		err = errActionNotFound
	}
	writeResponse(ctx, err, res)
}

func userSrv(c context.Context, ctx *app.RequestContext) {
	var res any
	var err error
	switch ctx.Query("Action") {
	case "GetUserPlanInfo":
		res, err = call(c, ctx, service.GetUserPlanInfo)
	case "ListUsers":
		res, err = call(c, ctx, service.ListUsers)
	case "EditUser":
		res, err = call(c, ctx, service.EditUser)
	default:
		err = errActionNotFound
	}
	writeResponse(ctx, err, res)
}

func planSrv(c context.Context, ctx *app.RequestContext) {
	var res any
	var err error
	switch ctx.Query("Action") {
	case "ListPlans":
		res, err = call(c, ctx, service.ListPlans)
	case "AssociatePlan":
		res, err = call(c, ctx, service.AssociatePlan)
	default:
		err = errActionNotFound
	}
	writeResponse(ctx, err, res)
}

func dataSrv(c context.Context, ctx *app.RequestContext) {
	var res any
	var err error
	switch ctx.Query("Action") {
	case "ReportNetworkTraffic":
		res, err = call(c, ctx, service.ReportNetworkTraffic)
	case "ObserverNetworkTraffic":
		res, err = call(c, ctx, service.ObserverNetworkTraffic)
	default:
		err = errActionNotFound
	}
	writeResponse(ctx, err, res)
}
