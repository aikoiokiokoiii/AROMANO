// ── Aromano Co. — script.js ──
const API = 'http://localhost:3000/api';

// ── Utility ──
function $(sel, ctx = document) { return ctx.querySelector(sel); }
function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

/** Themed glass + gold toast for important admin / status feedback */
function showLuxToast(message, opts = {}) {
  const duration = opts.duration ?? 4200;
  const variant = opts.variant || 'success';
  let root = document.getElementById('lux-toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'lux-toast-root';
    root.className = 'lux-toast-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `lux-toast lux-toast--${variant}`;
  const accent = document.createElement('span');
  accent.className = 'lux-toast__accent';
  const p = document.createElement('p');
  p.className = 'lux-toast__msg';
  p.textContent = message;
  el.appendChild(accent);
  el.appendChild(p);
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('lux-toast--visible'));
  clearTimeout(el._hide);
  el._hide = setTimeout(() => {
    el.classList.remove('lux-toast--visible');
    setTimeout(() => el.remove(), 480);
  }, duration);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const AUTH_TOKEN_KEY = 'aromano_auth_token';
const AUTH_USER_KEY = 'aromano_auth_user';

function getAuthToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function saveAuthToken(token) { localStorage.setItem(AUTH_TOKEN_KEY, token); }
function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
function getAuthUser() { return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null'); }
function saveAuthUser(user) { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)); }

let wishlistItems = new Set();
function isFavorite(productId) { return wishlistItems.has(productId); }

async function loadWishlist() {
  const user = getAuthUser();
  if (!user) { wishlistItems = new Set(); updateFavoriteButtons(); return; }
  if (user.role === 'admin') { wishlistItems = new Set(); updateFavoriteButtons(); return; }
  try {
    const result = await api('/wishlist');
    wishlistItems = new Set(result.items || []);
  } catch (err) {
    wishlistItems = new Set();
  }
  updateFavoriteButtons();
}

function updateFavoriteButtons() {
  $$('.favorite-btn').forEach(btn => {
    const id = Number(btn.dataset.id);
    btn.classList.toggle('active', isFavorite(id));
  });
}

