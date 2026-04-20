import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = window.supabase?.createClient
	? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: null;

const TEAL = "#048b7b";
const BURGUNDY = "#800020";
const SIDEBAR_COLLAPSE_KEY = "makazi_admin_sidebar_collapsed";

const dom = {
	layout: document.querySelector(".ad-layout"),
	sidebar: document.getElementById("ad-sidebar"),
	sidebarToggle: document.getElementById("ad-sidebar-toggle"),
	sidebarToggleIcon: document.getElementById("ad-sidebar-toggle-icon"),
	mobileToggle: document.getElementById("ad-mobile-toggle"),
	logoutBtn: document.getElementById("ad-logout-btn"),
	sidebarLogoutBtn: document.getElementById("ad-sidebar-logout-btn"),
	adminNameDisplay: document.getElementById("admin-name-display"),
	totalUsers: document.getElementById("ad-total-users"),
	activeListings: document.getElementById("ad-active-listings"),
	pendingVerifications: document.getElementById("ad-pending-verifications"),
	reportedFraud: document.getElementById("ad-reported-fraud"),
	activityLog: document.getElementById("ad-activity-log"),
	userGrowthCanvas: document.getElementById("ad-user-growth-chart"),
	marketActivityCanvas: document.getElementById("ad-market-activity-chart"),
};

const state = {
	user: null,
	profilesCache: [],
	listingsCache: [],
	viewingsCache: [],
	userGrowthChart: null,
	marketActivityChart: null,
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
		// Ignore persistence issues and keep runtime behavior.
	}
}

function readSidebarCollapsed() {
	try {
		return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1";
	} catch (_error) {
		return false;
	}
}

