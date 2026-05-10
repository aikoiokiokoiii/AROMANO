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
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3>Reviews & Ratings</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div id="reviews-list">Loading...</div>
      <div id="review-form" style="margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem">
        <h4>Submit Your Review</h4>
        <form id="submit-review-form">
          <label>Rating (1-5): <input type="number" name="rating" min="1" max="5" required></label>
          <label>Review: <textarea name="review" rows="3" placeholder="Optional review text"></textarea></label>
          <button type="submit" class="btn">Submit Review</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Load reviews
  await loadReviews(productId);

  // Bind form
  $('#submit-review-form', modal).onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const rating = Number(formData.get('rating'));
    const review = formData.get('review');
    try {
      await api(`/reviews/${productId}`, { method: 'POST', body: JSON.stringify({ rating, review }) });
      showToast('Review submitted');
      e.target.reset();
      await loadReviews(productId);
    } catch (err) {
      showToast('Review failed: ' + err.message);
    }
  };
}

async function loadReviews(productId) {
  const list = $('#reviews-list');
  if (!list) return;
  try {
    const data = await api(`/reviews/${productId}`);
    const { reviews, averageRating } = data;
    list.innerHTML = `
      <div style="margin-bottom:1rem"><strong>Average Rating: ${averageRating} ★</strong></div>
      ${reviews.length === 0 ? '<p>No reviews yet.</p>' : reviews.map(r => `
        <div class="review-item" style="border-bottom:1px solid var(--border);padding:0.5rem 0">
          <div><strong>${r.user.first_name} ${r.user.last_name}</strong> - ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} (${r.rating}/5)</div>
          ${r.review ? `<p style="margin:0.25rem 0">${r.review}</p>` : ''}
          <small style="color:var(--fg-muted)">${new Date(r.created_at).toLocaleDateString()}</small>
        </div>
      `).join('')}
    `;
  } catch (err) {
    list.innerHTML = '<p>Could not load reviews.</p>';
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

// ══════════════════════════════════════
// INDEX PAGE
// ══════════════════════════════════════
async function initIndex() {
  const grid = $('#featured-grid');
  if (!grid) return;
  try {
    const products = await api('/products');
    grid.innerHTML = products.slice(0, 5).map(productCardHTML).join('');
    bindProductButtons();
    initNotifications();
  } catch (e) { grid.innerHTML = '<p style="color:var(--fg-muted)">Could not load products.</p>'; }
}

// ══════════════════════════════════════
// PRODUCTS PAGE
// ══════════════════════════════════════
async function initProducts() {
  const grid = $('#products-grid');
  const filterBar = $('#filter-bar');
  if (!grid) return;
  try {
    const products = await api('/products');
    const families = ['All', ...new Set(products.map(p => p.fragrance_family))];
    filterBar.innerHTML = families.map(f =>
      `<button class="filter-btn${f === 'All' ? ' active' : ''}" data-family="${f}">${f}</button>`
    ).join('');
    const render = (filter) => {
      const list = filter === 'All' ? products : products.filter(p => p.fragrance_family === filter);
      grid.innerHTML = list.map(productCardHTML).join('');
      bindProductButtons();
    };
    render('All');
    filterBar.addEventListener('click', e => {
      if (!e.target.matches('.filter-btn')) return;
      $$('.filter-btn', filterBar).forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      render(e.target.dataset.family);
    });
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

function productCardHTML(p) {
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
          <button class="add-btn" data-id="${p.product_id}" ${oos ? 'disabled' : ''} title="Add to cart" aria-label="Add to cart">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"></circle>
              <circle cx="20" cy="21" r="1"></circle>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
          </button>
          <button class="favorite-btn${isFavorite(p.product_id) ? ' active' : ''}" data-id="${p.product_id}" title="Toggle favorite" aria-label="Toggle favorite">♥</button>
          <button class="reviews-btn" data-id="${p.product_id}" title="View reviews" aria-label="View reviews">★</button>
        </div>
      </div>
      <div style="margin-top:0.5rem;font-size:0.68rem;color:var(--fg-muted)">Notes: ${p.fragrance_family} • ${p.size_ml}ml • ${oos ? 'Out of stock' : 'In stock'}</div>
    </div>
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
      list.innerHTML = customers.map(c => `
        <div class="customer-card" id="cust-${c.customer_id}">
          <div>
            <strong style="font-family:var(--font-display)">${c.first_name} ${c.last_name}</strong>
            <div style="font-size:0.75rem;color:var(--fg-muted)">${c.email} ${c.phone ? '• ' + c.phone : ''}</div>
            ${c.address ? `<div style="font-size:0.7rem;color:var(--fg-muted)">${c.address}</div>` : ''}
          </div>
          <div style="display:flex;gap:0.5rem">
            <button class="btn btn-outline btn-sm" onclick="editCustomer(${c.customer_id})">Edit</button>
            <button class="btn-destructive" onclick="deleteCustomer(${c.customer_id})" title="Delete">✕</button>
          </div>
        </div>
      `).join('');
      if (customers.length === 0) list.innerHTML = '<p class="empty-state">No customers yet.</p>';
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

  if (isAdmin) {
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
        if (editId) {
          await api(`/customers/${editId}`, { method: 'PUT', body: JSON.stringify(data) });
          showToast('Customer updated');
          delete form.dataset.editId;
          $('#customer-submit').textContent = 'Add Customer';
        } else {
          await api('/customers', { method: 'POST', body: JSON.stringify(data) });
          showToast('Customer added');
        }
        form.reset();
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
      $('#customer-submit').textContent = 'Update Customer';
      form.scrollIntoView({ behavior: 'smooth' });
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
let expandedOrderId = null;

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
    const orders = isAdmin
      ? await api('/orders')
      : (await api('/order-tracking')).map(track => ({
        order_id: track.order_id,
        customer_name: track.order ? `${track.order.first_name} ${track.order.last_name}` : 'You',
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
          const productName =
            item.name ||
            item.productName ||
            item.title ||
            item.product?.name ||
            item.product?.title ||
            order.productName ||
            order.title ||
            'Unknown Product';
          const qty = item.quantity || item.qty || item.count || 1;
          return `${productName} x${qty}`;
        }).join(', ')
        : (fallbackOrderName ? `${fallbackOrderName} x1` : 'Unknown Product x1');
      const currentStatus = order.status || 'pending';

      let statusCell;
      if (isAdmin) {
        statusCell = `
          <td>
            <select class="status-select" onchange="updateOrderStatus(${order.order_id}, this.value)" style="padding:0.25rem 0.5rem;border:1px solid var(--border);border-radius:0.25rem;font-size:0.875rem">
              <option value="pending" ${currentStatus === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="processing" ${currentStatus === 'processing' ? 'selected' : ''}>Processing</option>
              <option value="shipped" ${currentStatus === 'shipped' ? 'selected' : ''}>Shipped</option>
              <option value="delivered" ${currentStatus === 'delivered' ? 'selected' : ''}>Delivered</option>
            </select>
          </td>
        `;
      } else {
        statusCell = `<td><span class="status-badge">${currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1)}</span></td>`;
      }

      let rows = `
        <tr>
          <td style="font-family:var(--font-display);font-weight:600">#${order.order_id}</td>
          <td style="color:var(--fg-muted)">${order.customer_name || (order.customer ? order.customer.first_name + ' ' + order.customer.last_name : '—')}</td>
          <td style="color:var(--fg-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${products}</td>
          <td style="font-family:var(--font-display);font-weight:700;color:var(--gold)">₱${Number(order.total_amount).toLocaleString()}</td>
          <td style="font-size:0.75rem;color:var(--fg-muted)">${new Date(order.order_date).toLocaleDateString('en-PH', { dateStyle: 'medium' })}</td>
          ${statusCell}
          <td style="text-align:right">
            <div style="display:flex;gap:0.5rem;justify-content:flex-end">
              ${isAdmin
                ? `<button class="btn btn-outline btn-sm" onclick="toggleEdit(${order.order_id})">${expandedOrderId === order.order_id ? 'Close' : 'Update'}</button>
              <button class="btn-destructive" onclick="confirmDelete(${order.order_id})" title="Delete">✕</button>`
                : `<a class="btn btn-outline btn-sm" href="order-tracking.html">View</a>`}
            </div>
          </td>
        </tr>`;

      if (expandedOrderId === order.order_id && order.items) {
        rows += `<tr class="edit-row"><td colspan="7" style="padding:1rem">
          <p style="font-size:0.75rem;font-family:var(--font-display);font-weight:600;margin-bottom:0.5rem">Edit Items</p>
          ${order.items.map(item => `
            <div class="edit-item">
              <div>
                <div style="font-size:0.875rem">${item.product_name || item.product?.product_name || 'Product'}</div>
                <div style="font-size:0.7rem;color:var(--fg-muted)">₱${Number(item.unit_price).toLocaleString()} each</div>
              </div>
              <div class="qty-controls">
                <button class="qty-btn" onclick="updateOrderQty(${order.order_id},${item.product_id},${item.quantity - 1})">−</button>
                <span class="qty-num">${item.quantity}</span>
                <button class="qty-btn" onclick="updateOrderQty(${order.order_id},${item.product_id},${item.quantity + 1})">+</button>
                <span style="margin-left:0.5rem;font-family:var(--font-display);font-weight:700;color:var(--gold)">₱${(item.unit_price * item.quantity).toLocaleString()}</span>
              </div>
            </div>
          `).join('')}
        </td></tr>`;
      }
      return rows;
    }).join('');
  } catch (e) { tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem;color:var(--fg-muted)">Could not load orders.</td></tr>'; }
}

window.updateOrderStatus = async (orderId, newStatus) => {
  const user = getAuthUser();
  if (!user || user.role !== 'admin') {
    showToast('Admin access required');
    return;
  }
  try {
    await api(`/order-tracking/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    alert('Order status updated successfully!');
    loadOrderTable(); // Refresh the table
  } catch (e) {
    alert('Failed to update order status: ' + e.message);
  }
};

window.toggleEdit = (orderId) => {
  const user = getAuthUser();
  if (!user || user.role !== 'admin') return;
  expandedOrderId = expandedOrderId === orderId ? null : orderId;
  loadOrderTable();
};

window.updateOrderQty = async (orderId, productId, newQty) => {
  const user = getAuthUser();
  if (!user || user.role !== 'admin') {
    showToast('Admin access required');
    return;
  }
  try {
    await api(`/orders/${orderId}/items/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity: newQty }),
    });
    showToast(newQty <= 0 ? 'Item removed from order' : 'Order updated');
    await loadOrderTable();
  } catch (err) { showToast('Error: ' + err.message); }
};

