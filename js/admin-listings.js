import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = window.supabase?.createClient
	? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: null;

const SIDEBAR_COLLAPSE_KEY = "makazi_admin_sidebar_collapsed";

const dom = {
	layout: document.querySelector(".ad-layout"),
	sidebar: document.getElementById("ad-sidebar"),
	sidebarToggle: document.getElementById("ad-sidebar-toggle"),
	sidebarToggleIcon: document.getElementById("ad-sidebar-toggle-icon"),
	mobileToggle: document.getElementById("ad-mobile-toggle"),
	logoutBtn: document.getElementById("ad-logout-btn"),
	sidebarLogoutBtn: document.getElementById("ad-sidebar-logout-btn"),
	totalListings: document.getElementById("alq-total-listings"),
	liveListings: document.getElementById("alq-live-listings"),
	rejectedListings: document.getElementById("alq-rejected-listings"),
	avgWaitTime: document.getElementById("alq-avg-wait-time"),
	tabs: Array.from(document.querySelectorAll(".alq-tab")),
	rows: document.getElementById("alq-listing-rows"),
	toast: document.getElementById("alq-toast"),
};

const state = {
	listings: [],
	activeFilter: "pending",
	busyIds: new Set(),
};

document.addEventListener("DOMContentLoaded", function () {
	bindUi();
	init();
});

function bindUi() {
	bindSidebarCollapse();

	if (dom.mobileToggle && dom.sidebar) {
		dom.mobileToggle.addEventListener("click", function () {
			const open = dom.sidebar.classList.toggle("is-open");
			dom.mobileToggle.setAttribute("aria-expanded", String(open));
		});
	}

	bindLogout(dom.logoutBtn);
	bindLogout(dom.sidebarLogoutBtn);

	dom.tabs.forEach(function (tab) {
		tab.addEventListener("click", function () {
			state.activeFilter = tab.dataset.filter || "pending";
			dom.tabs.forEach(function (btn) {
				const active = btn === tab;
				btn.classList.toggle("is-active", active);
				btn.setAttribute("aria-selected", String(active));
			});
			renderTable();
		});
	});

	if (dom.rows) {
		dom.rows.addEventListener("click", async function (event) {
			const button = event.target.closest("button[data-action]");
			if (!button) {
				return;
			}

			const listingId = button.getAttribute("data-listing-id");
			const action = button.getAttribute("data-action");
			if (!listingId || !action || state.busyIds.has(listingId)) {
				return;
			}

			if (action !== "approve" && action !== "reject") {
				return;
			}

			const nextStatus = action === "approve" ? "approved" : "rejected";
			await updateListingStatus(listingId, nextStatus);
		});
	}
}

function bindSidebarCollapse() {
	if (!dom.sidebar || !dom.sidebarToggle) {
		return;
	}

	applySidebarCollapsed(readSidebarCollapsed());

	dom.sidebarToggle.addEventListener("click", function () {
		const collapsed = !dom.sidebar.classList.contains("is-collapsed");
		applySidebarCollapsed(collapsed);
		saveSidebarCollapsed(collapsed);
	});
}

function applySidebarCollapsed(collapsed) {
	if (!dom.sidebar) {
		return;
	}

	dom.sidebar.classList.toggle("is-collapsed", collapsed);
	dom.layout?.classList.toggle("is-collapsed", collapsed);

	if (dom.sidebarToggle) {
		dom.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
		dom.sidebarToggle.setAttribute(
			"aria-label",
			collapsed ? "Expand sidebar" : "Collapse sidebar",
		);
	}

	if (dom.sidebarToggleIcon) {
		dom.sidebarToggleIcon.textContent = collapsed ? "chevron_right" : "chevron_left";
	}
}

function saveSidebarCollapsed(collapsed) {
	try {
		window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? "1" : "0");
	} catch (_error) {
		// Ignore storage permission issues.
	}
}

function readSidebarCollapsed() {
	try {
		return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
	} catch (_error) {
		return false;
	}
}

function bindLogout(button) {
	if (!button || !supabaseClient) {
		return;
	}

	button.addEventListener("click", async function () {
		await supabaseClient.auth.signOut();
		window.location.href = "login.html";
	});
}

