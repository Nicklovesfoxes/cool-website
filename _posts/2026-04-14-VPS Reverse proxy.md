---
layout: post
title: VPS Reverse proxy Setup
date: 2026-04-14
description: VPS Reverse proxy Setup with Caddy, Docker, and WireGuard
---
Exposing your home lab directly to the internet is a massive security risk. By utilizing an affordable public Virtual Private Server (VPS) as a secure gateway, you can mask your home IP address, automatically handle SSL certificates, and drop malicious traffic before it ever reaches your local network.

You will transform a minimal Ubuntu VPS into a simple reverse proxy. We will secure the base system with Fail2Ban, tunnel traffic back to your home server using WireGuard, and route web requests using Caddy inside a Docker container.

### The Architecture & Prerequisites

The following are needed beforehand:
- **A Cloud VPS:** A minimal Ubuntu server from providers like Linode, DigitalOcean, or Hetzner.
- **A Domain Name:** With DNS A-records pointing to your VPS's public IP address.
- **A Local Home Server:** The machine hosting your actual web apps or static sites.
- **Basic Terminal Access:** SSH access to both your VPS and your local server.

> Why this specific stack?
> Running a reverse proxy directly on your home network requires opening ports on your residential router, exposing your home IP to DDoS attacks and port scanners. By placing Caddy on a VPS, the VPS absorbs all public traffic. WireGuard then creates an encrypted, private tunnel between the VPS and your home server. This completely bypasses residential NAT restrictions and keeps your home network strictly firewalled.
> In some scenarios like a university double NAT or CGNAT, traditional port forwarding will not work.

---

### Step 1: Secure the Minimal Ubuntu VPS

Start by SSHing into your fresh Ubuntu VPS. Before installing any routing software, we need to establish a baseline of security. Use SSH keys and disable password login.

Update the system and install core utilities:

```Bash
sudo apt update && sudo apt upgrade -y
sudo apt install fail2ban ufw wireguard -y
```

**Configure the Firewall (UFW)**

Only expose exactly what is necessary. Allow SSH for access and a UDP port for WireGuard.

```Bash
sudo ufw allow 22
sudo ufw allow 51820/udp
sudo ufw enable
```

> **Warning:** Be aware that by default, Docker modifies `iptables` directly to route traffic to containers. This means Docker will **bypass UFW entirely**. While we want ports 80 and 443 open for Caddy in this setup, keep this in mind if you spin up other containers on this VPS in the future.

Fail2Ban runs quietly in the background. It monitors your log files for suspicious activity like automated bots trying to brute-force your SSH password and temporarily bans their IP addresses at the firewall level. For best practice, copy the default configuration to a local file so your settings persist through system updates:

```Bash
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
```

You can edit `jail.local` to adjust ban times and max retries for your SSH jail.

---

### Step 2: Establish the WireGuard Tunnel

**Understanding the Architecture** How you configure this depends on your home hardware:
- The Router Method (Used in this guide), You have a WireGuard-capable router (like pfSense, OPNsense, or Unifi) acting as the tunnel endpoint. The VPS talks to the router, and the router forwards the traffic to your internal servers. This is ideal for multi-server labs.
- The Single Server Method, If you do not have an advanced router, you install WireGuard directly on the specific home server hosting your apps. The VPS talks only to that single machine.

