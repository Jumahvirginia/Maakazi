import { supabase } from './config.js';

const dom = {
  logoLink: document.querySelector('.td-logo'),
  navTabs: document.querySelectorAll('.td-nav-tab'),
  avatarBtn: document.querySelector('.td-avatar-btn'),
  logoutBtn: document.getElementById('tdLogoutBtn'),
  mobileToggle: document.getElementById('tdMobileToggle'),
  navMenu: document.getElementById('tenantNav'),
  title: document.getElementById('pdTitle'),
  price: document.getElementById('pdPrice'),
  mobilePrice: document.getElementById('pdMobilePrice'),
  location: document.getElementById('pdLocation'),
  bedrooms: document.getElementById('pdBedrooms'),
  bathrooms: document.getElementById('pdBathrooms'),
  propertyType: document.getElementById('pdPropertyType'),
  description: document.getElementById('pdDescription'),
  amenitiesGrid: document.getElementById('pdAmenitiesGrid'),
  landlordName: document.getElementById('pdLandlordName'),
  landlordVerified: document.getElementById('pdLandlordVerified'),
  slotGrid: document.getElementById('pdSlotGrid'),
  reportListingBtn: document.getElementById('pdReportListingBtn'),
  requestButtons: document.querySelectorAll('#pdRequestViewingBtn, .pd-mobile-price-bar .pd-request-btn'),
  images: {
    main: document.getElementById('pdImageMain'),
    two: document.getElementById('pdImageTwo'),
    three: document.getElementById('pdImageThree'),
    four: document.getElementById('pdImageFour'),
    mainFallback: document.getElementById('pdImageMainFallback'),
    twoFallback: document.getElementById('pdImageTwoFallback'),
    threeFallback: document.getElementById('pdImageThreeFallback'),
    fourFallback: document.getElementById('pdImageFourFallback'),
  },
};

const state = {
  listingId: null,
  selectedSlotIso: null,
  confirmedSlotKeys: new Set(),
};

const AMENITY_ICON_MAP = {
  borehole: 'water_drop',
  security: 'shield_lock',
  '24/7 security': 'shield_lock',
  'token meter': 'electric_bolt',
  wifi: 'wifi',
  gym: 'fitness_center',
  parking: 'local_parking',
  'swimming pool': 'pool',
  'play-area': 'sports_soccer',
  'play area': 'sports_soccer',
};

async function init() {
  bindHeaderNavigation();

  const propertyId = new URLSearchParams(window.location.search).get('id');
  state.listingId = propertyId;

  if (!propertyId) {
    renderMissing('Listing not found.');
    return;
  }

  const listing = await fetchListing(propertyId);
  if (!listing) return;

  renderListing(listing);
  await hydrateConfirmedSlots(state.listingId);
  renderSlots();
  bindSlotEvents();
  bindRequestActions();
}

async function fetchListing(listingId) {
  const { data, error } = await supabase
    .from('listings')
    .select('*, profiles:landlord_id(full_name, verification_status)')
    .eq('id', listingId)
    .single();

  if (error) {
    console.error('Property detail fetch failed:', error.message, error.details, error.hint);
    renderMissing('Unable to load this property right now.');
    return null;
  }

  if (!data) {
    renderMissing('This listing is unavailable.');
    return null;
  }

  data.__resolvedProfile = await resolveLandlordProfile(data);
  data.__extraImages = await resolveRelatedListingImages(data.id);

  return data;
}

function renderListing(listing) {
  if (dom.title) dom.title.textContent = listing.title || 'Untitled property';

  const price = formatCurrency(listing.price);
  if (dom.price) dom.price.textContent = `${price} / month`;
  if (dom.mobilePrice) dom.mobilePrice.textContent = `${price} / month`;

  if (dom.location) dom.location.textContent = listing.location || listing.address || 'Location unavailable';
  if (dom.bedrooms) dom.bedrooms.textContent = normalizeCount(getBedroomCount(listing));
  if (dom.bathrooms) dom.bathrooms.textContent = normalizeCount(getBathroomCount(listing));
  if (dom.propertyType) dom.propertyType.textContent = listing.house_type || listing.property_type || listing.type || 'Property type not set';
  if (dom.description) dom.description.textContent = listing.description || 'No description available.';

  const profile = getLandlordProfile(listing);
  if (dom.landlordName) {
    dom.landlordName.textContent =
      buildLandlordName(profile) || listing.landlord_name || listing.owner_name || 'Landlord Name Unavailable';
  }

  const isVerified = String(profile?.verification_status || '').toLowerCase() === 'verified';
  if (dom.landlordVerified) {
    dom.landlordVerified.hidden = !isVerified;
  }

  renderAmenities(listing.amenities);
  renderImages(listing);
}

