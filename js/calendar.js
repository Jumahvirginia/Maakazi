import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = window.supabase?.createClient
	? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: null;

const TEAL = "#048b7b";
const GREY = "#94a3b8";

const dom = {
	sidebar: document.getElementById("ld-sidebar"),
	collapseBtn: document.getElementById("ld-sidebar-toggle"),
	collapseIcon: document.getElementById("ld-sidebar-toggle-icon"),
	mobileBtn: document.getElementById("ld-mobile-menu-btn"),
	logoutBtn: document.getElementById("ld-logout-btn"),

	calendarEl: document.getElementById("booking-calendar"),
	propertyFilter: document.getElementById("cal-property-filter"),
	exportBtn: document.getElementById("cal-export-btn"),

	agendaDateLabel: document.getElementById("agenda-date-label"),
	agendaList: document.getElementById("agenda-list"),

	blockModal: document.getElementById("block-date-modal"),
	blockModalTitle: document.getElementById("block-modal-title"),
	blockModalText: document.getElementById("block-modal-text"),
	blockModalNote: document.getElementById("block-modal-note"),
	blockCancelBtn: document.getElementById("btn-cancel-block"),
	blockConfirmBtn: document.getElementById("btn-confirm-block"),
};

const state = {
	user: null,
	listings: [],
	listingsById: new Map(),
	selectedListingId: "all",
	selectedDateISO: toDateOnly(new Date()),
	viewings: [],
	blockedDates: [],
	pendingBlockDateISO: "",
	pendingBlockAction: "block",
	calendar: null,
	isModalOpen: false,
	suppressDateClickUntil: 0,
};
document.addEventListener("DOMContentLoaded", function () {
	init();

	document.getElementById("btn-cancel-block")?.addEventListener("click", function () {
		if (dom.blockModal) {
			dom.blockModal.style.display = "none";
		}
		state.pendingBlockDateISO = "";
		state.isModalOpen = false;
		state.suppressDateClickUntil = Date.now() + 260;
	});

	document.getElementById("btn-confirm-block")?.addEventListener("click", async function () {
		if (!state.pendingBlockDateISO) {
			if (dom.blockModal) {
				dom.blockModal.style.display = "none";
			}
			state.isModalOpen = false;
			state.suppressDateClickUntil = Date.now() + 260;
			return;
		}

		const dateToRender = state.pendingBlockDateISO;
		if (state.pendingBlockAction === "unblock") {
			await unblockDate(dateToRender);
		} else {
			await saveBlockedDate(dateToRender);
		}
		if (dom.blockModal) {
			dom.blockModal.style.display = "none";
		}
		state.pendingBlockDateISO = "";
		state.pendingBlockAction = "block";
		state.isModalOpen = false;
		state.suppressDateClickUntil = Date.now() + 260;
		await refreshCalendarData();
		renderAgendaForDate(dateToRender);
	});
});

async function init() {
	setupSidebar();

	if (!supabaseClient || !dom.calendarEl) {
		return;
	}

	const user = await getAuthenticatedUser();
	if (!user) {
		window.location.href = "login.html";
		return;
	}

	state.user = user;

	state.listings = await fetchListings();
	state.listingsById = new Map(
		state.listings.map(function (item) {
			return [String(item.id), item];
		}),
	);
	populatePropertyFilter();
	bindControls();
	initCalendar();
	await refreshCalendarData();
	renderAgendaForDate(state.selectedDateISO);
}

function setupSidebar() {
	if (dom.collapseBtn && dom.sidebar) {
		dom.collapseBtn.addEventListener("click", function () {
			const collapsed = dom.sidebar.classList.toggle("is-collapsed");
			dom.collapseBtn.setAttribute("aria-expanded", String(!collapsed));
			if (dom.collapseIcon) {
				dom.collapseIcon.textContent = collapsed ? "chevron_right" : "chevron_left";
			}
		});
	}

	if (dom.mobileBtn && dom.sidebar) {
		dom.mobileBtn.addEventListener("click", function () {
			const open = dom.sidebar.classList.toggle("is-open");
			dom.mobileBtn.setAttribute("aria-expanded", String(open));
		});
	}

	if (dom.logoutBtn && supabaseClient) {
		dom.logoutBtn.addEventListener("click", async function () {
			await supabaseClient.auth.signOut();
			window.location.href = "login.html";
		});
	}
}

