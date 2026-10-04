# Viewer bridge sections and agent export

The `/stashes` bridge response can remain the authoritative agent export
while viewer-local records render in a separate editable section. Keep
the displayed combined sections separate from the existing extension
export contract.

The extension popup E2E harness can exercise this flow with the
`launchWithExtension` scenario step and the existing popup page helper;
new scenarios belong beside the MCP flows in `agent-flow-extension.spec`.
