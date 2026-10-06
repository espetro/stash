package codec

import (
	"encoding/base32"
	"encoding/base64"
	"strings"
)

// base64URLEncoding emits unpadded base64url (like @oslojs
// encodeBase64urlNoPadding) but tolerates padding on decode, mirroring the
// TS decoder's ignore-padding behavior.
var base64URLEncoding = base64.URLEncoding.WithPadding(base64.NoPadding)

// base32StdEncoding emits unpadded uppercase base32 (like @oslojs
// encodeBase32UpperCaseNoPadding), padding tolerated on decode.
var base32StdEncoding = base32.StdEncoding.WithPadding(base32.NoPadding)

// decodeBase64URLIgnorePadding strips any '=' padding before a strict
// unpadded decode. Note: some legacy fixtures carry an odd trailing
// character (see packages/shared/fixtures/payloads.md); trailing leftovers
// are rejected.
func decodeBase64URLIgnorePadding(s string) ([]byte, error) {
	return base64URLEncoding.DecodeString(strings.TrimRight(s, "="))
}

func decodeBase32IgnorePadding(s string) ([]byte, error) {
	return base32StdEncoding.DecodeString(strings.TrimRight(s, "="))
}

func encodeBase64URLNoPadding(b []byte) string {
	return base64URLEncoding.EncodeToString(b)
}

func encodeBase32NoPadding(b []byte) string {
	return base32StdEncoding.EncodeToString(b)
}
