---
layout: page
title: Config
description: Main Configs
toc: "true"
---
**Status:** Active / deployed

### VPS Proxy (kali@Proxy)

## /opt/docker/caddy/Caddyfile

``` yaml
auth.nickloves.me {
        reverse_proxy authentik-server-1:9000
}

proxmox.nickloves.me {
        # 1. Route for Authentik's Embedded Outpost
        reverse_proxy /outpost.goauthentik.io/* http://authentik-server-1:9000

        # 2. Forward Authentication check
        forward_auth http://authentik-server-1:9000 {
                uri /outpost.goauthentik.io/auth/caddy
                copy_headers X-Authentik-Username X-Authentik-Groups X-Authentik-Email X-Authentik-Name X-Authentik-Uid X-Authentik-Jwt X-Authentik-Meta-Jwks X-Authentik-Meta-Outpost X-Authentik-Meta-Provider X-Authentik-Meta-App X-Authentik-Meta-Version
        }

        # 3. Proxy over WireGuard
        reverse_proxy https://192.168.20.3:8006 {
                transport http {
                        tls_insecure_skip_verify
                }
        }
}

post.nickloves.me {
        reverse_proxy 192.168.20.5:8080
}

audio.nickloves.me {
        # audio books! :)
        reverse_proxy http://192.168.20.8:13378 {
        }
}
```
## /opt/docker/caddy/docker-compose.yml
``` yaml
services:
  caddy:
    image: caddy:latest
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./caddy_data:/data
      - ./caddy_config:/config
    networks:
      - proxy
    extra_hosts:
      - "host-gateway:host-gateway"
networks:
  proxy:
    external: true
```
## /opt/docker/authentik/compose.yml
``` yaml
services:
  postgresql:
    env_file:
      - .env
    environment:
      POSTGRES_DB: ${PG_DB:-authentik}
      POSTGRES_PASSWORD: ${PG_PASS:?database password required}
      POSTGRES_USER: ${PG_USER:-authentik}
    healthcheck:
      interval: 30s
      retries: 5
      start_period: 20s
      test:
        - CMD-SHELL
        - pg_isready -d $${POSTGRES_DB} -U $${POSTGRES_USER}
      timeout: 5s
    image: docker.io/library/postgres:16-alpine
    restart: unless-stopped
    volumes:
      - database:/var/lib/postgresql/data
    networks:
      - proxy

  server:
    command: server
    depends_on:
      postgresql:
        condition: service_healthy
    env_file:
      - .env
    environment:
      AUTHENTIK_POSTGRESQL__HOST: postgresql
      AUTHENTIK_POSTGRESQL__NAME: ${PG_DB:-authentik}
      AUTHENTIK_POSTGRESQL__PASSWORD: ${PG_PASS}
      AUTHENTIK_POSTGRESQL__USER: ${PG_USER:-authentik}
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY:?secret key required}
    image: ${AUTHENTIK_IMAGE:-ghcr.io/goauthentik/server}:${AUTHENTIK_TAG:-2026.2.0}
    ports:
      - ${COMPOSE_PORT_HTTP:-9000}:9000
      - ${COMPOSE_PORT_HTTPS:-9443}:9443
    restart: unless-stopped
    shm_size: 512mb
    volumes:
      - ./data:/data
      - ./custom-templates:/templates
    networks:
      - proxy

  worker:
    command: worker
    depends_on:
      postgresql:
        condition: service_healthy
    env_file:
      - .env
    environment:
      AUTHENTIK_POSTGRESQL__HOST: postgresql
      AUTHENTIK_POSTGRESQL__NAME: ${PG_DB:-authentik}
      AUTHENTIK_POSTGRESQL__PASSWORD: ${PG_PASS}
      AUTHENTIK_POSTGRESQL__USER: ${PG_USER:-authentik}
      AUTHENTIK_SECRET_KEY: ${AUTHENTIK_SECRET_KEY:?secret key required}
    image: ${AUTHENTIK_IMAGE:-ghcr.io/goauthentik/server}:${AUTHENTIK_TAG:-2026.2.0}
    restart: unless-stopped
    shm_size: 512mb
    user: root
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
      - ./certs:/certs
      - ./custom-templates:/templates
    networks:
      - proxy

volumes:
  database:
    driver: local

networks:
  proxy:
    external: true
```

---

### ARR Stack (arr@arr)

**Status:** Deployed / not yet documented here

The ARR stack (Sonarr/Radarr/etc.) and Jellyfin run as Docker containers on the `arr` host, restricted to the server VLAN per the [Home Lab Documentation](/Documentation/Home%20Lab%20Documentation) service table. The `docker-compose.yml` and `.env` for this stack still need to be pasted in here.

> TODO: add the actual `docker-compose.yml`, container list, and volume/media mount paths for the ARR stack.

### Pterodactyl

**Status:** Deployed / not yet documented here

Pterodactyl (game server panel + node) is proxied through Caddy and gated by Authentik, same pattern as Proxmox above. Panel/daemon config, allocation ports, and the wings config still need to be filled in.

> TODO: add the Pterodactyl panel `docker-compose.yml`, wings config, and the specific port range(s) forwarded from the VPS (see the UFW port-forwarding section in the [Home Lab Documentation](/Documentation/Home%20Lab%20Documentation) for the Minecraft/game VM ports already documented there).