// ====== SAFETY CENTER PAGE INITIALIZATION ======

document.addEventListener('DOMContentLoaded', () => {
  initializeNavbarActiveState();
  initializeReportModal();
  initializeLogout();
  loadReports();
  populatePropertyList();
});

// ====== NAVBAR ACTIVE STATE ======
function initializeNavbarActiveState() {
  const navTabs = document.querySelectorAll('.td-nav-tab');
  const currentPage = getCurrentPageName();

  navTabs.forEach((tab) => {
    const tabPage = tab.getAttribute('data-page');
    if (tabPage === 'safety') {
      tab.classList.add('is-active');
    } else {
      tab.classList.remove('is-active');
    }
  });

  // Add click handlers for navigation
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const page = tab.getAttribute('data-page');
      navigateToPage(page);
    });
  });
}

function getCurrentPageName() {
  const currentFile = window.location.pathname.split('/').pop();
  return currentFile.replace('.html', '') || 'index';
}

function navigateToPage(page) {
  const pageMap = {
    discover: 'tenant_dashboard.html',
    'property-detail': 'property_detail.html',
    favorites: 'tenant_dashboard.html#favorites',
    safety: 'safety.html',
    'tenant-profile': 'tenant-profile.html',
  };

  const targetPage = pageMap[page] || 'tenant_dashboard.html';
  window.location.href = targetPage;
}

// ====== LOGOUT FUNCTIONALITY ======
function initializeLogout() {
  const logoutBtn = document.getElementById('tdLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      // Clear localStorage
      localStorage.clear();
      // Redirect to login
      window.location.href = 'login.html';
    });
  }
}

// ====== MODAL MANAGEMENT ======
function initializeReportModal() {
  const reportTriggerBtn = document.getElementById('reportTriggerBtn');
  const reportModal = document.getElementById('reportModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const reportForm = document.getElementById('reportForm');

  if (!reportTriggerBtn || !reportModal) return;

  // Open modal
  reportTriggerBtn.addEventListener('click', () => {
    reportModal.classList.add('is-active');
    document.body.style.overflow = 'hidden';
  });

  // Close modal - Close button
  closeModalBtn.addEventListener('click', () => {
    closeReportModal();
  });

  // Close modal - Cancel button
  cancelBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeReportModal();
  });

  // Close modal - Click outside
  reportModal.addEventListener('click', (e) => {
    if (e.target === reportModal) {
      closeReportModal();
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && reportModal.classList.contains('is-active')) {
      closeReportModal();
    }
  });

  // Form submission
  reportForm.addEventListener('submit', handleReportSubmit);
}

function closeReportModal() {
  const reportModal = document.getElementById('reportModal');
  reportModal.classList.remove('is-active');
  document.body.style.overflow = 'auto';
  // Reset form
  document.getElementById('reportForm').reset();
}

// ====== FORM SUBMISSION ======
async function handleReportSubmit(e) {
  e.preventDefault();

  const propertySelect = document.getElementById('propertySelect').value;
  const reportReason = document.getElementById('reportReason').value;
  const reportDescription = document.getElementById('reportDescription').value;

  if (!propertySelect || !reportReason) {
    showNotification('Please fill in all required fields', 'error');
    return;
  }

  try {
    // Prepare report data
    const reportData = {
      listing_id: propertySelect,
      reason: reportReason,
      description: reportDescription,
      reporter_id: getCurrentUserId(),
      status: 'pending',
      created_at: new Date().toISOString(),
    };

    // ====== SUPABASE INTEGRATION (Uncomment when ready) ======
    /*
    const { data, error } = await supabase
      .from('reports')
      .insert([reportData])
      .select();

    if (error) {
      console.error('Error submitting report:', error);
      showNotification('Failed to submit report. Please try again.', 'error');
      return;
    }

    showNotification('Report submitted successfully. Thank you for helping keep our community safe!', 'success');
    closeReportModal();
    loadReports(); // Refresh the reports list
    */

    // ====== DEVELOPMENT: Save to localStorage ======
    const existingReports = JSON.parse(localStorage.getItem('reports') || '[]');
    const newReport = {
      id: `report_${Date.now()}`,
      ...reportData,
    };
    existingReports.push(newReport);
    localStorage.setItem('reports', JSON.stringify(existingReports));

    showNotification('Report submitted successfully. Thank you for helping keep our community safe!', 'success');
    closeReportModal();
    loadReports(); // Refresh the reports list
  } catch (error) {
    console.error('Error submitting report:', error);
    showNotification('An error occurred. Please try again.', 'error');
  }
}

