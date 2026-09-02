---
layout: page
title: Host nodes
description: Proxmox cluster - hosts and access
toc: "true"
---
**Status:** Needs work - there are no backups yet, storage layout / VM placement not documented.

---

Servers use the following subnets 

| **Name** | **VLAN** | **Subnet**        | **Description**                            |
| -------- | -------- | ----------------- | ------------------------------------------ |
| Servers  | 20       | `192.168.20.0/24` | Used by the VMs and Services               |
| Core     | 25       | `192.168.25.0/24` | Core layer for hosts to talk to each other |
| Remote   | 35       | `192.168.35.0/24` | Mainly for proxied GUI.                    |


The hosts and most the vms will use manual IPs, DHCP existes for `192.168.20.0/24`


The IPs will start at 192.168.35.2 - 9 for the hosts (same IP for core IP 192.168.25.x) , then 192.168.20.10 - 99 for the VMs, 192.168.20.99 - 255 are for DHCP VMs. 


| **Hostname** | **Role**                        | **IP**         | **RAM** | Physically                 |
| ------------ | ------------------------------- | -------------- | ------- | -------------------------- |
| pve          | bulk storage and main buff node | `192.168.35.2` | 64 GB   | Workstation PC             |
| pve2         | Backup location and small VMs   | `192.168.35.3` | 8 GB    | Junk in a rack mounted box |
| pve3         | Tie Breaker and small VMs       | `192.168.35.4` |         | Mini PC                    |

---

## Cluster Configuration

Standard 3-node Proxmox cluster (pve, pve2, pve3) with quorum via corosync, running over the Core network (VLAN 25, `192.168.25.0/24`).

## Access / Auth

The Proxmox web UI is accessed through Authentik (see [Auth Server](/Documentation/VMs/Auth%20Server)), the same SSO pattern used for the other public-facing services (see [VPS Proxy](/Documentation/Network/VPS%20Proxy)).

## Backups

None yet. This is a known gap - see the [To-Do](/Documentation/To-Do) list ("central backup for all Proxmox VMs and hosts").

---

![](/assets/images/Pasted%20image%2020260902122308.png)


