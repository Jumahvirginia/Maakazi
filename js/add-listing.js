import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = window.supabase?.createClient
	? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
	: null;

const listingData = {
	basic: {
		title: "",
		type: "",
		monthlyRent: null,
		location: "",
		description: "",
	},
	features: {
		bedrooms: 0,
		bathrooms: 0,
		amenities: [],
	},
	images: [],
	imageUrls: [],
};

const dom = {
	sidebar: document.getElementById("ld-sidebar"),
	collapseBtn: document.getElementById("ld-sidebar-toggle"),
	collapseIcon: document.getElementById("ld-sidebar-toggle-icon"),
	mobileBtn: document.getElementById("ld-mobile-menu-btn"),

	form: document.getElementById("add-listing-form"),
	steps: Array.from(document.querySelectorAll(".anl-step")),
	stepItems: Array.from(document.querySelectorAll(".anl-stepper-item")),
	stepNumber: document.getElementById("anl-step-number"),

	backBtn: document.getElementById("btn-back"),
	nextBtn: document.getElementById("btn-next"),
	backEditBtn: document.getElementById("btn-back-edit"),
	publishBtn: document.getElementById("btn-publish") || document.getElementById("btn-submit"),

	title: document.getElementById("listing-title"),
	type: document.getElementById("property-type"),
	rent: document.getElementById("monthly-rent"),
	location: document.getElementById("listing-location"),
	bedrooms: document.getElementById("bedrooms"),
	bathrooms: document.getElementById("bathrooms"),
	amenityInputs: Array.from(document.querySelectorAll(".anl-amenity-input")),
	counterBtns: Array.from(document.querySelectorAll(".anl-counter-btn")),
	photosInput: document.getElementById("listing-photos"),
	photoSlotInputs: Array.from(document.querySelectorAll(".anl-slot-input")),
	photoSlots: Array.from(document.querySelectorAll(".anl-photo-slot[data-slot-index]")),

	reviewTitle: document.getElementById("review-title"),
	reviewRent: document.getElementById("review-rent"),
	reviewLocation: document.getElementById("review-location"),
	reviewFeatures: document.getElementById("review-features"),
	reviewAmenities: document.getElementById("review-amenities"),
};

let currentStep = 1;
const totalSteps = 4;
const originalPublishText = dom.publishBtn ? dom.publishBtn.innerHTML : "Publish Listing";
const slotFiles = [null, null, null, null];

function init() {
	if (!dom.form || !dom.steps.length) {
		return;
	}

	setupSidebar();
	injectSpinnerStyle();
	setupCounterButtons();
	setupInputBindings();
	setupStepNavigation();

	updateStepUI();
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
}

function injectSpinnerStyle() {
	const style = document.createElement("style");
	style.textContent = `
		.anl-spin { animation: anl-spin 1s linear infinite; }
		@keyframes anl-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
	`;
	document.head.appendChild(style);
}

function setupCounterButtons() {
	dom.counterBtns.forEach(function (btn) {
		btn.addEventListener("click", function () {
			const targetId = btn.getAttribute("data-target");
			const action = btn.getAttribute("data-action");
			const input = targetId ? document.getElementById(targetId) : null;

			if (!input) {
				return;
			}

			const currentVal = Number(input.value) || 0;
			const minVal = Number(input.min || 0);
			input.value = String(action === "inc" ? currentVal + 1 : Math.max(minVal, currentVal - 1));
			collectCurrentStepData();
		});
	});
}

function setupInputBindings() {
	[dom.title, dom.type, dom.rent, dom.location, dom.bedrooms, dom.bathrooms]
		.filter(Boolean)
		.forEach(function (el) {
			el.addEventListener("input", collectCurrentStepData);
			el.addEventListener("change", collectCurrentStepData);
		});

	dom.amenityInputs.forEach(function (input) {
		input.addEventListener("change", collectCurrentStepData);
	});

	if (dom.photosInput) {
		dom.photosInput.addEventListener("change", function (event) {
			const files = Array.from(event.target.files || []).slice(0, slotFiles.length);
			for (let i = 0; i < slotFiles.length; i += 1) {
				slotFiles[i] = files[i] || null;
				updatePhotoSlotPreview(i, slotFiles[i]);
			}

			syncListingImages();
			dom.photosInput.value = "";
		});
	}

	dom.photoSlotInputs.forEach(function (inputEl) {
		inputEl.addEventListener("change", function (event) {
			const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
			const slotIndex = Number(inputEl.dataset.slotIndex);
			if (file === null || Number.isNaN(slotIndex)) {
				return;
			}

			slotFiles[slotIndex] = file;
			updatePhotoSlotPreview(slotIndex, file);
			syncListingImages();
			inputEl.value = "";
		});
	});

	dom.photoSlots.forEach(function (slotEl) {
		slotEl.addEventListener("click", function () {
			const slotIndex = Number(slotEl.dataset.slotIndex);
			const inputEl = document.getElementById(`listing-photo-slot-${slotIndex}`);
			if (!inputEl) {
				return;
			}
			inputEl.click();
		});
	});
}

