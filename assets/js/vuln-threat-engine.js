(() => {
	"use strict";

	const DEFAULT_MIN_CVSS = 7.0;
	const DEFAULT_MIN_EPSS_PERCENTILE = 70;
	const DEFAULT_DAYS_BACK = 30;
	const DEFAULT_MAX_PAGES = 15;
	const DEFAULT_PAGE_SIZE = 20;
	const DEFAULT_TARGET_COUNT = 10;
	const DEFAULT_EPSS_BATCH_SIZE = 120;
	const UNAVAILABLE_MESSAGE = "Affected version data unavailable.";

	function toNumber(value) {
		if (typeof value === "number") return Number.isFinite(value) ? value : null;
		if (typeof value === "string" && value.trim()) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : null;
		}
		return null;
	}

	function clampNumber(value, min, max, fallback) {
		const numeric = toNumber(value);
		if (numeric === null) return fallback;
		return Math.min(max, Math.max(min, numeric));
	}

	function clampDaysBack(value, fallback) {
		const numeric = toNumber(value);
		if (numeric === null) return fallback;
		return numeric >= 45 ? 60 : 30;
	}

	function formatDaysLabel(daysBack) {
		return `Past ${daysBack} days`;
	}

	function getPublishedCutoffMs(daysBack) {
		const cutoff = new Date();
		cutoff.setHours(0, 0, 0, 0);
		cutoff.setDate(cutoff.getDate() - daysBack);
		return cutoff.getTime();
	}

	function normalizeFilterState(rawState, defaults) {
		const minCvss = clampNumber(rawState.minCvss, 1, 10, defaults.minCvss);
		const minEpssPercentile = clampNumber(rawState.minEpssPercentile, 1, 99, defaults.minEpssPercentile);
		const daysBack = clampDaysBack(rawState.daysBack, defaults.daysBack);
		return {
			minCvss,
			minEpssPercentile,
			minEpssPercentile01: minEpssPercentile / 100,
			daysBack,
			publishedCutoffMs: getPublishedCutoffMs(daysBack),
		};
	}

	function inferRepoName(sourceCodeLocation) {
		if (typeof sourceCodeLocation !== "string" || !sourceCodeLocation) return "";
		try {
			const url = new URL(sourceCodeLocation);
			const parts = url.pathname.replace(/^\/+/, "").split("/");
			if (parts.length < 2) return "";
			return parts[1] || "";
		} catch {
			return "";
		}
	}

	function getFirstPackage(advisory) {
		const entries = Array.isArray(advisory && advisory.vulnerabilities) ? advisory.vulnerabilities : [];
		const first = entries[0];

		const standardPackageName =
			first && first.package && typeof first.package.name === "string"
				? first.package.name.trim()
				: "";
		const standardEcosystem =
			first && first.package && typeof first.package.ecosystem === "string"
				? first.package.ecosystem.trim()
				: "";

		if (standardPackageName) {
			return {
				name: standardPackageName,
				ecosystem: standardEcosystem || "unknown",
			};
		}

		const repoName = inferRepoName(advisory && advisory.source_code_location);
		const vendor = inferVendor(advisory);

		if (repoName) {
			return {
				name: repoName,
				ecosystem: "Repository",
			};
		}

		if (vendor) {
			return {
				name: vendor + " Appliance/Product",
				ecosystem: "Infrastructure",
			};
		}

		return {
			name: "Core System / Infrastructure",
			ecosystem: "Unspecified",
		};
	}

	function inferVendor(advisory) {
		if (!advisory || typeof advisory.source_code_location !== "string") return "";
		try {
			const url = new URL(advisory.source_code_location);
			const [owner] = url.pathname.replace(/^\/+/, "").split("/");
			return owner || "";
		} catch {
			return "";
		}
	}

	function extractCve(advisory) {
		if (typeof advisory.cve_id === "string" && advisory.cve_id.startsWith("CVE-")) {
			return advisory.cve_id;
		}

		const identifiers = Array.isArray(advisory.identifiers) ? advisory.identifiers : [];
		for (const identifier of identifiers) {
			if (!identifier || identifier.type !== "CVE") continue;
			if (typeof identifier.value === "string" && identifier.value.startsWith("CVE-")) {
				return identifier.value;
			}
		}

		return null;
	}

	function pickCvssScore(advisory) {
		const scores = [
			toNumber(advisory.cvss && advisory.cvss.score),
			toNumber(advisory.cvss_severities && advisory.cvss_severities.cvss_v3 && advisory.cvss_severities.cvss_v3.score),
			toNumber(advisory.cvss_severities && advisory.cvss_severities.cvss_v4 && advisory.cvss_severities.cvss_v4.score),
		].filter((n) => n !== null);

		if (!scores.length) return null;
		return scores[0];
	}

	function formatGithubAffectedEntry(entry) {
		if (!entry || typeof entry !== "object") return null;

		const packageInfo = entry.package || {};
		const packageName = typeof packageInfo.name === "string" ? packageInfo.name : "unknown";
		const ecosystem = typeof packageInfo.ecosystem === "string" ? packageInfo.ecosystem : "unknown";
		const vulnerableRange = typeof entry.vulnerable_version_range === "string" ? entry.vulnerable_version_range.trim() : "";
		const patchedVersion =
			entry.first_patched_version && typeof entry.first_patched_version.identifier === "string"
				? entry.first_patched_version.identifier.trim()
				: "";

		const parts = [`${ecosystem}:${packageName}`];
		if (vulnerableRange) parts.push(`affected: ${vulnerableRange}`);
		if (patchedVersion) parts.push(`patched: ${patchedVersion}`);
		return parts.join(" | ");
	}

	function getGithubAffectedDetails(advisory) {
		const entries = Array.isArray(advisory && advisory.vulnerabilities) ? advisory.vulnerabilities : [];
		return entries.map(formatGithubAffectedEntry).filter(Boolean).slice(0, 8);
	}

	function normalizeCandidate(advisory, filters) {
		if (!advisory || advisory.withdrawn_at) return null;
		const severity = String(advisory.severity || "").toLowerCase();
		if (severity !== "high" && severity !== "critical") return null;

		const cve = extractCve(advisory);
		if (!cve) return null;

		const cvss = pickCvssScore(advisory);
		if (cvss === null || cvss < filters.minCvss) return null;

		const publishedAt = String(advisory.published_at || "");
		const publishedAtMs = Date.parse(publishedAt);
		if (!Number.isFinite(publishedAtMs) || publishedAtMs < filters.publishedCutoffMs) return null;

		const pkg = getFirstPackage(advisory);
		const vendor = inferVendor(advisory);
		const summary = String(advisory.summary || "No summary available.").trim();
		const clippedSummary = summary.length > 260 ? `${summary.slice(0, 257)}...` : summary;

		return {
			ghsaId: String(advisory.ghsa_id || ""),
			cve,
			severity,
			cvss,
			vendor,
			packageLabel: vendor ? `${vendor}/${pkg.name}` : pkg.name,
			packageName: pkg.name,
			ecosystem: pkg.ecosystem,
			summary: clippedSummary,
			publishedAt,
			htmlUrl: String(advisory.html_url || ""),
			affectedDetails: getGithubAffectedDetails(advisory),
		};
	}

	function resolveAffectedDetails(item) {
		if (Array.isArray(item.affectedDetails) && item.affectedDetails.length) {
			return item.affectedDetails.slice(0, 8);
		}
		return [UNAVAILABLE_MESSAGE];
	}

	function chunkArray(items, size) {
		if (!Array.isArray(items) || !items.length) return [];
		const chunks = [];
		for (let index = 0; index < items.length; index += size) {
			chunks.push(items.slice(index, index + size));
		}
		return chunks;
	}

	async function fetchEpssMapForCandidates(cves, options = {}) {
		const { signal, fetchEpssBatch, log, batchSize = DEFAULT_EPSS_BATCH_SIZE } = options;
		const uniqueCves = Array.from(new Set(cves.filter(Boolean)));
		if (!uniqueCves.length) return new Map();

		const chunks = chunkArray(uniqueCves, Math.max(1, batchSize));
		const maps = await Promise.all(chunks.map((chunk) => fetchEpssBatch(chunk, signal)));
		const merged = new Map();
		for (const map of maps) {
			for (const [cve, score] of map.entries()) {
				merged.set(cve, score);
			}
		}

		if (typeof log === "function") {
			log("info", "EPSS enrichment summary", {
				requested: uniqueCves.length,
				batches: chunks.length,
				returned: merged.size,
			});
		}

		return merged;
	}

	function compareThreats(a, b) {
		const percentileA = Number.isFinite(a.epssPercentile) ? a.epssPercentile : 0;
		const percentileB = Number.isFinite(b.epssPercentile) ? b.epssPercentile : 0;
		if (percentileA !== percentileB) return percentileB - percentileA;

		const cvssA = Number.isFinite(a.cvss) ? a.cvss : 0;
		const cvssB = Number.isFinite(b.cvss) ? b.cvss : 0;
		if (cvssA !== cvssB) return cvssB - cvssA;

		const publishedA = Date.parse(String(a.publishedAt || ""));
		const publishedB = Date.parse(String(b.publishedAt || ""));
		if (Number.isFinite(publishedA) && Number.isFinite(publishedB) && publishedA !== publishedB) {
			return publishedB - publishedA;
		}

		return String(a.cve || "").localeCompare(String(b.cve || ""));
	}

	async function collectVulnerabilities(options) {
		const {
			signal,
			filters,
			log,
			createInitialGithubUrl,
			fetchGithubPage,
			fetchEpssBatch,
			maxPages = DEFAULT_MAX_PAGES,
			pageSize = DEFAULT_PAGE_SIZE,
			targetCount = DEFAULT_TARGET_COUNT,
			epssBatchSize = DEFAULT_EPSS_BATCH_SIZE,
		} = options || {};

		const candidatesPool = [];
		const seenCves = new Set();
		let pageCount = 0;
		let stopReason = "unknown";
		let nextUrl = createInitialGithubUrl(pageSize);
		let totalAdvisoriesFetched = 0;
		let totalCandidates = 0;
		let githubApiFailed = false;

		while (nextUrl && pageCount < maxPages) {
			pageCount += 1;
			if (typeof log === "function") {
				log("info", "Advisory page scan start", {
					page: pageCount,
					maxPages,
					currentCandidates: candidatesPool.length,
				});
			}

			let page;
			try {
				page = await fetchGithubPage(nextUrl.toString(), signal);
			} catch (error) {
				if (signal && signal.aborted) throw error;
				githubApiFailed = true;
				stopReason = "github_api_failed";
				if (typeof log === "function") {
					log("warn", "GitHub fetch failed during scan; using partial collected data.", {
						page: pageCount,
						message: error && error.message ? error.message : "unknown error",
					});
				}
				break;
			}
			nextUrl = page.nextUrl ? new URL(page.nextUrl) : null;
			totalAdvisoriesFetched += page.advisories.length;

			const pagePublishedAtMs = page.advisories
				.map((advisory) => Date.parse(String(advisory && advisory.published_at ? advisory.published_at : "")))
				.filter(Number.isFinite);
			const advisoriesWithinWindow = pagePublishedAtMs.filter((ms) => ms >= filters.publishedCutoffMs).length;
			const windowExhausted = pagePublishedAtMs.length > 0 && advisoriesWithinWindow === 0;
			if (windowExhausted) {
				stopReason = "window_exhausted";
				break;
			}

			const candidates = page.advisories
				.map((advisory) => normalizeCandidate(advisory, filters))
				.filter(Boolean)
				.filter((item) => !seenCves.has(item.cve));

			totalCandidates += candidates.length;
			if (typeof log === "function") {
				log("info", "Page candidate summary", {
					page: pageCount,
					advisoriesFetched: page.advisories.length,
					advisoriesWithinWindow,
					candidatesAfterCvssCve: candidates.length,
				});
			}

			for (const item of candidates) {
				seenCves.add(item.cve);
				candidatesPool.push(item);
			}

			if (!nextUrl) {
				stopReason = "no_next_page";
				break;
			}

			if (pageCount >= maxPages) {
				stopReason = "page_cap_reached";
				break;
			}
		}

		if (stopReason === "unknown") {
			if (!nextUrl) {
				stopReason = "no_next_page";
			} else if (pageCount >= maxPages) {
				stopReason = "page_cap_reached";
			}
		}

		const allCves = candidatesPool.map((item) => item.cve);
		let epssByCve = new Map();
		let epssApiFailed = false;
		try {
			epssByCve = await fetchEpssMapForCandidates(allCves, {
				signal,
				fetchEpssBatch,
				log,
				batchSize: epssBatchSize,
			});
		} catch (error) {
			epssApiFailed = true;
			if (typeof log === "function") {
				log("warn", "EPSS API unavailable. Falling back to pending EPSS values.", {
					message: error && error.message ? error.message : "unknown error",
				});
			}
			epssByCve = new Map();
		}

		const enrichedCandidates = [];
		let epssMissing = 0;
		let epssBelowThreshold = 0;
		for (const candidate of candidatesPool) {
			const epss = epssByCve.get(candidate.cve);
			const hasEpss = !!epss;
			const epssPercentile = hasEpss ? epss.percentile : 0;
			const epssScore = hasEpss ? epss.epss : null;
			const epssPending = !hasEpss;

			if (hasEpss && epss.percentile < filters.minEpssPercentile01) {
				epssBelowThreshold += 1;
				continue;
			}

			if (!hasEpss) {
				epssMissing += 1;
			}

			enrichedCandidates.push({
				...candidate,
				epssPercentile,
				epssScore,
				epssPending,
			});
		}

		enrichedCandidates.sort(compareThreats);
		const selected = enrichedCandidates.slice(0, targetCount).map((item) => ({
			...item,
			affectedDetails: resolveAffectedDetails(item),
		}));

		if (typeof log === "function") {
			log("info", "Collection complete", {
				selected: selected.length,
				totalAdvisoriesFetched,
				totalCandidates,
				totalQualified: enrichedCandidates.length,
				epssMissing,
				epssBelowThreshold,
				epssApiFailed,
				pagesScanned: pageCount,
				stopReason,
			});
		}

		return {
			items: selected,
			pagesScanned: pageCount,
			complete: selected.length >= targetCount,
			stopReason,
			totalQualified: enrichedCandidates.length,
			warnings: {
				github: githubApiFailed,
				epss: epssApiFailed,
			},
		};
	}

	window.VulnAlertsThreatEngine = {
		defaults: {
			minCvss: DEFAULT_MIN_CVSS,
			minEpssPercentile: DEFAULT_MIN_EPSS_PERCENTILE,
			daysBack: DEFAULT_DAYS_BACK,
			maxPages: DEFAULT_MAX_PAGES,
			pageSize: DEFAULT_PAGE_SIZE,
			targetCount: DEFAULT_TARGET_COUNT,
			epssBatchSize: DEFAULT_EPSS_BATCH_SIZE,
			unavailableMessage: UNAVAILABLE_MESSAGE,
		},
		clampNumber,
		clampDaysBack,
		formatDaysLabel,
		normalizeFilterState,
		collectVulnerabilities,
	};
})();