[WireGuard](https://www.wireguard.com/) is a modern, lightning-fast VPN protocol. In this architecture, the VPS acts as the "server" and your local home machine acts as a "peer".

Configuring WireGuard is very quick and easy, Read the official WireGuard [documentation](https://www.wireguard.com) or watch a YouTube video setting up a WireGuard tunnel. 

Use a private subnet specifically for the VPN tunnel (e.g., `10.10.0.x`):
- The VPS is assigned `10.10.0.1`.
- The pfSense Router is assigned `10.10.0.2`.

Once the tunnel is active, the VPS can communicate with the home network entirely bypassing the public internet.

[screen shoot of `wg show` on the VPS confirming a successful handshake with the router peer]

> This is an example `/etc/wireguard/wg0.conf` file, This is from the VPS (sever) perspective allowing my router (peer) `10.10.0.2/32` and my local servers subnet `192.168.20.0/24`.

``` Toml
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = 

[Peer]
PublicKey = imgqtDNvnfSlWRwDinqiuubdDpdRZgIfSBFLJxw=
AllowedIPs = 10.10.0.2/32, 192.168.20.0/24
```

When configuring the WireGuard tunnel on your pfSense router (or any home peer sitting behind a NAT), include: `PersistentKeepalive`.

> The firewall state will naturally close inactive connections. Setting `PersistentKeepalive = 25` forces pfSense to send a tiny ping through the tunnel every 25 seconds. This keeps the NAT state open, ensuring the VPS can instantly push web traffic down to server.

---

### Step 3: Dockerize the Reverse Proxy (Caddy)

We will run Caddy inside Docker. This keeps our proxy isolated and makes it incredibly easy to back up or migrate in the future. 
If Docker is not already installed on the VPS, install it:
```Bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

> **Note on Production Environments:** This script is perfect for quickly spinning up a home lab. However, if you are building a strict, enterprise-grade production server, it is generally recommended to install Docker manually via the `apt` repository. If you prefer that method, follow the manual instructions in the [official Docker documentation](https://docs.docker.com/engine/install/ubuntu/).

To verify that docker is installed 
``` bash
docker --version
```

**Create the Directory Structure**
Following the Filesystem Hierarchy Standard (FHS), we will place our proxy configuration in `/opt`. Keeping custom Docker deployments outside of `/home` or `/root` keeps your filesystem clean and simplifies backups.
```Bash
sudo mkdir -p /opt/docker/caddy
cd /opt/docker/caddy
```

Because the configuration uses an external Docker network named `proxy`, you must create it first before starting your container:
```Bash
docker network create proxy
```

Create a `docker-compose.yml` file. Think of this file as the blueprint for the local server environment. This file tells Docker exactly which containers to download, how they should communicate, and what rules they need to follow.

```bash
sudo nano docker-compose.yml 
```

```YAML
services:
  caddy:
    image: caddy:latest # Use a pinned version for production stability
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - ./caddy_data:/data
      - ./caddy_config:/config
    networks:
      - proxy

networks:
  proxy:
    external: true
```

> **Note on Volumes:** The `caddy_data` volume is critical. Caddy automatically provisions Let's Encrypt SSL certificates for your domains. If you do not persist this data volume, Caddy will request new certificates every time the container restarts, which will quickly trigger Let's Encrypt rate limits and lock you out of your domain.

> Avoid blindly copying and pasting docker-compose files from the internet. Make sure you understand exactly what each line does before running it. Reference the official Docker [documentation](https://docs.docker.com/), and use AI to explain confusing configurations.

---

### Step 4: Configure Routing & Identity

Next, create the `Caddyfile` in the same directory (`/opt/docker/caddy`). This file tells Caddy exactly how to route incoming traffic through the WireGuard tunnel.

```Bash
sudo nano Caddyfile
```

```
# Replace with your actual domain and IPs
app.yourdomain.com {
    reverse_proxy 192.168.20.x:8080
}

whatever.yourdomain.com {
    reverse_proxy 192.168.20.x:1234
}
```

> **Note for Single Server Setups:** If you are _not_ using a router like pfSense to handle your VPN tunnel and instead installed WireGuard directly onto your specific home server, the VPS does not know how to reach your `192.168.20.x` subnet. If you use those IPs, the connection will fail.
> Instead, point Caddy directly to your server's WireGuard IP along with the specific port your application uses. For example: `reverse_proxy 10.10.0.2:8080`.

Once your Caddyfile is saved, start the proxy:

```Bash
sudo docker compose up -d
```

> Caddy will instantly boot, read your domain names, automatically fetch SSL certificates, and securely pipe the traffic down your WireGuard tunnel to your local server.

[screen shoot of the site loading over HTTPS with a valid Let's Encrypt certificate]

---
### Post-Deployment Security

Use Unattended Upgrades so Ubuntu automatically installs security patches without manual intervention.

While your network is now hidden from the public web, the applications you host are still exposed to anyone who navigates to your domain, this is fine for a blog website but very bad for any private dashboards.  
To take this architecture to the next level, explore Authentik. Authentik is an open-source Identity Provider that integrates seamlessly with Caddy using "forward authentication." Instead of relying on the built-in login screens of your various self-hosted apps, Authentik places a unified, highly secure SSO (Single Sign-On) portal in front of your entire domain. When a user visits `app.yourdomain.com`, Caddy halts the request, forces the user to authenticate through Authentik (complete with 2FA/MFA), and only passes the traffic through the WireGuard tunnel if the user is authorized.