// ── Reviews ──
async function openReviewsModal(productId) {
  const user = getAuthUser();
  const isAdmin = user && user.role === 'admin';
  const modal = document.createElement('div');
  modal.className = 'modal-overlay reviews-lux-overlay';
  modal.innerHTML = `
    <div class="modal-box reviews-lux-modal">
      <div class="reviews-lux-head">
        <div>
          <p class="reviews-lux-eyebrow">Aromano Co.</p>
          <h3 class="reviews-lux-title">Reviews & Ratings</h3>
        </div>
        <button type="button" class="lux-modal-close-btn reviews-lux-close" aria-label="Close" data-close-reviews>×</button>
      </div>
      ${isAdmin ? '<p class="reviews-lux-admin-hint reviews-lux-admin-hint--top">Official replies: use the fields under each review. The submit form is for customers only.</p>' : ''}
      <div id="reviews-list" class="reviews-lux-list">Loading…</div>
      <div id="review-form" class="reviews-lux-form ${isAdmin ? 'hidden' : ''}">
        <h4 class="reviews-lux-form-title">Share your experience</h4>
        <form id="submit-review-form" class="reviews-lux-form-grid">
          <div class="form-group">
            <label>Rating (1–5)</label>
            <input type="number" name="rating" class="form-input" min="1" max="5" required>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Review</label>
            <textarea name="review" class="form-textarea" rows="3" placeholder="Notes, longevity, occasion…"></textarea>
          </div>
          <button type="submit" class="btn btn-gold" style="grid-column:1/-1;justify-content:center">Submit review</button>
        </form>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('[data-close-reviews]').onclick = close;
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  await loadReviews(productId, modal);

  const form = $('#submit-review-form', modal);
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const rating = Number(formData.get('rating'));
      const review = formData.get('review');
      try {
        await api(`/reviews/${productId}`, { method: 'POST', body: JSON.stringify({ rating, review }) });
        showLuxToast('Thank you — your review was submitted', { variant: 'success' });
        e.target.reset();
        await loadReviews(productId, modal);
      } catch (err) {
        showLuxToast(err.message || 'Review could not be submitted', { variant: 'error' });
      }
    };
  }
}

async function loadReviews(productId, modalRoot = document) {
  const list = $('#reviews-list', modalRoot);
  if (!list) return;
  const user = getAuthUser();
  const isAdmin = user && user.role === 'admin';
  try {
    const data = await api(`/reviews/${productId}`);
    const { reviews, averageRating } = data;
    list.innerHTML = `
      <div class="reviews-lux-avg"><span class="reviews-lux-avg-num">${averageRating}</span><span class="reviews-lux-avg-stars">${'★'.repeat(Math.round(Number(averageRating) || 0))}</span><span class="reviews-lux-avg-label">average</span></div>
      ${reviews.length === 0 ? '<p class="reviews-lux-empty">No reviews yet — be the first.</p>' : reviews.map(r => `
        <article class="reviews-lux-card" data-review-id="${r._id}">
          <div class="reviews-lux-card-top">
            <strong class="reviews-lux-name">${r.user ? `${r.user.first_name} ${r.user.last_name}` : 'Customer'}</strong>
            <span class="reviews-lux-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
          </div>
          ${r.review ? `<p class="reviews-lux-body">${escapeHtml(r.review)}</p>` : '<p class="reviews-lux-body muted">No written review</p>'}
          <time class="reviews-lux-date">${new Date(r.created_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</time>
          ${r.adminReply ? `
            <div class="reviews-lux-reply">
              <span class="reviews-lux-reply-label">Aromano reply</span>
              <p class="reviews-lux-reply-text">${escapeHtml(r.adminReply)}</p>
              ${r.adminReplyAt ? `<time class="reviews-lux-date">${new Date(r.adminReplyAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</time>` : ''}
            </div>` : ''}
          ${isAdmin ? `
            <div class="reviews-lux-reply-editor">
              <label class="reviews-lux-reply-label">Official reply</label>
              <textarea class="form-textarea reviews-lux-reply-input" rows="2" placeholder="Write a thoughtful response…" data-reply-for="${r._id}">${r.adminReply ? escapeHtml(r.adminReply) : ''}</textarea>
              <button type="button" class="btn btn-outline btn-sm" data-save-reply="${r._id}">${r.adminReply ? 'Update reply' : 'Post reply'}</button>
            </div>` : ''}
        </article>
      `).join('')}
    `;
    if (isAdmin) {
      list.querySelectorAll('[data-save-reply]').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.dataset.saveReply;
          const ta = list.querySelector(`textarea[data-reply-for="${id}"]`);
          const reply = ta ? ta.value.trim() : '';
          try {
            await api(`/reviews/${id}/reply`, { method: 'PUT', body: JSON.stringify({ reply }) });
            showLuxToast(reply ? 'Reply saved' : 'Reply cleared', { variant: 'success' });
            await loadReviews(productId, modalRoot);
          } catch (err) {
            showLuxToast(err.message || 'Could not save reply', { variant: 'error' });
          }
        };
      });
    }
  } catch (err) {
    list.innerHTML = '<p class="reviews-lux-empty">Could not load reviews.</p>';
  }
}

// ── Notifications ──
let notifications = [];
let unreadCount = 0;

async function initNotifications() {
  const user = getAuthUser();
  if (!user) return;
  const navLinks = $('.navbar-links');
  if (!navLinks) return;
  if (document.querySelector('.notification-icon')) return;
  // Add notification icon
  const notifIcon = document.createElement('div');
  notifIcon.className = 'notification-icon';
  notifIcon.innerHTML = '🔔 <span class="notif-count" style="display:none">0</span>';
  notifIcon.onclick = openNotificationsDropdown;
  navLinks.appendChild(notifIcon);
  await loadNotifications();
}

async function loadNotifications() {
  try {
    const data = await api('/notifications');
    notifications = data.notifications;
    unreadCount = notifications.filter(n => !n.isRead).length;
    updateNotificationUI();
  } catch (err) {
    console.error('Load notifications error:', err);
  }
}

function updateNotificationUI() {
  const countEl = $('.notif-count');
  if (countEl) {
    countEl.textContent = unreadCount;
    countEl.style.display = unreadCount > 0 ? 'inline' : 'none';
  }
}

async function openNotificationsDropdown() {
  await loadNotifications();
  const existing = document.querySelector('.notifications-dropdown');
  if (existing) existing.remove();
  const dropdown = document.createElement('div');
  dropdown.className = 'notifications-dropdown';
  dropdown.innerHTML = `
    <div class="dropdown-header">
      <h4>Notifications</h4>
      <button onclick="this.closest('.notifications-dropdown').remove()">×</button>
    </div>
    <div class="dropdown-list">
      ${notifications.length === 0 ? '<p>No notifications</p>' : notifications.map(n => `
        <div class="notif-item ${n.isRead ? 'read' : 'unread'}" data-id="${n._id}">
          <p>${n.message}</p>
          <small>${new Date(n.created_at).toLocaleDateString()}</small>
          ${!n.isRead ? '<button class="mark-read" onclick="markAsRead(\'' + n._id + '\')">Mark Read</button>' : ''}
        </div>
      `).join('')}
    </div>
  `;
  document.body.appendChild(dropdown);
  dropdown.style.display = 'block';
}

async function markAsRead(notifId) {
  try {
    await api(`/notifications/${notifId}/read`, { method: 'PUT' });
    const notif = notifications.find(n => n._id === notifId);
    if (notif) notif.isRead = true;
    unreadCount = Math.max(0, unreadCount - 1);
    updateNotificationUI();
    // Update dropdown
    const item = $(`.notif-item[data-id="${notifId}"]`);
    if (item) {
      item.classList.remove('unread');
      item.classList.add('read');
      const btn = item.querySelector('.mark-read');
      if (btn) btn.remove();
    }
  } catch (err) {
    showToast('Failed to mark as read');
  }
}

async function toggleFavorite(productId) {
  const user = getAuthUser();
  if (!user) {
    showToast('Login to save favorites');
    openAuthModal('login');
    return;
  }
  if (user.role === 'admin') return;
  try {
    const method = isFavorite(productId) ? 'DELETE' : 'POST';
    const result = await api(`/wishlist/${productId}`, { method });
    wishlistItems = new Set(result.items || []);
    updateFavoriteButtons();
    if (document.getElementById('wishlist-grid')) {
      await renderWishlistPage();
    }
    showToast(isFavorite(productId) ? 'Added to favorites' : 'Removed from favorites');
  } catch (err) {
    showToast('Wishlist failed: ' + err.message);
  }
}

async function verifyAuth() {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const result = await api('/auth/me', { method: 'GET' });
    if (result && result.user) {
      saveAuthUser(result.user);
      return result.user;
    }
  } catch (err) {
    clearAuthToken();
  }
  return null;
}

async function api(path, opts = {}) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, {
    headers,
    ...opts,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return res.json();
}

function resolveOrderCustomerName(order) {
  if (!order || typeof order !== 'object') return '—';
  const direct = order.customer_name && String(order.customer_name).trim();
  if (direct) return direct;
  const c = order.customer;
  if (c) {
    const n = c.name || [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
    if (n) return n;
  }
  const fl = [order.first_name, order.last_name].filter(Boolean).join(' ').trim();
  if (fl) return fl;
  const o = order.order;
  if (o) {
    const fromNested = [o.first_name, o.last_name].filter(Boolean).join(' ').trim();
    if (fromNested) return fromNested;
  }
  return '—';
}

function resolveItemProductDisplayName(item, productById, order) {
  const pid = item.product_id != null ? item.product_id : item.productId;
  const matched = pid != null && productById ? productById.get(Number(pid)) : null;
  const fromItem =
    item.name ||
    item.productName ||
    item.title ||
    item.product_name ||
    (item.product && (item.product.name || item.product.product_name || item.product.title));
  const fromCatalog = matched && (matched.product_name || matched.name);
  const fromOrder = order && (order.productName || order.title);
  const resolved = fromItem || fromCatalog || fromOrder;
  return resolved ? String(resolved) : 'Unknown Product';
}

// ══════════════════════════════════════
// INDEX PAGE
// ══════════════════════════════════════
async function initIndex() {
  const grid = $('#featured-grid');
  if (!grid) return;
  const user = getAuthUser();
  const isAdmin = user && user.role === 'admin';
  try {
    const products = await api('/products');
    grid.innerHTML = products.slice(0, 5).map(p => productCardHTML(p, { adminMode: isAdmin })).join('');
    bindProductButtons();
    initNotifications();
  } catch (e) { grid.innerHTML = '<p style="color:var(--fg-muted)">Could not load products.</p>'; }
}

// ══════════════════════════════════════
// PRODUCTS PAGE
// ══════════════════════════════════════
function openProductAdminModal(existing, onSaved) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay admin-product-overlay';
  const isEdit = !!(existing && existing.product_id);
  overlay.innerHTML = `
    <div class="modal-box admin-product-modal">
      <div class="admin-product-modal__head">
        <div>
          <p class="admin-product-modal__eyebrow">${isEdit ? 'Edit fragrance' : 'New fragrance'}</p>
          <h3 class="admin-product-modal__title">${isEdit ? 'Edit product' : 'Add product'}</h3>
        </div>
        <button type="button" class="admin-product-modal__close lux-modal-close-btn" aria-label="Close">×</button>
      </div>
      <form id="admin-product-form" class="admin-product-modal__form">
        <div class="form-group"><label>Brand</label><input name="brand" class="form-input" required autocomplete="off"></div>
        <div class="form-group"><label>Product name</label><input name="product_name" class="form-input" required autocomplete="off"></div>
        <div class="form-group"><label>Description</label><textarea name="description" class="form-textarea" rows="2"></textarea></div>
        <div class="form-group"><label>Fragrance family</label><input name="fragrance_family" class="form-input" placeholder="e.g. Woody Aromatic" autocomplete="off"></div>
        <div class="form-group admin-product-modal__row2">
          <div><label>Size (ml)</label><input name="size_ml" type="number" class="form-input" min="1" step="1"></div>
          <div><label>Stock</label><input name="stock_quantity" type="number" class="form-input" min="0" step="1"></div>
        </div>
        <div class="form-group"><label>Price (₱)</label><input name="price" type="number" class="form-input" min="0" step="0.01" required></div>
        <div class="form-group"><label>Image URL</label><input name="image_url" class="form-input" placeholder="/images/prod1.jpg" autocomplete="off"></div>
        <button type="submit" class="btn btn-gold admin-product-modal__submit">Save product</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  $('.admin-product-modal__close', overlay).onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const form = $('#admin-product-form', overlay);
  if (isEdit) {
    form.brand.value = existing.brand || '';
    form.product_name.value = existing.product_name || '';
    form.description.value = existing.description || '';
    form.fragrance_family.value = existing.fragrance_family || '';
    form.size_ml.value = existing.size_ml != null ? existing.size_ml : '';
    form.price.value = existing.price != null ? existing.price : '';
    form.stock_quantity.value = existing.stock_quantity != null ? existing.stock_quantity : '';
    form.image_url.value = existing.image_url || '';
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.size_ml = data.size_ml ? Number(data.size_ml) : 100;
    data.price = Number(data.price);
    data.stock_quantity = data.stock_quantity !== '' ? Number(data.stock_quantity) : 0;
    try {
      if (isEdit) {
        await api(`/products/${existing.product_id}`, { method: 'PUT', body: JSON.stringify(data) });
        showLuxToast('Product updated successfully', { variant: 'success' });
      } else {
        await api('/products', { method: 'POST', body: JSON.stringify(data) });
        showLuxToast('Product added to collection', { variant: 'success' });
      }
      close();
      if (onSaved) await onSaved();
    } catch (err) {
      showLuxToast(err.message || 'Save failed', { variant: 'error' });
    }
  };
}

function bindAdminProductGrid(grid, productList, onRefresh) {
  grid.onclick = async (e) => {
    const del = e.target.closest('.admin-delete-product');
    const ed = e.target.closest('.admin-edit-product');
    if (del) {
      const id = Number(del.dataset.id);
      const p = productList.find(x => x.product_id === id);
      if (!confirm(`Delete product #${id}${p ? ` (${p.product_name})` : ''}?`)) return;
      try {
        await api(`/products/${id}`, { method: 'DELETE' });
        showToast('Product deleted');
        const next = await api('/products');
        onRefresh(next);
      } catch (err) {
        showToast(err.message || 'Delete failed');
      }
      return;
    }
    if (ed) {
      const id = Number(ed.dataset.id);
      const p = productList.find(x => x.product_id === id);
      if (!p) return;
      openProductAdminModal(p, async () => {
        const next = await api('/products');
        onRefresh(next);
      });
    }
  };
}

