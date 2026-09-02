---
layout: page
title: Auth Server
description: VM hosting Authentik and Vaultwarden
toc: "true"
---
**IP:** `192.168.20.10`
**Username:** auth

---

Authentik and Vaultwarden both run on this VM, each in Docker - grouped together since they're both auth-adjacent services.

Authentik provides SSO/forward-auth for Vaultwarden.

Vaultwarden is the self-hosted password vault, port `80`, gated behind Authentik SSO - same forward-auth pattern as Proxmox (see [VPS Proxy](Documentation/Network/VPS%20Proxy.md)). Standard hardening is applied (admin panel token-protected, new signups disabled). Some passwords are written down; most VM and locally-used passwords are randomly generated and stored in it.

There's no formal server-side backup for the vault. The closest thing is that every device using the Bitwarden-compatible browser extension keeps a local encrypted copy of the vault, so losing the server wouldn't wipe out every copy at once - but restoring a canonical vault would still mean rebuilding from whichever device's local copy is most current. 