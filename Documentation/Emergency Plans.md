---
layout: page
title: Emergency plans
description: What to do when bad stuff happens to the homeLab
toc: "true"
---

## DoS Attack

Ban the offending IP via Fail2Ban on the VPS (already running on the public-facing proxy - see [VPS Proxy](Documentation/Network/VPS%20Proxy.md)).

## DDoS Attack

Unplug the router, research current mitigation options, implement whatever's needed, then plug it back in. Since the VPS absorbs all public traffic by design (see [Double NAT](/2026/06/02/Double-NAT-Proxy-architecture/)), the home network itself shouldn't be directly reachable regardless.

## VPS Compromised

The VPS is treated as disposable and stateless on purpose (see the "Security" section of [Double NAT](/2026/06/02/Double-NAT-Proxy-architecture/)) - it holds no lab data, so the fix is to destroy and rebuild it rather than try to clean it. Restore from the DigitalOcean snapshot (see [VPS Proxy](Documentation/Network/VPS%20Proxy.md)), then rotate the WireGuard keypair and any secrets it held (Authentik secret key, Caddy config) before reconnecting it to the tunnel.

## VM or Host Rooted/Hacked

Unplug the affected host or VM's network cable first. VLANs are set up to block cross-talk between segments (see [Switch](Documentation/Network/Switch.md)), so this should contain the problem to that one host/VM. If it's unclear which host or VM is affected, unplug the router as a last resort to cut everything off at once.

## Drive Fails

Look up how to fix it and fix it. There are currently no backups for Proxmox VMs/hosts (see [Host Nodes](Documentation/Proxmox/Host%20nodes.md)) or for the Cisco switch config (see [Switch](Documentation/Network/Switch.md)), so a failure on any of those means rebuilding from scratch, not restoring. The router's boot drive is a known, especially old single point of failure (see [Router](Documentation/Network/Router.md)).

## WireGuard Tunnel Down

A cron job on the VPS already pages my phone when this happens (see [VPS Proxy](Documentation/Network/VPS%20Proxy.md)). The tunnel is known to sometimes fail to recover on its own after a power outage, for a still-unknown reason (see [Router](Documentation/Network/Router.md)) - if it doesn't come back within a few minutes, log into the router and restart WireGuard manually.

## Power or Internet Is Down

Nothing - no UPS or generator. Everything should come back up on its own once power/internet is restored, aside from possibly needing the manual WireGuard restart above.
