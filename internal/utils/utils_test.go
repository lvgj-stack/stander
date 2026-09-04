package utils

import (
	"encoding/json"
	"io"
	"testing"
)

// These replace IDE-generated table stubs inherited from stander-forward whose
// `want` fields were left empty, so every case asserted equality against "" and
// failed. The network-dependent stubs (GetOutBoundIPv4/v6, HandleTcpping) are
// gone rather than rewritten: they asserted nothing and needed live egress.

func TestMd5Hash(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty", "", "d41d8cd98f00b204e9800998ecf8427e"},
		{"digits", "123456", "e10adc3949ba59abbe56e057f20f883e"},
		{"ascii", "stander", "e7a8bae8d5ee68ef540ba0a9390177e6"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Md5Hash(tt.in); got != tt.want {
				t.Errorf("Md5Hash(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestIsPrivateIP(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		want bool
	}{
		{"10/8", "10.37.26.209", true},
		{"172.16/12 lower", "172.16.0.1", true},
		{"172.16/12 upper", "172.31.255.255", true},
		{"172.32 is public", "172.32.0.1", false},
		{"192.168/16", "192.168.2.196", true},
		{"public v4", "103.103.245.186", false},
		{"ipv6 is not matched", "fdbd:dc01:ff:306::1", false},
		{"garbage", "not-an-ip", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsPrivateIP(tt.ip); got != tt.want {
				t.Errorf("IsPrivateIP(%q) = %v, want %v", tt.ip, got, tt.want)
			}
		})
	}
}

// GenIpAndPort must bracket IPv6 literals, otherwise the address is unusable as
// a dial target.
func TestGenIpAndPort(t *testing.T) {
	tests := []struct {
		name string
		ip   string
		port int32
		want string
	}{
		{"ipv4", "1.2.3.4", 8123, "1.2.3.4:8123"},
		{"ipv6 gets brackets", "fdbd:dc01:ff:306::1", 8123, "[fdbd:dc01:ff:306::1]:8123"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := GenIpAndPort(tt.ip, tt.port); got != tt.want {
				t.Errorf("GenIpAndPort(%q, %d) = %v, want %v", tt.ip, tt.port, got, tt.want)
			}
		})
	}
}

func TestMustStructToReader(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
		N    int    `json:"n"`
	}
	r := MustStructToReader(payload{Name: "stander", N: 7})
	got, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	var back payload
	if err := json.Unmarshal(got, &back); err != nil {
		t.Fatalf("unmarshal %s: %v", got, err)
	}
	if back.Name != "stander" || back.N != 7 {
		t.Errorf("round trip lost data: %+v", back)
	}
}