function bindControls() {
	if (dom.propertyFilter) {
		dom.propertyFilter.addEventListener("change", async function () {
			state.selectedListingId = dom.propertyFilter.value || "all";
			await refreshCalendarData();
			renderAgendaForDate(state.selectedDateISO);
		});
	}

	if (dom.exportBtn) {
		dom.exportBtn.addEventListener("click", exportCurrentAgenda);
	}

	if (dom.blockCancelBtn) {
		// Bound immediately in setupImmediateModalHandlers.
	}

	if (dom.blockConfirmBtn) {
		// Bound immediately in setupImmediateModalHandlers.
	}

	if (dom.blockModal) {
		const modalCard = dom.blockModal.querySelector(".cal-modal");
		if (modalCard) {
			modalCard.addEventListener("click", function (event) {
				event.stopPropagation();
			});
		}

		dom.blockModal.addEventListener("click", function (event) {
			if (event.target === dom.blockModal) {
				closeBlockModal();
			}
		});
	}
}

function initCalendar() {
	state.calendar = new window.FullCalendar.Calendar(dom.calendarEl, {
		initialView: "dayGridMonth",
		height: "auto",
		firstDay: 0,
		selectable: false,
		eventDisplay: "block",
		headerToolbar: {
			left: "title",
			center: "",
			right: "today prev,next dayGridMonth,timeGridWeek,timeGridDay",
		},
		dateClick: function (info) {
			if (state.isModalOpen || Date.now() < state.suppressDateClickUntil) {
				return;
			}
			state.selectedDateISO = info.dateStr;
			renderAgendaForDate(info.dateStr);
			const alreadyBlocked = isDateBlocked(info.dateStr);
			if (hasViewingOnDate(info.dateStr)) {
				return;
			}
			showModal(info.dateStr, alreadyBlocked);
		},
		eventClick: function (info) {
			state.selectedDateISO = toDateOnly(info.event.start || new Date());
			renderAgendaForDate(state.selectedDateISO);
		},
		eventDidMount: function (info) {
			if (info.event.display === "background") {
				info.el.classList.add("cal-blocked-bg");
			}
		},
	});

	state.calendar.render();
}

async function getAuthenticatedUser() {
	try {
		const {
			data: { user },
			error,
		} = await supabaseClient.auth.getUser();
		if (error) {
			return null;
		}
		return user || null;
	} catch (_error) {
		return null;
	}
}

async function fetchListings() {
	try {
		const { data, error } = await supabaseClient
			.from("listings")
			.select("id,title,is_visible")
			.eq("landlord_id", state.user.id);

		if (error) {
			throw error;
		}

		return Array.isArray(data) ? data : [];
	} catch (error) {
		const message = String(error?.message || "").toLowerCase();
		if (message.includes("column") && message.includes("does not exist")) {
			console.warn("Calendar listing fetch skipped due to schema mismatch:", error.message || error);
			return [];
		}

		console.error("Unable to load listings for calendar:", error);
		return [];
	}
}

function populatePropertyFilter() {
	if (!dom.propertyFilter) {
		return;
	}

	dom.propertyFilter.innerHTML = '<option value="all">All Properties</option>';

	state.listings.forEach(function (listing) {
		const opt = document.createElement("option");
		opt.value = String(listing.id);
		opt.textContent = listing.title || `Listing ${listing.id}`;
		dom.propertyFilter.appendChild(opt);
	});
}

