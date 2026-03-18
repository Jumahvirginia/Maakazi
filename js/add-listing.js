import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const listingData = {
  title: "",
  propertyType: "",
  monthlyRent: null,
  location: "",
  bedrooms: 1,
  bathrooms: 1,
  amenities: [],
  imageFile: null,
  imagePreviewUrl: "",
};

const dom = {
  sidebar: document.getElementById("ld-sidebar"),
  collapseBtn: document.getElementById("ld-sidebar-toggle"),
  collapseIcon: document.getElementById("ld-sidebar-toggle-icon"),
  mobileBtn: document.getElementById("ld-mobile-menu-btn"),
  logoutBtn: document.getElementById("ld-logout-btn"),

  form: document.getElementById("add-listing-form"),
  card: document.querySelector(".anl-card"),
  successView: document.getElementById("anl-success-view"),
  steps: Array.from(document.querySelectorAll(".anl-step")),
  stepItems: Array.from(document.querySelectorAll(".anl-stepper-item")),

  backBtn: document.getElementById("btn-back"),
  nextBtn: document.getElementById("btn-next"),
  backEditBtn: document.getElementById("btn-back-edit"),
  publishBtn: document.getElementById("btn-publish"),

  title: document.getElementById("listing-title"),
  propertyType: document.getElementById("property-type"),
  rent: document.getElementById("monthly-rent"),
  location: document.getElementById("listing-location"),
  bedrooms: document.getElementById("bedrooms"),
  bathrooms: document.getElementById("bathrooms"),
  amenityInputs: Array.from(document.querySelectorAll(".anl-amenity-input")),
  counterBtns: Array.from(document.querySelectorAll(".anl-counter-btn")),

  photosInput: document.getElementById("listing-photos"),
  slotInputs: Array.from(document.querySelectorAll(".anl-slot-input")),
  photoSlots: Array.from(document.querySelectorAll(".anl-photo-slot[data-slot-index]")),

  reviewTitle: document.getElementById("review-title"),
  reviewRent: document.getElementById("review-rent"),
  reviewLocation: document.getElementById("review-location"),
  reviewFeatures: document.getElementById("review-features"),
  reviewAmenities: document.getElementById("review-amenities"),
  reviewPreviewWrap: document.querySelector(".anl-preview-image"),

  successId: document.getElementById("success-listing-id"),
  successTitle: document.getElementById("success-title"),
  successLocation: document.getElementById("success-location"),
  successPreview: document.querySelector(".anl-success-preview"),
};

let currentStep = 1;
const totalSteps = 4;
const slotFiles = [null, null, null, null];
const originalPublishHtml = dom.publishBtn ? dom.publishBtn.innerHTML : "Publish Listing";

function init() {
  if (!dom.form || dom.steps.length !== 4) {
    return;
  }

  setupSidebar();
  setupCounters();
  setupFormBindings();
  setupStepNavigation();
  ensurePreviewImageElement();
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

  if (dom.logoutBtn && supabaseClient) {
    dom.logoutBtn.addEventListener("click", async function () {
      await supabaseClient.auth.signOut();
      window.location.href = "login.html";
    });
  }
}

function setupCounters() {
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
      collectListingData();
    });
  });
}