async function init() {
	if (!supabaseClient) {
		renderUnavailable("Supabase client unavailable.");
		return;
	}

	const {
		data: { user },
		error,
	} = await supabaseClient.auth.getUser();

	if (error || !user) {
		window.location.href = "login.html";
		return;
	}

	await refreshListings();
}

async function refreshListings() {
	state.listings = await fetchListings();
	renderStats();
	renderTable();
}

async function fetchListings() {
	const { data, error } = await supabaseClient
		.from("listings")
		.select("*, profiles:landlord_id(full_name)")
		.order("created_at", { ascending: false });

	if (error || !Array.isArray(data)) {
		console.error("Failed to load listings", error);
		showToast("Unable to fetch listings.");
		return [];
	}

	return data.map(function (row) {
		return {
			...row,
			moderation_status: normalizeModerationStatus(row),
		};
	});
}

function renderStats() {
	const total = state.listings.length;
	const live = state.listings.filter(function (row) {
		return row.moderation_status === "approved";
	}).length;
	const rejected = state.listings.filter(function (row) {
		return row.moderation_status === "rejected";
	}).length;

	if (dom.totalListings) {
		dom.totalListings.textContent = String(total);
	}
	if (dom.liveListings) {
		dom.liveListings.textContent = String(live);
	}
	if (dom.rejectedListings) {
		dom.rejectedListings.textContent = String(rejected);
	}
	if (dom.avgWaitTime) {
		dom.avgWaitTime.textContent = "2.4 hrs";
	}
}