function renderImages(listing) {
  const images = resolveListingImages(listing);

  setImage(dom.images.main, dom.images.mainFallback, images[0]);
  setImage(dom.images.two, dom.images.twoFallback, images[1]);
  setImage(dom.images.three, dom.images.threeFallback, images[2]);
  setImage(dom.images.four, dom.images.fourFallback, images[3]);
}

function setImage(imgEl, fallbackEl, src) {
  if (!imgEl || !fallbackEl) return;

  if (!src) {
    imgEl.style.display = 'none';
    fallbackEl.style.display = 'grid';
    return;
  }

  imgEl.onerror = function () {
    imgEl.style.display = 'none';
    fallbackEl.style.display = 'grid';
  };

  imgEl.src = src;
  imgEl.style.display = 'block';
  fallbackEl.style.display = 'none';
}

function resolveListingImages(listing) {
  const urls = [];

  const scalarSources = [
    listing?.image_url,
    listing?.cover_image_url,
    listing?.cover_image,
    listing?.thumbnail_url,
    listing?.photo_url,
    listing?.main_image,
  ];

  scalarSources.forEach((value) => {
    const normalized = normalizeImageUrl(value);
    if (normalized) {
      urls.push(normalized);
    }
  });

  const collectionSources = [
    listing?.images,
    listing?.image_urls,
    listing?.photos,
    listing?.gallery,
    listing?.media,
    listing?.listing_images,
    listing?.property_images,
    listing?.__extraImages,
  ];

  collectionSources.forEach((source) => {
    urls.push(...extractImageList(source));
  });

  urls.push(...extractImageList(listing?.property_details));
  urls.push(...extractImageList(listing?.details));
  urls.push(...extractImageList(listing?.metadata));

  return dedupeImageUrls(urls).slice(0, 4);
}

function extractImageList(source) {
  if (!source) {
    return [];
  }

  if (Array.isArray(source)) {
    return source
      .map((item) => {
        if (typeof item === 'string') {
          return normalizeImageUrl(item);
        }
        if (item && typeof item === 'object') {
          const value =
            item.url ||
            item.src ||
            item.image_url ||
            item.imageUrl ||
            item.image ||
            item.public_url ||
            item.secure_url ||
            item.path;
          return normalizeImageUrl(value);
        }
        return null;
      })
      .filter(Boolean);
  }

  if (typeof source === 'string') {
    const text = source.trim();
    if (!text) {
      return [];
    }

    if (text.startsWith('[') || text.startsWith('{')) {
      try {
        const parsed = JSON.parse(text);
        return extractImageList(parsed);
      } catch (_error) {
        // Continue to comma split fallback.
      }
    }

    if (text.includes(',')) {
      return text
        .split(',')
        .map((part) => normalizeImageUrl(part))
        .filter(Boolean);
    }

    const normalized = normalizeImageUrl(text);
    return normalized ? [normalized] : [];
  }

  if (typeof source === 'object') {
    const results = [];
    for (const [key, value] of Object.entries(source)) {
      if (!value) continue;

      if (/(image|img|photo|gallery|media|url)/i.test(String(key))) {
        results.push(...extractImageList(value));
      }
    }
    return results;
  }

  return [];
}

function normalizeImageUrl(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (['null', 'undefined', 'n/a', 'none', '-'].includes(lower)) {
    return null;
  }

  // Accept hosted URLs and relative asset/storage paths from DB.
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('assets/')) {
    return trimmed;
  }

  if (/^[a-z0-9._\-/]+$/i.test(trimmed) && (trimmed.includes('/') || /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(trimmed))) {
    return trimmed;
  }

  return null;
}

