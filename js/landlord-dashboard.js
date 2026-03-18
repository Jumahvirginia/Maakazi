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

  landlordName: document.getElementById("landlord-name"),
  totalListings: document.getElementById("stat-total-listings"),
  activeInquiries: document.getElementById("stat-active-inquiries"),
  listingPerformanceCanvas: document.getElementById("listing-performance-chart"),
  inquiryTrendsCanvas: document.getElementById("inquiry-trends-chart"),
};

init();

async function init() {
  setupSidebar();
  showSessionToast();

  if (!supabaseClient) {
    console.error("Supabase client is unavailable on landlord dashboard.");
    return;
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const [, , , statusCounts] = await Promise.all([
    hydrateProfileName(user.id),
    hydrateListingCount(user.id),
    hydrateInquiryCount(user.id),
    fetchListingStatusCounts(user.id),
  ]);

  initCharts(statusCounts);
}

function showSessionToast() {
  const message = sessionStorage.getItem("makaziToast");
  if (!message) {
    return;
  }

  sessionStorage.removeItem("makaziToast");

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
  }, 2400);
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

async function hydrateProfileName(userId) {
  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profile fetch failed:", error.message);
      if (dom.landlordName) {
        dom.landlordName.textContent = "Landlord";
      }
      return;
    }

    if (dom.landlordName) {
      dom.landlordName.textContent = data?.full_name?.trim() || "Landlord";
    }
  } catch (error) {
    console.error("Unexpected profile fetch error:", error);
    if (dom.landlordName) {
      dom.landlordName.textContent = "Landlord";
    }
  }
}

async function hydrateListingCount(userId) {
  if (dom.totalListings) {
    dom.totalListings.textContent = "0";
  }

  try {
    const { count, error } = await supabaseClient
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("landlord_id", userId);

    if (error) {
      console.error("Listings count failed:", error.message);
      return;
    }

    if (dom.totalListings) {
      dom.totalListings.textContent = String(count ?? 0);
    }
  } catch (error) {
    console.error("Unexpected listings count error:", error);
  }
}

async function hydrateInquiryCount(userId) {
  if (dom.activeInquiries) {
    dom.activeInquiries.textContent = "0";
  }

  try {
    const directResult = await supabaseClient
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("landlord_id", userId);

    if (!directResult.error) {
      if (dom.activeInquiries) {
        dom.activeInquiries.textContent = String(directResult.count ?? 0);
      }
      return;
    }

    const inquiryTableMissing = /does not exist|relation|schema cache/i.test(String(directResult.error.message || ""));
    if (inquiryTableMissing) {
      return;
    }

    const landlordColumnMissing = /column.*landlord_id|landlord_id.*does not exist/i.test(String(directResult.error.message || ""));
    if (!landlordColumnMissing) {
      console.error("Inquiries count failed:", directResult.error.message);
      return;
    }

    const { data: listings, error: listingsError } = await supabaseClient
      .from("listings")
      .select("id")
      .eq("landlord_id", userId);

    if (listingsError) {
      console.error("Listing ids fetch for inquiries failed:", listingsError.message);
      return;
    }

    const listingIds = (listings || []).map(function (row) {
      return row.id;
    }).filter(Boolean);

    if (!listingIds.length) {
      if (dom.activeInquiries) {
        dom.activeInquiries.textContent = "0";
      }
      return;
    }

    const byListing = await supabaseClient
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .in("listing_id", listingIds);

    if (byListing.error) {
      const listingIdColumnMissing = /column.*listing_id|listing_id.*does not exist/i.test(String(byListing.error.message || ""));
      if (!listingIdColumnMissing) {
        console.error("Inquiries by listing failed:", byListing.error.message);
      }
      return;
    }

    if (dom.activeInquiries) {
      dom.activeInquiries.textContent = String(byListing.count ?? 0);
    }
  } catch (error) {
    console.error("Unexpected inquiries count error:", error);
  }
}

async function fetchListingStatusCounts(userId) {
  try {
    const { data, error } = await supabaseClient
      .from("listings")
      .select("status")
      .eq("landlord_id", userId);

    if (error) {
      console.error("Listing statuses fetch failed:", error.message);
      return { approved: 0, pending: 0 };
    }

    const counts = { approved: 0, pending: 0 };
    for (const row of data || []) {
      const status = String(row.status || "").toLowerCase().trim();
      if (status === "approved") {
        counts.approved += 1;
      } else if (status === "pending" || status === "pending_review") {
        counts.pending += 1;
      }
    }

    return counts;
  } catch (error) {
    console.error("Unexpected listing statuses fetch error:", error);
    return { approved: 0, pending: 0 };
  }
}

function initCharts(statusCounts = { approved: 0, pending: 0 }) {
  if (typeof window.Chart === "undefined") {
    console.warn("Chart.js is not loaded.");
    return;
  }

  const css = getComputedStyle(document.documentElement);
  const clrPrimary = (css.getPropertyValue("--clr-primary") || "#048b7b").trim();
  const clrPrimaryDark = (css.getPropertyValue("--clr-primary-dark") || "#03746a").trim();
  const clrSlate400 = (css.getPropertyValue("--clr-slate-400") || "#94a3b8").trim();
  const clrSlate500 = (css.getPropertyValue("--clr-slate-500") || "#64748b").trim();

  if (dom.listingPerformanceCanvas) {
    new window.Chart(dom.listingPerformanceCanvas, {
      type: "doughnut",
      data: {
        labels: ["Live", "Under Review"],
        datasets: [
          {
            label: "Listing Status",
            data: [statusCounts.approved, statusCounts.pending],
            backgroundColor: [clrPrimary, clrSlate400],
            borderColor: [clrPrimaryDark, clrSlate400],
            borderWidth: 1,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              color: clrSlate500,
              usePointStyle: true,
              pointStyle: "circle",
              padding: 14,
            },
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const val = Number(ctx.parsed || 0);
                const suffix = val === 1 ? "listing" : "listings";
                return `${ctx.label}: ${val} ${suffix}`;
              },
            },
          },
        },
      },
    });
  }

  if (dom.inquiryTrendsCanvas) {
    const labels = getLastSevenDayLabels();
    new window.Chart(dom.inquiryTrendsCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Inquiries per Day",
            data: [2, 4, 3, 6, 5, 7, 4],
            borderColor: clrPrimaryDark,
            backgroundColor: "rgba(4, 139, 123, 0.14)",
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 5,
            pointBackgroundColor: clrPrimary,
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            ticks: {
              color: clrSlate500,
            },
            grid: {
              display: false,
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: clrSlate500,
              precision: 0,
            },
            grid: {
              color: "rgba(100, 116, 139, 0.12)",
            },
          },
        },
      },
    });
  }
}

function getLastSevenDayLabels() {
  const formatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const labels = [];
  const today = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    labels.push(formatter.format(day));
  }

  return labels;
}
