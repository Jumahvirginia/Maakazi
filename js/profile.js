import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = window.supabase?.createClient
	? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: null;

const dom = {
	sidebar: document.getElementById("ld-sidebar"),
	collapseBtn: document.getElementById("ld-sidebar-toggle"),
	collapseIcon: document.getElementById("ld-sidebar-toggle-icon"),
	mobileBtn: document.getElementById("ld-mobile-menu-btn"),
	logoutBtn: document.getElementById("ld-logout-btn"),

	form: document.getElementById("kyc-form"),
	submitBtn: document.getElementById("kyc-submit-btn"),
	saveLinkBtn: document.getElementById("kyc-save-link"),
	statePending: document.getElementById("state-pending"),
	stateVerified: document.getElementById("state-verified"),
	stateNotStarted: document.getElementById("state-not-started"),

	phoneInput: document.getElementById("kyc-phone"),

	idFrontInput: document.getElementById("kyc-id-front-input"),
	idBackInput: document.getElementById("kyc-id-back-input"),
	ownershipInput: document.getElementById("kyc-ownership-input"),

	idFrontBtn: document.getElementById("kyc-id-front-btn"),
	idBackBtn: document.getElementById("kyc-id-back-btn"),
	ownershipBtn: document.getElementById("kyc-ownership-btn"),

	idFrontName: document.getElementById("kyc-id-front-name"),
	idBackName: document.getElementById("kyc-id-back-name"),
	ownershipName: document.getElementById("kyc-ownership-name"),
	ownershipDropzone: document.getElementById("kyc-ownership-dropzone"),
	uploadZones: Array.from(document.querySelectorAll(".kyc-upload-zone")),

	uploadButtons: Array.from(document.querySelectorAll(".kyc-upload-btn")),
};

const state = {
	currentUser: null,
	verificationStatus: "unverified",
	files: {
		idFront: null,
		idBack: null,
		ownership: null,
	},
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DRAFT_KEY_PREFIX = "makaziVerificationDraft";

init();

async function init() {
	setupSidebar();

	if (!supabaseClient) {
		alert("Supabase is not available on this page.");
		return;
	}

	bindEvents();
	const status = await checkVerificationStatus();
	if (!status) {
		return;
	}

	await hydratePhoneNumber();
	hydrateDraftFromLocal();
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

function bindEvents() {
	if (dom.idFrontBtn && dom.idFrontInput) {
		dom.idFrontBtn.addEventListener("click", function () {
			dom.idFrontInput.click();
		});
	}

	if (dom.idBackBtn && dom.idBackInput) {
		dom.idBackBtn.addEventListener("click", function () {
			dom.idBackInput.click();
		});
	}

	if (dom.ownershipBtn && dom.ownershipInput) {
		dom.ownershipBtn.addEventListener("click", function (event) {
			event.stopPropagation();
			dom.ownershipInput.click();
		});
	}

	if (dom.idFrontInput) {
		dom.idFrontInput.addEventListener("change", function () {
			setFile("idFront", dom.idFrontInput.files?.[0] || null, ["image/", "application/pdf"]);
		});
	}

	if (dom.idBackInput) {
		dom.idBackInput.addEventListener("change", function () {
			setFile("idBack", dom.idBackInput.files?.[0] || null, ["image/", "application/pdf"]);
		});
	}

	if (dom.ownershipInput) {
		dom.ownershipInput.addEventListener("change", function () {
			setFile("ownership", dom.ownershipInput.files?.[0] || null, ["image/", "application/pdf"]);
		});
	}

	dom.uploadZones.forEach(function (zone) {
		const zoneType = zone.dataset.zone;
		const inputId = zoneType === "id-front" ? "kyc-id-front-input" : "kyc-id-back-input";
		const inputEl = document.getElementById(inputId);
		if (!inputEl) {
			return;
		}

		zone.addEventListener("click", function (event) {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest("button")) {
				return;
			}
			inputEl.click();
		});

		zone.addEventListener("keydown", function (event) {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				inputEl.click();
			}
		});

		["dragenter", "dragover"].forEach(function (evtName) {
			zone.addEventListener(evtName, function (event) {
				event.preventDefault();
				event.stopPropagation();
				zone.classList.add("is-dragover");
			});
		});

		["dragleave", "drop"].forEach(function (evtName) {
			zone.addEventListener(evtName, function (event) {
				event.preventDefault();
				event.stopPropagation();
				zone.classList.remove("is-dragover");
			});
		});

		zone.addEventListener("drop", function (event) {
			const file = event.dataTransfer?.files?.[0] || null;
			if (zoneType === "id-front") {
				setFile("idFront", file, ["image/", "application/pdf"]);
			} else {
				setFile("idBack", file, ["image/", "application/pdf"]);
			}
		});
	});

	if (dom.ownershipDropzone && dom.ownershipInput) {
		dom.ownershipDropzone.addEventListener("click", function (event) {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest("button")) {
				return;
			}
			dom.ownershipInput.click();
		});

		dom.ownershipDropzone.addEventListener("keydown", function (event) {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				dom.ownershipInput.click();
			}
		});

		["dragenter", "dragover"].forEach(function (evtName) {
			dom.ownershipDropzone.addEventListener(evtName, function (event) {
				event.preventDefault();
				event.stopPropagation();
				dom.ownershipDropzone.classList.add("is-dragover");
			});
		});

		["dragleave", "drop"].forEach(function (evtName) {
			dom.ownershipDropzone.addEventListener(evtName, function (event) {
				event.preventDefault();
				event.stopPropagation();
				dom.ownershipDropzone.classList.remove("is-dragover");
			});
		});

		dom.ownershipDropzone.addEventListener("drop", function (event) {
			const files = event.dataTransfer?.files;
			if (files && files.length) {
				setFile("ownership", files[0], ["image/", "application/pdf"]);
			}
		});
	}

	if (dom.phoneInput) {
		dom.phoneInput.addEventListener("input", function () {
			dom.phoneInput.value = formatKenyanPhone(dom.phoneInput.value);
		});
	}

	if (dom.form) {
		dom.form.addEventListener("submit", onSubmitVerification);
	}

	if (dom.saveLinkBtn) {
		dom.saveLinkBtn.addEventListener("click", async function () {
			await saveVerificationDraft();
		});
	}
}

