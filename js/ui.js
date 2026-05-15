// js/ui.js — Shared UI components and rendering helpers

export const fmt = {
  price: (n) => '$' + Number(n).toLocaleString(),
  area: (n) => n + ' m²',
  date: (s) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  daysAgo: (s) => {
    const d = Math.floor((Date.now() - new Date(s)) / 86400000);
    return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d}d ago`;
  },
};

// ── Property card for listing grid ──
export function propertyCard(p, opts = {}) {
  const img = p.images?.[0] || 'https://images.unsplash.com/photo-1600585154340-be6191da110e?auto=format&fit=crop&q=80&w=800';
  const slug = p.slug;
  const statusClass = { active: 'status-active', pending: 'status-pending', sold: 'status-sold' }[p.status] || '';

  return `
    <article class="prop-card ${opts.featured ? 'featured' : ''}" data-slug="${slug}">
      <a href="/properties/${slug}" class="card-link">
        <div class="card-img">
          <img src="${img}" alt="${p.title || p.address}" loading="lazy">
          <span class="badge intent-${p.intent.toLowerCase()}">${p.intent}</span>
          ${p.status !== 'active' ? `<span class="badge status-badge ${statusClass}">${p.status}</span>` : ''}
          <button class="fav-btn" data-id="${p.id}" onclick="toggleFav(event,'${p.id}')" aria-label="Save property">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          </button>
        </div>
        <div class="card-body">
          <div class="card-price">${fmt.price(p.price)}</div>
          <div class="card-address"><svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg> ${p.address}</div>
          <div class="card-specs">
            ${p.beds ? `<span>${p.beds} bds</span>` : ''}
            ${p.baths ? `<span>${p.baths} ba</span>` : ''}
            ${p.area ? `<span>${fmt.area(p.area)}</span>` : ''}
          </div>
        </div>
        <div class="card-footer">
          <span class="card-agency">${p.agency || 'Lucent Estate'}</span>
          <span class="card-views">${p.views || 0} views</span>
        </div>
      </a>
    </article>
  `;
}

// ── Toast notification ──
export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span> ${msg}`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3800);
}

// ── Mortgage calculator ──
export function calcMortgage({ price, downPct = 20, rate = 4.37, years = 30 }) {
  const principal = price * (1 - downPct / 100);
  const r = rate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ── Inquiry form HTML ──
export function inquiryFormHTML(propertySlug = '', propertyTitle = '') {
  return `
    <div class="modal-header">
      <h3>Contact Agent</h3>
      <p>${propertyTitle ? `Enquiring about: <strong>${propertyTitle}</strong>` : 'Send an inquiry or schedule a tour'}</p>
    </div>
    <form id="inquiry-form" onsubmit="handleInquirySubmit(event)">
      <input type="hidden" name="property_slug" value="${propertySlug}">
      <div class="form-row">
        <div class="form-field">
          <label>First name <span class="req">*</span></label>
          <input type="text" name="first_name" required placeholder="Jane">
        </div>
        <div class="form-field">
          <label>Last name</label>
          <input type="text" name="last_name" placeholder="Doe">
        </div>
      </div>
      <div class="form-field">
        <label>Email <span class="req">*</span></label>
        <input type="email" name="email" required placeholder="jane@example.com">
      </div>
      <div class="form-field">
        <label>Phone</label>
        <input type="tel" name="phone" placeholder="+1 555 000 0000">
      </div>
      <div class="form-field">
        <label>I'm interested in</label>
        <select name="interest">
          <option>Buying</option>
          <option>Renting</option>
          <option>Schedule a tour</option>
          <option>Mortgage inquiry</option>
        </select>
      </div>
      <div class="form-field">
        <label>Message</label>
        <textarea name="message" rows="3" placeholder="I'm interested in this property…"></textarea>
      </div>
      <button type="submit" class="btn btn-primary btn-full">
        <span class="btn-text">Send Inquiry</span>
        <span class="btn-loading hidden">Sending…</span>
      </button>
    </form>
  `;
}

// ── Skeleton loader ──
export function skeleton(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="prop-card skeleton">
      <div class="card-img skel-box"></div>
      <div class="card-body">
        <div class="skel-line skel-w60"></div>
        <div class="skel-line skel-w40 mt-1"></div>
        <div class="skel-line skel-w80 mt-1"></div>
      </div>
    </div>
  `).join('');
}

// ── Favorites (localStorage) ──
export const favs = {
  get: () => JSON.parse(localStorage.getItem('lucent_favs') || '[]'),
  toggle: (id) => {
    let f = favs.get();
    f = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
    localStorage.setItem('lucent_favs', JSON.stringify(f));
    return f.includes(id);
  },
  has: (id) => favs.get().includes(id),
};

// ── Update fav buttons after render ──
export function syncFavButtons() {
  document.querySelectorAll('.fav-btn').forEach(btn => {
    const id = btn.dataset.id;
    btn.classList.toggle('active', favs.has(id));
  });
}

// ── Lazy load images with IntersectionObserver ──
export function lazyImages() {
  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const img = e.target;
        if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
        obs.unobserve(img);
      }
    });
  }, { rootMargin: '200px' });
  document.querySelectorAll('img[data-src]').forEach(img => obs.observe(img));
}

// ── Price histogram bars ──
export function buildHistogram(containerId, prices) {
  const el = document.getElementById(containerId);
  if (!el || !prices.length) return;
  const min = Math.min(...prices), max = Math.max(...prices);
  const buckets = 12;
  const counts = new Array(buckets).fill(0);
  prices.forEach(p => {
    const i = Math.min(buckets - 1, Math.floor(((p - min) / (max - min || 1)) * buckets));
    counts[i]++;
  });
  const peak = Math.max(...counts);
  el.innerHTML = counts.map((c, i) => {
    const h = peak ? Math.max(8, (c / peak) * 100) : 8;
    const active = i >= Math.floor(buckets * 0.2) && i <= Math.floor(buckets * 0.7);
    return `<div class="histo-bar ${active ? 'active' : ''}" style="height:${h}%"></div>`;
  }).join('');
}
