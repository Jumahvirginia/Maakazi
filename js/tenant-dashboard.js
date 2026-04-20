/* =============================================
   TENANT DASHBOARD – JavaScript
   ============================================= */

import { supabase } from './config.js';

const dom = {
  // Navigation
  navTabs: document.querySelectorAll('.td-nav-tab'),
  logoLink: document.querySelector('.td-logo'),
  avatarBtn: document.querySelector('.td-avatar-btn'),
  
  // Property Grid
  propertyGrid: document.getElementById('propertyGrid'),
  
  // Actions
  logoutBtn: document.getElementById('tdLogoutBtn'),
  mobileToggle: document.getElementById('tdMobileToggle'),
};

const currentFilters = {
  location: 'Nairobi, Kenya',
  priceRange: '',
  houseType: '',
};

/* ========== Initialize ========== */
function init() {
  bindNavigation();
  renderPropertyGrid();
  bindActions();
  bindSearchForm();
}

/* ========== Navigation ========== */
function bindNavigation() {
  const pageMap = {
    discover: 'tenant_dashboard.html',
    'property-detail': 'property_detail.html',
    favorites: 'tenant_dashboard.html#favorites',
    safety: 'safety.html',
    'tenant-profile': 'tenant-profile.html',
  };

  dom.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const page = tab.getAttribute('data-page');
      const route = pageMap[page || ''];
      if (!route) {
        return;
      }
      window.location.href = route;
    });
  });

  if (dom.logoLink) {
    dom.logoLink.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.href = 'tenant_dashboard.html';
    });
  }
}

/* ========== Property Grid ========== */
async function renderPropertyGrid() {
  if (!dom.propertyGrid) return;

  dom.propertyGrid.innerHTML = `
    <div class="td-empty-state" style="grid-column: 1 / -1;">
      <span class="material-symbols-outlined">progress_activity</span>
      <h3>Loading Listings...</h3>
      <p>Fetching approved properties for you.</p>
    </div>
  `;

  const listings = await fetchApprovedListings();

  if (!Array.isArray(listings) || listings.length === 0) {
    dom.propertyGrid.innerHTML = `
      <div class="td-empty-state" style="grid-column: 1 / -1;">
        <span class="material-symbols-outlined">home</span>
        <h3>No Listings Available</h3>
        <p>Check back soon for newly approved listings.</p>
      </div>
    `;
    return;
  }

  dom.propertyGrid.innerHTML = listings.map(createPropertyCard).join('');
  bindHeartButtons();
}

async function fetchApprovedListings() {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('moderation_status', 'approved')
      .eq('is_visible', true)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      return data;
    }

    // Backward-compatibility fallback for schemas still using status.
    const legacy = await supabase
      .from('listings')
      .select('*')
      .eq('status', 'approved')
      .eq('is_visible', true)
      .order('created_at', { ascending: false });

    if (legacy.error || !Array.isArray(legacy.data)) {
      console.error('Failed to fetch approved listings:', error || legacy.error);
      return [];
    }

    return legacy.data;
  } catch (fetchError) {
    console.error('Unexpected listing fetch error:', fetchError);
    return [];
  }
}