window.confirmDelete = (orderId) => {
  const user = getAuthUser();
  if (!user || user.role !== 'admin') {
    showToast('Admin access required');
    return;
  }
  const overlay = $('#delete-modal');
  $('#delete-modal-title').textContent = `Delete Order #${orderId}?`;
  overlay.classList.remove('hidden');
  $('#delete-confirm-btn').onclick = async () => {
    try {
      await api(`/orders/${orderId}`, { method: 'DELETE' });
      showToast(`Order #${orderId} deleted and stock restored`);
      overlay.classList.add('hidden');
      expandedOrderId = null;
      await loadOrderTable();
    } catch (err) { showToast('Error: ' + err.message); }
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

// ══════════════════════════════════════
// QUIZ (Novelty Feature — client-side)
// ══════════════════════════════════════
const quizQuestions = [
  { question: "What's your ideal weekend?", options: [
    { label: "Hiking in the mountains", family: "Woody Aromatic" },
    { label: "Fine dining in the city", family: "Amber Spicy" },
    { label: "Beach vacation", family: "Fruity Chypre" },
    { label: "Museum and gallery hopping", family: "Oriental Floral" },
    { label: "Cozy night with a book", family: "Woody Oud" }
  ]},
  { question: "Pick your favorite season", options: [
    { label: "Spring — fresh starts", family: "Woody Aromatic" },
    { label: "Summer — warm nights", family: "Fruity Chypre" },
    { label: "Autumn — golden hues", family: "Amber Spicy" },
    { label: "Winter — deep warmth", family: "Woody Oud" }
  ]},
  { question: "Choose a color that speaks to you", options: [
    { label: "Forest Green", family: "Woody Aromatic" },
    { label: "Deep Red", family: "Amber Spicy" },
    { label: "Ocean Blue", family: "Fruity Chypre" },
    { label: "Midnight Purple", family: "Oriental Floral" },
    { label: "Charcoal Black", family: "Woody Oud" }
  ]}
];

let quizStep = 0, quizAnswers = [];

function initQuiz() {
  const container = $('#quiz-container');
  if (!container) return;
  renderQuizStep();
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('auth-login-form').classList.toggle('hidden', mode !== 'login');
  document.getElementById('auth-register-form').classList.toggle('hidden', mode !== 'register');
  document.getElementById('auth-login-tab').classList.toggle('active', mode === 'login');
  document.getElementById('auth-register-tab').classList.toggle('active', mode === 'register');
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
      showToast('Logged out');
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
}

function buildAuthModal() {
  if (document.getElementById('auth-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'auth-modal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box">
      <div style="display:flex;gap:0.75rem;margin-bottom:1.25rem;">
        <button id="auth-login-tab" class="btn btn-outline btn-sm active" type="button">Login</button>
        <button id="auth-register-tab" class="btn btn-outline btn-sm" type="button">Register</button>
      </div>
      <form id="auth-login-form">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" class="form-input" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" class="form-input" required>
        </div>
        <button class="btn btn-gold" type="submit" style="width:100%;">Sign in</button>
      </form>
      <form id="auth-register-form" class="hidden">
        <div class="form-group">
          <label>First Name</label>
          <input type="text" name="first_name" class="form-input">
        </div>
        <div class="form-group">
          <label>Last Name</label>
          <input type="text" name="last_name" class="form-input">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" class="form-input" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" class="form-input" required>
        </div>
        <button class="btn btn-gold" type="submit" style="width:100%;">Create account</button>
      </form>
      <button id="auth-close-btn" class="btn btn-outline btn-sm" type="button" style="margin-top:1rem;width:100%;">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeAuthModal();
  });
  document.getElementById('auth-login-tab').addEventListener('click', () => openAuthModal('login'));
  document.getElementById('auth-register-tab').addEventListener('click', () => openAuthModal('register'));
  document.getElementById('auth-close-btn').addEventListener('click', closeAuthModal);
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
      showToast('Logged in successfully');
    } catch (err) {
      showToast('Login failed: ' + err.message);
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
      showToast('Account created successfully');
    } catch (err) {
      showToast('Register failed: ' + err.message);
    }
  });
}

