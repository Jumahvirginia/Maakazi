// ── Mobile nav toggle ──
document.getElementById('navToggle').addEventListener('click', () => {
  document.getElementById('navLinks').classList.toggle('open');
});

// ── Supabase client ──
const SUPABASE_URL  = 'https://srunbbuchycskrzfzfgz.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNydW5iYnVjaHljc2tyemZ6Zmd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1Njk3NDgsImV4cCI6MjA4ODE0NTc0OH0.1qJwzTeRuvFxGIPCkIs_JPaOAIpNj8KcfL50EtBX8eE';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Placeholder for listings with no image ──
const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80';

// ── Helper: format price ──
function formatPrice(amount) {
  if (!amount && amount !== 0) return 'Price on request';
  return 'Ksh ' + Number(amount).toLocaleString('en-KE');
}

// ── Helper: build a single listing card ──
function cardHTML(listing) {
  const title     = listing.title    || listing.name     || 'Untitled';
  const location  = listing.location || listing.area     || listing.neighborhood || '';
  const bedrooms  = listing.bedrooms ?? listing.beds     ?? null;
  const bathrooms = listing.bathrooms ?? listing.baths   ?? null;
  const price     = listing.price    ?? listing.rent     ?? null;
  const image     = listing.image_url || listing.image   || listing.photo_url || PLACEHOLDER_IMG;
  const featured  = listing.featured || listing.is_featured || false;

  // Only show bed/bath row if at least one value exists
  const hasMeta = bedrooms !== null || bathrooms !== null;

  return `
    <div class="listing-card">
      <div class="card-img">
        <div class="thumb" style="background-image:url('${image}')"></div>
        ${featured ? '<span class="card-badge">Featured</span>' : ''}
      </div>
      <div class="card-body">
        <h4>${title}</h4>
        ${location ? `<p class="card-location">
          <span class="material-symbols-outlined">location_on</span> ${location}
        </p>` : ''}
        ${hasMeta ? `<div class="card-meta">
          ${bedrooms !== null ? `<span><span class="material-symbols-outlined">bed</span> ${bedrooms} Bed</span>` : ''}
          ${bathrooms !== null ? `<span><span class="material-symbols-outlined">bathtub</span> ${bathrooms} Bath</span>` : ''}
        </div>` : ''}
        <div class="card-price-row">
          <span class="card-price">${formatPrice(price)}<span class="per">/mo</span></span>
        </div>
      </div>
    </div>`;
}

// ── Fetch and render listings ──
async function loadListings() {
  const grid    = document.getElementById('listingsGrid');
  const message = document.getElementById('gridMessage');

  try {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .limit(12);

    if (error) throw error;

    // Log raw data so you can verify column names in the browser console
    console.log('Supabase listings:', data);

    if (!data || data.length === 0) {
      message.textContent = 'No listings available yet. Check back soon!';
      return;
    }

    // Remove loading message and inject cards
    grid.innerHTML = data.map(cardHTML).join('');
  } catch (err) {
    console.error('Supabase fetch error:', err);
    message.textContent = 'Unable to load listings right now. Please try again later.';
  }
}

// Kick off on page load
loadListings();