async function init() {
	if (!supabaseClient) {
		setUnavailableState("Supabase client unavailable.");
		return;
	}

	const {
		data: { user },
		error,
	} = await supabaseClient.auth.getUser();

	if (error) {
		window.location.href = "login.html";
		return;
	}

	if (!user) {
		window.location.href = "login.html";
		return;
	}

	state.user = user;
	const { data: profile } = await supabaseClient
		.from("profiles")
		.select("full_name")
		.eq("id", user.id)
		.single();

	const nameDisplay = document.getElementById("admin-name-display");
	if (nameDisplay && profile?.full_name) {
		nameDisplay.innerHTML = `<span style="color: #800020; font-weight: 800;">${escapeHtml(profile.full_name)}</span>`;
	} else if (nameDisplay) {
		nameDisplay.innerHTML = '<span style="color: #800020; font-weight: 800;">Admin User</span>';
	}

	await Promise.all([loadStats(), loadChartData(), loadRecentActivity()]);
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

function setUnavailableState(message) {
	if (dom.totalUsers) {
		dom.totalUsers.textContent = "-";
	}
	if (dom.activeListings) {
		dom.activeListings.textContent = "-";
	}
	if (dom.pendingVerifications) {
		dom.pendingVerifications.textContent = "-";
	}
	if (dom.reportedFraud) {
		dom.reportedFraud.textContent = "-";
	}
	if (dom.activityLog) {
		dom.activityLog.innerHTML = `<li class="ad-empty">${escapeHtml(message)}</li>`;
	}
}

async function loadStats() {
	const [totalUsers, activeListings, pendingVerifications, reportedFraud] = await Promise.all([
		countTotalUsers(),
		countActiveListings(),
		countPendingVerifications(),
		countReportedFraud(),
	]);

	if (dom.totalUsers) {
		dom.totalUsers.textContent = formatCompact(totalUsers);
	}
	if (dom.activeListings) {
		dom.activeListings.textContent = formatCompact(activeListings);
	}
	if (dom.pendingVerifications) {
		dom.pendingVerifications.textContent = formatCompact(pendingVerifications);
	}
	if (dom.reportedFraud) {
		dom.reportedFraud.textContent = formatCompact(reportedFraud);
	}
}

async function countTotalUsers() {
	const profiles = await countRows("profiles");
	if (profiles !== null) {
		return profiles;
	}
	const users = await countRows("users");
	if (users !== null) {
		return users;
	}
	return 0;
}

async function countActiveListings() {
	let result = await supabaseClient
		.from("listings")
		.select("id", { count: "exact", head: true })
		.eq("is_visible", true);
	if (!result.error) {
		return result.count || 0;
	}

	result = await supabaseClient
		.from("listings")
		.select("id", { count: "exact", head: true })
		.eq("status", "approved");
	if (!result.error) {
		return result.count || 0;
	}

	return 0;
}

async function countPendingVerifications() {
	let result = await supabaseClient
		.from("landlord_verifications")
		.select("id", { count: "exact", head: true })
		.eq("status", "pending");
	if (!result.error) {
		return result.count || 0;
	}

	result = await supabaseClient
		.from("profiles")
		.select("id", { count: "exact", head: true })
		.eq("role", "landlord")
		.eq("verification_status", "pending");
	if (!result.error) {
		return result.count || 0;
	}

	return 0;
}

async function countReportedFraud() {
	let result = await supabaseClient.from("fraud_reports").select("id", { count: "exact", head: true });
	if (!result.error) {
		return result.count || 0;
	}

	result = await supabaseClient.from("reported_content").select("id", { count: "exact", head: true });
	if (!result.error) {
		return result.count || 0;
	}

	return 0;
}

async function countRows(tableName) {
	const { count, error } = await supabaseClient
		.from(tableName)
		.select("id", { count: "exact", head: true });
	if (error) {
		return null;
	}
	return count || 0;
}

async function loadChartData() {
	const [profilesData, listingsData, viewingsData] = await Promise.all([
		loadProfilesForCharts(),
		loadListingsForCharts(),
		loadViewingsForCharts(),
	]);

	state.profilesCache = profilesData;
	state.listingsCache = listingsData;
	state.viewingsCache = viewingsData;

	renderUserGrowthChart();
	renderMarketActivityChart();
}

async function loadProfilesForCharts() {
	const result = await supabaseClient.from("profiles").select("id,role,created_at").limit(5000);
	if (result.error || !Array.isArray(result.data)) {
		return [];
	}
	return result.data;
}

async function loadListingsForCharts() {
	const result = await supabaseClient.from("listings").select("id,created_at").limit(5000);
	if (result.error || !Array.isArray(result.data)) {
		return [];
	}
	return result.data;
}

async function loadViewingsForCharts() {
	const result = await supabaseClient.from("viewings").select("id,created_at,start_time").limit(5000);
	if (result.error || !Array.isArray(result.data)) {
		return [];
	}
	return result.data;
}

function renderUserGrowthChart() {
	if (!dom.userGrowthCanvas || !window.Chart) {
		return;
	}

	const labels = buildRecentWeekLabels(4);
	const landlordCounts = new Array(labels.length).fill(0);
	const tenantCounts = new Array(labels.length).fill(0);

	state.profilesCache.forEach(function (row) {
		const createdAt = row.created_at;
		if (!createdAt) {
			return;
		}
		const weekIndex = getWeekIndexFromDate(createdAt, labels.length);
		if (weekIndex < 0) {
			return;
		}

		const role = String(row.role || "").toLowerCase();
		if (role === "landlord") {
			landlordCounts[weekIndex] += 1;
		}
		if (role === "tenant") {
			tenantCounts[weekIndex] += 1;
		}
	});

	const landlordSeries = normalizeSeries(landlordCounts, labels.length);
	const tenantSeries = normalizeSeries(tenantCounts, labels.length);

	if (state.userGrowthChart) {
		state.userGrowthChart.destroy();
	}

	state.userGrowthChart = new window.Chart(dom.userGrowthCanvas, {
		type: "bar",
		data: {
			labels,
			datasets: [
				{
					label: "Landlords",
					data: landlordSeries,
					backgroundColor: TEAL,
					borderRadius: 8,
				},
				{
					label: "Tenants",
					data: tenantSeries,
					backgroundColor: BURGUNDY,
					borderRadius: 8,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "top",
				},
			},
			scales: {
				x: {
					grid: { display: false },
				},
				y: {
					beginAtZero: true,
					ticks: {
						precision: 0,
					},
				},
			},
		},
	});
}

function renderMarketActivityChart() {
	if (!dom.marketActivityCanvas || !window.Chart) {
		return;
	}

	const labels = buildRecentWeekLabels(6);
	const listingsCounts = new Array(labels.length).fill(0);
	const viewingsCounts = new Array(labels.length).fill(0);

	state.listingsCache.forEach(function (row) {
		if (!row.created_at) {
			return;
		}
		const index = getWeekIndexFromDate(row.created_at, labels.length);
		if (index >= 0) {
			listingsCounts[index] += 1;
		}
	});

	state.viewingsCache.forEach(function (row) {
		const anchor = row.start_time || row.created_at;
		if (!anchor) {
			return;
		}
		const index = getWeekIndexFromDate(anchor, labels.length);
		if (index >= 0) {
			viewingsCounts[index] += 1;
		}
	});

	const safeListingsSeries = normalizeSeries(listingsCounts, labels.length);
	const safeViewingsSeries = normalizeSeries(viewingsCounts, labels.length);

	if (state.marketActivityChart) {
		state.marketActivityChart.destroy();
	}

	state.marketActivityChart = new window.Chart(dom.marketActivityCanvas, {
		type: "line",
		data: {
			labels,
			datasets: [
				{
					label: "Viewings Scheduled",
					data: safeViewingsSeries,
					borderColor: TEAL,
					backgroundColor: "rgba(4, 139, 123, 0.16)",
					tension: 0.35,
					fill: true,
					spanGaps: true,
					pointRadius: 2,
				},
				{
					label: "New Listings",
					data: safeListingsSeries,
					borderColor: BURGUNDY,
					backgroundColor: "rgba(128, 0, 32, 0.14)",
					tension: 0.35,
					fill: false,
					spanGaps: true,
					pointRadius: 2,
				},
			],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: "top",
				},
			},
			scales: {
				x: {
					grid: { display: false },
				},
				y: {
					beginAtZero: true,
					grace: "4%",
					ticks: {
						precision: 0,
					},
				},
			},
		},
	});
}