async function getAuthenticatedUser() {
	try {
		const {
			data: { user },
			error,
		} = await supabaseClient.auth.getUser();

		if (error) {
			console.error("Auth check failed:", error.message);
			return null;
		}

		return user || null;
	} catch (error) {
		console.error("Unexpected auth check error:", error);
		return null;
	}
}

async function checkVerificationStatus() {
	try {
		const {
			data: { user },
			error: authError,
		} = await supabaseClient.auth.getUser();

		if (authError || !user) {
			window.location.href = "login.html";
			return null;
		}

		state.currentUser = user;

		const { data, error } = await supabaseClient
			.from("profiles")
			.select("verification_status")
			.eq("id", state.currentUser.id)
			.single();

		if (error) {
			throw error;
		}

		let status = data?.verification_status ?? null;

		// Force a fresh read with a cache-busting timestamp.
		const token = (await supabaseClient.auth.getSession())?.data?.session?.access_token;
		const ts = Date.now();
		const noCacheUrl = `${SUPABASE_URL}/rest/v1/profiles?select=verification_status&id=eq.${encodeURIComponent(state.currentUser.id)}&_ts=${ts}`;
		const freshResponse = await fetch(noCacheUrl, {
			method: "GET",
			headers: {
				apikey: SUPABASE_ANON_KEY,
				Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
			},
			cache: "no-cache",
		});

		if (freshResponse.ok) {
			const rows = await freshResponse.json();
			if (Array.isArray(rows) && rows.length) {
				status = rows[0]?.verification_status ?? status;
			}
		}

		const normalized = String(status || "").toLowerCase().trim() || "not_started";
		state.verificationStatus = normalized;
		console.log("Current Status from DB:", normalized);
		hideAllStates();
		showStateForStatus(normalized);
		return normalized;
	} catch (error) {
		console.error("Unable to fetch profile verification status:", error);
		state.verificationStatus = "not_started";
		hideAllStates();
		showStateForStatus("not_started");
		return "not_started";
	}
}

function hideAllStates() {
	if (dom.statePending) {
		dom.statePending.style.display = "none";
	}
	if (dom.stateVerified) {
		dom.stateVerified.style.display = "none";
	}
	if (dom.stateNotStarted) {
		dom.stateNotStarted.style.display = "none";
}
}

function showStateForStatus(status) {
	if (status === "pending" || status === "pending_review") {
		if (dom.statePending) {
			dom.statePending.style.display = "block";
		}
		return;
	}

	if (status === "verified") {
		if (dom.stateVerified) {
			dom.stateVerified.style.display = "block";
		}
		return;
	}

	if (dom.stateNotStarted) {
		dom.stateNotStarted.style.display = "block";
	}
}