async function refreshCalendarData() {
	const [viewings, blocked] = await Promise.all([fetchViewings(), fetchBlockedDates()]);
	state.viewings = viewings;
	state.blockedDates = blocked;

	if (!state.calendar) {
		return;
	}

	state.calendar.removeAllEvents();

	const allEvents = [...buildViewingEvents(), ...buildBlockedBackgroundEvents()];
	allEvents.forEach(function (eventObj) {
		state.calendar.addEvent(eventObj);
	});
}

async function fetchViewings() {
	try {
		let query = supabaseClient
			.from("viewings")
			.select("*")
			.order("start_time", { ascending: true });

		if (state.selectedListingId !== "all") {
			query = query.eq("listing_id", state.selectedListingId);
		}

		const byLandlord = await query.eq("landlord_id", state.user.id);

		if (!byLandlord.error) {
			return Array.isArray(byLandlord.data) ? byLandlord.data : [];
		}

		const landlordMissing = /column.*landlord_id|landlord_id.*does not exist/i.test(String(byLandlord.error.message || ""));
		if (!landlordMissing) {
			throw byLandlord.error;
		}

		const listingIds = state.listings.map(function (x) {
			return x.id;
		}).filter(Boolean);

		if (!listingIds.length) {
			return [];
		}

		let fallbackQuery = supabaseClient
			.from("viewings")
			.select("*")
			.in("listing_id", listingIds)
			.order("start_time", { ascending: true });

		if (state.selectedListingId !== "all") {
			fallbackQuery = fallbackQuery.eq("listing_id", state.selectedListingId);
		}

		const fallback = await fallbackQuery;
		if (fallback.error) {
			throw fallback.error;
		}

		return Array.isArray(fallback.data) ? fallback.data : [];
	} catch (error) {
		console.error("Unable to load viewings:", error);
		return [];
	}
}

async function fetchBlockedDates() {
	try {
		let query = supabaseClient
			.from("blocked_dates")
			.select("*")
			.order("blocked_date", { ascending: true });

		if (state.selectedListingId !== "all") {
			query = query.eq("listing_id", state.selectedListingId);
		}

		const byLandlord = await query.eq("landlord_id", state.user.id);

		if (!byLandlord.error) {
			return Array.isArray(byLandlord.data) ? byLandlord.data : [];
		}

		const landlordMissing = /column.*landlord_id|landlord_id.*does not exist/i.test(String(byLandlord.error.message || ""));
		if (!landlordMissing) {
			throw byLandlord.error;
		}

		const listingIds = state.listings.map(function (x) {
			return x.id;
		}).filter(Boolean);

		if (!listingIds.length) {
			return [];
		}

		let fallbackQuery = supabaseClient
			.from("blocked_dates")
			.select("*")
			.in("listing_id", listingIds)
			.order("blocked_date", { ascending: true });

		if (state.selectedListingId !== "all") {
			fallbackQuery = fallbackQuery.eq("listing_id", state.selectedListingId);
		}

		const fallback = await fallbackQuery;
		if (fallback.error) {
			throw fallback.error;
		}

		return Array.isArray(fallback.data) ? fallback.data : [];
	} catch (error) {
		console.error("Unable to load blocked dates:", error);
		return [];
	}
}

function buildViewingEvents() {
	return state.viewings
		.map(function (row) {
			const listingId = String(row.listing_id || row.property_id || "");
			const listing = state.listingsById.get(listingId);

			const startIso = row.start_time || row.starts_at || row.viewing_time || row.date_time;
			if (!startIso) {
				return null;
			}

			const startDate = new Date(startIso);
			const endIso = row.end_time || row.ends_at || new Date(startDate.getTime() + 45 * 60 * 1000).toISOString();
			const titleBase = listing?.title || row.property_title || row.listing_title || "Property Viewing";
			const status = String(row.status || row.viewing_status || "").toLowerCase();
			const isCancelled = status.includes("cancel");
			const isInactive = listing?.is_visible === false;
			const useGrey = isInactive || isCancelled;
			const titlePrefix = isCancelled ? "[CANCELLED] " : (isInactive ? "[RENTED] " : "");

			return {
				id: `viewing-${row.id || Math.random().toString(36).slice(2)}`,
				title: `${titlePrefix}${titleBase}`,
				start: startIso,
				end: endIso,
				allDay: false,
				backgroundColor: useGrey ? GREY : TEAL,
				borderColor: useGrey ? GREY : TEAL,
				textColor: "#ffffff",
				classNames: useGrey ? ["cal-viewing", "is-rented"] : ["cal-viewing"],
				extendedProps: {
					listingId,
					tenantName: row.tenant_name || row.full_name || row.tenant || "Tenant",
					tenantPhone: row.tenant_phone || row.phone || "",
					propertyTitle: titleBase,
					raw: row,
				},
			};
		})
		.filter(Boolean);
}