function normalizeSeries(series, size) {
	const safe = new Array(size).fill(0);
	for (let i = 0; i < size; i += 1) {
		const value = Number(series[i]);
		safe[i] = Number.isFinite(value) && value >= 0 ? value : 0;
	}
	return safe;
}

function buildRecentWeekLabels(weeks) {
	const labels = [];
	for (let i = weeks - 1; i >= 0; i -= 1) {
		labels.push(`Week ${weeks - i}`);
	}
	return labels;
}

function getWeekIndexFromDate(value, totalWeeks) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return -1;
	}

	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	if (diffMs < 0) {
		return -1;
	}

	const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
	if (diffWeeks >= totalWeeks) {
		return -1;
	}

	return totalWeeks - diffWeeks - 1;
}

async function loadRecentActivity() {
	const [listingsRes, viewingsRes] = await Promise.all([
		supabaseClient.from("listings").select("id,title,created_at").order("created_at", { ascending: false }).limit(5),
		supabaseClient
			.from("viewings")
			.select("id,created_at,start_time,property_title,listing_title,listing_id")
			.order("created_at", { ascending: false })
			.limit(5),
	]);

	const listingNameById = new Map(
		state.listingsCache.map(function (row) {
			return [String(row.id), row.title || "Property"];
		}),
	);

	const listingItems = Array.isArray(listingsRes.data)
		? listingsRes.data.map(function (row) {
			return {
				label: `New Listing added: ${row.title || "Untitled Listing"}`,
				time: row.created_at,
			};
		})
		: [];

	const viewingItems = Array.isArray(viewingsRes.data)
		? viewingsRes.data.map(function (row) {
			const listingId = String(row.listing_id || "");
			const property = row.property_title || row.listing_title || listingNameById.get(listingId) || "Property";
			return {
				label: `New Viewing booked for ${property}`,
				time: row.created_at || row.start_time,
			};
		})
		: [];

	const merged = [...listingItems, ...viewingItems]
		.filter(function (item) {
			return item.time;
		})
		.sort(function (a, b) {
			return new Date(b.time).getTime() - new Date(a.time).getTime();
		})
		.slice(0, 5);

	renderActivity(merged);
}

function renderActivity(items) {
	if (!dom.activityLog) {
		return;
	}

	if (!Array.isArray(items) || !items.length) {
		dom.activityLog.innerHTML = '<li class="ad-empty">No recent activity available.</li>';
		return;
	}

	dom.activityLog.innerHTML = items
		.map(function (item) {
			return `
				<li>
					<span>${escapeHtml(item.label)}</span>
					<span class="ad-activity-time">${escapeHtml(formatRelativeTime(item.time))}</span>
				</li>
			`;
		})
		.join("");
}

function formatCompact(value) {
	const num = Number(value || 0);
	return num.toLocaleString("en-KE");
}

function formatRelativeTime(value) {
	if (!value) {
		return "Just now";
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Just now";
	}

	const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
	if (diffMinutes < 60) {
		return `${diffMinutes} min ago`;
	}

	const diffHours = Math.round(diffMinutes / 60);
	if (diffHours < 24) {
		return `${diffHours} hr ago`;
	}

	const diffDays = Math.round(diffHours / 24);
	return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function escapeHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
