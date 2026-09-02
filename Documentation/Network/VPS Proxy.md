---
layout: page
title: VPS Proxy
description: Rented VPS Routing all inbound traffic
toc: "true"
---
**Hardware:** Rented VPS - DigitalOcean
**Management:** SSH Key
**Role:** Proxy
**Backup Located**: DigitalOcean snapshot 

This environment utilizes a Virtual Private Server (VPS) as the primary public-facing ingress point. Caddy is deployed on the VPS to handle all external HTTP and HTTPS traffic, managing SSL certificates and routing.

To securely access internal services, the VPS acts as a gateway, connected to the local Proxmox environment via a WireGuard VPN tunnel (see [Router](/Documentation/Network/Router)). Caddy forwards requests through the WireGuard tunnel to the internal `192.168.20.x` subnet, including to Authentik for single sign-on - Authentik runs on its own [Auth Server](/Documentation/VMs/Auth%20Server) VM, not on the VPS itself.

Caddy uses Docker and is configured to communicate with other VPS-local containers via a shared external Docker network named `proxy`.

Caddy location: `/opt/docker/caddy`

---
## Firewall

**Current iptables ruleset**

```
*nat
:PREROUTING ACCEPT [0:0]
:INPUT ACCEPT [0:0]
:OUTPUT ACCEPT [0:0]
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -s 10.10.0.0/24 -o eth0 -j MASQUERADE
COMMIT

*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]

# Loopback
-A INPUT -i lo -j ACCEPT

# Established/related traffic
-A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
-A FORWARD -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT

# Drop invalid packets
-A INPUT -m conntrack --ctstate INVALID -j DROP

# ICMP (INPUT + FORWARD)
-A INPUT -p icmp --icmp-type destination-unreachable -j ACCEPT
-A INPUT -p icmp --icmp-type time-exceeded -j ACCEPT
-A INPUT -p icmp --icmp-type parameter-problem -j ACCEPT
-A INPUT -p icmp --icmp-type echo-request -j ACCEPT
-A FORWARD -p icmp --icmp-type destination-unreachable -j ACCEPT
-A FORWARD -p icmp --icmp-type time-exceeded -j ACCEPT
-A FORWARD -p icmp --icmp-type parameter-problem -j ACCEPT
-A FORWARD -p icmp --icmp-type echo-request -j ACCEPT

# DHCP client
-A INPUT -p udp --sport 67 --dport 68 -j ACCEPT

# Service ports
-A INPUT -p tcp --dport 22 -j ACCEPT
-A INPUT -p udp --dport 51820 -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT
-A INPUT -p tcp --dport 25565:25575 -j ACCEPT

# Full allow on wg0 (matches old "Anywhere on wg0 ALLOW Anywhere")
-A INPUT -i wg0 -j ACCEPT

# Forward: homelab subnet out to internet
-A FORWARD -s 10.10.0.0/24 -i wg0 -o eth0 -j ACCEPT

# Forward: internet in to Minecraft backend over WireGuard
-A FORWARD -d 192.168.20.9 -p tcp --dport 25565:25575 -i eth0 -o wg0 -j ACCEPT

COMMIT
```

**Notes:**

- This box runs Docker containers with published ports (Caddy on 80/443). Docker manages its own iptables rules and inserts a jump to the `DOCKER-USER` chain — a `DROP` default policy on `FORWARD`/`INPUT` here does not automatically block traffic to Docker-published ports, since Docker's own chains run separately.
- Rules are set up to be persisted across reboots.

---
## WireGuard Tunnel (VPS side)

The VPS runs a WireGuard interface `wg0` that tunnels to the router, giving Caddy and HAProxy a path into the 192.168.20.x and 192.168.35.x Proxmox subnet without exposing it directly to the internet. Router-side peer config is documented on the [Router](/Documentation/Network/Router) page.

---

## Minecraft Traffic Proxying (HAProxy)

Minecraft traffic is proxied through **HAProxy**, running directly on the VPS (not containerized). It listens on ports 25565–25575 and forwards each to a specific backend service on `192.168.20.9` over the WireGuard tunnel.

**Config: `/etc/haproxy/haproxy.cfg`**


---

## Tunnel Monitoring / Alerting

A small cron job checks whether the WireGuard tunnel is down. If it is, it pushes the equivalent of an amber alert to my phone, even through Do Not Disturb.

[screen shoot of the phone alert/notification triggered when the tunnel goes down]

---

## Hardening
Unnecessary services have been disabled to harden the public-facing VPS. Automatic unattended upgrades are enabled.

Some logs have been disabled. 