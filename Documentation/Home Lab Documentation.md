---
layout: page
title: Documentation
description: Main Documentation - Second pass
---
**Status:** Active / In Development
**Primary Hypervisor:** Proxmox
**Primary Network Gateway:** Netgate Router
**Core Switch:** Cisco Managed Switch

![](assets/images/Copy%20of%20Home%20Lab%204_13_2026.jpeg)

---
## Core Services & Deployment

| **Service**     | **Environment** | **Function**                    | **Status / Notes**                         |
| --------------- | --------------- | ------------------------------- | ------------------------------------------ |
| **ARR Stack**   | Docker          | Media Management                | local IPs only on server VLAN              |
| **Jellyfin**    | Docker          | Media Streaming                 | Open port configuration proxied with caddy |
| **Webserver**   | Docker          | Website hosting                 | Proxied via Caddy                          |
| **Pterodactyl** | Docker          | Game Server Management and node | Open port for game panel is local only     |
| **Caddy**       | Docker (VPS)    | Reverse Proxy & SSL             | Primary ingress router                     |
| **Authentik**   | Docker (VPS)    | Authentication                  | Used for auth of public facing services    |

---

## Switch Port Allocation & VLANs

The network is segmented to isolate personal devices, management interfaces, and publicly accessible servers. The switch can only be managed via console cable.

| **VLAN ID** | **Name**      | **Subnet / Gateway** | **Description**                         |
| ----------- | ------------- | -------------------- | --------------------------------------- |
| **10**      | Personal      | `192.168.10.0/24`    | Trusted personal devices.               |
| **20**      | Servers       | `192.168.20.0/24`    | Lab servers and exposed services.       |
| **30**      | Management    | `192.168.30.0/24`    | Infrastructure management interfaces.   |
| **999**     | Hole (Native) | N/A                  | Blackhole VLAN to prevent VLAN hopping. |


| **Port Range**        | **Assignment**       | **Mode**                    |
| --------------------- | -------------------- | --------------------------- |
| **G1/0/23**           | Router Uplink        | Trunk (Allowed: 10, 20, 30) |
| **G1/0/24**           | Switch Downlink      | Trunk (Allowed: 10, 20, 30) |
| **G1/0/1 - G1/0/12**  | VLAN 10 (Personal)   | Access                      |
| **G1/0/13 - G1/0/20** | VLAN 20 (Servers)    | Access                      |
| **G1/0/21 - G1/0/22** | VLAN 30 (Management) | Access                      |
| **f0, Tel1/0/1-2**    | Parking              | Access                      |

![](assets/images/Pasted%20image%2020260429161841.png)

---

## ACL / Firewall

Server Interface:
![](assets/images/Pasted%20image%2020260429164850.png)

1. All server traffic ONLY uses WireGuard tunnel.
2. All personal traffic uses normal gateway.

---
## WireGuard

A Virtual Private Server (VPS) is used to expose internal services securely. The VPS server routes traffic through this tunnel.

| **Configuration Item** | **Value**                       | **Note**                                           |
| ---------------------- | ------------------------------- | -------------------------------------------------- |
| **Tunnel Device**      | `tun_wg0`                       | Assigned to interface `WG_VPN (opt2)`              |
| **Description**        | WireGuard to VPS                | The router is a peer                               |
| **Listen Port**        | `51820`- todo, change to random | Standard WireGuard port                            |
| **MTU**                | `1420`                          | (Recommended for WireGuard to avoid fragmentation) |
| **Allowed IPs**        | `10.10.0.1/32`, `0.0.0.0/0`     | Routes traffic for the tunnel and the Internet     |

---
## Caddy Configuration

This environment utilizes a Virtual Private Server (VPS) as the primary public-facing ingress point. Caddy is deployed on the VPS to handle all external HTTP and HTTPS traffic, managing SSL certificates and routing.

To securely access internal services, the VPS acts as a gateway, connected to the local Proxmox environment via a WireGuard VPN tunnel. Caddy routes traffic either to local containers on the VPS (such as Authentik for single sign-on) or forwards it through the WireGuard tunnel to the internal 192.168.20.x subnets.

Both Caddy and Authentik are configured to communicate via a shared external Docker network named `proxy`.

| **Parameter**     | **Configuration**          |
| ----------------- | -------------------------- |
| **Exposed Ports** | `80` (HTTP), `443` (HTTPS) |
| **Network**       | `proxy` (External)         |
| **Config File**   | `/opt/docker/caddy`        |

---

| **Subdomain**          | **Internal Destination** | **Port** | **Purpose / Service**       |
| ---------------------- | ------------------------ | -------- | --------------------------- |
| `auth.nickloves.me`    | `authentik-server-1`     | `9000`   | Authentik Identity Provider |
| `proxmox.nickloves.me` | `192.168.20.3`           | `8006`   | Proxmox VE (via WireGuard)  |
| `post.nickloves.me`    | `192.168.20.5`           | `8080`   | This Website                |

---
## Other Notes
Spanning Tree (STP) / BPDU Guard: When the Netgate router reboots, its internal switch briefly acts unmanaged and passes Cisco BPDU packets from the LAN switch out to the WAN. This triggers BPDU Guard and shuts down the port.

> _Fix:_ The trunk port connected to the router requires `spanning-tree bpdufilter enable` to prevent sending STP packets during this window.

VPS Hardening: Unnecessary services have been disabled to harden the public-facing VPS. Automatic unattended upgrades are enabled.