function setupFormBindings() {
  [dom.title, dom.propertyType, dom.rent, dom.location, dom.bedrooms, dom.bathrooms]
    .filter(Boolean)
    .forEach(function (el) {
      el.addEventListener("input", collectListingData);
      el.addEventListener("change", collectListingData);
    });

  dom.amenityInputs.forEach(function (input) {
    input.addEventListener("change", collectListingData);
  });

  if (dom.photosInput) {
    dom.photosInput.addEventListener("change", function (event) {
      const files = Array.from(event.target.files || []).slice(0, slotFiles.length);
      for (let i = 0; i < slotFiles.length; i += 1) {
        slotFiles[i] = files[i] || null;
        renderSlotPreview(i, slotFiles[i]);
      }
      syncPrimaryImageFromSlots();
      event.target.value = "";
    });
  }

  dom.slotInputs.forEach(function (inputEl) {
    inputEl.addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
      const slotIndex = Number(inputEl.dataset.slotIndex);
      if (Number.isNaN(slotIndex) || !file) {
        return;
      }

      slotFiles[slotIndex] = file;
      renderSlotPreview(slotIndex, file);
      syncPrimaryImageFromSlots();
      event.target.value = "";
    });
  });

  dom.photoSlots.forEach(function (slotEl) {
    slotEl.addEventListener("click", function () {
      const slotIndex = Number(slotEl.dataset.slotIndex);
      if (Number.isNaN(slotIndex)) {
        return;
      }
      const inputEl = document.getElementById(`listing-photo-slot-${slotIndex}`);
      if (inputEl) {
        inputEl.click();
      }
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
      alert("Supabase is not available on this page.");
      return;
    }

    collectListingData();

    try {
      setPublishLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        throw new Error("Please login again to publish this listing.");
      }

      const imageUrl = await uploadPrimaryImage(listingData.imageFile, user.id);
      const insertedListing = await insertListingRow(user.id, imageUrl);
      showSubmittedSuccess(insertedListing, imageUrl);
    } catch (error) {
      console.error("Publish failed:", error);
      alert(error?.message || "Unable to publish listing right now. Please try again.");
    } finally {
      setPublishLoading(false);
    }
  });
}

function goToStep(targetStep) {
  const nextStep = Math.max(1, Math.min(totalSteps, targetStep));
  if (nextStep > currentStep && !validateStep(currentStep)) {
    return;
  }

  collectListingData();
  currentStep = nextStep;
  updateStepUI();
}

function updateStepUI() {
  dom.steps.forEach(function (stepEl, index) {
    const isActive = index + 1 === currentStep;
    stepEl.classList.toggle("is-active", isActive);
    stepEl.style.display = isActive ? "block" : "none";
  });

  dom.stepItems.forEach(function (item, index) {
    const stepIndex = index + 1;
    item.classList.toggle("is-active", stepIndex === currentStep);
    item.classList.toggle("is-complete", stepIndex < currentStep);
  });

  if (dom.backBtn) {
    dom.backBtn.disabled = currentStep === 1;
    dom.backBtn.style.display = currentStep === totalSteps ? "none" : "inline-flex";
  }

  if (dom.nextBtn) {
    dom.nextBtn.style.display = currentStep === totalSteps ? "none" : "inline-flex";
  }

  if (dom.backEditBtn) {
    dom.backEditBtn.style.display = currentStep === totalSteps ? "inline-flex" : "none";
  }

  if (dom.publishBtn) {
    dom.publishBtn.style.display = currentStep === totalSteps ? "inline-flex" : "none";
  }

  if (currentStep === totalSteps) {
    renderReview();
  }
}

function collectListingData() {
  listingData.title = (dom.title?.value || "").trim();
  listingData.propertyType = (dom.propertyType?.value || "").trim();
  listingData.monthlyRent = dom.rent?.value ? Number(dom.rent.value) : null;
  listingData.location = (dom.location?.value || "").trim();
  listingData.bedrooms = Number(dom.bedrooms?.value || 0);
  listingData.bathrooms = Number(dom.bathrooms?.value || 0);

  listingData.amenities = dom.amenityInputs
    .filter(function (input) {
      return input.checked;
    })
    .map(function (input) {
      const strong = document.querySelector(`label[for="${input.id}"] strong`);
      return strong ? strong.textContent.trim() : "";
    })
    .filter(Boolean);

  syncPrimaryImageFromSlots();
}