async function hydratePhoneNumber() {
	if (!state.currentUser?.id) {
		return;
	}

	try {
		const { data, error } = await supabaseClient
			.from("profiles")
			.select("phone,phone_number,telephone")
			.eq("id", state.currentUser.id)
			.maybeSingle();

		if (error) {
			throw error;
		}

		const existingPhone = data?.phone_number || data?.telephone || data?.phone || "";
		if (existingPhone && dom.phoneInput) {
			dom.phoneInput.value = formatKenyanPhone(String(existingPhone));
		}
	} catch (error) {
		console.error("Unable to fetch profile phone number:", error);
	}
}

function getDraftStorageKey() {
	if (!state.currentUser?.id) {
		return "";
	}
	return `${DRAFT_KEY_PREFIX}:${state.currentUser.id}`;
}

function hydrateDraftFromLocal() {
	if (state.verificationStatus === "pending" || state.verificationStatus === "pending_review" || state.verificationStatus === "verified") {
		return;
	}

	const key = getDraftStorageKey();
	if (!key) {
		return;
	}

	try {
		const raw = localStorage.getItem(key);
		if (!raw) {
			return;
		}

		const draft = JSON.parse(raw);
		if (!dom.phoneInput?.value && draft?.phone) {
			dom.phoneInput.value = formatKenyanPhone(String(draft.phone));
		}

		if (draft?.idFrontName && dom.idFrontName) {
			dom.idFrontName.textContent = `${draft.idFrontName} (saved draft)`;
		}
		if (draft?.idBackName && dom.idBackName) {
			dom.idBackName.textContent = `${draft.idBackName} (saved draft)`;
		}
		if (draft?.ownershipName && dom.ownershipName) {
			dom.ownershipName.textContent = `${draft.ownershipName} (saved draft)`;
		}
	} catch (error) {
		console.error("Unable to hydrate saved draft:", error);
	}
}

async function saveVerificationDraft() {
	if (!state.currentUser?.id) {
		showToast("Unable to save draft. Please login again.");
		return;
	}

	const draft = {
		phone: String(dom.phoneInput?.value || "").trim(),
		idFrontName: state.files.idFront?.name || "",
		idBackName: state.files.idBack?.name || "",
		ownershipName: state.files.ownership?.name || "",
		savedAt: new Date().toISOString(),
	};

	try {
		localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));

		const normalized = normalizeKenyanPhone(draft.phone);
		if (normalized.valid) {
			await persistDraftPhone(normalized.e164);
		}

		showToast("Draft saved for later.");
	} catch (error) {
		console.error("Save draft failed:", error);
		showToast("Unable to save draft right now.");
	}
}

async function persistDraftPhone(phoneValue) {
	const attempts = [{ phone_number: phoneValue }, { telephone: phoneValue }, { phone: phoneValue }];
	for (const payload of attempts) {
		const { error } = await supabaseClient
			.from("profiles")
			.update(payload)
			.eq("id", state.currentUser.id);

		if (!error) {
			return;
		}

		const message = String(error.message || "").toLowerCase();
		const schemaError = message.includes("column") || message.includes("schema") || message.includes("does not exist");
		if (!schemaError) {
			throw error;
		}
	}
}

function showToast(message) {
	if (!message) {
		return;
	}

	const toast = document.createElement("div");
	toast.className = "app-toast";
	toast.textContent = message;
	document.body.appendChild(toast);

	window.setTimeout(function () {
		toast.style.opacity = "0";
		toast.style.transform = "translateY(-8px)";
		window.setTimeout(function () {
			toast.remove();
		}, 220);
	}, 2200);
}

function setFile(type, file, mimePrefixes) {
	if (!file) {
		return;
	}

	if (file.size > MAX_FILE_SIZE_BYTES) {
		alert("File is too large. Maximum allowed size is 5MB.");
		return;
	}

	const isAllowed = mimePrefixes.some(function (prefix) {
		return String(file.type || "").startsWith(prefix);
	});

	if (!isAllowed) {
		alert("Unsupported file type. Please upload JPG, PNG, or PDF.");
		return;
	}

	if (type === "idFront") {
		state.files.idFront = file;
		if (dom.idFrontName) {
			dom.idFrontName.textContent = file.name;
		}
		return;
	}

	if (type === "idBack") {
		state.files.idBack = file;
		if (dom.idBackName) {
			dom.idBackName.textContent = file.name;
		}
		return;
	}

	state.files.ownership = file;
	if (dom.ownershipName) {
		dom.ownershipName.textContent = file.name;
	}
}