function setupStepNavigation() {
	if (dom.backBtn) {
		dom.backBtn.addEventListener("click", function () {
			goToStep(currentStep - 1);
		});
	}

	if (dom.nextBtn) {
		dom.nextBtn.addEventListener("click", function () {
			if (!validateStep(currentStep)) {
				return;
			}
			goToStep(currentStep + 1);
		});
	}

	if (dom.backEditBtn) {
		dom.backEditBtn.addEventListener("click", function (event) {
			event.preventDefault();
			goToStep(1);
		});
	}

	dom.form.addEventListener("submit", async function (event) {
		event.preventDefault();

		if (!validateStep(4)) {
			return;
		}

		if (!supabaseClient) {
			alert("Supabase client is not available. Ensure the Supabase CDN script is loaded.");
			return;
		}

		collectAllData();

		if (!listingData.images.length) {
			alert("Please select at least one photo before publishing.");
			return;
		}

		try {
			setPublishLoading(true);
			const imageUrls = await uploadPropertyImages(listingData.images);
			listingData.imageUrls = imageUrls;

			await insertListingRecord(listingData);
			window.location.href = "landlord_dashboard.html";
		} catch (error) {
			console.error("Publish failed:", error);
			alert(error?.message || "Unable to publish listing right now. Please try again.");
		} finally {
			setPublishLoading(false);
		}
	});
}

function goToStep(stepNumber) {
	const bounded = Math.max(1, Math.min(totalSteps, stepNumber));

	if (bounded > currentStep && !validateStep(currentStep)) {
		return;
	}

	collectCurrentStepData();
	currentStep = bounded;
	updateStepUI();
}

function updateStepUI() {
	dom.steps.forEach(function (stepEl, idx) {
		const stepIndex = idx + 1;
		const isCurrent = stepIndex === currentStep;
		stepEl.classList.toggle("is-active", isCurrent);
		stepEl.style.display = isCurrent ? "block" : "none";
	});

	dom.stepItems.forEach(function (item, idx) {
		const stepIndex = idx + 1;
		item.classList.toggle("is-active", stepIndex === currentStep);
		item.classList.toggle("is-complete", stepIndex < currentStep);
	});

	if (dom.stepNumber) {
		dom.stepNumber.textContent = String(currentStep);
	}

	if (dom.backBtn) {
		dom.backBtn.disabled = currentStep === 1;
		dom.backBtn.style.display = currentStep === totalSteps ? "none" : "inline-flex";
	}

	if (dom.backEditBtn) {
		dom.backEditBtn.style.display = currentStep === totalSteps ? "inline-flex" : "none";
	}

	if (dom.nextBtn) {
		dom.nextBtn.style.display = currentStep === totalSteps ? "none" : "inline-flex";
	}

	if (dom.publishBtn) {
		dom.publishBtn.style.display = currentStep === totalSteps ? "inline-flex" : "none";
	}

	if (currentStep === totalSteps) {
		renderReview();
	}
}

function collectCurrentStepData() {
	if (currentStep === 1) {
		listingData.basic.title = (dom.title?.value || "").trim();
		listingData.basic.type = (dom.type?.value || "").trim();
		listingData.basic.monthlyRent = dom.rent?.value ? Number(dom.rent.value) : null;
		listingData.basic.location = (dom.location?.value || "").trim();
		listingData.basic.description = "";
	}

	if (currentStep === 2 || currentStep === 4) {
		listingData.features.bedrooms = Number(dom.bedrooms?.value || 0);
		listingData.features.bathrooms = Number(dom.bathrooms?.value || 0);
		listingData.features.amenities = dom.amenityInputs
			.filter(function (input) {
				return input.checked;
			})
			.map(function (input) {
				const labelText = document.querySelector(`label[for="${input.id}"] strong`);
				return labelText ? labelText.textContent.trim() : "";
			})
			.filter(Boolean);
	}
}

function collectAllData() {
	const previousStep = currentStep;
	[1, 2, 3, 4].forEach(function (step) {
		currentStep = step;
		collectCurrentStepData();
	});
	currentStep = previousStep;

	if (dom.photosInput) {
		syncListingImages();
	}
}

function syncListingImages() {
	listingData.images = slotFiles.filter(Boolean);
}

function updatePhotoSlotPreview(slotIndex, file) {
	const slotEl = dom.photoSlots.find(function (el) {
		return Number(el.dataset.slotIndex) === slotIndex;
	});

	if (!slotEl) {
		return;
	}

	const thumb = slotEl.querySelector(".anl-photo-thumb");
	if (!thumb) {
		return;
	}

	if (!file) {
		slotEl.classList.remove("is-filled");
		thumb.removeAttribute("src");
		return;
	}

	thumb.src = URL.createObjectURL(file);
	slotEl.classList.add("is-filled");
}