function dedupeImageUrls(urls) {
  const seen = new Set();
  const result = [];

  for (const url of urls) {
    const cleanUrl = normalizeImageUrl(url);
    if (!cleanUrl) continue;

    const key = cleanUrl.replace(/[#?].*$/, '').toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleanUrl);
  }

  return result;
}

function renderAmenities(rawAmenities) {
  if (!dom.amenitiesGrid) return;

  const amenities = Array.isArray(rawAmenities)
    ? rawAmenities
    : typeof rawAmenities === 'string'
      ? rawAmenities.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

  dom.amenitiesGrid.innerHTML = '';

  if (!amenities.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No amenities listed.';
    empty.className = 'pd-amenities-empty';
    dom.amenitiesGrid.appendChild(empty);
    return;
  }

  for (const amenity of amenities) {
    const item = document.createElement('span');
    item.className = 'pd-amenity-item';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = pickAmenityIcon(amenity);

    const label = document.createElement('span');
    label.textContent = amenity;

    item.append(icon, label);
    dom.amenitiesGrid.appendChild(item);
  }
}

function pickAmenityIcon(amenityLabel) {
  const key = String(amenityLabel || '').trim().toLowerCase();
  return AMENITY_ICON_MAP[key] || 'check_circle';
}

async function hydrateConfirmedSlots(listingId) {
  const { data, error } = await supabase
    .from('viewings')
    .select('scheduled_at, start_time, status')
    .eq('listing_id', listingId)
    .eq('status', 'confirmed');

  if (error) {
    console.error('Could not load confirmed slots:', error.message, error.details, error.hint);
    state.confirmedSlotKeys = new Set();
    return;
  }

  const keys = new Set();

  (data || []).forEach((slot) => {
    const key = slotKeyFromRow(slot);
    if (key) keys.add(key);
  });

  state.confirmedSlotKeys = keys;
}

function slotKeyFromRow(row) {
  if (row?.scheduled_at) {
    const dt = new Date(row.scheduled_at);
    if (!Number.isNaN(dt.getTime())) {
      return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    }
  }

  if (row?.start_time) {
    const match = String(row.start_time).match(/^(\d{2}:\d{2})/);
    if (match) return match[1];
  }

  return null;
}

function renderSlots() {
  if (!dom.slotGrid) return;

  dom.slotGrid.innerHTML = '';
  state.selectedSlotIso = null;

  const slots = generateSlots();

  for (const slot of slots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pd-slot';
    btn.dataset.slotIso = slot.iso;
    btn.textContent = `${slot.startLabel} - ${slot.endLabel}`;

    if (state.confirmedSlotKeys.has(slot.key)) {
      btn.disabled = true;
      btn.classList.add('is-unavailable');
      btn.setAttribute('aria-disabled', 'true');
    }

    dom.slotGrid.appendChild(btn);
  }
}

function generateSlots() {
  const startMinutes = 9 * 60;
  const endMinutes = 16 * 60 + 30;
  const duration = 45;
  const gap = 15;
  const step = duration + gap;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');

  const slots = [];

  for (let current = startMinutes; current <= endMinutes; current += step) {
    const end = current + duration;
    const key = toTimeKey(current);

    slots.push({
      key,
      startLabel: formatMinutes(current),
      endLabel: formatMinutes(end),
      iso: `${yyyy}-${mm}-${dd}T${key}:00`,
    });
  }

  return slots;
}

function bindSlotEvents() {
  if (!dom.slotGrid) return;

  dom.slotGrid.addEventListener('click', (event) => {
    const btn = event.target.closest('.pd-slot');
    if (!btn || btn.disabled) return;

    const buttons = dom.slotGrid.querySelectorAll('.pd-slot');
    buttons.forEach((node) => node.classList.remove('is-selected'));

    btn.classList.add('is-selected');
    state.selectedSlotIso = btn.dataset.slotIso || null;
  });
}

function bindRequestActions() {
  dom.requestButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!state.selectedSlotIso) {
        alert('Please choose a slot before requesting a viewing.');
        return;
      }

      const { data: authData } = await supabase.auth.getUser();
      const tenantId = authData?.user?.id || localStorage.getItem('user_id') || null;

      if (!tenantId) {
        alert('Please sign in to request a viewing.');
        return;
      }

      const payload = {
        tenant_id: tenantId,
        listing_id: state.listingId,
        scheduled_at: state.selectedSlotIso,
        start_time: `${slotHourMinute(state.selectedSlotIso)}:00`,
        status: 'pending',
      };

      const { error } = await supabase.from('viewings').insert(payload);

      if (error) {
        console.error('Viewing request failed:', error.message, error.details, error.hint);
        alert('Could not submit request. Please try a different slot.');
        return;
      }

      alert('Viewing request submitted.');
      await hydrateConfirmedSlots(state.listingId);
      renderSlots();
      bindSlotEvents();
    });
  });
}

