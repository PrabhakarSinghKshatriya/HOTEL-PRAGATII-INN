/* =====================================================
   HOTEL PRAGATI — Main JavaScript
   Handles: Cart, Booking, Toasts, Navigation
   ===================================================== */

// ── Cart State ──────────────────────────────────────
const CART_KEY = 'pragati_cart';

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadges();
}

function updateCartBadges() {
  const cart = getCart();
  const count = cart.reduce((s, i) => s + i.qty, 0);
  document.querySelectorAll('.cart-badge').forEach(b => {
    b.textContent = count;
    b.style.display = count ? 'flex' : 'none';
  });
}

// ── Toast Notifications ──────────────────────────────
function showToast(message, type = 'info', icon = '✨') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Navigation ───────────────────────────────────────
function initNav() {
  // Scroll effect
  window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
  });

  // Hamburger
  const hamburger = document.querySelector('.hamburger');
  const navLinks  = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    // Close on link click
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // Active link
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === current || (current === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  // Update cart badge
  updateCartBadges();
}

// ── Modal ─────────────────────────────────────────────
function showModal(icon, title, message, refNo = null) {
  const overlay = document.getElementById('successModal');
  if (!overlay) return;
  overlay.querySelector('.modal-icon').textContent = icon;
  overlay.querySelector('.modal-title').textContent = title;
  overlay.querySelector('.modal-msg').textContent = message;
  const refEl = overlay.querySelector('.modal-ref');
  if (refNo && refEl) {
    refEl.style.display = 'block';
    refEl.querySelector('span').textContent = refNo;
  } else if (refEl) {
    refEl.style.display = 'none';
  }
  overlay.classList.add('open');
}

function closeModal() {
  const overlay = document.getElementById('successModal');
  if (overlay) overlay.classList.remove('open');
}