async function initProducts() {
  const grid = $('#products-grid');
  const filterBar = $('#filter-bar');
  if (!grid) return;
  const user = getAuthUser();
  const isAdmin = user && user.role === 'admin';
  const pageTitle = document.querySelector('.container.pt-24.pb-20 h1.section-title');
  const pageSub = document.querySelector('.container.pt-24.pb-20 > p');
  if (isAdmin) {
    if (pageTitle) pageTitle.textContent = 'Product Management';
    if (pageSub) pageSub.textContent = 'View, add, edit, or remove fragrances in the collection';
    let toolbar = $('#admin-product-toolbar');
    if (!toolbar && filterBar) {
      toolbar = document.createElement('div');
      toolbar.id = 'admin-product-toolbar';
      toolbar.style.cssText = 'display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center';
      toolbar.innerHTML = '<button type="button" class="btn btn-gold btn-sm" id="admin-add-product-btn">Add product</button>';
      filterBar.parentNode.insertBefore(toolbar, filterBar);
    }
    if (toolbar) toolbar.style.display = 'flex';
  }
  try {
    let products = await api('/products');
    let currentFamily = 'All';
    const families = () => ['All', ...new Set(products.map(p => p.fragrance_family))];
    const syncFilters = () => {
      filterBar.innerHTML = families().map(f =>
        `<button class="filter-btn${f === currentFamily ? ' active' : ''}" data-family="${f}">${f}</button>`
      ).join('');
    };
    syncFilters();
    const renderList = (list, family) => {
      const filtered = family === 'All' ? list : list.filter(p => p.fragrance_family === family);
      grid.innerHTML = filtered.map(p => productCardHTML(p, { adminMode: isAdmin })).join('');
      bindProductButtons();
      if (isAdmin) {
        bindAdminProductGrid(grid, list, (nextProds) => {
          products = nextProds;
          syncFilters();
          renderList(products, currentFamily);
        });
      }
    };
    renderList(products, currentFamily);
    filterBar.addEventListener('click', e => {
      if (!e.target.matches('.filter-btn')) return;
      currentFamily = e.target.dataset.family;
      $$('.filter-btn', filterBar).forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderList(products, currentFamily);
    });
    const addBtn = $('#admin-add-product-btn');
    if (isAdmin && addBtn) {
      addBtn.onclick = () => openProductAdminModal(null, async () => {
        products = await api('/products');
        syncFilters();
        renderList(products, currentFamily);
      });
    }
    initNotifications();
  } catch (e) { grid.innerHTML = '<p style="color:var(--fg-muted)">Could not load products.</p>'; }
}

async function renderWishlistPage() {
  const grid = $('#wishlist-grid');
  if (!grid) return;
  const user = getAuthUser();
  if (!user) {
    grid.innerHTML = '<p class="empty-state">Please log in to view your wishlist.</p>';
    return;
  }
  if (user.role === 'admin') {
    grid.innerHTML = '<p class="empty-state">Favorites are only available for customer accounts.</p>';
    return;
  }
  try {
    await loadWishlist();
    const products = await api('/products');
    const favorites = products.filter(p => wishlistItems.has(p.product_id));
    if (favorites.length === 0) {
      grid.innerHTML = '<p class="empty-state">Your wishlist is empty.</p>';
      return;
    }
    grid.innerHTML = favorites.map(productCardHTML).join('');
    bindProductButtons();
  } catch (e) {
    grid.innerHTML = '<p style="color:var(--fg-muted)">Could not load wishlist.</p>';
  }
}

async function initWishlistPage() {
  const grid = $('#wishlist-grid');
  if (!grid) return;
  await renderWishlistPage();
  initNotifications();
}

function productCardHTML(p, options = {}) {
  const { adminMode = false } = options;
  const user = getAuthUser();
  const showFavorites = user && user.role !== 'admin';
  const oos = p.stock_quantity <= 0;
  const imageUrl = p.image_url || `/images/prod${p.product_id}.jpg`;
  const descriptions = {
    1: 'Woody aromatic signature with vibrant citrus top notes and deep masculine base.',
    2: 'Fresh aromatic blend with crisp spices and modern comfort for everyday elegance.',
    3: 'Luxurious floriental composition with black truffle and rich vetiver warmth.',
    4: 'Bold fruity chypre profile featuring smoked birch and juicy pineapple accents.',
    5: 'Opulent woody oud fragrance accented by Turkish rose and creamy vanilla.',
    6: 'Intense and complex woody oriental profile featuring smoky frankincense and rich, resinous amber accords.',
    7: 'Audacious and warm leather-spicy profile featuring juicy blood mandarin and sweet, aromatic cinnamon accents.',
    8: 'Sophisticated and radiant woody-amber profile featuring delicate jasmine and rich, exotic saffron notes.'
  };
  const longDesc = descriptions[p.product_id] || p.description || 'Premium fragrance with refined notes and long-lasting sillage.';
  return `
  <div class="card">
    <div style="position:relative; overflow:hidden;">
      <img class="product-img" src="${imageUrl}" alt="${p.product_name}">
      ${oos ? '<div class="sold-out-overlay">Sold Out</div>' : ''}
      <span class="product-tag" style="position:absolute;top:0.75rem;left:0.75rem">${p.fragrance_family}</span>
    </div>
    <div class="card-body" style="display:flex;flex-direction:column;gap:0.35rem">
      <span class="product-brand">${p.brand}</span>
      <span class="product-name">${p.product_name}</span>
      <p style="font-size:0.75rem;color:var(--fg-muted);line-height:1.4;margin:0.2rem 0 0.55rem;max-height:3.5rem;overflow:hidden;text-overflow:ellipsis;">${longDesc}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:0.75rem">
        <div>
          <span class="product-price">₱${Number(p.price).toLocaleString()}</span>
          <div class="product-stock">${p.size_ml}ml • ${p.stock_quantity} in stock</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          ${!adminMode ? `<button class="add-btn" data-id="${p.product_id}" ${oos ? 'disabled' : ''} title="Add to cart" aria-label="Add to cart">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
          </button>` : ''}
          ${showFavorites && !adminMode ? `<button class="favorite-btn${isFavorite(p.product_id) ? ' active' : ''}" data-id="${p.product_id}" title="Toggle favorite" aria-label="Toggle favorite">♥</button>` : ''}
          <button class="reviews-btn" data-id="${p.product_id}" title="View reviews" aria-label="View reviews">★</button>
        </div>
      </div>
      <div style="margin-top:0.5rem;font-size:0.68rem;color:var(--fg-muted)">Notes: ${p.fragrance_family} • ${p.size_ml}ml • ${oos ? 'Out of stock' : 'In stock'}</div>
    </div>
    ${adminMode ? `
    <div style="padding:0.75rem 1rem;border-top:1px solid var(--border);display:flex;gap:0.5rem;flex-wrap:wrap">
      <button type="button" class="btn btn-outline btn-sm admin-edit-product" data-id="${p.product_id}">Edit</button>
      <button type="button" class="btn-destructive btn-sm admin-delete-product" data-id="${p.product_id}">Delete</button>
    </div>` : ''}
  </div>`;
}

// ── Simple client-side cart (localStorage) ──
function getCart() { return JSON.parse(localStorage.getItem('aromano_cart') || '[]'); }
function saveCart(cart) { localStorage.setItem('aromano_cart', JSON.stringify(cart)); }

function addToCart(productId) {
  const currentUser = getAuthUser();

  if (!currentUser) {
    showToast('Login to add items to cart');
    openAuthModal('login');
    return;
  }// We store just the id & qty; orders page will resolve details
  const cart = getCart();
  const existing = cart.find(c => c.product_id === productId);
  if (existing) existing.quantity++;
  else cart.push({ product_id: productId, quantity: 1 });
  saveCart(cart);
  showToast('Added to cart');
}

function bindProductButtons() {
  $$('.add-btn').forEach(btn => {
    btn.onclick = () => addToCart(Number(btn.dataset.id));
  });
  $$('.favorite-btn').forEach(btn => {
    btn.onclick = () => toggleFavorite(Number(btn.dataset.id));
  });
  $$('.reviews-btn').forEach(btn => {
    btn.onclick = () => openReviewsModal(Number(btn.dataset.id));
  });
  // Keep favorites UI in sync after cards are rendered.
  updateFavoriteButtons();
}

