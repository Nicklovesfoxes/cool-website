document.documentElement.classList.add("js");

(() => {
	"use strict";

	const state = {
		fpAbortController: null,
		quoteAbortController: null,
	};

	// 2) Device Attributes (box 2 only)
	function getWebGLRendererString() {
		try {
			const canvas = document.createElement("canvas");
			const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
			if (!gl) return "(unavailable)";

			const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
			if (debugInfo) {
				const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
				const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
				if (vendor && renderer) return `${vendor} | ${renderer}`;
				if (renderer) return String(renderer);
			}

			const vendor = gl.getParameter(gl.VENDOR);
			const renderer = gl.getParameter(gl.RENDERER);
			if (vendor && renderer) return `${vendor} | ${renderer}`;
			if (renderer) return String(renderer);
			return "(unavailable)";
		} catch {
			return "(unavailable)";
		}
	}

	function formatWebGLRendererShort(raw) {
		const value = String(raw || "").trim();
		if (!value || value === "(unavailable)") return "(unavailable)";

		const cleaned = value.replace(/\s+/g, " ");

		let api = "";
		const direct3d = cleaned.match(/Direct3D\d+/i);
		if (direct3d) api = direct3d[0];
		else if (/\bD3D11\b/i.test(cleaned)) api = "Direct3D11";
		else if (/\bD3D12\b/i.test(cleaned)) api = "Direct3D12";
		else {
			const otherApi = cleaned.match(/\b(Metal|OpenGL|Vulkan)\b/i);
			if (otherApi) api = otherApi[0];
		}

		const stripGpuNoise = (s) => {
			return String(s)
				.replace(/\(TM\)|\(R\)|\(C\)/g, "")
				.replace(/\(0x[0-9a-fA-F]+\)/g, "")
				.replace(/\bvs_\d+_\d+\b/gi, "")
				.replace(/\bps_\d+_\d+\b/gi, "")
				.replace(/\bDirect3D\d+\b/gi, "")
				.replace(/\bD3D\d+\b/gi, "")
				.replace(/\s+/g, " ")
				.trim();
		};

		let gpu = "";
		const angleInner = cleaned.match(/ANGLE\s*\((.*)\)/i);
		if (angleInner && angleInner[1]) {
			const parts = angleInner[1].split(",").map((p) => p.trim()).filter(Boolean);
			const preferred =
				parts.find((p) => /Radeon|GeForce|Intel\b|Iris|UHD|Apple|Adreno|Mali/i.test(p)) ||
				parts[1] ||
				parts[0] ||
				"";
			gpu = stripGpuNoise(preferred);
		}

		if (!gpu) {
			const m = cleaned.match(/(Radeon[^|,]+|GeForce[^|,]+|Intel[^|,]+|Apple[^|,]+|Adreno[^|,]+|Mali[^|,]+)/i);
			if (m) gpu = stripGpuNoise(m[1]);
		}

		gpu = gpu.replace(/\s*\|\s*.*/, "").trim();

		if (gpu && api) return `${gpu} (${api})`;
		if (gpu) return gpu;
		if (api) return `(${api})`;
		return "(unavailable)";
	}

	async function getAudioContextInfo() {
		try {
			const AudioCtx = window.AudioContext || window.webkitAudioContext;
			if (!AudioCtx) return { sampleRate: "(unavailable)" };

			const ctx = new AudioCtx();
			const info = { sampleRate: String(ctx.sampleRate) };
			try { await ctx.close(); } catch { /* ignore */ }
			return info;
		} catch {
			return { sampleRate: "(blocked)" };
		}
	}

	function normalizeValue(value) {
		if (value === undefined || value === null || value === "") return "(unavailable)";
		return String(value);
	}

	function formatUserAgentShort() {
		const ua = String(navigator.userAgent || "");

		const pickMajorMinor = (version) => {
			const parts = String(version || "").split(".").filter(Boolean);
			if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
			if (parts.length === 1) return `${parts[0]}.0`;
			return "?";
		};

		let browser = "Browser";
		let version = "?";

		const edge = ua.match(/Edg\/([\d.]+)/);
		const chrome = ua.match(/Chrome\/([\d.]+)/);
		const firefox = ua.match(/Firefox\/([\d.]+)/);
		const safari = ua.match(/Version\/([\d.]+).*Safari\//);

		if (edge) {
			browser = "Edge";
			version = pickMajorMinor(edge[1]);
		} else if (chrome) {
			browser = "Chrome";
			version = pickMajorMinor(chrome[1]);
		} else if (firefox) {
			browser = "Firefox";
			version = pickMajorMinor(firefox[1]);
		} else if (safari) {
			browser = "Safari";
			version = pickMajorMinor(safari[1]);
		}

		let os = "Unknown";
		if (/Windows NT/i.test(ua)) os = "Windows";
		else if (/Android/i.test(ua)) os = "Android";
		else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
		else if (/Mac OS X/i.test(ua)) os = "macOS";
		else if (/Linux/i.test(ua)) os = "Linux";

		let arch = "";
		if (/Win64|x64|x86_64/i.test(ua)) arch = "x64";
		else if (/ARM64|aarch64/i.test(ua)) arch = "arm64";

		return `${browser} v${version} (${os}${arch ? " " + arch : ""})`;
	}

	async function safeFetchJson(url, signal) {
		if (typeof fetch !== "function") throw new Error("fetch unavailable");
		const res = await fetch(url, {
			method: "GET",
			mode: "cors",
			cache: "no-store",
			signal,
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	}

	async function initIpAndLocation(cells, signal) {
		const ipCell = cells.get("Public IP");
		const ispCell = cells.get("ISP");
		const cityStateCell = cells.get("City/State");

		if (ipCell) {
			ipCell.textContent = "Fetching...";
			try {
				try {
					console.info("Public IP: fetch start", {
						url: "https://api.ipify.org?format=json",
						onLine: typeof navigator !== "undefined" ? navigator.onLine : "(unknown)",
						aborted: !!(signal && signal.aborted),
					});
				} catch {
					// ignore
				}

				const data = await safeFetchJson("https://api.ipify.org?format=json", signal);
				ipCell.textContent = data && data.ip ? String(data.ip) : "Failed";
				try {
					console.info("Public IP: fetch success", { ip: ipCell.textContent });
				} catch {
					// ignore
				}
			} catch (e) {
				if (e && e.name === "AbortError") return;
				ipCell.textContent = "IP likely Hidden by Ad-Blocker or Privacy Settings";
				try {
					console.warn("Public IP: fetch failed", {
						name: e && e.name,
						message: e && e.message,
						stack: e && e.stack,
						onLine: typeof navigator !== "undefined" ? navigator.onLine : "(unknown)",
						aborted: !!(signal && signal.aborted),
						note:
							"Often shows TypeError: Failed to fetch when blocked by extensions (adblock/tracking protection), CORS/network issues, or DNS filtering.",
					});
				} catch {
					// ignore
				}
			}
		}

		if (ispCell) ispCell.textContent = "Fetching...";
		if (cityStateCell) cityStateCell.textContent = "Fetching...";

		const geoProviders = [
			{
				name: "ipapi.co",
				url: "https://ipapi.co/json/",
				map(geo) {
					if (!geo || geo.error) {
						throw new Error(geo && geo.reason ? String(geo.reason) : "invalid geo payload");
					}
					const isp = geo.org ? String(geo.org) : "";
					const city = geo.city ? String(geo.city) : "";
					const region = geo.region ? String(geo.region) : "";
					return { isp, cityState: [city, region].filter(Boolean).join(", ") };
				},
			},
			{
				name: "ipwho.is",
				url: "https://ipwho.is/",
				map(geo) {
					if (!geo || geo.success === false) {
						throw new Error(geo && geo.message ? String(geo.message) : "invalid geo payload");
					}
					const connection = geo.connection && typeof geo.connection === "object" ? geo.connection : {};
					const isp = connection.isp ? String(connection.isp) : "";
					const city = geo.city ? String(geo.city) : "";
					const region = geo.region ? String(geo.region) : "";
					return { isp, cityState: [city, region].filter(Boolean).join(", ") };
				},
			},
		];

		let geoResolved = false;
		for (const provider of geoProviders) {
			try {
				try {
					console.info("Geo: fetch start", {
						provider: provider.name,
						url: provider.url,
						onLine: typeof navigator !== "undefined" ? navigator.onLine : "(unknown)",
						aborted: !!(signal && signal.aborted),
					});
				} catch {
					// ignore
				}

				const geo = await safeFetchJson(provider.url, signal);

				const mapped = provider.map(geo);
				const isp = mapped && mapped.isp ? mapped.isp : "";
				const cityState = mapped && mapped.cityState ? mapped.cityState : "";

				if (!isp && !cityState) throw new Error("empty geo fields");

				if (ispCell) ispCell.textContent = isp || "Failed";
				if (cityStateCell) cityStateCell.textContent = cityState || "Failed";

				try {
					console.info("Geo: fetch success", {
						provider: provider.name,
						isp: ispCell ? ispCell.textContent : undefined,
						cityState: cityStateCell ? cityStateCell.textContent : undefined,
					});
				} catch {
					// ignore
				}

				geoResolved = true;
				break;
			} catch (e) {
				if (e && e.name === "AbortError") return;
				try {
					console.warn("Geo: provider failed", {
						provider: provider.name,
						name: e && e.name,
						message: e && e.message,
						stack: e && e.stack,
						onLine: typeof navigator !== "undefined" ? navigator.onLine : "(unknown)",
						aborted: !!(signal && signal.aborted),
					});
				} catch {
					// ignore
				}
			}
		}

		if (!geoResolved) {
			if (ispCell) ispCell.textContent = "Failed";
			if (cityStateCell) cityStateCell.textContent = "Failed";
			try {
				console.warn("Geo: all providers failed", {
					providersTried: geoProviders.map((provider) => provider.name),
					onLine: typeof navigator !== "undefined" ? navigator.onLine : "(unknown)",
					aborted: !!(signal && signal.aborted),
				});
			} catch {
				// ignore
			}
		}
	}

	async function collectFingerprintAttributes() {
		const tz = (() => {
			try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "(unavailable)"; }
		})();

		const audio = await getAudioContextInfo();

		return [
			["Live System Clock", "(initializing…)"],
			["Mouse Coordinates", "(move mouse)"],
			["Battery Status", "(initializing…)"],
			["Window Dimensions", `${window.innerWidth} x ${window.innerHeight}`],
			["Focus State", document.visibilityState === "hidden" ? "Hidden" : "Active"],

			["Public IP", "Fetching..."],
			["ISP", "Fetching..."],
			["City/State", "Fetching..."],

			["User Agent", formatUserAgentShort()],
			["Preferred Language", normalizeValue(navigator.language)],

			["CPU Cores", normalizeValue(navigator.hardwareConcurrency)],
			["Device Memory (GB)", normalizeValue(navigator.deviceMemory)],
			["Screen Resolution", `${window.screen.width} x ${window.screen.height}`],

			["Timezone", normalizeValue(tz)],
			["WebGL Renderer", formatWebGLRendererShort(getWebGLRendererString())],
			["Audio Sample Rate", normalizeValue(audio.sampleRate)],
		];
	}

	function renderFingerprintTable(container, rows) {
		const table = document.createElement("table");
		table.className = "fp-table";

		const tbody = document.createElement("tbody");
		const cellsByKey = new Map();

		for (const [key, value] of rows) {
			const tr = document.createElement("tr");

			const th = document.createElement("th");
			th.scope = "row";
			th.textContent = key;

			const td = document.createElement("td");
			const code = document.createElement("code");
			code.textContent = value;
			td.appendChild(code);

			tr.appendChild(th);
			tr.appendChild(td);
			tbody.appendChild(tr);

			cellsByKey.set(key, code);
		}

		table.appendChild(tbody);
		container.replaceChildren(table);
		return cellsByKey;
	}

	function formatClockNow() {
		const d = new Date();
		const pad2 = (n) => String(n).padStart(2, "0");
		const pad3 = (n) => String(n).padStart(3, "0");
		return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
	}

	async function fetchQuotesFromFile(url, signal) {
		if (typeof fetch !== "function") throw new Error("fetch unavailable");
		const res = await fetch(url, {
			method: "GET",
			cache: "no-store",
			signal,
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const raw = await res.text();
		return String(raw)
			.split(/\r?\n/g)
			.map((line) => line.trim())
			.filter(Boolean);
	}

	function getCurrentDateSeed() {
		const d = new Date();
		const yyyy = String(d.getFullYear());
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return Number(`${yyyy}${mm}${dd}`);
	}

	function renderQuoteTable(container, quoteText) {
		const table = document.createElement("table");
		table.className = "fp-table quote-table";

		const tbody = document.createElement("tbody");

		const addRow = (text, className) => {
			const tr = document.createElement("tr");
			const td = document.createElement("td");
			td.textContent = text;
			if (className) td.className = className;
			tr.appendChild(td);
			tbody.appendChild(tr);
		};

		addRow(quoteText, "quote-table-cell--quote");

		table.appendChild(tbody);
		container.replaceChildren(table);
	}

	function initVulnerabilityAlertsPanel() {
		const api = window.VulnerabilityAlerts;
		if (!api || typeof api.init !== "function") return;

		api.init({
			dependencies: {
				api: window.VulnAlertsApiClient,
				engine: window.VulnAlertsThreatEngine,
				renderer: window.VulnAlertsRenderer,
			},
			rootId: "vuln-alerts-box",
			listId: "vuln-alerts-list",
			minCvssId: "vuln-filter-min-cvss",
			minEpssPercentileId: "vuln-filter-min-epss",
			daysSwitchId: "vuln-filter-window-switch",
			fetchButtonId: "vuln-filter-fetch",
			defaultMinCvss: 7.0,
			defaultMinEpssPercentile: 70,
			defaultDaysBack: 30,
		}).catch(() => {
			// Ignore module-level failures; UI state is handled inside the module.
		});
	}

	async function initDailyQuote() {
		const box = document.getElementById("daily-quote-box");
		if (!box) return;

		initVulnerabilityAlertsPanel();

		const tableBox = document.getElementById("daily-quote-table-box");
		if (!tableBox) return;

		const quotesUrl = box.getAttribute("data-quotes-url") || "/quotes.txt";
		const quoteController = new AbortController();

		try {
			if (state.quoteAbortController) state.quoteAbortController.abort();
		} catch {
			// ignore
		}
		state.quoteAbortController = quoteController;

		tableBox.textContent = "Loading quote...";

		try {
			const quotes = await fetchQuotesFromFile(quotesUrl, quoteController.signal);

			if (!quotes.length) {
				tableBox.textContent = "No quotes available.";
				return;
			}

			const seed = getCurrentDateSeed();
			const quoteAIndex = seed % quotes.length;

			const quoteA = quotes[quoteAIndex];

			renderQuoteTable(tableBox, quoteA);
		} catch (e) {
			if (e && e.name === "AbortError") return;
			tableBox.textContent = "Failed to load quotes.txt.";
		} finally {
			if (state.quoteAbortController === quoteController) {
				state.quoteAbortController = null;
			}
		}
	}

	async function initFingerprinter() {
		const container = document.getElementById("fingerprint-box");
		if (!container) return; // box 2 only

		try {
			if (state.fpAbortController) state.fpAbortController.abort();
		} catch {
			// ignore
		}
		state.fpAbortController = new AbortController();

		container.textContent = "Collecting…";

		try {
			const rows = await collectFingerprintAttributes();
			const cells = renderFingerprintTable(container, rows);

			// Live System Clock
			const clockCell = cells.get("Live System Clock");
			if (clockCell) {
				clockCell.textContent = formatClockNow();
				window.setInterval(() => {
					clockCell.textContent = formatClockNow();
				}, 1000);
			}

			// Mouse Coordinates
			const mouseCell = cells.get("Mouse Coordinates");
			if (mouseCell) {
				window.addEventListener(
					"mousemove",
					(e) => {
						mouseCell.textContent = `${e.clientX}, ${e.clientY}`;
					},
					{ passive: true }
				);
			}

			// Battery Status
			const battCell = cells.get("Battery Status");
			if (battCell) {
				const getBattery = typeof navigator.getBattery === "function" ? navigator.getBattery.bind(navigator) : null;
				if (!getBattery) {
					battCell.textContent = "(unavailable)";
				} else {
					try {
						const battery = await getBattery();

						const renderBattery = () => {
							const pct = Math.round((battery.level || 0) * 100);
							battCell.textContent = `${pct}% | ${battery.charging ? "Plugged" : "On Battery"}`;
						};

						renderBattery();
						battery.addEventListener("levelchange", () => {
							renderBattery();
						});
						battery.addEventListener("chargingchange", () => {
							renderBattery();
						});
					} catch {
						battCell.textContent = "(blocked)";
					}
				}
			}

			// Window Dimensions
			const winCell = cells.get("Window Dimensions");
			if (winCell) {
				const renderWin = () => {
					winCell.textContent = `${window.innerWidth} x ${window.innerHeight}`;
				};
				renderWin();
				window.addEventListener("resize", () => {
					renderWin();
				});
			}

			// Focus State
			const focusCell = cells.get("Focus State");
			if (focusCell) {
				const renderFocus = () => {
					focusCell.textContent = document.visibilityState === "hidden" ? "Hidden" : "Active";
				};
				renderFocus();
				document.addEventListener("visibilitychange", () => {
					renderFocus();
				});
				window.addEventListener("focus", () => {
					renderFocus();
				});
				window.addEventListener("blur", () => {
					renderFocus();
				});
			}

			// Public IP + Geo (isolated: never breaks the table)
			try {
				const ipCell = cells.get("Public IP");
				const ispCell = cells.get("ISP");
				const cityStateCell = cells.get("City/State");
				const signal = state.fpAbortController.signal;
				void initIpAndLocation(cells, signal).catch(() => {
					if (ipCell && ipCell.textContent === "Fetching...") ipCell.textContent = "Failed";
					if (ispCell && ispCell.textContent === "Fetching...") ispCell.textContent = "Failed";
					if (cityStateCell && cityStateCell.textContent === "Fetching...") cityStateCell.textContent = "Failed";
				});
			} catch {
				// ignore
			}
		} catch (e) {
			try { console.error("Fingerprint init failed:", e); } catch { /* ignore */ }
			container.textContent = "(failed to collect attributes)";
		}
	}

	function initVideoTile() {
		const video = document.querySelector(".tile-video");
		if (!(video instanceof HTMLVideoElement)) return;
		const sourceNode = video.querySelector("source");
		const sourceUrl =
			(sourceNode && sourceNode.src) ||
			video.currentSrc ||
			video.getAttribute("src") ||
			"";

		video.muted = true;
		video.defaultMuted = true;
		video.playsInline = true;
		video.autoplay = true;
		video.loop = true;

		const tryPlay = () => {
			try {
				const playPromise = video.play();
				if (playPromise && typeof playPromise.catch === "function") {
					playPromise.catch(() => {
						// ignore autoplay rejections
					});
				}
			} catch {
				// ignore
			}
		};

		video.addEventListener("loadeddata", tryPlay, { passive: true });
		video.addEventListener("canplay", tryPlay, { passive: true });
		video.addEventListener("pause", tryPlay, { passive: true });

		tryPlay();

		// Load the media into memory once to avoid intermittent network-stream errors
		// from the local dev server during playback.
		if (sourceUrl) {
			void (async () => {
				try {
					const response = await fetch(sourceUrl, {
						method: "GET",
						cache: "no-store",
					});
					if (!response.ok) {
						return;
					}

					const blob = await response.blob();
					const objectUrl = URL.createObjectURL(blob);
					video.src = objectUrl;
					try { video.load(); } catch { /* ignore */ }
					tryPlay();

					window.addEventListener(
						"beforeunload",
						() => {
							try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
						},
						{ once: true }
					);
				} catch {
					// ignore
				}
			})();
		}
	}

	function initPostMenu() {
		const randomLink = document.getElementById("open-random-post");
		if (randomLink) {
			randomLink.addEventListener("click", (event) => {
				event.preventDefault();

				const raw = String(randomLink.getAttribute("data-posts") || "");
				const posts = raw.split("|").map((x) => x.trim()).filter(Boolean);
				if (!posts.length) return;

				const index = Math.floor(Math.random() * posts.length);
				window.location.assign(posts[index]);
			}, { passive: false });
		}

		const recentLink = document.getElementById("open-most-recent-post");
		if (recentLink) {
			recentLink.addEventListener("click", (event) => {
				event.preventDefault();
			}, { passive: false });
		}
	}

	initPostMenu();
	initVideoTile();
	initFingerprinter();
	initDailyQuote();
})();