// ====== LOAD REPORTS ======
async function loadReports() {
  const reportsContainer = document.getElementById('reportsContainer');
  const emptyState = document.getElementById('emptyState');

  try {
    // ====== SUPABASE INTEGRATION (Uncomment when ready) ======
    /*
    const currentUserId = getCurrentUserId();
    const { data: reports, error } = await supabase
      .from('reports')
      .select(`
        id,
        listing_id,
        reason,
        status,
        created_at,
        listings (
          title,
          image_url
        )
      `)
      .eq('reporter_id', currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading reports:', error);
      return;
    }
    */

    // ====== DEVELOPMENT: Load from localStorage ======
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    const listings = JSON.parse(localStorage.getItem('listings') || '[]');

    if (reports.length === 0) {
      reportsContainer.innerHTML = '';
      reportsContainer.appendChild(emptyState);
      return;
    }

    // Clear container
    reportsContainer.innerHTML = '';

    // Render each report
    reports.forEach((report) => {
      const listing = listings.find((l) => l.id === report.listing_id);
      const card = createReportCard(report, listing);
      reportsContainer.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading reports:', error);
  }
}

function createReportCard(report, listing) {
  const card = document.createElement('div');
  card.className = 'safety-report-card';

  const statusBadge = getStatusBadge(report.status);
  const reasonText = getReasonText(report.reason);
  const reasonIcon = getReasonIcon(report.reason);
  const reportDate = formatDate(report.created_at);

  const listingTitle = listing?.title || 'Property (ID: ' + report.listing_id + ')';
  const listingImage = listing?.image_url || 'https://via.placeholder.com/80x80?text=No+Image';

  card.innerHTML = `
    <img 
      src="${listingImage}" 
      alt="${listingTitle}" 
      class="safety-card-thumbnail"
      onerror="this.src='https://via.placeholder.com/80x80?text=No+Image'"
    />
    <div class="safety-card-content">
      <h3 class="safety-card-title">${listingTitle}</h3>
      <div class="safety-card-meta">
        <div class="safety-card-date">
          <span class="material-symbols-outlined" style="font-size: 1rem;">calendar_today</span>
          ${reportDate}
        </div>
        <div class="safety-card-id">
          <span class="material-symbols-outlined" style="font-size: 1rem;">tag</span>
          ${report.id.slice(0, 8).toUpperCase()}
        </div>
      </div>
      <div class="safety-card-reason">
        <span class="safety-reason-icon">${reasonIcon}</span>
        ${reasonText}
      </div>
    </div>
    <div class="safety-card-status">
      <span class="safety-status-badge ${getStatusClass(report.status)}">
        ${statusBadge}
      </span>
    </div>
  `;

  return card;
}

// ====== POPULATE PROPERTY LIST ======
async function populatePropertyList() {
  const propertySelect = document.getElementById('propertySelect');

  try {
    // ====== SUPABASE INTEGRATION (Uncomment when ready) ======
    /*
    const currentUserId = getCurrentUserId();
    const { data: listings, error } = await supabase
      .from('listings')
      .select('id, title')
      .eq('tenant_id', currentUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading listings:', error);
      return;
    }
    */

    // ====== DEVELOPMENT: Use sample listings ======
    const sampleListings = [
      { id: 'list_001', title: 'Modern 2BR Apartment - CBD' },
      { id: 'list_002', title: 'Cozy Studio in Westlands' },
      { id: 'list_003', title: '3BR House - Kileleshwa' },
      { id: 'list_004', title: 'Bedsitter - Uthiru' },
    ];

    // Get actual listings from localStorage
    const listings = JSON.parse(localStorage.getItem('listings') || '[]');
    const itemsToShow = listings.length > 0 ? listings : sampleListings;

    // Populate select
    itemsToShow.forEach((listing) => {
      const option = document.createElement('option');
      option.value = listing.id;
      option.textContent = listing.title;
      propertySelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error populating property list:', error);
  }
}

// ====== HELPER FUNCTIONS ======

function getCurrentUserId() {
  // Get from localStorage (development)
  const userId = localStorage.getItem('userId');
  if (userId) return userId;

  // Generate a temporary ID for testing
  const tempId = 'user_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('userId', tempId);
  return tempId;
}

function getStatusBadge(status) {
  const statusMap = {
    pending: 'Pending Review',
    under_review: 'Under Review',
    confirmed_safe: 'Confirmed Safe',
    listing_removed: 'Listing Removed',
    false_report: 'False Report',
  };
  return statusMap[status] || status;
}

function getStatusClass(status) {
  const classMap = {
    pending: 'safety-status-pending',
    under_review: 'safety-status-pending',
    confirmed_safe: 'safety-status-safe',
    listing_removed: 'safety-status-removed',
    false_report: 'safety-status-pending',
  };
  return classMap[status] || 'safety-status-pending';
}

function getReasonText(reason) {
  const reasonMap = {
    wrong_location: 'Wrong Location',
    fraudulent_landlord: 'Fraudulent Landlord',
    incorrect_pricing: 'Incorrect Pricing',
    identity_fraud: 'Potential Identity Fraud',
    unsafe_area: 'Unsafe Area',
    misleading_photos: 'Misleading Photos',
    scam: 'Suspected Scam',
    other: 'Other Concern',
  };
  return reasonMap[reason] || reason;
}

function getReasonIcon(reason) {
  const iconMap = {
    wrong_location: '📍',
    fraudulent_landlord: '⚠️',
    incorrect_pricing: '💰',
    identity_fraud: '🔒',
    unsafe_area: '⚠️',
    misleading_photos: '🖼️',
    scam: '🚨',
    other: '❓',
  };
  return iconMap[reason] || '⚠️';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 1.5rem;
    padding: 1rem 1.5rem;
    border-radius: 0.5rem;
    background-color: ${type === 'success' ? 'rgba(4, 139, 123, 0.9)' : type === 'error' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(100, 116, 139, 0.9)'};
    color: white;
    font-weight: 500;
    z-index: 3000;
    animation: slideIn 0.3s ease;
    max-width: 90%;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  `;

  // Add animation
  const style = document.createElement('style');
  if (!document.querySelector('style[data-notification]')) {
    style.setAttribute('data-notification', 'true');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}