// ══════════════════════════════════════
// CUSTOMER PAGE
// ══════════════════════════════════════
async function initCustomer() {
  const form = $('#customer-form');
  const list = $('#customer-list');
  if (!form) return;
  const user = getAuthUser();
  const isAdmin = user && user.role === 'admin';

  const loadCustomers = async () => {
    try {
      const customers = await api('/customers');
      list.innerHTML = customers.length === 0
        ? '<p class="empty-state">No customer records yet.</p>'
        : `
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:0.75rem">
          <table style="width:100%;border-collapse:collapse;font-size:0.875rem;background:var(--bg-card)">
            <thead>
              <tr style="text-align:left;border-bottom:1px solid var(--border)">
                <th style="padding:0.65rem 0.75rem;font-family:var(--font-display);font-weight:600">Name</th>
                <th style="padding:0.65rem 0.75rem;font-family:var(--font-display);font-weight:600">Email</th>
                <th style="padding:0.65rem 0.75rem;font-family:var(--font-display);font-weight:600">Phone</th>
                <th style="padding:0.65rem 0.75rem;font-family:var(--font-display);font-weight:600">Address</th>
                <th style="padding:0.65rem 0.75rem;text-align:right;font-family:var(--font-display);font-weight:600">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(c => `
                <tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:0.65rem 0.75rem;vertical-align:top">${c.first_name} ${c.last_name}</td>
                  <td style="padding:0.65rem 0.75rem;color:var(--fg-muted);vertical-align:top;word-break:break-word">${c.email}</td>
                  <td style="padding:0.65rem 0.75rem;color:var(--fg-muted);vertical-align:top">${c.phone || '—'}</td>
                  <td style="padding:0.65rem 0.75rem;color:var(--fg-muted);vertical-align:top;max-width:14rem">${c.address ? String(c.address).replace(/</g, '') : '—'}</td>
                  <td style="padding:0.65rem 0.75rem;text-align:right;white-space:nowrap;vertical-align:top">
                    <button type="button" class="btn btn-outline btn-sm" onclick="editCustomer(${c.customer_id})">Edit</button>
                    <button type="button" class="btn-destructive btn-sm" onclick="deleteCustomer(${c.customer_id})" title="Delete">✕</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (e) { list.innerHTML = '<p style="color:var(--fg-muted)">Could not load customers.</p>'; }
  };

  const loadMyProfile = async () => {
    try {
      const profile = await api('/customers/me');
      form.first_name.value = profile.first_name || '';
      form.last_name.value = profile.last_name || '';
      form.email.value = profile.email || user.email || '';
      form.phone.value = profile.phone || '';
      form.address.value = profile.address || '';
      form.dataset.editId = 'self';
      $('#customer-submit').textContent = 'Update Profile';
      list.innerHTML = `
        <div class="customer-card">
          <div>
            <strong style="font-family:var(--font-display)">${profile.first_name} ${profile.last_name}</strong>
            <div style="font-size:0.75rem;color:var(--fg-muted)">${profile.email} ${profile.phone ? '• ' + profile.phone : ''}</div>
            ${profile.address ? `<div style="font-size:0.7rem;color:var(--fg-muted)">${profile.address}</div>` : ''}
          </div>
        </div>
      `;
    } catch (e) {
      form.first_name.value = user?.first_name || '';
      form.last_name.value = user?.last_name || '';
      form.email.value = user?.email || '';
      form.phone.value = '';
      form.address.value = '';
      delete form.dataset.editId;
      $('#customer-submit').textContent = 'Save Profile';
      list.innerHTML = '<p class="empty-state">No profile yet. Fill out the form to create your profile.</p>';
    }
  };

  const formPanel = $('#customer-form-panel');
  const pageLayout = $('#customer-page-layout');

  if (isAdmin) {
    if (pageLayout) pageLayout.style.gridTemplateColumns = '1fr';
    if (formPanel) {
      formPanel.style.display = 'none';
      formPanel.dataset.adminHidden = '1';
    }
    const t = $('.section-title');
    if (t) t.textContent = 'Customer Records';
    const st = $('.container.pt-24.pb-20 > p');
    if (st) st.textContent = 'View and update customer account records';
    const listHeader = document.querySelector('#customer-list-heading');
    if (listHeader) listHeader.textContent = 'All customers';
    await loadCustomers();
  } else {
    const title = $('.section-title');
    if (title) title.textContent = 'My Profile';
    const subtitle = $('.container.pt-24.pb-20 > p');
    if (subtitle) subtitle.textContent = 'View and update your customer profile information';
    const listHeader = document.querySelector('#customer-list')?.parentElement?.querySelector('h3');
    if (listHeader) listHeader.textContent = 'Profile Preview';
    const formTitle = $('#form-title');
    if (formTitle) formTitle.textContent = 'My Customer Profile';
    await loadMyProfile();
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const editId = form.dataset.editId;
    try {
      if (isAdmin) {
        if (!editId) {
          showToast('Choose a customer and click Edit to update their record');
          return;
        }
        await api(`/customers/${editId}`, { method: 'PUT', body: JSON.stringify(data) });
        showToast('Customer updated');
        delete form.dataset.editId;
        $('#customer-submit').textContent = 'Save changes';
        form.reset();
        if (formPanel) formPanel.style.display = 'none';
        await loadCustomers();
      } else {
        if (editId) {
          await api('/customers/me', { method: 'PUT', body: JSON.stringify(data) });
          showToast('Profile updated');
        } else {
          await api('/customers/me', { method: 'POST', body: JSON.stringify(data) });
          showToast('Profile created');
        }
        await loadMyProfile();
      }
    } catch (err) { showToast('Error: ' + err.message); }
  };

  window.editCustomer = async (id) => {
    if (!isAdmin) {
      form.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    try {
      const c = await api(`/customers/${id}`);
      form.first_name.value = c.first_name;
      form.last_name.value = c.last_name;
      form.email.value = c.email;
      form.phone.value = c.phone || '';
      form.address.value = c.address || '';
      form.dataset.editId = id;
      $('#customer-submit').textContent = 'Save changes';
      const ft = $('#form-title');
      if (ft) ft.textContent = 'Edit customer record';
      if (formPanel) {
        formPanel.style.display = '';
        formPanel.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (err) { showToast('Error: ' + err.message); }
  };

  window.deleteCustomer = async (id) => {
    if (!isAdmin) {
      showToast('You can only manage your own profile');
      return;
    }
    if (!confirm('Delete this customer?')) return;
    try {
      await api(`/customers/${id}`, { method: 'DELETE' });
      showToast('Customer deleted');
      await loadCustomers();
    } catch (err) { showToast('Error: ' + err.message); }
  };
}

// ══════════════════════════════════════
// ORDERS PAGE (place order)
// ══════════════════════════════════════
async function initOrders() {
  const cartList = $('#cart-items');
  const totalEl = $('#cart-total');
  const custSelect = $('#order-customer');
  const placeBtn = $('#place-order-btn');
  const summaryEl = $('#order-summary');
  if (!cartList) return;
  const currentUser = getAuthUser();
  const isAdmin = currentUser && currentUser.role === 'admin';

  let products = [];
  try { products = await api('/products'); } catch (e) {}
  if (isAdmin) {
    try {
      const customers = await api('/customers');
      custSelect.innerHTML = '<option value="">Select customer...</option>' +
        customers.map(c => `<option value="${c.customer_id}">${c.first_name} ${c.last_name} (${c.email})</option>`).join('');
    } catch (e) {
      custSelect.innerHTML = '<option value="">Could not load customers</option>';
    }
  } else {
    try {
      const profile = await api('/customers/me');
      custSelect.innerHTML = `<option value="${profile.customer_id}" selected>${profile.first_name} ${profile.last_name} (${profile.email})</option>`;
    } catch (e) {
      custSelect.innerHTML = '<option value="">Set up your customer profile first</option>';
    }
  }

  const renderCart = () => {
    const cart = getCart();
    if (cart.length === 0) {
      cartList.innerHTML = '<p class="empty-state">Cart is empty. Go to Products to add items.</p>';
      totalEl.textContent = '₱0';
      return;
    }
    let total = 0;
    cartList.innerHTML = cart.map(item => {
      const p = products.find(x => x.product_id === item.product_id);
      if (!p) return '';
      const sub = p.price * item.quantity;
      total += sub;
      return `
        <div class="edit-item">
          <div>
            <div style="font-size:0.875rem">${p.product_name}</div>
            <div style="font-size:0.7rem;color:var(--fg-muted)">₱${Number(p.price).toLocaleString()} each</div>
          </div>
          <div class="qty-controls">
            <button class="qty-btn" onclick="changeCartQty(${p.product_id},-1)">−</button>
            <span class="qty-num">${item.quantity}</span>
            <button class="qty-btn" onclick="changeCartQty(${p.product_id},1)">+</button>
            <button class="btn-destructive" onclick="removeCartItem(${p.product_id})" title="Remove">✕</button>
            <span style="margin-left:0.5rem;font-family:var(--font-display);font-weight:700;color:var(--gold)">₱${sub.toLocaleString()}</span>
          </div>
        </div>`;
    }).join('');
    totalEl.textContent = '₱' + total.toLocaleString();
  };

  window.changeCartQty = (id, delta) => {
    const cart = getCart();
    const item = cart.find(c => c.product_id === id);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) saveCart(cart.filter(c => c.product_id !== id));
    else saveCart(cart);
    renderCart();
  };
  window.removeCartItem = (id) => {
    saveCart(getCart().filter(c => c.product_id !== id));
    renderCart();
  };

  renderCart();

  placeBtn.onclick = async () => {
    const customerId = custSelect.value;
    if (!customerId) { showToast('Please select a customer'); return; }
    const cart = getCart();
    if (cart.length === 0) { showToast('Cart is empty'); return; }
    const items = cart.map(c => {
      const p = products.find(x => x.product_id === c.product_id);
      return { product_id: c.product_id, quantity: c.quantity, unit_price: p ? p.price : 0 };
    });
    try {
      const result = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({ customer_id: customerId, items }),
      });
      saveCart([]);
      renderCart();
      showToast('Order placed successfully!');
      summaryEl.innerHTML = `
        <div class="card" style="padding:1.5rem;margin-top:1.5rem">
          <p class="section-tag">Order Confirmed</p>
          <h3 class="section-title">Order #${result.order_id}</h3>
          <p style="font-size:0.85rem;color:var(--fg-muted);margin-top:0.5rem">
            Total: <strong style="color:var(--gold)">₱${Number(result.total_amount).toLocaleString()}</strong>
          </p>
          <p style="font-size:0.75rem;color:var(--fg-muted);margin-top:0.25rem">${new Date(result.order_date).toLocaleDateString('en-PH', { dateStyle: 'long' })}</p>
          <a href="ordertable.html" class="btn btn-outline btn-sm" style="margin-top:1rem">View All Orders</a>
        </div>`;
    } catch (err) { showToast('Error: ' + err.message); }
  };
}

// ══════════════════════════════════════
// ORDER TABLE PAGE (update & delete)
// ══════════════════════════════════════

async function initOrderTable() {
  const tbody = $('#order-tbody');
  if (!tbody) return;
  const user = getAuthUser();
  const isAdmin = user && user.role === 'admin';
  const dashboardTitle = $('.section-title');
  const dashboardSubtitle = $('.container.pt-24.pb-20 > p');
  const transactionsSubtitle = $('.container.pt-24.pb-20 h2.section-title + p');
  const transactionsTitle = $('.container.pt-24.pb-20 h2.section-title.mt-12');
  const analyticsGrid = $('.analytics-grid');
  const actionsHeader = document.querySelector('.order-table thead th:last-child');

  if (!isAdmin) {
    if (dashboardTitle) dashboardTitle.textContent = 'Order Transactions';
    if (dashboardSubtitle) dashboardSubtitle.textContent = 'View your own order transactions';
    if (transactionsTitle) transactionsTitle.style.display = 'none';
    if (transactionsSubtitle) transactionsSubtitle.style.display = 'none';
    if (analyticsGrid) analyticsGrid.style.display = 'none';
    if (actionsHeader) actionsHeader.textContent = 'Details';
  }

  await loadOrderTable();
  if (isAdmin) await loadAnalytics();
}

async function loadOrderTable() {
  const tbody = $('#order-tbody');
  const user = getAuthUser();
  const isAdmin = user && user.role === 'admin';

  try {
    let catalog = [];
    try { catalog = await api('/products'); } catch (e) { /* optional */ }
    const productById = new Map(catalog.map(p => [Number(p.product_id), p]));

    const orders = isAdmin
      ? await api('/orders')
      : (await api('/order-tracking')).map(track => ({
        order_id: track.order_id,
        customer_name: track.order
          ? `${track.order.first_name || ''} ${track.order.last_name || ''}`.trim()
          : (track.user_id && (track.user_id.first_name || track.user_id.last_name)
            ? `${track.user_id.first_name || ''} ${track.user_id.last_name || ''}`.trim()
            : 'You'),
        first_name: track.order?.first_name,
        last_name: track.order?.last_name,
        items: track.items || track.order?.items || [],
        total_amount: track.order?.total_amount || 0,
        order_date: track.order?.order_date || track.created_at,
        status: track.status || 'pending',
      }));
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:var(--fg-muted)">No orders found</td></tr>';
      return;
    }
    tbody.innerHTML = orders.map(order => {
      const rawProducts = order.items || order.products || order.order?.items || order.order?.products || [];
      const fallbackOrderName = order.productName || order.title || '';
      const products = Array.isArray(rawProducts)
        ? rawProducts.map(item => {
          const productName = resolveItemProductDisplayName(item, productById, order);
          const qty = item.quantity || item.qty || item.count || 1;
          return `${productName} x${qty}`;
        }).join(', ')
        : (fallbackOrderName ? `${fallbackOrderName} x1` : 'Unknown Product x1');
      const custDisplay = resolveOrderCustomerName(order);
      const currentStatus = String(order.status || 'pending').toLowerCase();

      let statusCell;
      if (isAdmin) {
        statusCell = `
          <td>
            <div class="order-status-cell">
              <select class="status-select form-input" data-order-id="${order.order_id}" aria-label="Order status">
              <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="processing" ${currentStatus === 'processing' ? 'selected' : ''}>Processing</option>
              <option value="shipped" ${currentStatus === 'shipped' ? 'selected' : ''}>Shipped</option>
              <option value="delivered" ${currentStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
              <option value="cancelled" ${currentStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
              <button type="button" class="btn btn-gold btn-sm order-status-save-btn" data-commit-status="${order.order_id}">Update Status</button>
            </div>
          </td>
        `;
      } else {
        statusCell = `<td><span class="status-badge">${currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}</span></td>`;
      }

      let rows = `
        <tr>
          <td style="font-family:var(--font-display);font-weight:600">#${order.order_id}</td>
          <td style="color:var(--fg-muted)">${custDisplay}</td>
          <td style="color:var(--fg-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${products}</td>
          <td style="font-family:var(--font-display);font-weight:700;color:var(--gold)">₱${Number(order.total_amount).toLocaleString()}</td>
          <td style="font-size:0.75rem;color:var(--fg-muted)">${new Date(order.order_date).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</td>
          ${statusCell}
          <td style="text-align:right">
            <div style="display:flex;gap:0.5rem;justify-content:flex-end">
              ${isAdmin
                ? `<button class="btn-destructive" onclick="confirmDelete(${order.order_id})" title="Delete">✕</button>`
                : `<a class="btn btn-outline btn-sm" href="order-tracking.html">View</a>`}
            </div>
          </td>
        </tr>`;

      return rows;
    }).join('');
    if (isAdmin) {
      tbody.querySelectorAll('.order-status-save-btn').forEach(btn => {
        btn.addEventListener('click', () => commitOrderStatus(Number(btn.dataset.commitStatus)));
      });
    }
  } catch (e) { tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:var(--fg-muted)">Could not load orders.</td></tr>'; }
}

async function commitOrderStatus(orderId) {
  const user = getAuthUser();
  if (!user || user.role !== 'admin') {
    showLuxToast('Admin access required', { variant: 'error' });
    return;
  }
  const sel = document.querySelector(`.status-select[data-order-id="${orderId}"]`);
  if (!sel) return;
  const newStatus = sel.value;
  try {
    await api(`/order-tracking/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    showLuxToast('Order status updated successfully', { variant: 'success' });
    await loadOrderTable();
  } catch (e) {
    showLuxToast('Failed to update order status: ' + (e.message || 'Unknown error'), { variant: 'error' });
  }
}

window.commitOrderStatus = commitOrderStatus;

window.updateOrderQty = async (orderId, productId, newQty) => {
  const user = getAuthUser();
  if (!user || user.role !== 'admin') {
    showLuxToast('Admin access required', { variant: 'error' });
    return;
  }
  try {
    await api(`/orders/${orderId}/items/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity: newQty }),
    });
    showLuxToast(newQty <= 0 ? 'Item removed from order' : 'Order updated', { variant: 'success' });
    await loadOrderTable();
  } catch (err) {
    showLuxToast('Error: ' + err.message, { variant: 'error' });
  }
};

