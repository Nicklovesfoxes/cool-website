---
layout: post
title: Ethernet Tap with a Switch
date: 2026-08-04
description: Building a Soft Ethernet Tap with a Switch SPAN Port
---
Visibility into what's actually crossing the WAN link is one of those things that's easy to put off until something goes wrong. A dedicated inline hardware tap is the "correct" answer, but it's another physical device, another cable run, and another thing that can fail and take the internet connection down with it. If the core switch already supports port mirroring, you can get the same visibility as a passive tap for free, using hardware already in the rack.

This is a "soft" tap: a Switched Port Analyzer (SPAN) session on a managed switch copies traffic from one port to another, purely for observation. Nothing sits inline, nothing can block traffic, and if the monitoring box falls over, the WAN link doesn't even notice.

---

### The Architecture & Prerequisites

- A managed switch that supports `monitor session` (this lab uses a Cisco Catalyst 2960-S/3560).
- A free physical port on that switch to act as the SPAN destination.
- A capture box with a spare NIC - a small VM, an old SFF, or a Raspberry Pi with a USB NIC all work.
- Optional: [Suricata](https://suricata.io/) or [Zeek](https://zeek.org/) for automated DPI/IDS, or just `tcpdump`/Wireshark for manual inspection.

> Why not a hardware tap? A hardware tap is strictly better for high-availability monitoring - it's completely passive at the electrical level and can't be misconfigured into affecting production traffic. A SPAN port is a software feature of the switch, so it competes with the switch's own CPU and backplane, and a bad `monitor session` command is one `configure terminal` away. For a homelab where the switch is already the single point of contact between the router and the ISP, SPAN is the zero-cost way to get most of the same visibility.

Per the [Home Lab Documentation](/Documentation/Home%20Lab%20Documentation), the switch's port allocation already reserves exactly this pair:

| **Port** | **Assignment** | **Mode** |
|---|---|---|
| **G1/0/23** | ISP Link - WAN | Access - VLAN 100 |
| **G1/0/22** | SPAN (Tap) | SPAN - Copy ISP Link (G1/0/23) |

G1/0/23 carries every packet in and out to the ISP. G1/0/22 is the dedicated, otherwise-unused port that will receive a copy of it.

---

### Step 1: Confirm the Source and Destination Ports

Before touching the config, confirm which physical port the ISP hands off on and which port is genuinely free. Getting this backwards means either mirroring the wrong traffic or accidentally turning a live access port into a receive-only SPAN destination.

```bash
show interfaces status
```

Cross-reference the output against the port table above. `Te1/0/1` and `Te1/0/2` are trunked to the router and should never be used as a SPAN source or destination in this setup - only `G1/0/23` (the raw ISP link) is the target.

---

### Step 2: Configure the SPAN Session

SSH or console into the switch and enter configuration mode:

```bash
enable
configure terminal
```

Create the monitor session, pointing the source at the ISP uplink and the destination at the dedicated tap port:

```bash
monitor session 1 source interface GigabitEthernet1/0/23 both
monitor session 1 destination interface GigabitEthernet1/0/22
end
```

- `both` mirrors traffic in both directions (ingress and egress) on the source port. Use `rx` or `tx` instead if only one direction matters.
- The destination port stops behaving like a normal switchport the moment it's assigned - it becomes receive-only and drops out of normal MAC learning and STP. Nothing else should ever be plugged into G1/0/22 while the session is active.

Verify the session is active:

```bash
show monitor session 1
```

> The [Home Lab Documentation](/Documentation/Home%20Lab%20Documentation) already flags that "there are no backups for the main Cisco switch." Before making this change (or any change) to the running config, pull a copy with `show running-config` and store it outside the switch - in this repo's `Documentation/` folder is a reasonable place. Console-only management means there's no web UI fallback if something gets fat-fingered.

Once confirmed, save the config so it survives a reboot:

```bash
write memory
```

---

### Step 3: Connect the Capture Hardware

Plug the monitoring box's spare NIC into G1/0/22. That interface should never get an IP address - it's purely listening, and assigning one just invites the switch (or the box itself) to try to treat it as a normal network member.

Put the interface into promiscuous mode and make sure it stays unaddressed:

```bash
sudo ip link set eth1 promisc on
sudo ip addr flush dev eth1
sudo ip link set eth1 up
```

---

### Step 4: Validate With a Packet Capture

Confirm the mirror is actually working before building anything on top of it:

```bash
sudo tcpdump -i eth1 -nn -c 20
```

You should see a live mix of traffic that clearly isn't just the monitoring box's own management traffic - DNS lookups, TLS handshakes, and other flows crossing the WAN link. If the capture is empty, double check the `monitor session` source/destination interfaces and that the cable is actually in G1/0/22.

---

### Step 5: Feed It Into a DPI/IDS Engine

A raw packet capture is only useful if something is actually looking at it. Point an IDS engine at the tap interface for automated alerting instead of manually running `tcpdump` every time something feels off:

```bash
sudo suricata -i eth1 -c /etc/suricata/suricata.yaml
```

This is the "general DPI" line item that shows up both in the switch's port table and on the [To-Do](Documentation/To-Do.md) list ("general DPI on my WAN side"). Alerts from here are also a natural feed for the "full scale logging collection and notifications" goal on the same list - ship Suricata's `eve.json` output to whatever central logging stack ends up handling that.

---

### Post-Deployment Notes

- **SPAN sessions aren't free.** Mirroring a saturated link can add real load to the switch's CPU and backplane. Watch for dropped mirrored packets under heavy WAN utilization - `show monitor session 1` and switch CPU stats will show it if it's happening.
- **This is observation only.** A SPAN-fed IDS can alert, it cannot block. Nothing about this setup stops malicious traffic in-line; it only makes it visible after the fact. Treat it as the visibility layer, not the enforcement layer.
- **Back up the switch config now.** With console-only management and no existing backups, a single mistyped `monitor session` command during a future change is an easy way to lose WAN connectivity with no quick way to see what changed.