async function initAuthUI() {
  buildAuthModal();
  wireLegacyAuthLinks();
  await verifyAuth();
  await loadWishlist();
  renderAuthState();
}

function initQuiz() {
  const container = $('#quiz-container');
  if (!container) return;
  renderQuizStep();
}

function renderQuizStep() {
  const container = $('#quiz-container');
  if (quizStep >= quizQuestions.length) { renderQuizResult(); return; }
  const q = quizQuestions[quizStep];
  container.innerHTML = `
    <div class="quiz-progress">${quizQuestions.map((_, i) => `<div class="quiz-bar${i <= quizStep ? ' active' : ''}"></div>`).join('')}</div>
    <h2 class="section-title">${q.question}</h2>
    <div style="margin-top:1.5rem">${q.options.map(o => `<button class="quiz-option" onclick="quizAnswer('${o.family}')">${o.label}</button>`).join('')}</div>
  `;
}

window.quizAnswer = (family) => {
  quizAnswers.push(family);
  quizStep++;
  renderQuizStep();
};

async function renderQuizResult() {
  const container = $('#quiz-container');
  const counts = {};
  quizAnswers.forEach(a => counts[a] = (counts[a] || 0) + 1);
  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  let recommended = [];
  try {
    const products = await api('/products');
    recommended = products.filter(p => p.fragrance_family === winner);
  } catch (e) {}
  container.innerHTML = `
    <p class="section-tag text-center">Your Fragrance Family</p>
    <h2 class="quiz-result-title text-center mt-2">${winner}</h2>
    <p style="text-align:center;font-size:0.875rem;color:var(--fg-muted);margin-top:1rem">Based on your personality, we recommend these fragrances:</p>
    <div class="product-grid" style="margin-top:2rem">${recommended.map(productCardHTML).join('')}</div>
    ${recommended.length === 0 ? '<p class="empty-state">No exact matches — explore our full collection!</p>' : ''}
    <div class="text-center mt-8"><button class="btn btn-outline" onclick="resetQuiz()">Retake Quiz</button></div>
  `;
  bindProductButtons();
}