window.confirmDelete = (orderId) => {
  const user = getAuthUser();
  if (!user || user.role !== 'admin') {
    showLuxToast('Admin access required', { variant: 'error' });
    return;
  }
  const overlay = $('#delete-modal');
  $('#delete-modal-title').textContent = `Delete Order #${orderId}?`;
  overlay.classList.remove('hidden');
  $('#delete-confirm-btn').onclick = async () => {
    try {
      await api(`/orders/${orderId}`, { method: 'DELETE' });
      showLuxToast(`Order #${orderId} deleted and stock restored`, { variant: 'success' });
      overlay.classList.add('hidden');
      await loadOrderTable();
    } catch (err) { showLuxToast('Error: ' + err.message, { variant: 'error' }); }
  };
  $('#delete-cancel-btn').onclick = () => overlay.classList.add('hidden');
};

async function loadAnalytics() {
  try {
    const data = await api('/analytics');
    $('#total-users').textContent = data.totalUsers;
    $('#total-products').textContent = data.totalProducts;
    $('#total-orders').textContent = data.totalOrders;
    $('#sales-summary').textContent = `₱${Number(data.salesSummary).toLocaleString()}`;
  } catch (err) {
    console.error('Analytics load error:', err);
    // Hide or show error in cards
    $('#total-users').textContent = 'Error';
    $('#total-products').textContent = 'Error';
    $('#total-orders').textContent = 'Error';
    $('#sales-summary').textContent = 'Error';
  }
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('auth-login-form').classList.toggle('hidden', mode !== 'login');
  document.getElementById('auth-register-form').classList.toggle('hidden', mode !== 'register');
  document.getElementById('auth-login-tab').classList.toggle('active', mode === 'login');
  document.getElementById('auth-register-tab').classList.toggle('active', mode === 'register');
  const h = document.getElementById('auth-lux-heading');
  if (h) h.textContent = mode === 'register' ? 'Create account' : 'Sign in';
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
}

