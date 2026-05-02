(() => {
	const tile = document.getElementById("ascii-pretext-tile");
	if (!tile) return;

	const output = tile.querySelector(".ascii-output");
	const fallback = tile.querySelector(".ascii-fallback");
	if (!(output instanceof HTMLElement) || !(fallback instanceof HTMLElement)) return;

	const video = document.querySelector(".tile-video");
	if (!(video instanceof HTMLVideoElement)) return;

	const TUNE = {
		blackCutoff: 0.05,
		gamma: 1.5,
		commaNoiseCutoff: 0.1,
		saturation: 2,
		whiteBiasStrength: 0.1,
	};

	const PERF = {
		maxCols: 180,
		maxRows: 120,
		extraRows: 1,
		baseFontPx: 7,
		baseLinePx: 7,
	};

	const glyphs = " .,:;irsXA253hMHGS#9B&@";

	const LINEAR_LUT = Array.from({ length: 256 }, (_, i) => {
		const s = i / 255;
		if (s <= 0.04045) return s / 12.92;
		return Math.pow((s + 0.055) / 1.055, 2.4);
	});

	let palette = [];

	const panel = document.createElement("canvas");
	panel.className = "ascii-panel ascii-panel--video-live";
	output.replaceChildren(panel);

	const sampleCanvas = document.createElement("canvas");
	const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
	if (!sampleCtx) return;

	const panelCtx = panel.getContext("2d", { alpha: false });
	if (!panelCtx) return;

	let rafId = null;
	let vfcId = null;
	let shown = false;
	let lastVideoTime = -1;
	let lastFrameStamp = 0;
	let fpsSmoothed = 0;

	const sharedMetrics =
		window.__fishAsciiMetrics && typeof window.__fishAsciiMetrics === "object"
			? window.__fishAsciiMetrics
			: { fps: 0, cols: 0, rows: 0 };
	window.__fishAsciiMetrics = sharedMetrics;

	let cachedCharWidth = 4;
	let cachedLineHeight = 7;
	let lastGridWidth = -1;
	let lastGridHeight = -1;
	let lastResolutionScale = -1;
	let lastDisplayWidth = -1;
	let lastDisplayHeight = -1;
	let lastDpr = -1;

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function toFiniteNumber(value, fallback) {
		const n = Number(value);
		return Number.isFinite(n) ? n : fallback;
	}

	function parseHexColor(hex) {
		const raw = String(hex || "").trim();
		if (!raw.startsWith("#")) return null;
		let v = raw.slice(1);
		if (v.length === 3) {
			v = `${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`;
		}
		if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
		const r = parseInt(v.slice(0, 2), 16);
		const g = parseInt(v.slice(2, 4), 16);
		const b = parseInt(v.slice(4, 6), 16);
		const lr = LINEAR_LUT[r];
		const lg = LINEAR_LUT[g];
		const lb = LINEAR_LUT[b];
		const luma = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
		return { color: `#${v}`, r: lr, g: lg, b: lb, luma };
	}

	function buildPaletteFromCss() {
		const style = window.getComputedStyle(panel);
		const out = [];
		for (let i = 0; i < 16; i++) {
			const hex = style.getPropertyValue(`--ascii-palette-${i}`).trim();
			if (!hex) continue;
			const parsed = parseHexColor(hex);
			if (!parsed) continue;

			const weightRaw = style.getPropertyValue(`--ascii-weight-${i}`).trim();
			const weight = Math.max(0, toFiniteNumber(weightRaw, 1));
			if (weight <= 0) continue;

			out.push({ weight, isWhiteBias: i === 5, ...parsed });
		}

		return out;
	}

	function nearestPaletteColor(r, g, b, lumaLinear, activePalette) {
		const lr = LINEAR_LUT[r];
		const lg = LINEAR_LUT[g];
		const lb = LINEAR_LUT[b];

		let bestColor = activePalette[0].color;
		let bestDist = Number.POSITIVE_INFINITY;

		for (let i = 0; i < activePalette.length; i++) {
			const p = activePalette[i];
			const dr = lr - p.r;
			const dg = lg - p.g;
			const db = lb - p.b;
			const dl = lumaLinear - p.luma;
			const weight = p.weight ?? 1;

			// Weighted RGB + luminance term: accurate enough, still very fast.
			const dist = dr * dr * 0.95 + dg * dg * 1.15 + db * db * 0.9 + dl * dl * 0.55;
			const whiteBiasedDist = p.isWhiteBias ? dist * Math.max(0.5, TUNE.whiteBiasStrength) : dist;
			const weightedDist = whiteBiasedDist / Math.max(0.001, weight);
			if (weightedDist < bestDist) {
				bestDist = weightedDist;
				bestColor = p.color;
			}
		}

		return bestColor;
	}

	function getRuntimeConfig() {
		const cfg =
			window.__fishAsciiConfig && typeof window.__fishAsciiConfig === "object"
				? window.__fishAsciiConfig
				: {};

		return {
			resolutionScale: clamp(toFiniteNumber(cfg.resolutionScale, 1), 0.4, 1.9),
			colorBoost: clamp(toFiniteNumber(cfg.colorBoost, 1), 0.6, 1.8),
			aspectCorrection: clamp(toFiniteNumber(cfg.aspectCorrection, 1), 0.85, 1.2),
			paletteSize: clamp(Math.round(toFiniteNumber(cfg.paletteSize, palette.length || 0)), 1, 16),
		};
	}

	function updateFps() {
		const now = performance.now();
		if (lastFrameStamp > 0) {
			const dt = Math.max(1, now - lastFrameStamp);
			const inst = 1000 / dt;
			fpsSmoothed = fpsSmoothed > 0 ? fpsSmoothed * 0.88 + inst * 0.12 : inst;
		}
		lastFrameStamp = now;
	}

	function getFont() {
		const style = window.getComputedStyle(panel);
		if (style.font && style.font !== "") return style.font;
		return `${style.fontWeight || "400"} ${style.fontSize || "7px"} ${style.fontFamily || "monospace"}`;
	}

	function getGridSize(runtimeConfig) {
		const width = output.clientWidth;
		const height = output.clientHeight;

		if (runtimeConfig.resolutionScale !== lastResolutionScale) {
			const scale = Math.max(0.4, runtimeConfig.resolutionScale);
			panel.style.fontSize = `${PERF.baseFontPx / scale}px`;
			panel.style.lineHeight = `${PERF.baseLinePx / scale}px`;
			lastResolutionScale = runtimeConfig.resolutionScale;
			lastGridWidth = -1;
			lastGridHeight = -1;
		}

		if (
			width !== lastGridWidth ||
			height !== lastGridHeight ||
			cachedCharWidth <= 0 ||
			cachedLineHeight <= 0
		) {
			const style = window.getComputedStyle(panel);
			cachedLineHeight = Math.max(1, parseFloat(style.lineHeight) || 7);
			panelCtx.font = getFont();
			cachedCharWidth = Math.max(1, panelCtx.measureText("M").width || 4);
			lastGridWidth = width;
			lastGridHeight = height;
		}

		const cols = Math.max(20, Math.min(PERF.maxCols, Math.floor(width / cachedCharWidth)));
		const rows = Math.max(
			12,
			Math.min(PERF.maxRows, Math.floor(height / cachedLineHeight) + PERF.extraRows)
		);
		return { cols, rows };
	}

	function syncCanvasSizes(cols, rows) {
		const displayWidth = Math.max(1, Math.round(cols * cachedCharWidth));
		const displayHeight = Math.max(1, Math.round(rows * cachedLineHeight));
		const dpr = 1;

		if (
			displayWidth !== lastDisplayWidth ||
			displayHeight !== lastDisplayHeight ||
			dpr !== lastDpr
		) {
			panel.style.width = `${displayWidth}px`;
			panel.style.height = `${displayHeight}px`;

			panel.width = Math.max(1, Math.round(displayWidth * dpr));
			panel.height = Math.max(1, Math.round(displayHeight * dpr));

			panelCtx.setTransform(1, 0, 0, 1, 0, 0);
			panelCtx.scale(dpr, dpr);
			panelCtx.textBaseline = "top";
			panelCtx.textAlign = "left";

			lastDisplayWidth = displayWidth;
			lastDisplayHeight = displayHeight;
			lastDpr = dpr;
		}

		if (sampleCanvas.width !== cols || sampleCanvas.height !== rows) {
			sampleCanvas.width = cols;
			sampleCanvas.height = rows;
		}

		return { displayWidth, displayHeight };
	}

	function drawVideoCoverFrame(cols, rows, targetAspect) {
		const srcWFull = video.videoWidth;
		const srcHFull = video.videoHeight;
		if (srcWFull <= 0 || srcHFull <= 0) return;

		const sourceAspect = srcWFull / srcHFull;
		let srcX = 0;
		let srcY = 0;
		let srcW = srcWFull;
		let srcH = srcHFull;

		if (sourceAspect > targetAspect) {
			srcW = Math.max(1, srcHFull * targetAspect);
			srcX = (srcWFull - srcW) * 0.5;
		} else {
			srcH = Math.max(1, srcWFull / targetAspect);
			srcY = (srcHFull - srcH) * 0.5;
		}

		sampleCtx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, cols, rows);
	}

	function drawAsciiFrame() {
		if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;
		updateFps();

		const runtime = getRuntimeConfig();
		const activePalette = palette.slice(0, clamp(runtime.paletteSize, 1, palette.length));
		if (activePalette.length === 0) return;
		const { cols, rows } = getGridSize(runtime);
		const { displayWidth, displayHeight } = syncCanvasSizes(cols, rows);

		sharedMetrics.fps = fpsSmoothed;
		sharedMetrics.cols = cols;
		sharedMetrics.rows = rows;
		sharedMetrics.dpr = lastDpr;

		const targetAspect =
			(cols * Math.max(1, cachedCharWidth) * runtime.aspectCorrection) /
			(rows * Math.max(1, cachedLineHeight));

		drawVideoCoverFrame(cols, rows, Math.max(0.1, targetAspect));

		const frame = sampleCtx.getImageData(0, 0, cols, rows);
		const data = frame.data;
		const saturation = Math.max(0, toFiniteNumber(TUNE.saturation, 1));
		const useSaturation = saturation !== 1;

		panelCtx.fillStyle = "#000000";
		panelCtx.fillRect(0, 0, displayWidth, displayHeight);
		panelCtx.font = getFont();
		panelCtx.textBaseline = "top";

		const drawsByColor = new Map();

		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const i = (y * cols + x) * 4;
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];

				const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
				let ch = " ";
				let colorString = "";
				let sampleR = r;
				let sampleG = g;
				let sampleB = b;

				if (useSaturation) {
					const gray = luma * 255;
					sampleR = Math.round(clamp(gray + (r - gray) * saturation, 0, 255));
					sampleG = Math.round(clamp(gray + (g - gray) * saturation, 0, 255));
					sampleB = Math.round(clamp(gray + (b - gray) * saturation, 0, 255));
				}

				if (luma > TUNE.blackCutoff) {
					const normalizedBase = Math.max(
						0,
						Math.min(1, (luma - TUNE.blackCutoff) / (1 - TUNE.blackCutoff))
					);
					const normalized = clamp(normalizedBase * runtime.colorBoost, 0, 1);
					const weighted = Math.pow(normalized, TUNE.gamma);
					const idx = Math.max(
						0,
						Math.min(glyphs.length - 1, Math.floor(weighted * (glyphs.length - 1)))
					);

					ch = glyphs[idx];

					if ((ch === "," || ch === ".") && normalized <= TUNE.commaNoiseCutoff) {
						ch = " ";
					}

					if (ch !== " ") {
						const lumaLinear = LINEAR_LUT[Math.round(luma * 255)];
						colorString = nearestPaletteColor(sampleR, sampleG, sampleB, lumaLinear, activePalette);
					}
				}

				if (ch === " " || !colorString) continue;

				const xPos = x * cachedCharWidth;
				const yPos = y * cachedLineHeight;
				const bucket = drawsByColor.get(colorString);
				if (bucket) {
					bucket.push({ ch, xPos, yPos });
				} else {
					drawsByColor.set(colorString, [{ ch, xPos, yPos }]);
				}
			}
		}

		for (const [colorString, draws] of drawsByColor.entries()) {
			panelCtx.fillStyle = colorString;
			for (let i = 0; i < draws.length; i++) {
				const draw = draws[i];
				panelCtx.fillText(draw.ch, draw.xPos, draw.yPos);
			}
		}

		if (!shown) {
			output.style.display = "block";
			fallback.style.display = "none";
			shown = true;
		}
	}

	palette = buildPaletteFromCss();

	function tickFallback() {
		rafId = window.requestAnimationFrame(tickFallback);
		if (document.visibilityState === "hidden") return;
		if (video.currentTime === lastVideoTime) return;
		lastVideoTime = video.currentTime;
		try {
			drawAsciiFrame();
		} catch {
			// Keep fallback or last good frame.
		}
	}

	function schedulePerFrame() {
		if (typeof video.requestVideoFrameCallback !== "function") return;
		vfcId = video.requestVideoFrameCallback(() => {
			if (document.visibilityState !== "hidden") {
				try {
					drawAsciiFrame();
				} catch {
					// Keep fallback or last good frame.
				}
			}
			schedulePerFrame();
		});
	}

	function start() {
		if (typeof video.requestVideoFrameCallback === "function") {
			if (vfcId === null) schedulePerFrame();
			return;
		}

		if (rafId !== null) return;
		rafId = window.requestAnimationFrame(tickFallback);
	}

	video.addEventListener("loadeddata", start, { passive: true });
	video.addEventListener("play", start, { passive: true });
	video.addEventListener(
		"pause",
		() => {
			try {
				drawAsciiFrame();
			} catch {
				// Ignore pause draw errors.
			}
		},
		{ passive: true }
	);

	window.addEventListener(
		"resize",
		() => {
			lastGridWidth = -1;
			lastGridHeight = -1;
			try {
				drawAsciiFrame();
			} catch {
				// Ignore resize draw errors.
			}
		},
		{ passive: true }
	);

	start();

	window.addEventListener("beforeunload", () => {
		if (rafId !== null) {
			window.cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (vfcId !== null && typeof video.cancelVideoFrameCallback === "function") {
			video.cancelVideoFrameCallback(vfcId);
			vfcId = null;
		}
	});
})();
