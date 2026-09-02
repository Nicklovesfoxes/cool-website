---
layout: page
title: Router
description: Netgate router / pfSense - firewall, WireGuard, and known issues
toc: "true"
---
**Hardware:** Pile of Junk running PfSense
**Management**: Default gateway of onboard RJ45 NIC or Management Subnet 
**Role:** Primary network gateway and firewall
**Backup Located**: somewhere I think

---
## ACL / Firewall

Nothing is let in the wan, all inbound is through the WireGuard tunnel, the vlans are set up to not allow cross talk.

---
## WireGuard

A Virtual Private Server (VPS) is used to expose internal services securely. The VPS server routes traffic through this tunnel (see [VPS Proxy](/Documentation/Network/VPS%20Proxy)).

| **Configuration Item** | **Value**                       | **Note**                                           |
| ---------------------- | ------------------------------- | -------------------------------------------------- |
| **Tunnel Device**      | `tun_wg0`                       | Assigned to interface `WG_VPN (opt2)`              |
| **Description**        | WireGuard to VPS                | The router is a peer                               |
| **Listen Port**        | `51820`                         | Standard WireGuard port - **TODO: change to a random port** |
| **MTU**                | `1420`                          | (Recommended for WireGuard to avoid fragmentation) |
| **Allowed IPs**        | `10.10.0.1/32`, `0.0.0.0/0`     | Routes traffic for the tunnel and the Internet     |

> **WireGuard note:** When replacing a router, **export and document every WireGuard peer setting** from the old router before decommissioning it. `AllowedIPs = 0.0.0.0/0` is required on any peer that is being used as a default gateway for internet traffic, not just for tunnel-to-tunnel communication. This is easy to miss because the tunnel itself will appear healthy (handshake succeeds, gateway monitoring passes) while internet traffic is silently dropped.

---
## DHCP Server 
The router gives out DHCP leases for many of the VLANS, generally I will hand them out  at 192.168.x.100 - 192.168.x.199

---
## Known Issues / Notes

## C States
Something was causing the system to freeze on the router, there were no crash reports - the whole thing would freeze till reboot. Fixed by disabling all the power saving options and C States in BIOS.

## failure to reconnect after power outage
The whole WireGuard link will generaly stay down after a power outage I still do not know the cause.  

## Single Point of Failure
There are many things that would fail the whole lab, however currently the most unreliable item would be the 12+ year old 2.5 inch SATA hard drive from Apple, that is currently the boot drive of PfSense. Also should replace the old unbranded RAM.

## Windows PC look
Small parts on the WAN link are set up to look like a windows PC from the WAN side. 

## Subnet mask

![](/assets/images/Pasted%20image%2020260717132536.png)
Don't make this mistake again use the correct subnet mask on new interfaces. 