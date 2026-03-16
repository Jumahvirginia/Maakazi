/* Makazi – UI Interactions + Supabase Listings Fetch */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const toggle = document.getElementById("mobile-menu-toggle");
const nav = document.getElementById("main-nav");
const featuredGrid = document.getElementById("featured-grid");

if (toggle && nav) {
  toggle.addEventListener("click", function () {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", isOpen);
  });
}

async function fetchListings() {
  if (!featuredGrid) {
    console.error("Listings container #featured-grid not found.");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("listings")
      .select("*")
      .eq("status", "approved");

    if (error) {
      console.error("Error fetching listings:", error);
      featuredGrid.innerHTML = '<p class="listings-empty">Unable to load listings right now.</p>';
      return;
    }

    if (!data || data.length === 0) {
      featuredGrid.innerHTML = '<p class="listings-empty">No properties available yet</p>';
      return;
    }

    console.log("Properties:", data);

    featuredGrid.innerHTML = "";

    for (const listing of data) {
      const title = listing.title ?? "Untitled Property";
      const price = formatKES(listing.price);
      const location = listing.location ?? "Location not specified";
      const type = listing.type ?? "Type not specified";
      const imageUrl = listing.image_url ?? "";

      const card = document.createElement("article");
      card.className = "listing-card";

      const imageArea = document.createElement("div");
      imageArea.className = "listing-image-placeholder";
      imageArea.setAttribute("role", "img");
      imageArea.setAttribute("aria-label", `${title} image`);

      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = title;
        image.style.width = "100%";
        image.style.height = "100%";
        image.style.objectFit = "cover";
        image.style.display = "block";
        imageArea.appendChild(image);
      }

      const cardBody = document.createElement("div");
      cardBody.className = "listing-card-body";

      const heading = document.createElement("h3");
      heading.className = "listing-name";
      heading.textContent = title;

      const priceTag = document.createElement("p");
      priceTag.className = "listing-price";
      priceTag.textContent = `${price} / month`;

      const detailLine = document.createElement("p");
      detailLine.className = "listing-location";

      const locationIcon = document.createElement("span");
      locationIcon.className = "material-symbols-outlined";
      locationIcon.setAttribute("aria-hidden", "true");
      locationIcon.textContent = "location_on";

      detailLine.append(locationIcon, ` ${location} - ${type}`);

      const actionBtn = document.createElement("a");
      actionBtn.href = "docs/stitch_makazi/makazi_property_detail/code.html";
      actionBtn.className = "listing-btn";
      actionBtn.textContent = "View Details";

      cardBody.append(heading, priceTag, detailLine, actionBtn);
      card.append(imageArea, cardBody);
      featuredGrid.appendChild(card);
    }
  } catch (err) {
    console.error("Unexpected error fetching listings:", err);
    if (featuredGrid) {
      featuredGrid.innerHTML = '<p class="listings-empty">Unable to load listings right now.</p>';
    }
  }
}

function formatKES(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "KES 0";
  }

  return `KES ${new Intl.NumberFormat("en-KE").format(numericValue)}`;
}

fetchListings();
