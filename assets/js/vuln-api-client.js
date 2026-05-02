(() => {
	"use strict";

	const GITHUB_BASE = "https://api.github.com/advisories";
	const EPSS_BASE = "https://api.first.org/data/v1/epss";

	function parseLinkHeader(header) {
		const links = new Map();
		if (!header) return links;

		for (const part of header.split(",")) {
			const pieces = part.trim().split(";");
			if (pieces.length < 2) continue;
			const urlMatch = pieces[0].match(/<([^>]+)>/);
			const relMatch = pieces[1].match(/rel=\"([^\"]+)\"/);
			if (!urlMatch || !relMatch) continue;
			links.set(relMatch[1], urlMatch[1]);
		}

		return links;
	}

	function createInitialGithubUrl(pageSize) {
		const nextUrl = new URL(GITHUB_BASE);
		nextUrl.searchParams.append("severity", "high");
		nextUrl.searchParams.append("severity", "critical");
		nextUrl.searchParams.set("sort", "published");
		nextUrl.searchParams.set("direction", "desc");
		nextUrl.searchParams.set("per_page", String(pageSize));
		return nextUrl;
	}

	async function fetchGithubPage(url, options = {}) {
		const { signal, log, errorToMeta } = options;
		if (typeof log === "function") {
			log("info", "GitHub fetch start", { url });
		}

		let response;
		try {
			response = await fetch(url, {
				headers: {
					Accept: "application/vnd.github+json",
				},
				signal,
			});
		} catch (error) {
			if (signal && signal.aborted) throw error;
			const wrapped = new Error(`GitHub network failure: ${error && error.message ? error.message : "unknown error"}`);
			wrapped.stage = "github-fetch-network";
			wrapped.cause = error;
			if (typeof log === "function") {
				log("error", "GitHub fetch network failure", typeof errorToMeta === "function" ? errorToMeta(wrapped) : wrapped);
			}
			throw wrapped;
		}

		if (!response.ok && response.status === 422) {
			try {
				const fallbackUrl = new URL(url);
				fallbackUrl.searchParams.delete("severity");
				if (typeof log === "function") {
					log("warn", "GitHub returned 422. Retrying without severity query parameters.", {
						originalUrl: url,
						fallbackUrl: fallbackUrl.toString(),
					});
				}

				const fallbackResponse = await fetch(fallbackUrl.toString(), {
					headers: {
						Accept: "application/vnd.github+json",
					},
					signal,
				});

				response = fallbackResponse;
				if (typeof log === "function") {
					if (fallbackResponse.ok) {
						log("warn", "GitHub fallback request succeeded.", { status: response.status });
					} else {
						log("error", "GitHub fallback request also failed.", { status: response.status });
					}
				}
			} catch (fallbackError) {
				if (typeof log === "function") {
					log("error", "GitHub fallback request threw an exception.", typeof errorToMeta === "function" ? errorToMeta(fallbackError) : fallbackError);
				}
			}
		}

		if (!response.ok) {
			let bodySnippet = "";
			try {
				bodySnippet = (await response.text()).slice(0, 400);
			} catch {
				bodySnippet = "(unable to read response body)";
			}
			const err = new Error(`GitHub advisories request failed (${response.status}).`);
			err.status = response.status;
			err.stage = "github-fetch-response";
			err.bodySnippet = bodySnippet;
			if (typeof log === "function") {
				log("error", "GitHub fetch non-OK response", {
					status: response.status,
					bodySnippet,
					rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
					rateLimitReset: response.headers.get("x-ratelimit-reset"),
				});
			}
			throw err;
		}

		let advisories;
		try {
			advisories = await response.json();
		} catch (error) {
			const wrapped = new Error(`GitHub response parse failure: ${error && error.message ? error.message : "invalid JSON"}`);
			wrapped.stage = "github-fetch-parse";
			wrapped.cause = error;
			if (typeof log === "function") {
				log("error", "GitHub JSON parse failure", typeof errorToMeta === "function" ? errorToMeta(wrapped) : wrapped);
			}
			throw wrapped;
		}

		const links = parseLinkHeader(response.headers.get("link"));
		if (typeof log === "function") {
			log("info", "GitHub fetch success", {
				status: response.status,
				count: Array.isArray(advisories) ? advisories.length : 0,
				hasNext: links.has("next"),
				rateLimitRemaining: response.headers.get("x-ratelimit-remaining"),
				rateLimitReset: response.headers.get("x-ratelimit-reset"),
			});
		}
		return {
			advisories: Array.isArray(advisories) ? advisories : [],
			nextUrl: links.get("next") || null,
		};
	}

	function toNumber(value) {
		if (typeof value === "number") return Number.isFinite(value) ? value : null;
		if (typeof value === "string" && value.trim()) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	}

	async function fetchEpssBatch(cves, options = {}) {
		const { signal, log, errorToMeta } = options;
		if (!cves.length) return new Map();

		const endpoint = `${EPSS_BASE}?cve=${encodeURIComponent(cves.join(","))}`;
		if (typeof log === "function") {
			log("info", "EPSS batch fetch start", { cveCount: cves.length });
		}

		let response;
		try {
			response = await fetch(endpoint, { signal });
		} catch (error) {
			if (signal && signal.aborted) throw error;
			const wrapped = new Error(`EPSS network failure: ${error && error.message ? error.message : "unknown error"}`);
			wrapped.stage = "epss-fetch-network";
			wrapped.cause = error;
			if (typeof log === "function") {
				log("error", "EPSS fetch network failure", typeof errorToMeta === "function" ? errorToMeta(wrapped) : wrapped);
			}
			throw wrapped;
		}

		if (!response.ok) {
			let bodySnippet = "";
			try {
				bodySnippet = (await response.text()).slice(0, 400);
			} catch {
				bodySnippet = "(unable to read response body)";
			}
			const err = new Error(`EPSS request failed (${response.status}).`);
			err.status = response.status;
			err.stage = "epss-fetch-response";
			err.bodySnippet = bodySnippet;
			if (typeof log === "function") {
				log("error", "EPSS fetch non-OK response", { status: response.status, bodySnippet });
			}
			throw err;
		}

		let payload;
		try {
			payload = await response.json();
		} catch (error) {
			const wrapped = new Error(`EPSS response parse failure: ${error && error.message ? error.message : "invalid JSON"}`);
			wrapped.stage = "epss-fetch-parse";
			wrapped.cause = error;
			if (typeof log === "function") {
				log("error", "EPSS JSON parse failure", typeof errorToMeta === "function" ? errorToMeta(wrapped) : wrapped);
			}
			throw wrapped;
		}

		const rows = Array.isArray(payload.data) ? payload.data : [];
		const byCve = new Map();
		for (const row of rows) {
			if (!row || typeof row.cve !== "string") continue;
			const percentile = toNumber(row.percentile);
			const epss = toNumber(row.epss);
			if (percentile === null || epss === null) continue;
			byCve.set(row.cve, {
				percentile,
				epss,
			});
		}

		if (typeof log === "function") {
			log("info", "EPSS batch fetch success", {
				requested: cves.length,
				returned: byCve.size,
			});
		}

		return byCve;
	}

	window.VulnAlertsApiClient = {
		createInitialGithubUrl,
		fetchGithubPage,
		fetchEpssBatch,
	};
})();
