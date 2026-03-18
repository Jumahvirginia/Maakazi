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

  totalProperties: document.getElementById("ml-total-properties"),
  liveProperties: document.getElementById("ml-live-properties"),
  pendingProperties: document.getElementById("ml-pending-properties"),

  searchInput: document.getElementById("ml-search"),
  filterTabs: Array.from(document.querySelectorAll(".ml-filter-tab")),

  listingsBody: document.getElementById("ml-listings-body"),
  emptyState: document.getElementById("ml-empty-state"),
  table: document.querySelector(".ml-listings-table"),
};

let currentUser = null;
let allListings = [];
let activeFilter = "all";

init();

async function init() {
  setupSidebar();

  if (!supabaseClient) {
    renderTableMessage("Unable to load listings right now.", 5);
    return;
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  bindControls();
  await fetchAndRenderListings();
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
  if (dom.searchInput) {
    dom.searchInput.addEventListener("input", renderListingsTable);
  }

  dom.filterTabs.forEach(function (tabBtn) {
    tabBtn.addEventListener("click", function () {
      activeFilter = tabBtn.dataset.filter || "all";
      dom.filterTabs.forEach(function (btn) {
        const isActive = btn === tabBtn;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
      renderListingsTable();
    });
  });

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

async function fetchAndRenderListings() {
  renderTableMessage("Loading listings...", 5);

  try {
    const { data, error } = await supabaseClient
      .from("listings")
      .select("*")
      .eq("landlord_id", currentUser.id);

    if (error) {
      throw error;
    }

    allListings = Array.isArray(data) ? data : [];
    updateQuickStats(allListings);
    renderListingsTable();
  } catch (error) {
    console.dir(error);
    allListings = [];
    updateQuickStats([]);
    renderTableMessage("Unable to load listings right now.", 5);
    if (dom.emptyState) {
      dom.emptyState.hidden = true;
    }
  }
}

function updateQuickStats(listings) {
  const total = listings.length;
  const live = listings.filter(function (row) {
    return normalizeStatus(row.status).key === "approved";
  }).length;
  const pending = listings.filter(function (row) {
    return normalizeStatus(row.status).key === "pending";
  }).length;

  if (dom.totalProperties) {
    dom.totalProperties.textContent = String(total);
  }

  if (dom.liveProperties) {
    dom.liveProperties.textContent = String(live);
  }

  if (dom.pendingProperties) {
    dom.pendingProperties.textContent = String(pending);
  }
}

function renderListingsTable() {
  const filtered = applySearchAndFilter(allListings);

  if (!allListings.length) {
    if (dom.table) {
      dom.table.hidden = true;
    }
    if (dom.emptyState) {
      dom.emptyState.hidden = false;
    }
    return;
  }

  if (!filtered.length) {
    if (dom.table) {
      dom.table.hidden = false;
    }
    if (dom.emptyState) {
      dom.emptyState.hidden = true;
    }
    renderTableMessage("No properties match your search.", 5);
    return;
  }

  if (dom.table) {
    dom.table.hidden = false;
  }
  if (dom.emptyState) {
    dom.emptyState.hidden = true;
  }

  if (!dom.listingsBody) {
    return;
  }

  dom.listingsBody.innerHTML = "";

  filtered.forEach(function (listing) {
    const row = document.createElement("tr");

    const imageCell = document.createElement("td");
    imageCell.innerHTML = buildPropertyImageCell(listing);

    const titleCell = document.createElement("td");
    titleCell.innerHTML = `
      <div class="ml-title-wrap">
        <strong>${escapeHtml(listing.title || "Untitled Property")}</strong>
        <span>${escapeHtml(listing.location || "Location not specified")}</span>
      </div>
    `;

    const priceCell = document.createElement("td");
    priceCell.textContent = formatKes(resolvePrice(listing));

    const statusCell = document.createElement("td");
    const status = normalizeStatus(listing.status);
    statusCell.innerHTML = `<span class="ml-status-badge ${status.className}">${status.label}</span>`;

    const actionsCell = document.createElement("td");
    actionsCell.appendChild(buildActions(listing));

    row.append(imageCell, titleCell, priceCell, statusCell, actionsCell);
    dom.listingsBody.appendChild(row);
  });
}

function buildPropertyImageCell(listing) {
  const imageUrl = resolvePrimaryImage(listing);

  if (!imageUrl) {
    return `
      <div class="ml-thumb ml-thumb-placeholder" aria-label="No image">
        <span class="material-symbols-outlined" aria-hidden="true">image</span>
      </div>
    `;
  }

  return `
    <div class="ml-thumb">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(listing.title || "Property")}" loading="lazy" />
    </div>
  `;
}

function buildActions(listing) {
  const wrapper = document.createElement("div");
  wrapper.className = "ml-actions";

  const viewLink = document.createElement("a");
  viewLink.className = "ml-btn ml-btn-view";
  viewLink.href = `property_detail.html?listing=${encodeURIComponent(String(listing.id || ""))}`;
  viewLink.target = "_blank";
  viewLink.rel = "noopener noreferrer";
  viewLink.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">visibility</span> View Live';

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ml-btn ml-btn-delete";
  deleteBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">delete</span> Delete';
  deleteBtn.addEventListener("click", async function () {
    await deleteListing(listing.id, deleteBtn);
  });

  wrapper.append(viewLink, deleteBtn);
  return wrapper;
}

async function deleteListing(listingId, triggerButton) {
  if (!listingId) {
    return;
  }

  try {
    if (triggerButton) {
      triggerButton.disabled = true;
    }

    const { error } = await supabaseClient
      .from("listings")
      .delete()
      .eq("id", listingId)
      .eq("landlord_id", currentUser.id);

    if (error) {
      throw error;
    }

    await fetchAndRenderListings();
  } catch (error) {
    console.error("Delete listing failed:", error);
    alert("Unable to delete listing right now. Please try again.");
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
    }
  }
}

function applySearchAndFilter(listings) {
  const searchTerm = (dom.searchInput?.value || "").trim().toLowerCase();

  const filtered = listings.filter(function (row) {
    const status = normalizeStatus(row.status).key;
    if (activeFilter !== "all" && status !== activeFilter) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const title = String(row.title || "").toLowerCase();
    const location = String(row.location || "").toLowerCase();
    return title.includes(searchTerm) || location.includes(searchTerm);
  });

  return filtered;
}

function resolvePrimaryImage(listing) {
  const imageFields = [listing.image_url, listing.images, listing.image_urls];

  for (const field of imageFields) {
    if (!field) {
      continue;
    }

    if (Array.isArray(field)) {
      const first = field.find(function (item) {
        return typeof item === "string" && item.trim();
      });
      if (first) {
        return first.trim();
      }
      continue;
    }

    if (typeof field === "string") {
      const raw = field.trim();
      if (!raw) {
        continue;
      }

      // Handle JSON arrays stored as text (e.g. "[\"url\"]").
      if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const firstParsed = parsed.find(function (item) {
              return typeof item === "string" && item.trim();
            });
            if (firstParsed) {
              return firstParsed.trim();
            }
          }
          if (parsed && typeof parsed === "object" && typeof parsed.url === "string" && parsed.url.trim()) {
            return parsed.url.trim();
          }
        } catch (_error) {
          // Not JSON, so treat as regular URL/text.
        }
      }

      // Handle comma-separated urls in text columns.
      if (raw.includes(",")) {
        const firstCsv = raw
          .split(",")
          .map(function (part) {
            return part.trim();
          })
          .find(Boolean);
        if (firstCsv) {
          return firstCsv;
        }
      }

      return raw;
    }
  }

  return "";
}

function resolvePrice(listing) {
  const raw = listing.monthly_rent ?? listing.price;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function normalizeStatus(rawStatus) {
  const status = String(rawStatus || "").toLowerCase();

  if (status === "approved") {
    return { key: "approved", label: "Live", className: "ml-status-live" };
  }

  if (status === "rejected") {
    return { key: "rejected", label: "Rejected", className: "ml-status-rejected" };
  }

  return { key: "pending", label: "Under Review", className: "ml-status-pending" };
}

function formatKes(value) {
  return `KES ${new Intl.NumberFormat("en-KE").format(Number(value) || 0)}`;
}

function renderTableMessage(message, colSpan) {
  if (!dom.listingsBody) {
    return;
  }

  dom.listingsBody.innerHTML = `
    <tr>
      <td colspan="${colSpan}" class="ld-empty-cell">${escapeHtml(message)}</td>
    </tr>
  `;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

