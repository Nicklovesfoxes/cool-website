(() => {
	"use strict";

	function isMeaningfulText(value) {
		if (value === null || value === undefined) return false;
		const text = String(value).trim();
		if (!text) return false;
		const lowered = text.toLowerCase();
		return lowered !== "unknown" && lowered !== "unavailable" && lowered !== "(unavailable)";
	}

	function renderEmpty(dom, text) {
		const empty = document.createElement("div");
		empty.className = "alerts-empty";
		empty.textContent = text;
		dom.list.replaceChildren(empty);
	}

	function renderAlerts(dom, items, unavailableMessage, warnings = {}) {
		const view = document.createElement("div");
		view.className = "alerts-view";

		const split = document.createElement("div");
		split.className = "alerts-split";

		const master = document.createElement("nav");
		master.className = "alerts-master";
		master.setAttribute("aria-label", "Vulnerability list");

		const detail = document.createElement("section");
		detail.className = "alerts-detail";
		detail.setAttribute("aria-live", "polite");

		const createCell = (labelText, value, wide = false) => {
			const cell = document.createElement("div");
			cell.className = "alerts-cell";
			if (wide) cell.classList.add("alerts-cell--wide");

			const label = document.createElement("div");
			label.className = "alerts-cell-label";
			label.textContent = labelText;

			const valueNode = document.createElement("div");
			valueNode.className = "alerts-cell-value";
			if (typeof value === "string") {
				valueNode.textContent = value;
			} else if (value instanceof Node) {
				valueNode.appendChild(value);
			}

			cell.append(label, valueNode);
			return cell;
		};

		const renderDetail = (item) => {
			detail.replaceChildren();

			const identity = document.createElement("div");
			identity.className = "alerts-detail-header";

			if (isMeaningfulText(item.packageLabel)) {
				const pkg = document.createElement("span");
				pkg.className = "alerts-package";
				pkg.textContent = item.packageLabel;
				identity.appendChild(pkg);
			}

			if (isMeaningfulText(item.cve)) {
				const cve = isMeaningfulText(item.htmlUrl) ? document.createElement("a") : document.createElement("span");
				cve.className = "alerts-cve";
				if (cve instanceof HTMLAnchorElement) {
					cve.classList.add("alerts-cve-link");
					cve.href = item.htmlUrl;
					cve.target = "_blank";
					cve.rel = "noreferrer";
				}
				cve.textContent = item.cve;
				identity.appendChild(cve);
			}

			if (identity.childNodes.length) {
				detail.appendChild(identity);
			}

			if (isMeaningfulText(item.summary)) {
				const summary = document.createElement("p");
				summary.className = "alerts-summary";
				summary.textContent = item.summary;
				detail.appendChild(summary);
			}

			const cells = document.createElement("div");
			cells.className = "alerts-cells";
			cells.appendChild(createCell("CVSS", item.cvss.toFixed(1)));

			if (Number.isFinite(item.epssScore)) {
				cells.appendChild(createCell("EPSS Score", `${(item.epssScore * 100).toFixed(3)}%`));
			} else if (item.epssPending) {
				cells.appendChild(createCell("EPSS Score", "Pending"));
			}

			if (Number.isFinite(item.epssPercentile) && !item.epssPending) {
				cells.appendChild(createCell("EPSS Percentile", `${(item.epssPercentile * 100).toFixed(1)}th percentile`));
			} else if (item.epssPending) {
				cells.appendChild(createCell("EPSS Percentile", "Pending"));
			}

			if (isMeaningfulText(item.ecosystem)) {
				cells.appendChild(createCell("Ecosystem", item.ecosystem));
			}

			const lines = Array.isArray(item.affectedDetails)
				? item.affectedDetails.map((line) => String(line).trim()).filter(Boolean)
				: [];
			const detailLines = lines.length ? lines : [unavailableMessage];

			const detailList = document.createElement("ul");
			detailList.className = "alerts-cell-list";
			for (const line of detailLines) {
				const li = document.createElement("li");
				li.textContent = line;
				detailList.appendChild(li);
			}

			cells.appendChild(createCell("Affected Versions", detailList, true));
			detail.appendChild(cells);
		};

		if (!items.length) {
			const empty = document.createElement("div");
			empty.className = "alerts-empty alerts-empty--full";
			empty.textContent = warnings.github
				? "GitHub API rate limit reached. Please wait a few minutes and try again."
				: "No high-impact vulnerabilities met the filter criteria.";
			split.appendChild(empty);
		} else {
			let activeButton = null;
			for (const [index, item] of items.entries()) {
				const row = document.createElement("button");
				row.type = "button";
				row.className = "alerts-master-item";
				row.setAttribute("aria-label", `${item.cve || "Unknown CVE"} ${item.packageLabel || "Package"}`.trim());

				const pkg = document.createElement("span");
				pkg.className = "alerts-master-pkg";
				pkg.textContent = item.packageLabel || "Unknown Package";

				const cve = document.createElement("span");
				cve.className = "alerts-master-cve";
				cve.textContent = item.cve || "Unknown CVE";

				row.append(cve, pkg);
				row.addEventListener("click", () => {
					if (activeButton) activeButton.classList.remove("is-active");
					row.classList.add("is-active");
					activeButton = row;
					renderDetail(item);
				});

				master.appendChild(row);

				if (index === 0) {
					row.classList.add("is-active");
					activeButton = row;
					renderDetail(item);
				}
			}

			split.append(master, detail);
		}

		const statusBox = document.createElement("div");
		statusBox.className = "alerts-status";
		const messages = [];
		if (warnings.github) {
			messages.push("GitHub API limited or unavailable. Showing partial historical data.");
		}
		if (warnings.epss) {
			messages.push("EPSS API unavailable. EPSS values are marked as Pending.");
		}

		if (messages.length) {
			statusBox.classList.add("alerts-status--warning");
			statusBox.textContent = `Warning: ${messages.join(" ")}`;
		} else {
			statusBox.classList.add("alerts-status--ok");
			statusBox.textContent = "Disclaimer: Results are pulled from free public APIs, so data can be delayed, incomplete, or occasionally inaccurate.";
		}

		view.append(split, statusBox);
		dom.list.replaceChildren(view);
	}

	window.VulnAlertsRenderer = {
		renderEmpty,
		renderAlerts,
	};
})();