function renderTable() {
	if (!dom.rows) {
		return;
	}

	const filtered = state.listings.filter(function (row) {
		if (state.activeFilter === "pending") {
			return row.moderation_status === "pending";
		}
		if (state.activeFilter === "live") {
			return row.moderation_status === "approved";
		}
		return row.moderation_status === "rejected";
	});

	if (!filtered.length) {
		dom.rows.innerHTML = `<tr><td colspan="5" class="ad-empty">No ${escapeHtml(getFilterLabel(state.activeFilter))} listings found.</td></tr>`;
		return;
	}

	dom.rows.innerHTML = filtered
		.map(function (row) {
			const id = String(row.id || "");
			const imageUrl = getListingImageUrl(row);
			const title = row.title || "Untitled Listing";
			const landlordName = getLandlordName(row);
			const isApproved = row.moderation_status === "approved";
			const isRejected = row.moderation_status === "rejected";
			const isBusy = state.busyIds.has(id);

			return `
				<tr>
					<td>
						<div class="alq-property-cell">
							<div class="alq-thumb">${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(title)}" />` : '<span class="material-symbols-outlined" aria-hidden="true">home_work</span>'}</div>
							<div>
								<strong>${escapeHtml(title)}</strong>
							</div>
						</div>
					</td>
					<td class="alq-price">${formatPrice(row.price, row.currency)}</td>
					<td>${escapeHtml(landlordName)}</td>
					<td>${escapeHtml(formatSubmittedTime(row.created_at))}</td>
					<td>
						<div class="alq-actions">
							<a class="alq-btn alq-btn-icon" href="property_detail.html?id=${encodeURIComponent(id)}" aria-label="View listing">
								<span class="material-symbols-outlined" aria-hidden="true">visibility</span>
							</a>
							<button type="button" class="alq-btn alq-btn-approve" data-action="approve" data-listing-id="${escapeAttr(id)}" ${isBusy || isApproved ? "disabled" : ""}>Approve</button>
							<button type="button" class="alq-btn alq-btn-reject" data-action="reject" data-listing-id="${escapeAttr(id)}" ${isBusy || isRejected ? "disabled" : ""}>Reject</button>
						</div>
					</td>
				</tr>
			`;
		})
		.join("");
}

async function updateListingStatus(listingId, nextStatus) {
	const target = state.listings.find(function (row) {
		return String(row.id) === String(listingId);
	});
	if (!target) {
		return;
	}

	const previousStatus = target.moderation_status;
	const previousVisible = target.is_visible;

	target.moderation_status = nextStatus;
	target.is_visible = nextStatus === "approved";
	state.busyIds.add(String(listingId));
	renderStats();
	renderTable();

	const payload =
		nextStatus === "approved"
			? { moderation_status: "approved", is_visible: true }
			: { moderation_status: "rejected", is_visible: false };

	const { error } = await supabaseClient.from("listings").update(payload).eq("id", listingId);

	state.busyIds.delete(String(listingId));

	if (error) {
		target.moderation_status = previousStatus;
		target.is_visible = previousVisible;
		renderStats();
		renderTable();
		showToast(`Unable to ${nextStatus === "approved" ? "approve" : "reject"} listing.`);
		return;
	}

	renderStats();
	renderTable();
	showToast(nextStatus === "approved" ? "Listing approved." : "Listing rejected.");
}

function renderUnavailable(message) {
	if (dom.totalListings) {
		dom.totalListings.textContent = "-";
	}
	if (dom.liveListings) {
		dom.liveListings.textContent = "-";
	}
	if (dom.rejectedListings) {
		dom.rejectedListings.textContent = "-";
	}
	if (dom.rows) {
		dom.rows.innerHTML = `<tr><td colspan="5" class="ad-empty">${escapeHtml(message)}</td></tr>`;
	}
}

function normalizeModerationStatus(row) {
	const status = String(row.moderation_status || row.status || "").toLowerCase();
	if (status === "approved" || status === "pending" || status === "rejected") {
		return status;
	}
	if (status === "live" || status === "published") {
		return "approved";
	}
	if (status === "denied" || status === "archived") {
		return "rejected";
	}
	if (row.is_visible === true) {
		return "approved";
	}
	return "pending";
}

function getFilterLabel(filter) {
	if (filter === "live") {
		return "Live";
	}
	if (filter === "rejected") {
		return "Rejected";
	}
	return "Pending";
}

function getListingImageUrl(row) {
	const preferred = [row.image_url, row.cover_image_url, row.cover_image, row.thumbnail_url];
	for (const item of preferred) {
		if (typeof item === "string" && item.trim()) {
			return item.trim();
		}
	}

	const imageArray = parseImages(row.images || row.image_urls);
	return imageArray.length ? imageArray[0] : "";
}

function parseImages(value) {
	if (Array.isArray(value)) {
		return value
			.map(function (item) {
				if (typeof item === "string") {
					return item.trim();
				}
				if (item && typeof item === "object") {
					return String(item.url || item.src || item.image_url || "").trim();
				}
				return "";
			})
			.filter(Boolean);
	}

	if (typeof value === "string" && value.trim()) {
		const text = value.trim();
		if (text.startsWith("[") || text.startsWith("{")) {
			try {
				const parsed = JSON.parse(text);
				return parseImages(parsed);
			} catch (_error) {
				return [];
			}
		}
		if (text.includes(",")) {
			return text
				.split(",")
				.map(function (item) {
					return item.trim();
				})
				.filter(Boolean);
		}
		return [text];
	}

	return [];
}

function getLandlordName(row) {
	const profile = row?.profiles;
	if (Array.isArray(profile) && profile.length && profile[0]?.full_name) {
		return profile[0].full_name;
	}
	if (profile && typeof profile === "object" && profile.full_name) {
		return profile.full_name;
	}
	return "Unknown Landlord";
}

function formatSubmittedTime(value) {
	if (!value) {
		return "Today";
	}
	const createdDate = new Date(value);
	if (!Number.isFinite(createdDate.getTime())) {
		return "Today";
	}

	const diffMs = Date.now() - createdDate.getTime();
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffDays <= 0) {
		return "Today";
	}
	if (diffDays === 1) {
		return "1 day ago";
	}
	return `${diffDays} days ago`;
}

function formatPrice(value, currency) {
	const amount = Number(value);
	if (!Number.isFinite(amount)) {
		return "-";
	}

	const code = String(currency || "KES").toUpperCase();
	try {
		const formatter = new Intl.NumberFormat("en-KE", {
			style: "currency",
			currency: code,
			maximumFractionDigits: 0,
		});
		return formatter.format(amount);
	} catch (_error) {
		return `${code} ${amount.toLocaleString("en-KE")}`;
	}
}

function showToast(message) {
	if (!dom.toast) {
		return;
	}

	dom.toast.textContent = message;
	dom.toast.hidden = false;
	dom.toast.classList.add("is-visible");
	setTimeout(function () {
		dom.toast.classList.remove("is-visible");
		dom.toast.hidden = true;
	}, 2000);
}

function escapeHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function escapeAttr(value) {
	return escapeHtml(value);
}