function hasViewingOnDate(dateISO) {
	return state.viewings.some(function (row) {
		const startIso = row.start_time || row.starts_at || row.viewing_time || row.date_time;
		if (!startIso) {
			return false;
		}

		const listingId = String(row.listing_id || row.property_id || "");
		const passesFilter = state.selectedListingId === "all" || listingId === String(state.selectedListingId);
		return passesFilter && toDateOnly(startIso) === dateISO;
	});
}

function buildBlockedBackgroundEvents() {
	return state.blockedDates
		.map(function (row, index) {
			const blockedDate = row.blocked_date || row.date || row.block_date;
			if (!blockedDate) {
				return null;
			}

			const start = toDateOnly(blockedDate);
			const end = addDaysISO(start, 1);

			return {
				id: `blocked-${row.id || index}`,
				start,
				end,
				allDay: true,
				display: "background",
				overlap: false,
				classNames: ["cal-blocked-bg"],
			};
		})
		.filter(Boolean);
}

function showModal(dateISO, alreadyBlocked = false) {
	state.pendingBlockDateISO = dateISO;
	state.isModalOpen = true;
	const isBlocked = alreadyBlocked;
	state.pendingBlockAction = isBlocked ? "unblock" : "block";

	if (dom.blockModalTitle) {
		dom.blockModalTitle.textContent = isBlocked ? "Unblock this date?" : "Block this date?";
	}

	if (dom.blockModalText) {
		dom.blockModalText.textContent = isBlocked
			? "This will make the date available for tenant viewings again."
			: "";
	}

	if (dom.blockModalNote) {
		dom.blockModalNote.textContent = isBlocked
			? ""
			: "Blocking this date means tenants will not be able to schedule any viewings at your properties on this day.";
	}

	if (dom.blockConfirmBtn) {
		dom.blockConfirmBtn.textContent = isBlocked ? "Unblock Date" : "Block Date";
	}

	if (dom.blockModal) {
		dom.blockModal.style.display = "grid";
	}
}

function closeBlockModal() {
	state.pendingBlockDateISO = "";
	state.pendingBlockAction = "block";
	state.isModalOpen = false;
	state.suppressDateClickUntil = Date.now() + 260;
	if (dom.blockModalTitle) {
		dom.blockModalTitle.textContent = "Block this date?";
	}
	if (dom.blockModalText) {
		dom.blockModalText.textContent = "";
	}
	if (dom.blockModalNote) {
		dom.blockModalNote.textContent = "";
	}
	if (dom.blockConfirmBtn) {
		dom.blockConfirmBtn.textContent = "Block Date";
	}
	if (dom.blockModal) {
		dom.blockModal.style.display = "none";
	}
}

async function saveBlockedDate(dateISO) {
	const { data: existingRows, error: existingError } = await supabaseClient
		.from("blocked_dates")
		.select("id")
		.eq("landlord_id", state.user.id)
		.eq("blocked_date", dateISO)
		.limit(1);

	if (existingError) {
		alert(existingError.message || "Unable to block date right now.");
		return;
	}

	if (Array.isArray(existingRows) && existingRows.length > 0) {
		alert("Date is already blocked.");
		return;
	}

	const payload = {
		landlord_id: state.user.id,
		blocked_date: dateISO,
		reason: "manual",
	};

	const { error } = await supabaseClient.from("blocked_dates").insert([payload]);
	if (error) {
		alert(error.message || "Unable to block date right now.");
		return;
	}

	alert("Date blocked successfully.");
}