function bindHeaderNavigation() {
  const pageMap = {
    discover: 'tenant_dashboard.html',
    'property-detail': 'property_detail.html',
    favorites: 'tenant_dashboard.html#favorites',
    safety: 'safety.html',
    'tenant-profile': 'tenant-profile.html',
  };

  if (dom.logoLink) {
    dom.logoLink.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = 'tenant_dashboard.html';
    });
  }

  dom.navTabs.forEach((tab) => {
    const page = tab.getAttribute('data-page');
    tab.classList.toggle('is-active', page === 'property-detail');

    tab.addEventListener('click', () => {
      const route = pageMap[page || ''];
      if (route) {
        window.location.href = route;
      }
    });
  });

  if (dom.avatarBtn) {
    dom.avatarBtn.addEventListener('click', () => {
      window.location.href = 'tenant-profile.html';
    });
  }

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('userToken');
      sessionStorage.clear();
      window.location.href = 'login.html';
    });
  }

  if (dom.mobileToggle && dom.navMenu) {
    dom.mobileToggle.addEventListener('click', () => {
      const expanded = dom.mobileToggle.getAttribute('aria-expanded') === 'true';
      dom.mobileToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      dom.navMenu.style.display = expanded ? 'none' : 'flex';
    });

    dom.navTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        dom.mobileToggle.setAttribute('aria-expanded', 'false');
        dom.navMenu.style.display = 'none';
      });
    });
  }

  if (dom.reportListingBtn) {
    dom.reportListingBtn.addEventListener('click', () => {
      const query = state.listingId ? `?listing_id=${encodeURIComponent(String(state.listingId))}` : '';
      window.location.href = `safety.html${query}`;
    });
  }
}

function getLandlordProfile(listing) {
  const profile = listing?.__resolvedProfile || listing?.profiles;
  if (Array.isArray(profile)) {
    return profile[0] || null;
  }
  if (profile && typeof profile === 'object') {
    return profile;
  }
  return null;
}

async function resolveLandlordProfile(listing) {
  const existing = getLandlordProfile({ profiles: listing?.profiles });
  if (existing) {
    return existing;
  }

  const landlordId = listing?.landlord_id || listing?.owner_id || listing?.user_id;
  if (!landlordId) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, user_id, full_name, verification_status, name, display_name, username, first_name, last_name')
    .or(`id.eq.${landlordId},user_id.eq.${landlordId}`)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('Profile fallback lookup failed:', error.message);
    return null;
  }

  return data || null;
}

async function resolveRelatedListingImages(listingId) {
  if (!listingId) {
    return [];
  }

  const tableCandidates = ['listing_images', 'property_images'];
  const imageRows = [];

  for (const table of tableCandidates) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('listing_id', listingId)
      .limit(12);

    if (error) {
      continue;
    }

    if (Array.isArray(data) && data.length) {
      imageRows.push(...data);
    }
  }

  return imageRows;
}

function buildLandlordName(profile) {
  if (!profile || typeof profile !== 'object') {
    return '';
  }

  const directName = profile.full_name || profile.name || profile.display_name || profile.username;
  if (directName) {
    return String(directName).trim();
  }

  const first = String(profile.first_name || '').trim();
  const last = String(profile.last_name || '').trim();
  return `${first} ${last}`.trim();
}

function getBedroomCount(listing) {
  const candidate =
    listing?.bedrooms ??
    listing?.bedroom_count ??
    listing?.bedroom ??
    listing?.beds ??
    listing?.details?.bedrooms ??
    listing?.details?.bedroom_count ??
    listing?.property_details?.bedrooms ??
    listing?.property_details?.bedroom_count ??
    listing?.specifications?.bedrooms;

  return parseCountValue(candidate);
}

function getBathroomCount(listing) {
  const candidate =
    listing?.bathrooms ??
    listing?.bathroom_count ??
    listing?.bathroom ??
    listing?.baths ??
    listing?.details?.bathrooms ??
    listing?.details?.bathroom_count ??
    listing?.property_details?.bathrooms ??
    listing?.property_details?.bathroom_count ??
    listing?.specifications?.bathrooms;

  return parseCountValue(candidate);
}

function parseCountValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const matched = text.match(/\d+(?:\.\d+)?/);
  if (!matched) {
    return null;
  }

  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function slotHourMinute(isoString) {
  const dt = new Date(isoString);
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function toTimeKey(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatMinutes(minutes) {
  const hh24 = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  const hh12 = ((hh24 + 11) % 12) + 1;
  return `${hh12}:${String(mm).padStart(2, '0')}`;
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'KES --';
  return `KES ${amount.toLocaleString('en-KE')}`;
}

function normalizeCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : '--';
}

function renderMissing(message) {
  if (dom.title) dom.title.textContent = message;
  if (dom.price) dom.price.textContent = '';
  if (dom.mobilePrice) dom.mobilePrice.textContent = '';
}

init();
