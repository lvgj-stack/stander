package service

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/lvgj-stack/stander/internal/identity"
	"github.com/lvgj-stack/stander/internal/model/dal"
	"github.com/lvgj-stack/stander/internal/service/req"
)

// adminCtx is the caller these actions require. The plan catalogue is an
// administrative screen's data, so a bare context.Background() is now refused —
// see TestListPlansRefusesANonAdmin.
func adminCtx() context.Context {
	return identity.NewContext(context.Background(), identity.Principal{
		UserID:   1,
		RoleCode: identity.RoleSuperAdmin,
	})
}

// newMockDB points the gorm-gen query layer at a mock driver.
//
// dal.SetDefault installs a process-wide handle, so tests that use it must not
// run in parallel with each other.
func newMockDB(t *testing.T) sqlmock.Sqlmock {
	t.Helper()

	sqlDB, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })

	gormDB, err := gorm.Open(mysql.New(mysql.Config{
		Conn:                      sqlDB,
		SkipInitializeWithVersion: true,
	}), &gorm.Config{Logger: logger.Discard})
	if err != nil {
		t.Fatalf("gorm open: %v", err)
	}
	dal.SetDefault(gormDB)
	return mock
}

// A service action now runs against a mock database with no HTTP server in
// sight, which is the whole point of taking *app.RequestContext out of the
// signature.
func TestListPlansMapsRowsToResponse(t *testing.T) {
	mock := newMockDB(t)

	mock.ExpectQuery("SELECT \\* FROM `traffic_plan`").
		WillReturnRows(sqlmock.NewRows([]string{"id", "plan_name", "total_traffic", "period"}).
			AddRow(1, "月付 100G", 107374182400, 0).
			AddRow(2, "年付 2T", 2199023255552, 3))

	got, err := ListPlans(adminCtx(), &req.ListPlansReq{})
	if err != nil {
		t.Fatalf("ListPlans: %v", err)
	}
	if len(got.Plans) != 2 {
		t.Fatalf("got %d plans, want 2", len(got.Plans))
	}
	if name := got.Plans[0].PlanName; name == nil || *name != "月付 100G" {
		t.Errorf("first plan name = %v, want 月付 100G", name)
	}
	if got.Plans[1].TotalTraffic != 2199023255552 {
		t.Errorf("second plan traffic = %d, want 2199023255552", got.Plans[1].TotalTraffic)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("unmet expectations: %v", err)
	}
}

// A database failure must surface as an error, not an empty list that looks
// like "this account has no plans".
func TestListPlansPropagatesQueryError(t *testing.T) {
	mock := newMockDB(t)
	mock.ExpectQuery("SELECT \\* FROM `traffic_plan`").WillReturnError(gorm.ErrInvalidDB)

	if _, err := ListPlans(adminCtx(), &req.ListPlansReq{}); err == nil {
		t.Fatal("expected the query error to propagate")
	}
}

// The user portal is served by the same API as the admin console, so a
// forwarding user holds a valid token against this action. It must be refused
// before it reaches the database — a refusal that queried first would still
// have leaked timing and error shape, and AssociatePlan next door would hand
// out quota.
func TestListPlansRefusesANonAdmin(t *testing.T) {
	mock := newMockDB(t)

	ctx := identity.NewContext(context.Background(), identity.Principal{UserID: 3, RoleCode: "USER"})
	if _, err := ListPlans(ctx, &req.ListPlansReq{}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("ListPlans as USER = %v, want ErrForbidden", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("the refusal must not have hit the database: %v", err)
	}
}

func TestAssociatePlanRefusesANonAdmin(t *testing.T) {
	mock := newMockDB(t)

	ctx := identity.NewContext(context.Background(), identity.Principal{UserID: 3, RoleCode: "USER"})
	// A user handing themselves the largest plan in the table.
	_, err := AssociatePlan(ctx, &req.AssociatePlanReq{UserId: 3, PlanId: 2})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("AssociatePlan as USER = %v, want ErrForbidden", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("the refusal must not have hit the database: %v", err)
	}
}
