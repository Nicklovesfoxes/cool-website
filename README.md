# Homelab Blog & Documentation

A self-hosted site for homelab runbooks, technical guides, and interactive tools. Built with Jekyll and vanilla JavaScript.

## Content

- **Technical Blog**: Guides on static site hosting, Docker automation, reverse proxies, and WireGuard tunneling
- **Lab Documentation**: Proxmox infrastructure, service architecture, VLAN segmentation, and deployment patterns
- **Interactive Vulnerability Scanner**: Real-time CVE alerts with CVSS/EPSS filtering and caching

## Features

- **Vulnerability Alerts**: Browser-based CVE scanner integrating GitHub advisories and FIRST EPSS data with granular filtering (CVSS score, EPSS percentile, time windows)
- **Device Fingerprinting**: WebGL renderer detection, GPU info, and device capabilities
- **Minimal Design**: Grid-based tile layout, dark mode, no frameworks
- **Performance Optimized**: Strategic timer management, fetch abort controllers, localStorage caching

## Tech Stack

- **Static Site Generator**: Jekyll with Kramdown
- **Styling**: Vanilla CSS with CSS variables
- **Interactives**: Vanilla JavaScript (no frameworks)
- **Hosting**: Docker + Caddy reverse proxy (normally on homelab, currently on GitHub)

## Architecture Notes

The vulnerability scanner (`vulnerability-alerts.js`) queries GitHub's advisory API and FIRST EPSS, renders results in a master/detail split view, and caches data locally for 24 hours. Device fingerprinting is scoped to the fingerprint tile only. A custom timer tracking system enables a killswitch that clears all timers, aborts active fetches, and cleans up event listeners.

## Status

Currently hosted on GitHub. Normally self-hosted on homelab, the homelab was forced to be taken off internet. 