function wireLegacyAuthLinks() {
  const loginLink = document.querySelector('a[href="login.html"]');
  const registerLink = document.querySelector('a[href="register.html"]');

  if (loginLink) {
    loginLink.onclick = (event) => {
      event.preventDefault();
      openAuthModal('login');
    };
  }
  if (registerLink) {
    registerLink.onclick = (event) => {
      event.preventDefault();
      openAuthModal('register');
    };
  }
}

function renderAuthState() {
  const navLinks = document.querySelector('.navbar-links');
  if (!navLinks) return;
  let authButton = document.getElementById('auth-button');
  if (!authButton) {
    authButton = document.createElement('a');
    authButton.href = '#';
    authButton.id = 'auth-button';
    navLinks.appendChild(authButton);
  }
  const user = getAuthUser();
  const adminQuizRoot = $('#quiz-admin-root');
  if (adminQuizRoot && (!user || user.role !== 'admin')) adminQuizRoot.remove();
  if (user) {
    authButton.textContent = `Logout (${user.role})`;
    authButton.onclick = (event) => {
      event.preventDefault();
      clearAuthToken();
      wishlistItems = new Set();
      updateFavoriteButtons();
      const notifIcon = document.querySelector('.notification-icon');
      if (notifIcon) notifIcon.remove();
      const notifDropdown = document.querySelector('.notifications-dropdown');
      if (notifDropdown) notifDropdown.remove();
      renderAuthState();
      showLuxToast('Successfully logged out', { variant: 'success' });
    };
    initNotifications();
  } else {
    authButton.textContent = 'Login';
    authButton.onclick = (event) => {
      event.preventDefault();
      openAuthModal('login');
    };
    const notifIcon = document.querySelector('.notification-icon');
    if (notifIcon) notifIcon.remove();
  }
  updateFavoriteButtons();
  updateNavbarVisibility();
  if (user && user.role === 'admin' && $('#quiz-container')) {
    const qc = $('#quiz-container');
    const wrap = qc.closest('.container');
    if (wrap) {
      let adminRoot = $('#quiz-admin-root');
      if (!adminRoot) {
        adminRoot = document.createElement('div');
        adminRoot.id = 'quiz-admin-root';
        adminRoot.className = 'quiz-admin-panel card';
        wrap.insertBefore(adminRoot, qc);
      }
      renderQuizAdminPanel(adminRoot);
    }
  }
}

function buildAuthModal() {
  if (document.getElementById('auth-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'modal-overlay auth-lux-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box auth-lux-modal">
      <button type="button" id="auth-modal-close" class="lux-modal-close-btn" aria-label="Close">×</button>
      <div class="auth-lux-brand">
        <p class="auth-lux-eyebrow">Aromano Co.</p>
        <h2 class="auth-lux-heading" id="auth-lux-heading">Sign in</h2>
        <p class="auth-lux-sub">Premium fragrances, your account.</p>
      </div>
      <div class="auth-lux-tabs">
        <button id="auth-login-tab" class="auth-lux-tab active" type="button">Login</button>
        <button id="auth-register-tab" class="auth-lux-tab" type="button">Register</button>
      </div>
      <form id="auth-login-form" class="auth-lux-form">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" class="form-input auth-lux-input" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" class="form-input auth-lux-input" required autocomplete="current-password">
        </div>
        <button class="btn btn-gold auth-lux-submit" type="submit">Sign in</button>
      </form>
      <form id="auth-register-form" class="auth-lux-form hidden">
        <div class="form-group">
          <label>First name</label>
          <input type="text" name="first_name" class="form-input auth-lux-input" autocomplete="given-name">
        </div>
        <div class="form-group">
          <label>Last name</label>
          <input type="text" name="last_name" class="form-input auth-lux-input" autocomplete="family-name">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" class="form-input auth-lux-input" required autocomplete="email">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" class="form-input auth-lux-input" required autocomplete="new-password">
        </div>
        <button class="btn btn-gold auth-lux-submit" type="submit">Create account</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeAuthModal();
  });
  const syncHeading = (mode) => {
    const h = document.getElementById('auth-lux-heading');
    if (h) h.textContent = mode === 'register' ? 'Create account' : 'Sign in';
  };
  document.getElementById('auth-login-tab').addEventListener('click', () => { openAuthModal('login'); syncHeading('login'); });
  document.getElementById('auth-register-tab').addEventListener('click', () => { openAuthModal('register'); syncHeading('register'); });
  document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
  document.getElementById('auth-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    try {
      const result = await api('/auth/login', { method: 'POST', body: JSON.stringify(data) });
      saveAuthToken(result.token);
      saveAuthUser(result.user);
      await loadWishlist();
      renderAuthState();
      closeAuthModal();
      showLuxToast('Successfully logged in', { variant: 'success' });
    } catch (err) {
      showLuxToast('Login failed: ' + err.message, { variant: 'error' });
    }
  });
  document.getElementById('auth-register-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    try {
      const result = await api('/auth/register', { method: 'POST', body: JSON.stringify(data) });
      saveAuthToken(result.token);
      saveAuthUser(result.user);
      await loadWishlist();
      renderAuthState();
      closeAuthModal();
      showLuxToast('Successfully registered', { variant: 'success' });
    } catch (err) {
      showLuxToast('Register failed: ' + err.message, { variant: 'error' });
    }
  });
  syncHeading('login');
}

async function initAuthUI() {
  buildAuthModal();
  wireLegacyAuthLinks();
  await verifyAuth();
  await loadWishlist();
  renderAuthState();
}

// ══════════════════════════════════════
// QUIZ (client-side bank + admin management on Home)
// ══════════════════════════════════════
const QUIZ_STORAGE_KEY = 'aromano_quiz_bank_v1';
const QUIZ_DEFAULT_BANK = [
  { question: "What's your ideal weekend?", options: [
    { label: 'Hiking in the mountains', family: 'Woody Aromatic' },
    { label: 'Fine dining in the city', family: 'Amber Spicy' },
    { label: 'Beach vacation', family: 'Fruity Chypre' },
    { label: 'Museum and gallery hopping', family: 'Oriental Floral' },
    { label: 'Cozy night with a book', family: 'Woody Oud' },
  ]},
  { question: 'Pick your favorite season', options: [
    { label: 'Spring — fresh starts', family: 'Woody Aromatic' },
    { label: 'Summer — warm nights', family: 'Fruity Chypre' },
    { label: 'Autumn — golden hues', family: 'Amber Spicy' },
    { label: 'Winter — deep warmth', family: 'Woody Oud' },
  ]},
  { question: 'Choose a color that speaks to you', options: [
    { label: 'Forest Green', family: 'Woody Aromatic' },
    { label: 'Deep Red', family: 'Amber Spicy' },
    { label: 'Ocean Blue', family: 'Fruity Chypre' },
    { label: 'Midnight Purple', family: 'Oriental Floral' },
    { label: 'Charcoal Black', family: 'Woody Oud' },
  ]},
];

function cloneQuizDefaults() {
  return JSON.parse(JSON.stringify(QUIZ_DEFAULT_BANK));
}

function getQuizBank() {
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 &&
          parsed.every(q => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length > 0 &&
            q.options.every(o => o && typeof o.label === 'string' && typeof o.family === 'string'))) {
        return parsed;
      }
    }
  } catch (e) { /* ignore */ }
  return cloneQuizDefaults();
}

function persistQuizBank(bank) {
  localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(bank));
  refreshQuizAdminPanel();
}

let quizStep = 0;
let quizAnswers = [];

function refreshQuizAdminPanel() {
  const root = $('#quiz-admin-root');
  if (root) renderQuizAdminPanel(root);
}

function renderQuizAdminPanel(root) {
  const bank = getQuizBank();
  root.innerHTML = `
    <div class="quiz-admin-inner">
      <p class="section-tag" style="margin:0">Admin</p>
      <h3 class="quiz-admin-title">Quiz management</h3>
      <p class="quiz-admin-desc">Stored in this browser (localStorage). Customers only take the quiz below.</p>
      <ul class="quiz-admin-list">
        ${bank.map((q, i) => `
          <li class="quiz-admin-row">
            <div class="quiz-admin-qtext"><strong>${i + 1}.</strong> ${escapeHtml(q.question)} <span class="quiz-admin-meta">(${q.options.length} answers)</span></div>
            <div class="quiz-admin-actions">
              <button type="button" class="btn btn-outline btn-sm" data-quiz-edit="${i}">Edit</button>
              <button type="button" class="btn-destructive btn-sm" data-quiz-del="${i}">Delete</button>
            </div>
          </li>`).join('')}
      </ul>
      <button type="button" class="btn btn-gold btn-sm" id="quiz-admin-add">Add question</button>
    </div>`;
  root.querySelectorAll('[data-quiz-edit]').forEach(btn => {
    btn.onclick = () => openQuizEditorModal(Number(btn.dataset.quizEdit));
  });
  root.querySelectorAll('[data-quiz-del]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.quizDel);
      if (!confirm('Delete this quiz question?')) return;
      const b = getQuizBank();
      b.splice(idx, 1);
      persistQuizBank(b);
      if (quizStep >= b.length) quizStep = Math.max(0, b.length - 1);
      if (b.length === 0) quizStep = 0;
      renderQuizStep();
      showLuxToast('Question removed', { variant: 'info' });
    };
  });
  const addBtn = $('#quiz-admin-add', root);
  if (addBtn) addBtn.onclick = () => openQuizEditorModal(null);
}