window.resetQuiz = () => { quizStep = 0; quizAnswers = []; renderQuizStep(); };

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

    container.innerHTML = orders.map(order => `
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
            <div class="status-badge status-${order.status}" style="margin-bottom:0.5rem">${order.status.toUpperCase()}</div>
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
          ${getStatusTimeline(order.status_history || [])}
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--fg-muted)">Could not load orders. Please try again.</div>';
  }
}

function getStatusTimeline(history) {
  const statuses = ['pending', 'processing', 'shipped', 'delivered'];
  return statuses.map(status => {
    const entry = history.find(h => h.status === status);
    const isCompleted = entry || (statuses.indexOf(status) < statuses.indexOf(history[history.length - 1]?.status || 'pending'));
    return `
      <div class="timeline-item ${isCompleted ? 'completed' : ''}" style="display:flex;align-items:center;margin:0.25rem 0">
        <div class="timeline-dot" style="width:12px;height:12px;border-radius:50%;background:${isCompleted ? 'var(--gold)' : 'var(--border)'} ;margin-right:0.5rem"></div>
        <span style="font-size:0.875rem;color:${isCompleted ? 'var(--fg)' : 'var(--fg-muted)'}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
        ${entry ? `<span style="font-size:0.75rem;color:var(--fg-muted);margin-left:auto">${new Date(entry.timestamp).toLocaleDateString()}</span>` : ''}
      </div>
    `;
  }).join('');
}

window.viewOrderDetails = async (orderId) => {
  try {
    const data = await api(`/order-tracking/${orderId}`);
    const modal = $('#order-modal');
    const details = $('#order-details');

    details.innerHTML = `
      <div style="margin-bottom:1rem">
        <h4 style="font-family:var(--font-display);font-size:1.1rem;font-weight:600;margin-bottom:0.5rem">Order #${data.order_id}</h4>
        <p style="color:var(--fg-muted);font-size:0.875rem">Status: <span class="status-badge status-${data.status}">${data.status.toUpperCase()}</span></p>
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
    alert('Could not load order details');
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
});
const currentUser = getAuthUser();

