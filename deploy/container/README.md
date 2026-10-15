# Container deployment

This example builds AgentPorch from the current checkout and exposes it on a
loopback port. Hermes history is mounted read-only. AgentPorch state uses a
named volume, and host paths are supplied through local configuration.

From this directory:

1. Copy `.env.example` to `.env`.
2. Set `HERMES_DATA_DIR` and `WORKSPACE_DIR` to existing absolute directories.
   Use `/workspace` as the workspace path in the Hermes container too, so project
   paths resolve consistently.
3. Set `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` to independent random values
   of at least 32 bytes. `openssl rand -hex 32` generates one value.
4. Run `docker compose --env-file .env config` to validate configuration, then
   `docker compose --env-file .env up -d --build`.

Open `http://localhost:3001` and complete account setup. Change `AGENTPORCH_PORT`
if the local port is already in use. For remote access, configure an authenticated
TLS reverse proxy; keep the container binding on loopback.

Update the checkout, then rerun the same Compose command. Keep the environment
file and named volume between updates. To run independent instances, use a
separate Compose project name, environment file, and host port for each instance.
Deployment hosts, proxy settings, credentials, and backup locations belong in
local operator configuration.