function formatKenyanPhone(value) {
	let digits = String(value || "").replace(/\D/g, "");

	if (digits.startsWith("254")) {
		digits = digits.slice(3);
	}
	if (digits.startsWith("0")) {
		digits = digits.slice(1);
	}

	digits = digits.slice(0, 9);

	const p1 = digits.slice(0, 3);
	const p2 = digits.slice(3, 6);
	const p3 = digits.slice(6, 9);

	let formatted = "+254";
	if (p1) {
		formatted += ` ${p1}`;
	}
	if (p2) {
		formatted += ` ${p2}`;
	}
	if (p3) {
		formatted += ` ${p3}`;
	}

	return formatted;
}

function normalizeKenyanPhone(value) {
	let digits = String(value || "").replace(/\D/g, "");

	if (digits.startsWith("254")) {
		digits = digits.slice(3);
	}
	if (digits.startsWith("0")) {
		digits = digits.slice(1);
	}

	digits = digits.slice(0, 9);

	const valid = /^[17]\d{8}$/.test(digits);
	return {
		valid,
		e164: valid ? `+254${digits}` : "",
	};
}

async function onSubmitVerification(event) {
	event.preventDefault();

	if (state.verificationStatus === "pending" || state.verificationStatus === "pending_review") {
		alert("Verification is already in progress.");
		return;
	}

	if (state.verificationStatus === "verified") {
		alert("Your account is already verified.");
		return;
	}

	if (!state.files.idFront || !state.files.idBack || !state.files.ownership) {
		alert("Please upload Front ID, Back ID, and Ownership Document before submitting.");
		return;
	}

	const phone = normalizeKenyanPhone(dom.phoneInput?.value || "");
	if (!phone.valid) {
		alert("Please enter a valid Kenyan phone number in +254 format.");
		return;
	}

	try {
		setSubmitting(true);

		const idFrontPath = await uploadVerificationFile(state.files.idFront, "id_front");
		const idBackPath = await uploadVerificationFile(state.files.idBack, "id_back");
		const ownershipPath = await uploadVerificationFile(state.files.ownership, "ownership_deed");

		await updateProfileVerification({
			phone: phone.e164,
			idFrontPath,
			idBackPath,
			ownershipPath,
		});

		state.verificationStatus = "pending";
		hideAllStates();
		showStateForStatus("pending");
		sessionStorage.setItem("makaziToast", "Documents submitted for review.");
		window.location.href = "landlord_dashboard.html";
	} catch (error) {
		console.error("Verification submission failed:", error);
		alert(error?.message || "Unable to submit verification right now. Please try again.");
	} finally {
		setSubmitting(false);
	}
}

function setSubmitting(isSubmitting) {
	if (!dom.submitBtn) {
		return;
	}

	if (isSubmitting) {
		dom.submitBtn.disabled = true;
		dom.submitBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">hourglass_top</span>Submitting...';
		return;
	}

	dom.submitBtn.disabled = false;
	dom.submitBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">check_circle</span>Submit for Verification';
}

async function uploadVerificationFile(file, category) {
	const path = `${state.currentUser.id}/${category}`;

	const { error } = await supabaseClient
		.storage
		.from("verification-docs")
		.upload(path, file, { upsert: true, contentType: file.type || undefined });

	if (error) {
		throw new Error(`Upload failed for ${file.name}: ${error.message}`);
	}

	return path;
}

async function updateProfileVerification(payload) {
	const updatedAt = new Date().toISOString();
	const attempts = [
		{
			verification_status: "pending",
			phone_number: payload.phone,
			id_front_path: payload.idFrontPath,
			id_back_path: payload.idBackPath,
			ownership_doc_path: payload.ownershipPath,
			verification_updated_at: updatedAt,
		},
		{
			verification_status: "pending",
			telephone: payload.phone,
			front_id_path: payload.idFrontPath,
			back_id_path: payload.idBackPath,
			property_doc_path: payload.ownershipPath,
			verification_updated_at: updatedAt,
		},
		{
			verification_status: "pending",
			phone: payload.phone,
			verification_documents: {
				id_front_path: payload.idFrontPath,
				id_back_path: payload.idBackPath,
				ownership_doc_path: payload.ownershipPath,
			},
			verification_updated_at: updatedAt,
		},
	];

	let lastError = null;

	for (const row of attempts) {
		const { error } = await supabaseClient
			.from("profiles")
			.update(row)
			.eq("id", state.currentUser.id);

		if (!error) {
			return;
		}

		lastError = error;
		const message = String(error.message || "").toLowerCase();
		const schemaError = message.includes("column") || message.includes("schema") || message.includes("does not exist");
		if (!schemaError) {
			break;
		}
	}

	throw new Error(lastError?.message || "Unable to update verification profile.");
}
