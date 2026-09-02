---
layout: page
title: Overview
description: Homelab overview
toc: "true"
---
![](assets/images/Copy%20of%20Home%20Lab%204_13_2026.jpeg)

> Device-specific detail lives in its own page.

---
## Core Services & Deployment

| **Service**     | **Environment** | **Function**                    | **Status / Notes**                                       | Location       |
| --------------- | --------------- | ------------------------------- | -------------------------------------------------------- | -------------- |
| **Webserver**   | Docker          | Website hosting                 | ~~Proxied via Caddy~~ On github                          | Github         |
| **Pterodactyl** | Docker          | Game Server Management and node | Open port configuration proxied with caddy and Authentik | Game Server VM |
| **Caddy**       | Docker          | Reverse Proxy & SSL             | Primary ingress router                                   | VPS            |
| **Authentik**   | Docker          | Authentication                  | Used for auth of public facing services                  | Auth Server VM |

---
## Core Public Routing

| **Subdomain**          | **Internal Destination**        | **Port** | **Purpose / Service**       |
| ---------------------- | ------------------------------- | -------- | --------------------------- |
| `auth.nickloves.me`    | `192.168.20.10` (via WireGuard) | `9000`   | Authentik Identity Provider |
| `proxmox.nickloves.me` | `192.168.20.3` (via WireGuard)  | `8006`   | Proxmox VE                  |
| `vault.nickloves.me`   | `192.168.20.10` (via WireGuard) | `80`     | Vaultwarden Password Vault  |

---
## Other Notes

### MTU
MTU likes to break stuff, watch out for it. WireGuard's overhead shrinks the effective MTU of everything riding through the tunnel - see the [Router](/Documentation/Network/Router) page for the specific tunnel MTU setting.