async function unblockDate(dateISO) {
	const { error } = await supabaseClient
		.from("blocked_dates")
		.delete()
		.eq("blocked_date", dateISO)
		.eq("landlord_id", state.user.id);

	if (error) {
		alert(error.message || "Unable to unblock date right now.");
		return;
	}

	alert("Date unblocked successfully.");
}

function isDateBlocked(dateISO) {
	return state.blockedDates.some(function (row) {
		const blockedDate = row.blocked_date || row.block_date || row.date;
		return blockedDate && toDateOnly(blockedDate) === dateISO;
	});
}

function renderAgendaForDate(dateISO) {
	state.selectedDateISO = dateISO;

	if (dom.agendaDateLabel) {
		dom.agendaDateLabel.textContent = formatFriendlyDate(dateISO);
	}

	if (!dom.agendaList) {
		return;
	}

	const dayRows = state.viewings
		.filter(function (row) {
			const startIso = row.start_time || row.starts_at || row.viewing_time || row.date_time;
			if (!startIso) {
				return false;
			}

			const rowDate = toDateOnly(startIso);
			const listingId = String(row.listing_id || row.property_id || "");
			const passesFilter = state.selectedListingId === "all" || listingId === String(state.selectedListingId);
			return rowDate === dateISO && passesFilter;
		})
		.sort(function (a, b) {
			return new Date(a.start_time || a.starts_at || a.viewing_time || a.date_time).getTime()
				- new Date(b.start_time || b.starts_at || b.viewing_time || b.date_time).getTime();
		});

	if (!dayRows.length) {
		dom.agendaList.innerHTML = '<p class="cal-agenda-empty">No viewings scheduled for this date.</p>';
		return;
	}

	dom.agendaList.innerHTML = "";

	dayRows.forEach(function (row) {
		const listingId = String(row.listing_id || row.property_id || "");
		const listing = state.listingsById.get(listingId);
		const startIso = row.start_time || row.starts_at || row.viewing_time || row.date_time;

		const tenantName = row.tenant_name || row.full_name || row.tenant || "Tenant";
		const tenantPhone = String(row.tenant_phone || row.phone || "").trim();
		const propertyTitle = listing?.title || row.property_title || row.listing_title || "Property";
		const timeText = formatTime(startIso);

		const card = document.createElement("article");
		card.className = "cal-tenant-card";
		card.innerHTML = `
			<div class="cal-tenant-card-head">
				<strong>${escapeHtml(tenantName)}</strong>
				<span>${escapeHtml(timeText)}</span>
			</div>
			<p>${escapeHtml(propertyTitle)}</p>
			<div class="cal-tenant-actions">
				<a class="cal-call-btn" href="${tenantPhone ? `tel:${encodeURIComponent(tenantPhone)}` : "#"}">
					<span class="material-symbols-outlined" aria-hidden="true">call</span>
					Call Tenant
				</a>
				<a class="cal-wa-btn" target="_blank" rel="noopener noreferrer" href="${buildWhatsAppLink(tenantPhone, propertyTitle, startIso)}">
					<span class="material-symbols-outlined" aria-hidden="true">chat</span>
					WhatsApp
				</a>
			</div>
		`;
		dom.agendaList.appendChild(card);
	});
}