function createPropertyCard(property) {
  const title = property.title || 'Untitled Property';
  const imageUrl = getListingImage(property);
  const location = property.location || 'Location unavailable';
  const listingId = property.id;
  const monthlyPrice = formatKES(property.price);
  const verified = isLandlordVerified(property);

  return `
    <div class="td-property-card">
      <div class="td-property-image">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" />` : '<span class="material-symbols-outlined">home_work</span>'}
        ${verified ? '<button class="td-verified-badge" aria-label="Verified"><span class="material-symbols-outlined">verified</span> Verified</button>' : ''}
        <button class="td-heart-btn" data-property-id="${escapeHtml(String(listingId || ''))}" aria-label="Add to favorites">
          <span class="material-symbols-outlined">favorite</span>
        </button>
      </div>
      <div class="td-property-content">
        <h3 class="td-property-title">${escapeHtml(title)}</h3>
        <span class="td-property-price">${monthlyPrice} / month</span>
        <div class="td-property-location">
          <span class="material-symbols-outlined">location_on</span>
          ${escapeHtml(location)}
        </div>
        <a class="td-view-btn" href="property_detail.html?id=${encodeURIComponent(String(listingId || ''))}">View Details</a>
      </div>
    </div>
  `;
}

function bindHeartButtons() {
  const heartButtons = document.querySelectorAll('.td-heart-btn');
  heartButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      btn.classList.toggle('is-liked');
    });
  });
}

/* ========== Actions ========== */
function bindActions() {
  // Logout
  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to logout?')) {
        // Clear auth data and redirect
        localStorage.removeItem('auth_token');
        window.location.href = 'login.html';
      }
    });
  }

  if (dom.avatarBtn) {
    dom.avatarBtn.addEventListener('click', () => {
      window.location.href = 'tenant-profile.html';
    });
  }

  // Mobile menu toggle
  if (dom.mobileToggle) {
    dom.mobileToggle.addEventListener('click', () => {
      const nav = document.querySelector('.td-nav');
      if (nav) {
        nav.style.display = nav.style.display === 'flex' ? 'none' : 'flex';
      }
    });
  }
}

/* ========== Search Form ========== */
function bindSearchForm() {
  bindFilterDropdowns();

  const searchBtn = document.getElementById('tdSearchBtn');
  if (!searchBtn) return;

  searchBtn.addEventListener('click', async () => {
    await handleSearch();
  });
}

function bindFilterDropdowns() {
  const searchWrap = document.getElementById('tdSearchWrap');
  if (!searchWrap) return;

  const triggerButtons = searchWrap.querySelectorAll('[data-filter-trigger]');
  const optionButtons = searchWrap.querySelectorAll('[data-filter-option]');

  triggerButtons.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      const filterName = trigger.getAttribute('data-filter-trigger');
      toggleDropdown(filterName);
    });
  });

  optionButtons.forEach((option) => {
    option.addEventListener('click', () => {
      const filterName = option.getAttribute('data-filter-option');
      const optionValue = option.getAttribute('data-value') || '';
      const optionLabel = option.textContent.trim();

      if (!filterName || !(filterName in currentFilters)) return;

      currentFilters[filterName] = optionValue;
      updateFilterLabel(filterName, optionLabel);
      closeAllDropdowns();
    });
  });

  document.addEventListener('click', (event) => {
    if (!searchWrap.contains(event.target)) {
      closeAllDropdowns();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllDropdowns();
    }
  });
}

function toggleDropdown(filterName) {
  const wraps = document.querySelectorAll('.td-filter-segment-wrap');

  wraps.forEach((wrap) => {
    const trigger = wrap.querySelector('[data-filter-trigger]');
    const isTarget = wrap.getAttribute('data-filter') === filterName;
    const shouldOpen = isTarget && !wrap.classList.contains('is-open');

    wrap.classList.toggle('is-open', shouldOpen);
    if (trigger) {
      trigger.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }
  });
}

function closeAllDropdowns() {
  const wraps = document.querySelectorAll('.td-filter-segment-wrap');
  wraps.forEach((wrap) => {
    wrap.classList.remove('is-open');
    const trigger = wrap.querySelector('[data-filter-trigger]');
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

function updateFilterLabel(filterName, labelText) {
  const labelNode = document.querySelector(`[data-filter-label="${filterName}"]`);
  if (labelNode) {
    labelNode.textContent = labelText;
  }
}

function parsePriceRange(priceRange) {
  if (!priceRange) {
    return { min: null, max: null };
  }

  const [minRaw, maxRaw] = priceRange.split('-');
  const parsedMin = Number(minRaw);
  const parsedMax = Number(maxRaw);

  return {
    min: Number.isFinite(parsedMin) ? parsedMin : null,
    max: Number.isFinite(parsedMax) ? parsedMax : null,
  };
}

async function handleSearch() {
  const activeFilters = {
    location: currentFilters.location?.trim() || '',
    priceRange: currentFilters.priceRange?.trim() || '',
    houseType: currentFilters.houseType?.trim() || '',
  };

  // Build URL query params from whichever filters are set.
  const params = new URLSearchParams();
  Object.entries(activeFilters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  if (supabase?.from) {
    let query = supabase
      .from('listings')
      .select('*')
      .eq('moderation_status', 'approved')
      .eq('is_visible', true);

    if (activeFilters.location) {
      query = query.ilike('location', `%${activeFilters.location}%`);
    }

    if (activeFilters.houseType) {
      query = query.eq('house_type', activeFilters.houseType);
    }

    if (activeFilters.priceRange) {
      const { min, max } = parsePriceRange(activeFilters.priceRange);
      if (min !== null) query = query.gte('price', min);
      if (max !== null) query = query.lte('price', max);
    }

    let { data, error } = await query;

    if (error) {
      // Backward-compatibility fallback for legacy status schema.
      let legacyQuery = supabase
        .from('listings')
        .select('*')
        .eq('status', 'approved')
        .eq('is_visible', true);

      if (activeFilters.location) {
        legacyQuery = legacyQuery.ilike('location', `%${activeFilters.location}%`);
      }

      if (activeFilters.houseType) {
        legacyQuery = legacyQuery.eq('house_type', activeFilters.houseType);
      }

      if (activeFilters.priceRange) {
        const { min, max } = parsePriceRange(activeFilters.priceRange);
        if (min !== null) legacyQuery = legacyQuery.gte('price', min);
        if (max !== null) legacyQuery = legacyQuery.lte('price', max);
      }

      const legacy = await legacyQuery;
      data = legacy.data;
      error = legacy.error;
    }

    if (error) {
      console.error('Search query failed:', error.message);
      return;
    }

    sessionStorage.setItem('makazi_search_results', JSON.stringify(Array.isArray(data) ? data : []));
  }

  const queryString = params.toString();
  window.location.href = `search_results.html${queryString ? `?${queryString}` : ''}`;
}

/* ========== Utilities ========== */
function viewPropertyDetails(propertyId) {
  // Navigate to property detail page with ID
  window.location.href = `property_detail.html?id=${propertyId}`;
}

function formatKES(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'KES 0';
  }
  return `KES ${new Intl.NumberFormat('en-KE').format(numericValue)}`;
}

function getListingImage(property) {
  if (typeof property.image_url === 'string' && property.image_url.trim()) {
    return property.image_url.trim();
  }

  if (typeof property.cover_image_url === 'string' && property.cover_image_url.trim()) {
    return property.cover_image_url.trim();
  }

  const images = property.images || property.image_urls;
  if (Array.isArray(images) && images.length) {
    const first = images[0];
    if (typeof first === 'string' && first.trim()) {
      return first.trim();
    }
    if (first && typeof first === 'object') {
      const fromObj = first.url || first.src || first.image_url;
      if (typeof fromObj === 'string' && fromObj.trim()) {
        return fromObj.trim();
      }
    }
  }

  return '';
}

function isLandlordVerified(property) {
  const status = String(property.verification_status || property.landlord_verification_status || '').toLowerCase();
  return status === 'verified';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.handleSearch = handleSearch;