function validateStep(stepNumber) {
  if (stepNumber === 1) {
    if (!listingData.title) {
      alert("Please enter the property title.");
      return false;
    }
    if (!listingData.propertyType) {
      alert("Please select a category.");
      return false;
    }
    if (!Number.isFinite(listingData.monthlyRent) || listingData.monthlyRent <= 0) {
      alert("Please enter a valid monthly rent.");
      return false;
    }
    if (!listingData.location) {
      alert("Please enter the property location.");
      return false;
    }
  }

  if (stepNumber === 3 || stepNumber === 4) {
    if (!listingData.imageFile) {
      alert("Please select at least one property photo.");
      return false;
    }
  }

  return true;
}

function renderReview() {
  if (dom.reviewTitle) {
    dom.reviewTitle.textContent = listingData.title || "--";
  }

  if (dom.reviewRent) {
    dom.reviewRent.textContent = Number.isFinite(listingData.monthlyRent)
      ? `KES ${new Intl.NumberFormat("en-KE").format(listingData.monthlyRent)}`
      : "--";
  }

  if (dom.reviewLocation) {
    dom.reviewLocation.textContent = listingData.location || "--";
  }

  if (dom.reviewFeatures) {
    const beds = listingData.bedrooms || 0;
    const baths = listingData.bathrooms || 0;
    dom.reviewFeatures.textContent = beds || baths ? `${beds} Bedroom(s), ${baths} Bathroom(s)` : "--";
  }

  if (dom.reviewAmenities) {
    dom.reviewAmenities.innerHTML = "";
    if (!listingData.amenities.length) {
      const empty = document.createElement("li");
      empty.textContent = "--";
      dom.reviewAmenities.appendChild(empty);
    } else {
      listingData.amenities.forEach(function (amenity) {
        const li = document.createElement("li");
        li.textContent = amenity;
        dom.reviewAmenities.appendChild(li);
      });
    }
  }

  renderStep4Preview();
}

function ensurePreviewImageElement() {
  if (!dom.reviewPreviewWrap) {
    return;
  }

  let previewImg = dom.reviewPreviewWrap.querySelector("img.anl-preview-live");
  if (!previewImg) {
    previewImg = document.createElement("img");
    previewImg.className = "anl-preview-live";
    previewImg.alt = "Property preview";
    previewImg.style.width = "100%";
    previewImg.style.height = "100%";
    previewImg.style.objectFit = "cover";
    previewImg.style.borderRadius = "10px";
    previewImg.style.display = "none";
    dom.reviewPreviewWrap.appendChild(previewImg);
  }
}

function renderStep4Preview() {
  if (!dom.reviewPreviewWrap) {
    return;
  }

  const previewImg = dom.reviewPreviewWrap.querySelector("img.anl-preview-live");
  const placeholderIcon = dom.reviewPreviewWrap.querySelector(".material-symbols-outlined");

  if (!previewImg) {
    return;
  }

  if (listingData.imagePreviewUrl) {
    previewImg.src = listingData.imagePreviewUrl;
    previewImg.style.display = "block";
    if (placeholderIcon) {
      placeholderIcon.style.display = "none";
    }
  } else {
    previewImg.removeAttribute("src");
    previewImg.style.display = "none";
    if (placeholderIcon) {
      placeholderIcon.style.display = "inline-block";
    }
  }
}

function syncPrimaryImageFromSlots() {
  const firstImage = slotFiles.find(Boolean) || null;
  listingData.imageFile = firstImage;

  if (listingData.imagePreviewUrl) {
    URL.revokeObjectURL(listingData.imagePreviewUrl);
    listingData.imagePreviewUrl = "";
  }

  if (firstImage) {
    listingData.imagePreviewUrl = URL.createObjectURL(firstImage);
  }

  renderStep4Preview();
}