function buildWhatsAppLink(phoneRaw, propertyTitle, startIso) {
	const digits = String(phoneRaw || "").replace(/\D/g, "");
	const text = `Hi, this is Makazi regarding your viewing at ${propertyTitle} on ${formatFriendlyDateTime(startIso)}.`;
	if (!digits) {
		return `https://wa.me/?text=${encodeURIComponent(text)}`;
	}
	return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function exportCurrentAgenda() {
	const dateISO = state.selectedDateISO || toDateOnly(new Date());
	const list = state.viewings.filter(function (row) {
		const startIso = row.start_time || row.starts_at || row.viewing_time || row.date_time;
		return startIso && toDateOnly(startIso) === dateISO;
	});

	const rowsHtml = list.length
		? list.map(function (row) {
			const listingId = String(row.listing_id || row.property_id || "");
			const listing = state.listingsById.get(listingId);
			const tenantName = row.tenant_name || row.full_name || row.tenant || "Tenant";
			const startIso = row.start_time || row.starts_at || row.viewing_time || row.date_time;
			const propertyTitle = listing?.title || row.property_title || row.listing_title || "Property";
			return `<li><strong>${escapeHtml(formatTime(startIso))}</strong> - ${escapeHtml(tenantName)} (${escapeHtml(propertyTitle)})</li>`;
		}).join("")
		: "<li>No viewings scheduled.</li>";

	const win = window.open("", "_blank", "width=860,height=700");
	if (!win) {
		return;
	}

	win.document.write(`
		<!doctype html>
		<html>
			<head>
				<meta charset="utf-8" />
				<title>Makazi Daily Schedule</title>
				<style>
					body { font-family: Arial, sans-serif; margin: 24px; color: #0f172a; }
					h1 { margin: 0 0 8px; }
					p { margin: 0 0 16px; color: #334155; }
					ul { padding-left: 20px; }
					li { margin: 10px 0; }
				</style>
			</head>
			<body>
				<h1>Makazi Daily Agenda</h1>
				<p>${escapeHtml(formatFriendlyDate(dateISO))}</p>
				<ul>${rowsHtml}</ul>
			</body>
		</html>
	`);
	win.document.close();
	win.focus();
	win.print();
}

// Exposed helper for future create-viewing flows to enforce 15-min booking buffer.
window.saveViewingWithBuffer = async function saveViewingWithBuffer(payload) {
	if (!payload?.listing_id || !payload?.start_time) {
		throw new Error("listing_id and start_time are required.");
	}

	const startDate = new Date(payload.start_time);
	const minBuffer = new Date(startDate.getTime() - 15 * 60 * 1000).toISOString();
	const maxBuffer = new Date(startDate.getTime() + 15 * 60 * 1000).toISOString();

	const { data: conflictRows, error: conflictError } = await supabaseClient
		.from("viewings")
		.select("id,start_time")
		.eq("listing_id", payload.listing_id)
		.gte("start_time", minBuffer)
		.lte("start_time", maxBuffer)
		.limit(1);

	if (conflictError) {
		throw conflictError;
	}

	if (Array.isArray(conflictRows) && conflictRows.length > 0) {
		alert("Time slot too close to another viewing.");
		throw new Error("Time slot too close to another viewing.");
	}

	const { data, error } = await supabaseClient
		.from("viewings")
		.insert([
			{
				...payload,
				landlord_id: payload.landlord_id || state.user?.id || null,
			},
		])
		.select("*")
		.maybeSingle();

	if (error) {
		throw error;
	}

	await refreshCalendarData();
	renderAgendaForDate(toDateOnly(payload.start_time));
	return data;
};

function toDateOnly(value) {
	const date = value instanceof Date ? value : new Date(value);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function addDaysISO(dateISO, days) {
	const d = new Date(`${dateISO}T00:00:00`);
	d.setDate(d.getDate() + days);
	return toDateOnly(d);
}

function formatFriendlyDate(dateISO) {
	const d = new Date(`${dateISO}T00:00:00`);
	return d.toLocaleDateString("en-KE", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function formatFriendlyDateTime(isoDateTime) {
	const d = new Date(isoDateTime);
	return d.toLocaleString("en-KE", {
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatTime(isoDateTime) {
	const d = new Date(isoDateTime);
	return d.toLocaleTimeString("en-KE", {
		hour: "numeric",
		minute: "2-digit",
	});
}

function escapeHtml(text) {
	return String(text)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}
