---
layout: post
title: Secure Static Site Hosting
date: 2026-04-08
description: " Automated Static Site Hosting with Docker, Watchtower, and a Reverse Proxy"
---
Hosting a static website does not require a massive cloud bill or a complex cluster. By combining a local home server with an affordable public VPS, you can build an enterprise-grade, highly secure hosting environment. Integrating GitHub Actions and Watchtower, transforms this setup into a fully automated deployment pipeline: simply push your code, and your website updates itself in minutes.

In this guide, you will deploy a Jekyll static website from a Git repository onto a local server, fully automate the build process, and securely expose it to the internet.

### The Architecture & Prerequisites

The following are needed beforehand or highly recommended. They are each a project on their own.

- A static website (such as Jekyll) sitting in a **public** GitHub repository.
- A local home server (this could be a Proxmox VM, a bare-metal machine, or a Raspberry Pi).
- A public-facing VPS running a reverse proxy. Caddy is highly recommended for its automatic SSL.
- A secure tunnel or routing method connecting your local server to your VPS. For example, you might configure your router to route server connections over a WireGuard tunnel or use a mesh VPN like Tailscale.

> Why use a VPS? 
> By placing Caddy on a public VPS and routing the traffic backward through a WireGuard tunnel, it will bypass residential NAT restrictions completely. This architecture gives absolute, granular control over ingress traffic, completely hides your home IP address from the public web, and allows a strict firewall on a local server to only speak to the WireGuard interface. 
> In some scenarios like a university double NAT or CGNAT, traditional port forwarding simply will not work.

The goal is to push your repo to GitHub and automatically have GitHub Actions build the site. The web server will update automatically, pulling the new build. 

---

### Step 1: Dockerize the Website

Instruct your repository on how to build the site into a lightweight container. In the root of a repository, create a file named `Dockerfile`.

For a Jekyll site, a multi-stage build is ideal. This process builds the site using a comprehensive Ruby environment but only packages the final HTML files into a minimal, highly optimized web server image.

Other environments may use a different process, I used AI to make a Dockerfile like this for Jekyll.

Dockerfile
```
FROM jekyll/jekyll:latest AS builder

# Set the working directory

WORKDIR /srv/jekyll

  

# Copy the repository files and assign ownership to the jekyll user

COPY --chown=jekyll:jekyll . /srv/jekyll

  

# Remove any conflicting local lockfiles, install dependencies, and build the site

RUN rm -f Gemfile.lock && \

    bundle install && \

    bundle exec jekyll build

  

FROM nginx:alpine

COPY --from=builder /srv/jekyll/_site /usr/share/nginx/html
```

---
### Step 2: Automate with GitHub Actions

Next, configure GitHub to automatically build the Dockerfile every time it is pushed to the `main` branch.

Create a file in your repository at `.github/workflows/docker.yml`:

YAML

```yml
name: Build and Publish Docker Image

on:
  push:
    branches: [ main ]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          #Ensure your username and repository name are completely lowercase!
          tags: ghcr.io/yourusername/your-repo-name:latest
```

_Commit and push these files to GitHub. If you navigate to your repository's "Actions" tab, you should see your image building and publishing to the GHCR._

[screen shoot of the GitHub Actions tab showing the build succeeding and the image published to GHCR]

---
### Step 3: Set Up the Home Server

Now, move to the local home server. Use `docker compose` to run the website alongside Watchtower, which serves as a automated updater.

SSH into your home server and ensure Docker is installed.

Make sure `curl` is installed (`sudo apt update && sudo apt install curl`)
To install Docker: 
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

To verify that docker is installed 
``` bash
docker --version
```

Create a new directory and configuration `docker-compose.yml` file 

_Install text editor of choice._
``` bash
sudo mkdir -p /opt/docker/jekyll
cd /opt/docker/jekyll
sudo nano docker-compose.yml 
```

> Why opt/docker/jekyll ? 
> Filesystem Hierarchy Standard (FHS) dictates that /opt is for optional or add-on software. Placing all Docker projects in /opt/docker/ makes it incredibly easy to manage backups and permissions in one place. On a minimal install, keeping custom applications outside of /home or /var keeps the files clean and easy to monitor.
> 
> Each directory acts as an isolated container that keeps configuration, site data, and temporary build files from cluttering the rest of the system. Docker Compose uses the folder name to automatically group containers and networks, ensuring Jekyll setup doesn't interfere with other services. This structure makes the entire website portable.

Create a `docker-compose.yml` file. Think of this file as the blueprint for the local server environment. This file tells Docker exactly which containers to download, how they should communicate, and what rules they need to follow.

Make sure to replace the image name with your actual GHCR path:

YAML
```yml
services:
  jekyll-site:
    image: ghcr.io/yourusername/your-repo-name:latest
    container_name: jekyll-site
    ports:
      - "8080:80"
    restart: always

  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - DOCKER_API_VERSION=1.40  #use the modern API
    command: --interval 3600 --cleanup
```

> Avoid blindly copying and pasting docker-compose files from the internet. Make sure you understand exactly what each line does before running it. Reference the official Docker [documentation](https://docs.docker.com/), and use AI to explain any confusing configurations.

Start the stack
``` bash
sudo docker compose up -d
```

Check it it's running go to `yourlocalserverIP:8080` , example `192.168.20.5:8080`

[screen shoot of the site loading in a browser at the local server's IP and port]

---
### Step 4: Connect the Reverse Proxy

The website is now running locally, and Watchtower is checking GitHub for updates. The final step is exposing it to the world.

> Ensure your public VPS and local server can communicate.

SSH into your public VPS.

Configure your reverse proxy (Caddy) to route traffic through your secure tunnel (e.g., WireGuard) to your home server's IP address.

If you are using Caddy, edit your `Caddyfile`

```
site.yourdomain.com {
    # Replace the IP below with your server's secure tunnel IP
    reverse_proxy 192.168.20.12:8080
}
```

> The Domain Block: The first part of the Caddyfile configuration (`blog.yourdomain.com`) dictates exactly which web addresses Caddy will listen for. Set this to absolutely anything such as `anything.yourdomain.com` or `www.yourdomain.com` as long as your domain name's DNS A-records point to your VPS's public IP address, or you have a wildcard (`*`) record configured.

Reload your proxy to apply the changes and automatically generate SSL certificates:
``` bash
sudo systemctl reload caddy
```

### Post-Deployment Security

This is a robust, hands-off hosting pipeline. To keep the web server secure, look into these standard practices:
- **SSH Key Authentication:** Look into disabling password logins entirely.
- **Uncomplicated Firewall (UFW):** Explore setting up a firewall.
- **Fail2Ban**: Consider installing Fail2Ban to automatically block IP addresses that exhibit malicious behavior or repeated failed login attempts on publicly reachable servers. However, you can avoid this utility if your VM is only accessible through a private VPN, as there would be no public traffic for the software to monitor.
- **Unattended Upgrades:** Enable this so Ubuntu automatically installs security patches without manual intervention.
- **Watchtower Webhooks**: Instead of relying on a time-based interval to poll for updates, configure Watchtower to listen for HTTP webhooks. Ensuring instant and resource-efficient deployments.