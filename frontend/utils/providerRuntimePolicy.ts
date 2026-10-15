/**
 * Declare external provider runtime ownership, dependency entry points, and risk confirmation boundaries.
 */
export const AGENTPORCH_RUNTIME_BOUNDARY = { providesAgentRuntime: false, installsProviderCli: false, managesDaemon: false } as const;
const tmuxWarning = { requiresRiskConfirmation: true, actions: ['cancel', 'continue-at-own-risk'], continueTarget: 'tmux-tui', forbiddenFallbacks: ['sdk', 'rpc', 'remote-control', 'other-provider'] } as const;
export const PROVIDER_RUNTIME_POLICY = {
  codex: { runtimeOwner: 'external-user', autoTakeover: true, takeoverTransport: 'user-managed-app-server', install: { command: 'Official Codex installation instructions' }, authentication: { command: 'Official Codex sign-in instructions' }, officialDocs: ['https://github.com/openai/codex'] },
  claude: { runtimeOwner: 'external-user', autoTakeover: false, install: { command: 'curl -fsSL https://claude.ai/install.sh | bash' }, authentication: { command: 'claude auth login；claude auth status' }, officialDocs: ['https://code.claude.com/docs/en/setup', 'https://code.claude.com/docs/en/authentication'], failureWarning: tmuxWarning },
  pi: { runtimeOwner: 'external-user', autoTakeover: false, install: { command: 'npm install -g --ignore-scripts @earendil-works/pi-coding-agent' }, authentication: { command: 'Run /login in the Pi TUI or configure an API key' }, officialDocs: ['https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/README.md'], failureWarning: tmuxWarning },
} as const;
