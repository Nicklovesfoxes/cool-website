---
layout: page
title: Game Server
description: Game Server for any hosted games
toc: "true"
---
**IP:** 192.168.20.9
**Username:** mine

Pterodactyl (game server panel + node) is proxied through Caddy and gated by Authentik, same pattern as Proxmox (see [VPS Proxy](Documentation/Network/VPS%20Proxy.md)). Minecraft traffic itself (raw ports, not HTTP) is proxied separately through HAProxy on the VPS so ports and player IPs work normally - see the [VPS Proxy](Documentation/Network/VPS%20Proxy.md) page for that config.


---
## UFW / iptables Port Forwarding Configuration

| **Parameter / Item**  | **Configuration Value** | **Note**                                                                             |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| **Destination IP**    | `192.168.20.9`          | The internal IP of the Pterodactyl/Minecraft VM                                      |
| **Port Range**        | `25565:25575`           | Cover the proxy, lobby, vanilla, modded, and minigame arena servers (11 ports total) |

---

![](assets/images/Pasted%20image%2020260902121102.png)

**VM Specs:** 6 vCPUs, 30 GiB RAM, 200 GiB boot disk.

---
## Exposure

This is likely the most vulnerable point to DDoS attacks in the whole architecture. Every other public-facing subdomain goes through Caddy first (see [Overview](/Documentation/Overview) - Core Public Routing), which gates HTTP traffic through a single, application-aware layer before it reaches anything else. The Minecraft ports (`25565:25575`) skip that entirely - HAProxy on the VPS accepts raw TCP directly on those ports per the firewall rules on [VPS Proxy](Documentation/Network/VPS%20Proxy.md), so a flood aimed at them hits the VPS's raw network stack instead of something that can inspect or rate-limit application traffic. It's also the widest open port range anywhere in the setup - eleven ports versus one (443/80) for everything else.

It doesn't threaten the rest of the lab directly if it goes down - the VPS is disposable and stateless by design (see [Double NAT](/2026/06/02/Double-NAT-Proxy-architecture/)) - but it's the one public entry point not gated by Caddy or Authentik.