function renderReview() {
	collectCurrentStepData();

	if (dom.reviewTitle) {
		dom.reviewTitle.textContent = listingData.basic.title || "--";
	}

	if (dom.reviewRent) {
		dom.reviewRent.textContent = Number.isFinite(listingData.basic.monthlyRent)
			? `KES ${new Intl.NumberFormat("en-KE").format(listingData.basic.monthlyRent)}`
			: "--";
	}

	if (dom.reviewLocation) {
		dom.reviewLocation.textContent = listingData.basic.location || "--";
	}

	if (dom.reviewFeatures) {
		const beds = listingData.features.bedrooms || 0;
		const baths = listingData.features.bathrooms || 0;
		dom.reviewFeatures.textContent = beds || baths ? `${beds} Bedroom(s), ${baths} Bathroom(s)` : "--";
	}

	if (dom.reviewAmenities) {
		dom.reviewAmenities.innerHTML = "";
		if (!listingData.features.amenities.length) {
			const placeholder = document.createElement("li");
			placeholder.textContent = "--";
			dom.reviewAmenities.appendChild(placeholder);
		} else {
			listingData.features.amenities.forEach(function (amenity) {
				const item = document.createElement("li");
				item.textContent = amenity;
				dom.reviewAmenities.appendChild(item);
			});
		}
	}
}

function validateStep(stepNumber) {
	if (stepNumber === 1) {
		if (!dom.title?.value.trim()) {
			alert("Please enter a property title.");
			return false;
		}
		if (!dom.type?.value.trim()) {
			alert("Please select a property category.");
			return false;
		}
		if (!dom.rent?.value) {
			alert("Please enter the monthly rent in KES.");
			return false;
		}
		if (!dom.location?.value.trim()) {
			alert("Please provide the property location.");
			return false;
		}
	}

	if (stepNumber === 3 || stepNumber === 4) {
		if (!listingData.images.length) {
			alert("Please select property photos before proceeding.");
			return false;
		}
	}

	return true;
}

function setPublishLoading(isLoading) {
	if (!dom.publishBtn) {
		return;
	}

	const navButtons = [dom.backBtn, dom.nextBtn, dom.backEditBtn, dom.publishBtn].filter(Boolean);
	navButtons.forEach(function (btn) {
		btn.disabled = isLoading;
		btn.setAttribute("aria-disabled", String(isLoading));
	});

	dom.publishBtn.innerHTML = isLoading
		? '<span class="material-symbols-outlined anl-spin" aria-hidden="true">progress_activity</span> Uploading...'
		: originalPublishText;
}

async function uploadPropertyImages(files) {
	const { data: authData } = await supabaseClient.auth.getUser();
	const ownerId = authData?.user?.id || "anonymous";

	const uploaded = [];

	for (let i = 0; i < files.length; i += 1) {
		const file = files[i];
		const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
		const path = `${ownerId}/${Date.now()}-${i + 1}-${safeName}`;

		const { error: uploadError } = await supabaseClient
			.storage
			.from("property-images")
			.upload(path, file, { upsert: false });

		if (uploadError) {
			throw new Error(`Image upload failed (${file.name}): ${uploadError.message}`);
		}

		const { data: publicData } = supabaseClient.storage.from("property-images").getPublicUrl(path);
		if (!publicData?.publicUrl) {
			throw new Error(`Could not resolve public URL for ${file.name}`);
		}

		uploaded.push(publicData.publicUrl);
	}

	return uploaded;
}

async function insertListingRecord(data) {
	const fullPayload = {
		title: data.basic.title,
		type: data.basic.type,
		price: data.basic.monthlyRent,
		monthly_rent: data.basic.monthlyRent,
		location: data.basic.location,
		description: data.basic.description,
		bedrooms: data.features.bedrooms,
		bathrooms: data.features.bathrooms,
		amenities: data.features.amenities,
		image_urls: data.imageUrls,
		image_url: data.imageUrls[0] || null,
		status: "pending_review",
	};

	const fallbackPayload = {
		title: data.basic.title,
		type: data.basic.type,
		price: data.basic.monthlyRent,
		location: data.basic.location,
		description: data.basic.description,
		amenities: data.features.amenities,
		image_url: data.imageUrls[0] || null,
	};

	const minimalPayload = {
		title: data.basic.title,
		type: data.basic.type,
		price: data.basic.monthlyRent,
		location: data.basic.location,
		image_url: data.imageUrls[0] || null,
	};

	const payloads = [fullPayload, fallbackPayload, minimalPayload];

	let lastError = null;
	for (const payload of payloads) {
		const { error } = await supabaseClient.from("listings").insert([payload]);
		if (!error) {
			return;
		}

		lastError = error;
		const msg = String(error.message || "").toLowerCase();
		const schemaIssue = msg.includes("column") || msg.includes("schema cache") || msg.includes("does not exist");
		if (!schemaIssue) {
			break;
		}
	}

	throw new Error(lastError?.message || "Failed to save listing data.");
}

init();
