/* =============================================
   TENANT DASHBOARD – JavaScript
   ============================================= */

const dom = {
  // Navigation
  navTabs: document.querySelectorAll('.td-nav-tab'),
  sections: document.querySelectorAll('.td-section'),
  
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
  dom.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const section = tab.getAttribute('data-section');
      switchSection(section);
    });
  });
}

function switchSection(sectionName) {
  // Update nav tabs
  dom.navTabs.forEach((tab) => {
    tab.classList.remove('is-active');
    if (tab.getAttribute('data-section') === sectionName) {
      tab.classList.add('is-active');
    }
  });

  // Update sections
  dom.sections.forEach((section) => {
    section.classList.remove('is-active');
    if (section.getAttribute('data-section') === sectionName) {
      section.classList.add('is-active');
    }
  });

  // Close mobile menu if open
  const mobileMenu = document.querySelector('.td-nav');
  if (mobileMenu) {
    mobileMenu.style.display = 'none';
  }
}

/* ========== Property Grid ========== */
function renderPropertyGrid() {
  if (!dom.propertyGrid) return;

  // Show empty state when no properties are available
  dom.propertyGrid.innerHTML = `
    <div class="td-empty-state" style="grid-column: 1 / -1;">
      <span class="material-symbols-outlined">home</span>
      <h3>No Listings Available</h3>
      <p>Check back soon for new property listings in your area.</p>
    </div>
  `;
}

function createPropertyCard(property) {
  return `
    <div class="td-property-card">
      <div class="td-property-image">
        ${property.image ? `<img src="${property.image}" alt="${property.title}" />` : '🏠'}
        ${property.verified ? '<button class="td-verified-badge" aria-label="Verified"><span class="material-symbols-outlined">verified</span> Verified</button>' : ''}
        <button class="td-heart-btn" data-property-id="${property.id}" aria-label="Add to favorites">
          <span class="material-symbols-outlined">favorite</span>
        </button>
      </div>
      <div class="td-property-content">
        <h3 class="td-property-title">${property.title}</h3>
        <span class="td-property-price">${property.price} / month</span>
        <div class="td-property-location">
          <span class="material-symbols-outlined">location_on</span>
          ${property.location}
        </div>
        <button class="td-view-btn" onclick="viewPropertyDetails(${property.id})">View Details</button>
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

  const supabaseClient = window.supabase || window.supabaseClient || null;

  if (supabaseClient?.from) {
    let query = supabaseClient.from('listings').select('*');

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

    const { data, error } = await query;
    if (error) {
      console.error('Search query failed:', error.message);
      return;
    }

    sessionStorage.setItem('makazi_search_results', JSON.stringify(data || []));
  }

  const queryString = params.toString();
  window.location.href = `search_results.html${queryString ? `?${queryString}` : ''}`;
}

/* ========== Utilities ========== */
function viewPropertyDetails(propertyId) {
  // Navigate to property detail page with ID
  window.location.href = `property_detail.html?id=${propertyId}`;
}

// Initialize on DOM load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.handleSearch = handleSearch;