const isLoggedIn = !!currentUser;
const isAdmin = currentUser?.role === 'admin';

const customersLink = document.querySelector('a[href="customer.html"]');
const orderTableLink = document.querySelector('a[href="ordertable.html"]');
const trackOrdersLink = document.querySelector('a[href="order-tracking.html"]');
const wishlistLink = document.querySelector('a[href="wishlist.html"]');

if (customersLink) {
    customersLink.style.display = isLoggedIn ? '' : 'none';
}

if (orderTableLink) {
    orderTableLink.style.display = isLoggedIn ? '' : 'none';
}

if (trackOrdersLink) {
    trackOrdersLink.style.display = isLoggedIn ? '' : 'none';
}

if (wishlistLink) {
    wishlistLink.style.display = isLoggedIn ? '' : 'none';
}
// ======================================
// NAVBAR VISIBILITY CONTROL
// ======================================

function updateNavbarVisibility() {

    const currentUser = JSON.parse(localStorage.getItem('aromano_auth_user'));

    const isLoggedIn = !!currentUser;
    const isAdmin = currentUser?.role === 'admin';

    // Navbar links
    const ordersLink = document.querySelector('a[href="orders.html"]');
    const trackOrdersLink = document.querySelector('a[href="order-tracking.html"]');
    const customerLink = document.querySelector('a[href="customer.html"]');
    const orderTableLink = document.querySelector('a[href="ordertable.html"]');
    const wishlistLink = document.querySelector('a[href="wishlist.html"]');

    // ======================================
    // GUEST USER
    // ======================================

    if (!isLoggedIn) {

        // Hide customer features
        if (ordersLink) ordersLink.style.display = 'none';
        if (trackOrdersLink) trackOrdersLink.style.display = 'none';
        if (customerLink) customerLink.style.display = 'none';
        if (orderTableLink) orderTableLink.style.display = 'none';
        if (wishlistLink) wishlistLink.style.display = 'none';

        return;
    }

    // ======================================
    // LOGGED IN USERS
    // ======================================

    // Show normal customer pages
    if (ordersLink) ordersLink.style.display = '';
    if (trackOrdersLink) trackOrdersLink.style.display = '';

    if (customerLink) customerLink.style.display = '';
    if (orderTableLink) orderTableLink.style.display = '';
    if (wishlistLink) wishlistLink.style.display = '';
}

// Run automatically
document.addEventListener('DOMContentLoaded', updateNavbarVisibility);