function renderSlotPreview(slotIndex, file) {
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

async function uploadPrimaryImage(file, landlordId) {
  if (!file) {
    throw new Error("No image selected.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${landlordId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseClient
    .storage
    .from("property-images")
    .upload(filePath, file, { upsert: false });

  if (uploadError) {
    throw new Error(`Image upload failed: ${uploadError.message}`);
  }

  const { data: publicData } = supabaseClient.storage.from("property-images").getPublicUrl(filePath);
  if (!publicData?.publicUrl) {
    throw new Error("Could not get uploaded image URL.");
  }

  return publicData.publicUrl;
}

async function insertListingRow(landlordId, imageUrl) {
  const payload = {
    landlord_id: landlordId,
    title: listingData.title,
    type: listingData.propertyType,
    price: listingData.monthlyRent,
    monthly_rent: listingData.monthlyRent,
    location: listingData.location,
    bedrooms: listingData.bedrooms,
    bathrooms: listingData.bathrooms,
    amenities: listingData.amenities,
    images: [imageUrl],
    image_urls: [imageUrl],
    image_url: imageUrl,
    status: "pending_review",
  };

  const fallback = {
    landlord_id: landlordId,
    title: listingData.title,
    type: listingData.propertyType,
    price: listingData.monthlyRent,
    location: listingData.location,
    amenities: listingData.amenities,
    image_url: imageUrl,
  };

  const payloads = [payload, fallback];
  let lastError = null;

  for (const row of payloads) {
    const { data, error } = await supabaseClient
      .from("listings")
      .insert([row])
      .select("id,title,location,image_url")
      .maybeSingle();

    if (!error) {
      return data || null;
    }

    lastError = error;
    const msg = String(error.message || "").toLowerCase();
    const schemaError = msg.includes("column") || msg.includes("schema") || msg.includes("does not exist");
    if (!schemaError) {
      break;
    }
  }

  throw new Error(lastError?.message || "Failed to save listing.");
}

function showSubmittedSuccess(insertedListing, imageUrl) {
  if (!dom.card || !dom.successView) {
    return;
  }

  const listingIdRaw = insertedListing?.id;
  const listingId = formatListingId(listingIdRaw);
  const listingTitle = insertedListing?.title || listingData.title || "Untitled Listing";
  const listingLocation = insertedListing?.location || listingData.location || "Location not provided";

  if (dom.successId) {
    dom.successId.textContent = `ID: ${listingId}`;
  }

  if (dom.successTitle) {
    dom.successTitle.textContent = listingTitle;
  }

  if (dom.successLocation) {
    const icon = dom.successLocation.querySelector(".material-symbols-outlined");
    dom.successLocation.textContent = "";
    if (icon) {
      dom.successLocation.appendChild(icon);
    }
    dom.successLocation.append(` ${listingLocation}`);
  }

  if (dom.successPreview) {
    dom.successPreview.style.backgroundImage = imageUrl ? `url(${imageUrl})` : "none";
    dom.successPreview.style.backgroundSize = "cover";
    dom.successPreview.style.backgroundPosition = "center";
    const icon = dom.successPreview.querySelector(".material-symbols-outlined");
    if (icon) {
      icon.style.display = imageUrl ? "none" : "inline-block";
    }
  }

  dom.card.classList.add("is-submitted");
  dom.successView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function formatListingId(rawId) {
  if (!rawId) {
    return `MKZ-${Date.now().toString().slice(-5)}`;
  }

  if (typeof rawId === "number") {
    return `MKZ-${String(rawId).padStart(5, "0")}`;
  }

  const text = String(rawId).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `MKZ-${text.slice(0, 6)}`;
}

function setPublishLoading(isLoading) {
  if (!dom.publishBtn) {
    return;
  }

  const controls = [dom.backBtn, dom.nextBtn, dom.backEditBtn, dom.publishBtn].filter(Boolean);
  controls.forEach(function (el) {
    el.disabled = isLoading;
  });

  dom.publishBtn.innerHTML = isLoading
    ? '<span class="material-symbols-outlined anl-spin" aria-hidden="true">progress_activity</span> Uploading...'
    : originalPublishHtml;

  if (isLoading && !document.getElementById("anl-spin-style")) {
    const style = document.createElement("style");
    style.id = "anl-spin-style";
    style.textContent = "@keyframes anl-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} .anl-spin{animation:anl-spin 1s linear infinite}";
    document.head.appendChild(style);
  }
}

init();
