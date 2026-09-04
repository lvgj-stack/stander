package service_test

import (
	"go/build"
	"strings"
	"testing"
)

// The service layer must stay free of the HTTP framework.
//
// Every action used to take a *app.RequestContext, which meant binding,
// identity and response writing were all tangled into the business logic and
// nothing could be tested without standing up a server. Binding now lives in
// api/, identity travels in context.Context, and the service layer is plain Go.
// This test fails if that boundary is crossed again.
func TestServiceDoesNotImportTheWebFramework(t *testing.T) {
	forbidden := []string{
		"github.com/cloudwego/hertz/pkg/app",
		"github.com/cloudwego/hertz/pkg/protocol",
		"github.com/gin-gonic/gin",
	}

	pkg, err := build.ImportDir(".", 0)
	if err != nil {
		t.Fatalf("read package: %v", err)
	}

	for _, imp := range pkg.Imports {
		for _, bad := range forbidden {
			if imp == bad || strings.HasPrefix(imp, bad+"/") {
				t.Errorf("internal/service imports %s; binding and response writing belong in api/", imp)
			}
		}
	}
}

// The admin console must reach the domain through the service layer, never by
// re-opening its own path to the controller over HTTP.
func TestServiceDoesNotImportTheAdminLayer(t *testing.T) {
	pkg, err := build.ImportDir(".", 0)
	if err != nil {
		t.Fatalf("read package: %v", err)
	}
	for _, imp := range pkg.Imports {
		if strings.Contains(imp, "/internal/admin") {
			t.Errorf("internal/service imports %s; the dependency runs the other way", imp)
		}
	}
}