function openQuizEditorModal(editIndex) {
  const bank = getQuizBank();
  const existing = editIndex != null && editIndex >= 0 ? bank[editIndex] : null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay admin-product-overlay';
  const optRows = (existing && existing.options ? existing.options : [
    { label: '', family: '' }, { label: '', family: '' },
  ]).map((o, i) => `
    <div class="quiz-opt-row" data-opt-i="${i}">
      <div class="form-group"><label>Option ${i + 1} label</label><input type="text" class="form-input quiz-opt-label" value="${escapeHtml(o.label)}"></div>
      <div class="form-group"><label>Fragrance family</label><input type="text" class="form-input quiz-opt-family" value="${escapeHtml(o.family)}" placeholder="Woody Aromatic"></div>
    </div>`).join('');
  overlay.innerHTML = `
    <div class="modal-box admin-product-modal quiz-editor-modal">
      <div class="admin-product-modal__head">
        <div>
          <p class="admin-product-modal__eyebrow">Fragrance quiz</p>
          <h3 class="admin-product-modal__title">${existing ? 'Edit question' : 'Add question'}</h3>
        </div>
        <button type="button" class="admin-product-modal__close lux-modal-close-btn" aria-label="Close">×</button>
      </div>
      <form id="quiz-editor-form" class="admin-product-modal__form">
        <div class="form-group">
          <label>Question</label>
          <input type="text" class="form-input" name="question" required value="${existing ? escapeHtml(existing.question) : ''}">
        </div>
        <p class="quiz-editor-opt-head">Answer choices (label + fragrance family for recommendations)</p>
        <div id="quiz-opt-rows">${optRows}</div>
        <button type="button" class="btn btn-outline btn-sm" id="quiz-add-opt-row" style="margin-top:0.5rem">Add answer row</button>
        <button type="submit" class="btn btn-gold admin-product-modal__submit" style="margin-top:1rem">Save question</button>
      </form>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.admin-product-modal__close').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  const rowsWrap = $('#quiz-opt-rows', overlay);
  $('#quiz-add-opt-row', overlay).onclick = () => {
    const n = rowsWrap.querySelectorAll('.quiz-opt-row').length;
    const div = document.createElement('div');
    div.className = 'quiz-opt-row';
    div.innerHTML = `
      <div class="form-group"><label>Option ${n + 1} label</label><input type="text" class="form-input quiz-opt-label" value=""></div>
      <div class="form-group"><label>Fragrance family</label><input type="text" class="form-input quiz-opt-family" value="" placeholder="Woody Aromatic"></div>`;
    rowsWrap.appendChild(div);
  };
  $('#quiz-editor-form', overlay).onsubmit = (e) => {
    e.preventDefault();
    const qText = e.target.question.value.trim();
    if (!qText) {
      showLuxToast('Question text is required', { variant: 'error' });
      return;
    }
    const opts = [];
    rowsWrap.querySelectorAll('.quiz-opt-row').forEach(row => {
      const label = row.querySelector('.quiz-opt-label')?.value.trim() || '';
      const family = row.querySelector('.quiz-opt-family')?.value.trim() || '';
      if (label && family) opts.push({ label, family });
    });
    if (opts.length < 2) {
      showLuxToast('Add at least two complete answer choices (label + family)', { variant: 'error' });
      return;
    }
    const next = getQuizBank();
    const entry = { question: qText, options: opts };
    if (editIndex != null && editIndex >= 0) next[editIndex] = entry;
    else next.push(entry);
    persistQuizBank(next);
    showLuxToast('Quiz question saved', { variant: 'success' });
    close();
    quizStep = 0;
    quizAnswers = [];
    renderQuizStep();
  };
}

function initQuiz() {
  const container = $('#quiz-container');
  if (!container) return;
  const user = getAuthUser();
  const wrap = container.closest('.container');
  if (user && user.role === 'admin' && wrap) {
    let adminRoot = $('#quiz-admin-root');
    if (!adminRoot) {
      adminRoot = document.createElement('div');
      adminRoot.id = 'quiz-admin-root';
      adminRoot.className = 'quiz-admin-panel card';
      wrap.insertBefore(adminRoot, container);
    }
    renderQuizAdminPanel(adminRoot);
  }
  renderQuizStep();
}

function renderQuizStep() {
  const container = $('#quiz-container');
  if (!container) return;
  const bank = getQuizBank();
  if (bank.length === 0) {
    container.innerHTML = '<p class="empty-state">No quiz questions configured. Use Quiz management above to add questions.</p>';
    return;
  }
  if (quizStep >= bank.length) { renderQuizResult(); return; }
  const q = bank[quizStep];
  container.innerHTML = `
    <div class="quiz-progress">${bank.map((_, i) => `<div class="quiz-bar${i <= quizStep ? ' active' : ''}"></div>`).join('')}</div>
    <h2 class="section-title">${escapeHtml(q.question)}</h2>
    <div style="margin-top:1.5rem">${q.options.map(o =>
      `<button type="button" class="quiz-option" data-quiz-family="${escapeHtml(o.family)}">${escapeHtml(o.label)}</button>`
    ).join('')}</div>
  `;
  container.querySelectorAll('.quiz-option').forEach(btn => {
    btn.onclick = () => {
      quizAnswers.push(btn.dataset.quizFamily);
      quizStep++;
      renderQuizStep();
    };
  });
}

async function renderQuizResult() {
  const container = $('#quiz-container');
  if (!container) return;
  if (quizAnswers.length === 0) {
    container.innerHTML = '<p class="empty-state">No quiz result.</p>';
    return;
  }
  const counts = {};
  quizAnswers.forEach(a => { counts[a] = (counts[a] || 0) + 1; });
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  let recommended = [];
  try {
    const products = await api('/products');
    recommended = products.filter(p => p.fragrance_family === winner);
  } catch (e) { /* ignore */ }
  container.innerHTML = `
    <p class="section-tag text-center">Your Fragrance Family</p>
    <h2 class="quiz-result-title text-center mt-2">${escapeHtml(winner)}</h2>
    <p style="text-align:center;font-size:0.875rem;color:var(--fg-muted);margin-top:1rem">Based on your personality, we recommend these fragrances:</p>
    <div class="product-grid" style="margin-top:2rem">${recommended.map(p => productCardHTML(p)).join('')}</div>
    ${recommended.length === 0 ? '<p class="empty-state">No exact matches — explore our full collection!</p>' : ''}
    <div class="text-center mt-8"><button type="button" class="btn btn-outline" id="quiz-retake-btn">Retake Quiz</button></div>
  `;
  bindProductButtons();
  const retake = $('#quiz-retake-btn', container);
  if (retake) retake.onclick = () => { resetQuiz(); };
}

function resetQuiz() {
  quizStep = 0;
  quizAnswers = [];
  renderQuizStep();
}

window.resetQuiz = resetQuiz;

function initPageTransitions() {
  const navLinks = document.querySelectorAll('.navbar-links a');
  navLinks.forEach(link => {
    link.addEventListener('click', (event) => {
      if (!link.href || link.target === '_blank') return;
      const targetOrigin = new URL(link.href).origin;
      if (targetOrigin !== window.location.origin) return;
      event.preventDefault();
      document.body.classList.remove('page-enter');
      document.body.classList.add('page-exit');
      setTimeout(() => { window.location.href = link.href; }, 260);
    });
  });

  window.addEventListener('pageshow', () => {
    document.body.classList.add('page-enter');
    document.body.classList.remove('page-exit');
  });
}

// ══════════════════════════════════════
// ORDER TRACKING PAGE
// ══════════════════════════════════════
async function initOrderTracking() {
  const trackingContent = $('#tracking-content');
  const authRequired = $('#auth-required');
  if (!trackingContent || !authRequired) return;

  const token = getAuthToken();
  if (!token) {
    authRequired.style.display = 'block';
    return;
  }

  trackingContent.style.display = 'block';
  await loadOrderTracking();
}

async function loadOrderTracking() {
  const container = $('#tracking-list');
  try {
    const orders = await api('/order-tracking');
    if (orders.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--fg-muted)">No orders found</div>';
      return;
    }

    container.innerHTML = orders.map(order => {
      const st = String(order.status || 'pending').toLowerCase();
      const stLabel = st.charAt(0).toUpperCase() + st.slice(1);
      return `
      <div class="tracking-card" style="border:1px solid var(--border);border-radius:0.75rem;padding:1.5rem;margin-bottom:1rem;background:var(--bg-card)">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
          <div>
            <h3 style="font-family:var(--font-display);font-size:1.2rem;font-weight:600;margin:0">
              Order #${order.order_id}
            </h3>
            <p style="color:var(--fg-muted);font-size:0.875rem;margin:0.25rem 0">
              ${order.order ? new Date(order.order.order_date).toLocaleDateString('en-PH', { dateStyle: 'medium' }) : 'Unknown date'}
            </p>
          </div>
          <div style="text-align:right">
            <div class="status-badge status-${st}" style="margin-bottom:0.5rem">${stLabel.toUpperCase()}</div>
            ${order.order ? `<div style="font-family:var(--font-display);font-weight:700;color:var(--gold)">₱${Number(order.order.total_amount).toLocaleString()}</div>` : ''}
          </div>
        </div>

        ${order.tracking_number ? `<p style="font-size:0.875rem;color:var(--fg-muted);margin:0.5rem 0">Tracking: ${order.tracking_number}</p>` : ''}
        ${order.estimated_delivery ? `<p style="font-size:0.875rem;color:var(--fg-muted);margin:0.5rem 0">Estimated delivery: ${new Date(order.estimated_delivery).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</p>` : ''}

        <div style="margin-top:1rem">
          <button class="btn btn-outline btn-sm" onclick="viewOrderDetails(${order.order_id})">View Details</button>
        </div>

        <!-- Status Timeline -->
        <div class="status-timeline" style="margin-top:1rem">
          ${getStatusTimeline(order.status_history || [], order.status)}
        </div>
      </div>
    `;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--fg-muted)">Could not load orders. Please try again.</div>';
  }
}

function getStatusTimeline(history, currentStatus) {
  const pipeline = ['pending', 'processing', 'shipped', 'delivered'];
  const effective = String(currentStatus || history[history.length - 1]?.status || 'pending').toLowerCase();

  const timelineRow = (statusKey, label, isCompleted, entry) => `
      <div class="timeline-item ${isCompleted ? 'completed' : ''}" style="display:flex;align-items:center;margin:0.25rem 0">
        <div class="timeline-dot" style="width:12px;height:12px;border-radius:50%;background:${isCompleted ? 'var(--gold)' : 'var(--border)'} ;margin-right:0.5rem"></div>
        <span style="font-size:0.875rem;color:${isCompleted ? 'var(--fg)' : 'var(--fg-muted)'}">${label}</span>
        ${entry ? `<span style="font-size:0.75rem;color:var(--fg-muted);margin-left:auto">${new Date(entry.timestamp).toLocaleDateString()}</span>` : ''}
      </div>`;

  if (effective === 'cancelled') {
    const pipelineRows = pipeline.map(status => {
      const entry = history.find(h => h.status === status);
      const isCompleted = !!entry;
      const label = status.charAt(0).toUpperCase() + status.slice(1);
      return timelineRow(status, label, isCompleted, entry);
    }).join('');
    const cancelEntry = history.find(h => h.status === 'cancelled');
    return pipelineRows + timelineRow('cancelled', 'Cancelled', !!cancelEntry, cancelEntry);
  }

  const lastIdx = pipeline.indexOf(effective);
  const safeLastIdx = lastIdx >= 0 ? lastIdx : 0;

  return pipeline.map(status => {
    const entry = history.find(h => h.status === status);
    const isCompleted =
      !!entry ||
      (pipeline.indexOf(status) < safeLastIdx) ||
      (pipeline.indexOf(status) === safeLastIdx && lastIdx >= 0);
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    return timelineRow(status, label, isCompleted, entry);
  }).join('');
}

window.viewOrderDetails = async (orderId) => {
  try {
    const data = await api(`/order-tracking/${orderId}`);
    const modal = $('#order-modal');
    const details = $('#order-details');

    const ds = String(data.status || 'pending').toLowerCase();
    details.innerHTML = `
      <div style="margin-bottom:1rem">
        <h4 style="font-family:var(--font-display);font-size:1.1rem;font-weight:600;margin-bottom:0.5rem">Order #${data.order_id}</h4>
        <p style="color:var(--fg-muted);font-size:0.875rem">Status: <span class="status-badge status-${ds}">${ds.toUpperCase()}</span></p>
        ${data.order ? `
          <p style="color:var(--fg-muted);font-size:0.875rem">Date: ${new Date(data.order.order_date).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</p>
          <p style="color:var(--fg-muted);font-size:0.875rem">Total: ₱${Number(data.order.total_amount).toLocaleString()}</p>
        ` : ''}
        ${data.tracking_number ? `<p style="color:var(--fg-muted);font-size:0.875rem">Tracking Number: ${data.tracking_number}</p>` : ''}
        ${data.estimated_delivery ? `<p style="color:var(--fg-muted);font-size:0.875rem">Estimated Delivery: ${new Date(data.estimated_delivery).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</p>` : ''}
      </div>

      <div>
        <h5 style="font-weight:600;margin-bottom:0.5rem">Status History</h5>
        ${data.status_history && data.status_history.length > 0 ?
          data.status_history.map(entry => `
            <div style="padding:0.5rem;border-left:3px solid var(--gold);margin:0.25rem 0;background:var(--bg);border-radius:0.25rem">
              <div style="font-weight:600;text-transform:capitalize">${entry.status}</div>
              <div style="font-size:0.875rem;color:var(--fg-muted)">${new Date(entry.timestamp).toLocaleString('en-PH')}</div>
              ${entry.notes ? `<div style="font-size:0.875rem;margin-top:0.25rem">${entry.notes}</div>` : ''}
            </div>
          `).join('') :
          '<p style="color:var(--fg-muted);font-size:0.875rem">No status updates yet</p>'
        }
      </div>
    `;

    modal.classList.remove('hidden');
  } catch (e) {
    showLuxToast('Could not load order details', { variant: 'error' });
  }
};

// ══════════════════════════════════════
// PAGE INIT
// ══════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  initPageTransitions();
  await initAuthUI();
  initIndex();
  initProducts();
  initWishlistPage();
  initCustomer();
  initOrders();
  initOrderTable();
  initOrderTracking();
  initQuiz();

  // Modal close handlers
  const closeModalBtn = $('#close-modal-btn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      $('#order-modal').classList.add('hidden');
    });
  }
  const deleteDismiss = $('#delete-modal-dismiss');
  if (deleteDismiss) {
    deleteDismiss.addEventListener('click', () => {
      const dm = $('#delete-modal');
      if (dm) dm.classList.add('hidden');
    });
  }
  updateNavbarVisibility();
});

// ======================================
// NAVBAR VISIBILITY CONTROL
// ======================================

function updateNavbarVisibility() {
  const currentUser = JSON.parse(localStorage.getItem('aromano_auth_user') || 'null');
  const isLoggedIn = !!currentUser;
  const isAdmin = currentUser?.role === 'admin';

  const ordersLink = document.querySelector('a[href="orders.html"]');
  const trackOrdersLink = document.querySelector('a[href="order-tracking.html"]');
  const customerLink = document.querySelector('a[href="customer.html"]');
  const orderTableLink = document.querySelector('a[href="ordertable.html"]');
  const wishlistLink = document.querySelector('a[href="wishlist.html"]');

  const placeOrderDisplay = () => {
    if (!isLoggedIn) return 'none';
    if (isAdmin) return 'none';
    return '';
  };
  const trackDisplay = () => {
    if (!isLoggedIn) return 'none';
    if (isAdmin) return 'none';
    return '';
  };
  const favoritesDisplay = () => {
    if (!isLoggedIn) return 'none';
    if (isAdmin) return 'none';
    return '';
  };

  if (!isLoggedIn) {
    if (ordersLink) ordersLink.style.display = 'none';
    if (trackOrdersLink) trackOrdersLink.style.display = 'none';
    if (customerLink) customerLink.style.display = 'none';
    if (orderTableLink) orderTableLink.style.display = 'none';
    if (wishlistLink) wishlistLink.style.display = 'none';
  } else if (isAdmin) {
    if (ordersLink) ordersLink.style.display = 'none';
    if (trackOrdersLink) trackOrdersLink.style.display = 'none';
    if (wishlistLink) wishlistLink.style.display = 'none';
    if (customerLink) customerLink.style.display = '';
    if (orderTableLink) orderTableLink.style.display = '';
  } else {
    if (ordersLink) ordersLink.style.display = '';
    if (trackOrdersLink) trackOrdersLink.style.display = '';
    if (customerLink) customerLink.style.display = '';
    if (orderTableLink) orderTableLink.style.display = '';
    if (wishlistLink) wishlistLink.style.display = '';
  }

  document.querySelectorAll('a[href="orders.html"]').forEach((a) => {
    a.style.display = placeOrderDisplay();
  });
  document.querySelectorAll('a[href="order-tracking.html"]').forEach((a) => {
    a.style.display = trackDisplay();
  });
  document.querySelectorAll('a[href="wishlist.html"]').forEach((a) => {
    a.style.display = favoritesDisplay();
  });
}