// ── Booking Form ─────────────────────────────────────
function initBookingForm() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  // Date defaults
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const checkinEl  = document.getElementById('checkin');
  const checkoutEl = document.getElementById('checkout');
  if (checkinEl)  { checkinEl.min = today; checkinEl.value = today; }
  if (checkoutEl) { checkoutEl.min = tomorrow; checkoutEl.value = tomorrow; }

  // Live price calculation
  function calcPrice() {
    const selectedRoom = document.querySelector('.room-list-card.selected');
    const checkin  = new Date(checkinEl?.value);
    const checkout = new Date(checkoutEl?.value);
    const nights   = Math.max(1, Math.round((checkout - checkin) / 86400000));
    const guests   = parseInt(document.getElementById('guests')?.value) || 1;
    const price    = selectedRoom ? parseInt(selectedRoom.dataset.price) : 1200;

    const nightEl  = document.getElementById('sumNights');
    const priceEl  = document.getElementById('sumPrice');
    const taxEl    = document.getElementById('sumTax');
    const totalEl  = document.getElementById('sumTotal');
    const roomNameEl = document.getElementById('sumRoomName');

    if (roomNameEl) roomNameEl.textContent = selectedRoom?.dataset.name || 'Select a room';
    if (nightEl)  nightEl.textContent = `${nights} Night${nights > 1 ? 's' : ''}`;
    if (priceEl)  priceEl.textContent = `₹${(price * nights).toLocaleString()}`;
    const tax = Math.round(price * nights * 0.12);
    if (taxEl)    taxEl.textContent = `₹${tax.toLocaleString()}`;
    if (totalEl)  totalEl.textContent = `₹${(price * nights + tax).toLocaleString()}`;
  }

  // Room card selection
  document.querySelectorAll('.room-list-card').forEach(card => {
    card.querySelector('.btn-select-room')?.addEventListener('click', () => {
      document.querySelectorAll('.room-list-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      calcPrice();
      // Scroll to form on mobile
      if (window.innerWidth < 900) {
        document.querySelector('.booking-sidebar')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Select first room by default
  const firstRoom = document.querySelector('.room-list-card');
  if (firstRoom) { firstRoom.classList.add('selected'); calcPrice(); }

  // Recalculate on date/guest change
  ['checkin','checkout','guests'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', calcPrice);
  });

  // Form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedRoom = document.querySelector('.room-list-card.selected');
    if (!selectedRoom) { showToast('Please select a room first', 'error', '❌'); return; }

    const name      = document.getElementById('guestName')?.value;
    const phone     = document.getElementById('guestPhone')?.value;
    const checkin   = document.getElementById('checkin')?.value;
    const checkout  = document.getElementById('checkout')?.value;
    const roomName  = selectedRoom.dataset.name;
    const refNo     = 'PRG-' + Date.now().toString().slice(-6);

    // Save booking
    const bookings = JSON.parse(localStorage.getItem('pragati_bookings') || '[]');
    bookings.push({ refNo, name, phone, checkin, checkout, roomName, timestamp: new Date().toISOString() });
    localStorage.setItem('pragati_bookings', JSON.stringify(bookings));

    showModal('🎉', 'Booking Confirmed!',
      `Thank you, ${name}! Your room "${roomName}" has been booked from ${checkin} to ${checkout}. We look forward to welcoming you!`,
      refNo
    );
    form.reset();
    document.querySelectorAll('.room-list-card').forEach(c => c.classList.remove('selected'));
    if (firstRoom) firstRoom.classList.add('selected');
    setTimeout(calcPrice, 100);
  });
}

// ── Food Order / Cart ─────────────────────────────────
function initFoodOrder() {
  const cartItemsEl  = document.getElementById('cartItems');
  const emptyEl      = document.getElementById('cartEmpty');
  const billSection  = document.getElementById('billSection');
  const subtotalEl   = document.getElementById('billSubtotal');
  const taxEl        = document.getElementById('billTax');
  const totalEl      = document.getElementById('billTotal');
  const placeOrderBtn= document.getElementById('placeOrderBtn');
  const tableSelect  = document.getElementById('tableNo');

  if (!cartItemsEl) return;

  // Menu tabs
  document.querySelectorAll('.menu-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.dataset.cat;
      document.querySelectorAll('.menu-item').forEach(item => {
        item.style.display = (cat === 'all' || item.dataset.cat === cat) ? 'block' : 'none';
      });
    });
  });

  // Add to cart buttons
  document.querySelectorAll('.btn-add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      const card   = btn.closest('.menu-item');
      const id     = card.dataset.id;
      const name   = card.dataset.name;
      const price  = parseInt(card.dataset.price);
      const emoji  = card.dataset.emoji;

      let cart = getCart();
      const existing = cart.find(i => i.id === id);
      if (existing) {
        existing.qty++;
      } else {
        cart.push({ id, name, price, emoji, qty: 1 });
      }
      saveCart(cart);
      updateMenuButtons();
      renderCart();
      showToast(`${name} added to order`, 'success', emoji);
    });
  });

  // Mobile order panel toggle
  const toggle = document.querySelector('.order-panel-toggle');
  const panel  = document.querySelector('.order-panel');
  if (toggle && panel) {
    toggle.addEventListener('click', () => panel.classList.toggle('open'));
  }

  // Place order
  if (placeOrderBtn) {
    placeOrderBtn.addEventListener('click', () => {
      const cart = getCart();
      if (!cart.length) return;
      const table = tableSelect?.value || 'T1';
      const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      const total    = Math.round(subtotal * 1.05);
      const refNo    = 'ORD-' + Date.now().toString().slice(-5);

      // Save order
      const orders = JSON.parse(localStorage.getItem('pragati_orders') || '[]');
      orders.push({ refNo, table, items: [...cart], total, timestamp: new Date().toISOString() });
      localStorage.setItem('pragati_orders', JSON.stringify(orders));

      saveCart([]);
      renderCart();
      updateMenuButtons();
      showModal('🍽️', 'Order Placed!',
        `Your order for ${table} has been sent to the kitchen. Estimated time: 15–20 minutes. Thank you!`,
        refNo
      );
    });
  }

  function renderCart() {
    const cart = getCart();
    cartItemsEl.innerHTML = '';

    if (!cart.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      if (billSection) billSection.style.display = 'none';
      if (placeOrderBtn) placeOrderBtn.disabled = true;
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (billSection) billSection.style.display = 'block';
    if (placeOrderBtn) placeOrderBtn.disabled = false;

    cart.forEach(item => {
      const el = document.createElement('div');
      el.className = 'cart-item';
      el.innerHTML = `
        <div class="cart-item-emoji">${item.emoji}</div>
        <div class="cart-item-info">
          <h5>${item.name}</h5>
          <span>₹${item.price} each</span>
        </div>
        <div class="cart-item-right">
          <span class="cart-item-price">₹${(item.price * item.qty).toLocaleString()}</span>
          <div class="cart-qty-control">
            <button class="cart-qty-btn" data-id="${item.id}" data-action="dec">−</button>
            <span class="cart-qty-num">${item.qty}</span>
            <button class="cart-qty-btn" data-id="${item.id}" data-action="inc">+</button>
          </div>
        </div>
      `;
      cartItemsEl.appendChild(el);
    });

    // Qty buttons
    cartItemsEl.querySelectorAll('.cart-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let cart = getCart();
        const id     = btn.dataset.id;
        const action = btn.dataset.action;
        const idx    = cart.findIndex(i => i.id === id);
        if (idx === -1) return;
        if (action === 'inc') cart[idx].qty++;
        else {
          cart[idx].qty--;
          if (cart[idx].qty <= 0) cart.splice(idx, 1);
        }
        saveCart(cart);
        renderCart();
        updateMenuButtons();
      });
    });

    // Update bill
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const tax      = Math.round(subtotal * 0.05);
    const total    = subtotal + tax;
    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toLocaleString()}`;
    if (taxEl)      taxEl.textContent      = `₹${tax.toLocaleString()}`;
    if (totalEl)    totalEl.textContent    = `₹${total.toLocaleString()}`;
  }

  function updateMenuButtons() {
    const cart = getCart();
    document.querySelectorAll('.menu-item').forEach(card => {
      const id = card.dataset.id;
      const inCart = cart.find(i => i.id === id);
      const addBtn   = card.querySelector('.btn-add-wrap');
      const qtyCtrl = card.querySelector('.menu-qty-ctrl');
      const qtyNum  = card.querySelector('.menu-qty-num');
      card.classList.toggle('in-cart', !!inCart);
      if (addBtn)   addBtn.style.display   = inCart ? 'none' : 'flex';
      if (qtyCtrl)  qtyCtrl.style.display  = inCart ? 'flex' : 'none';
      if (qtyNum && inCart) qtyNum.textContent = inCart.qty;
    });
  }

  // Menu qty controls (on menu card)
  document.querySelectorAll('.menu-qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card   = btn.closest('.menu-item');
      const id     = card.dataset.id;
      const action = btn.dataset.action;
      let cart = getCart();
      const idx = cart.findIndex(i => i.id === id);
      if (idx === -1) return;
      if (action === 'inc') cart[idx].qty++;
      else {
        cart[idx].qty--;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
      }
      saveCart(cart);
      updateMenuButtons();
      renderCart();
    });
  });

  renderCart();
  updateMenuButtons();
}

// ── DOMContentLoaded ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initBookingForm();
  initFoodOrder();

  // Modal close
  document.getElementById('successModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.querySelector('.btn-modal-close')?.addEventListener('click', closeModal);
});
