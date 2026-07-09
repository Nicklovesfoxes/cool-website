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

| **Service**     | **Environment** | **Function**                    | **Status / Notes**                                       |
| --------------- | --------------- | ------------------------------- | -------------------------------------------------------- |
| **ARR Stack**   | Docker (arr)    | Media Management                | local IPs only on server VLAN                            |
| **Jellyfin**    | Docker (arr)    | Media Streaming                 | Open port configuration proxied with caddy               |
| **Webserver**   | Docker          | Website hosting                 | ~~Proxied via Caddy~~ On github                          |
| **Pterodactyl** | Docker (Mine)   | Game Server Management and node | Open port configuration proxied with caddy and Authentik |
| **Caddy**       | Docker (VPS)    | Reverse Proxy & SSL             | Primary ingress router                                   |
| **Authentik**   | Docker (VPS)    | Authentication                  | Used for auth of public facing services                  |

---

### Switch Port Allocation & VLANs - 2960-S 10G

The network is segmented to isolate personal device and publicly accessible servers. The switch can only be managed via console cable. As of now there are no backups for the main Cisco switch. This is a known single point of failure — a `show running-config` should be pulled and stored off-box (e.g., in this repo's `Documentation/` folder) before any further changes are made to port or VLAN assignments.


**Subnet and VLANs**

| **VLAN ID** | **Name**             | **Subnet / Gateway** | **Description**                                                                                                     | Status          |
| ----------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| **10**      | Personal             | `192.168.10.0/24`    | Trusted personal devices -                                                                                          | Active          |
| **20**      | Servers              | `192.168.20.0/24`    | Proxmox server cluster - used for both internet access and local communications.                                    | Active          |
| **30**      | Management           | `192.168.30.0/24`    | Infrastructure management interface.                                                                                | Active          |
| **40**      | Wireless             | `192.168.40.0/24`    | Not used yet - Todo.                                                                                                | Not implemented |
| **50**      | Evil and IOT Devices | `192.168.50.0/24`    | Stuff like AI or IOT device cheaper then it should be.                                                              | Not implemented |
| **999**     | Hole (Native)        | N/A                  | Blackhole VLAN to prevent VLAN hopping.                                                                             | Shutdown        |
| **123**     | Parking              | N/A                  | This does nothing but hold unused interfaces.                                                                       | Shutdown        |
| **100**     | WAN                  | N/A                  | I use the switch to take in RJ45 and turn into SFP+ for the Router. Has a SPAN Link for a soft TAP and general DPI. | Active          |

**Ports** 

| **Port Range**        | **Assignment**     | **Mode**                            |
| --------------------- | ------------------ | ----------------------------------- |
| **G1/0/1 - G1/0/4**   | VLAN 10 (Personal) | Access - VLAN 10                    |
| **G1/0/5 - G1/0/12**  | VLAN 20 (Servers)  | Access - VLAN 20                    |
| **G1/0/13 - G1/0/21** | Parking (Unused)   | Shut                                |
| **Te1/0/1**           | Router Link - Wan  | Trunk (Allowed: 100)                |
| **Te1/0/2**           | Router Link - Lan  | Trunk (Allowed: 10, 20, 30, 40, 50) |
| **G1/0/22**           | SPAN (Tap)         | SPAN - Copy ISP Link (**G1/0/23**)  |
| **G1/0/23**<br>       | ISP Link - Wan     | Access - VLAN 100                   |
| **G1/0/24**<br>       | (Management)       | Access - VLAN 30                    |

![](assets/images/Pasted%20image%2020260605225652.png)


---

## ACL / Firewall

1. All server traffic ONLY uses WireGuard tunnel.
2. All personal traffic uses normal gateway.

Server Interface:
![](assets/images/Pasted%20image%2020260429164850.png)



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
## UFW / iptables Port Forwarding Configuration

This environment uses UFW (Uncomplicated Firewall) on the public VPS to forward raw TCP/UDP traffic (like game servers) that cannot be handled by a reverse proxy like Caddy. The rules are defined in the UFW before-rules configuration file to persist across reboots, routing traffic securely down the `wg0` WireGuard interface to the backend Proxmox gaming VM.

|**Parameter / Item**|**Configuration Value**|**Note**|
|---|---|---|
|**Config File Path**|`/etc/ufw/before.rules`|Handled via UFW's `*nat` table block|
|**Ingress Interface**|`eth0`|The public facing network interface of the VPS|
|**Egress Interface**|`wg0`|The WireGuard tunnel interface leading to your home network|
|**Destination IP**|`192.168.20.9`|The internal IP of the Pterodactyl/Minecraft VM|
|**Port Range**|`25565:25575`|Cover the proxy, lobby, vanilla, modded, and minigame arena servers (11 ports total)|
|**Protocols**|`tcp` and `udp`|Both forwarded to allow standard Java and Bedrock/Geyser support|

---

| **Subdomain**          | **Internal Destination** | **Port** | **Purpose / Service**       |
| ---------------------- | ------------------------ | -------- | --------------------------- |
| `auth.nickloves.me`    | `authentik-server-1`     | `9000`   | Authentik Identity Provider |
| `proxmox.nickloves.me` | `192.168.20.3`           | `8006`   | Proxmox VE (via WireGuard)  |
| `post.nickloves.me`    | `192.168.20.5`           | `8080`   | This Website                |

---
### Other Notes

## Spanning Tree (STP) / BPDU Guard:
When the Netgate router reboots, its internal switch briefly acts unmanaged and passes Cisco BPDU packets from the LAN switch out to the WAN. This triggers BPDU Guard and shuts down the port.

> _Fix:_ The trunk port connected to the router requires `spanning-tree bpdufilter enable` to prevent sending STP packets during this window.

## VPS Hardening: 
Unnecessary services have been disabled to harden the public-facing VPS. Automatic unattended upgrades are enabled. 

## Single point of failure:
There are many things that would fail the whole lab, however currently the most unreliable item would be the 15+ year old 2.5 inch SATA hard drive from Apple, that is currently the boot drive of Pfsence. Also I should replace the old unbranded RAM I got for free.

## WireGuard Note: 
When replacing a router, **export and document every WireGuard peer setting** from the old router before decommissioning it. `AllowedIPs = 0.0.0.0/0` is required on any peer that is being used as a default gateway for internet traffic, not just for tunnel-to-tunnel communication. This is easy to miss because the tunnel itself will appear healthy (handshake succeeds, gateway monitoring passes) while internet traffic is silently dropped.

## C States 
Something was causing the system to freeze on the router, there were no crash reports the whole thing would freeze till reboot, I fixed this by disabling all the power saving options, and C States in BIOS. 

## MTU

MTU likes to break stuff watch out for it 