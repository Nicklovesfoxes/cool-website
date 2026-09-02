---
layout: page
title: Template VM
description: Template VM to use for new VMs
toc: "true"
---

---
## Base Configuration

- Ubuntu 24.04 LTS server, minimal install.
- Packages baked in: `nano`, `docker`, `fail2ban`, and `ping` (iputils).
- VM ID `102`, named `Minimal`, on node `pve`.
- Converted to a Proxmox template once set up.

## Cloud-Init Defaults

- **User:** Default (cloud-init default user)
- **Password:** none set
- **SSH public key:** none baked in
- **DNS domain / servers:** use host settings
- **Upgrade packages on first boot:** Yes
- **IP Config (net0):** set per-clone

## Hardware Defaults

| **Item**             | **Default**                                                          |
| --------------------- | --------------------------------------------------------------------- |
| **Memory**            | 2.00 GiB                                                               |
| **Processors**        | 1 (1 socket, 1 core) [x86-64-v2-AES]                                  |
| **BIOS**              | Default (SeaBIOS)                                                     |
| **Machine**           | Default (i440fx)                                                      |
| **SCSI Controller**   | VirtIO SCSI single                                                    |
| **Hard Disk (scsi0)** | `local-lvm:base-102-disk-0`, discard=on, iothread=1, size=32G, ssd=1  |
| **CloudInit Drive**   | `local-lvm:vm-102-cloudinit` (ide2)                                   |
| **Network (net0)**    | virtio, bridge=vmbr0, firewall=1, VLAN tag=20 (Servers)               |

Storage pool is whatever's local to the host node it's cloned on (currently `pve`, using `local-lvm`) - see [Host Nodes](Documentation/Proxmox/Host%20nodes.md).

## Cloning Convention

- Cloned as a **Full Clone** (not linked).
- Give it a hostname and username similar to its role, matching the pattern used by the other VMs.
- Add the username to the VM's Notes field in Proxmox.
- Add the password to the local password vault.