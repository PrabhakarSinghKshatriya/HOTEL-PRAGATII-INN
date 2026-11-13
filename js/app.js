
// Dynamic UPI QR: amount is refreshed from the current payable total.
function updateDynamicUpiQr(prefix, amount) {
  const qr = document.getElementById(`${prefix}UpiQr`);
  const payLink = document.getElementById(`${prefix}UpiPayLink`);
  const amountLabel = document.getElementById(`${prefix}UpiAmount`);

  if (!qr || !payLink || !amountLabel) return;

  const payable = Math.max(0, Number(amount) || 0);
  amountLabel.textContent =
    `Payable Amount: ₹${payable.toLocaleString('en-IN')}`;

  if (payable <= 0) {
    qr.removeAttribute('src');
    payLink.href = 'upi://pay?pa=paytm.s132lso@pty&pn=Hotel%20Pragati';
    return;
  }

  const upiParams = new URLSearchParams({
    pa: 'paytm.s132lso@pty',
    pn: 'Hotel Pragati',
    am: payable.toFixed(2),
    cu: 'INR'
  });

  const upiUri = `upi://pay?${upiParams.toString()}`;

  payLink.href = upiUri;
  qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiUri)}`;
  qr.alt = `UPI QR for ₹${payable.toFixed(2)}`;
}

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
function showModal(icon, title, message, refNo = null, phone = '') {
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

  let trackLink = overlay.querySelector('.btn-track-status');
  if (!trackLink) {
    trackLink = document.createElement('a');
    trackLink.className = 'btn-track-status';
    trackLink.style.cssText =
      'display:block;margin:0 auto 12px;padding:13px 20px;border-radius:8px;' +
      'background:#b88632;color:#fff;text-decoration:none;font-weight:600;' +
      'max-width:260px;';
    const closeButton = overlay.querySelector('.btn-modal-close');
    if (closeButton) closeButton.parentNode.insertBefore(trackLink, closeButton);
  }

  if (refNo && phone) {
    const params = new URLSearchParams({ ref: refNo, phone });
    trackLink.href = `track.html?${params.toString()}`;
    trackLink.textContent = title.toLowerCase().includes('order')
      ? 'Track Your Food Order'
      : 'Track Your Booking';
    trackLink.style.display = 'block';
  } else {
    trackLink.style.display = 'none';
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

  // Active room offer loaded from the public offers API.
  let roomOffer = null;

  function getOfferPrice(price, offer) {
    const base = Math.max(0, Number(price) || 0);
    if (!offer) return base;

    let discount = offer.discountType === 'percentage'
      ? Math.round(base * Number(offer.discountValue) / 100)
      : Math.round(Number(offer.discountValue));

    discount = Math.min(base, Math.max(0, discount));
    return base - discount;
  }

  // Update customer-facing room card prices when offers change.
  function renderRoomOfferPrices() {
    document.querySelectorAll('.room-list-card').forEach(card => {
      const amountEl = card.querySelector('.room-price .amount');
      if (!amountEl) return;

      const basePrice = Number(card.dataset.price);
      if (!Number.isFinite(basePrice)) return;

      const discountedPrice = getOfferPrice(basePrice, roomOffer);

      amountEl.innerHTML = discountedPrice < basePrice
        ? `<del>₹${basePrice.toLocaleString('en-IN')}</del>
           <strong>₹${discountedPrice.toLocaleString('en-IN')}</strong>`
        : `₹${basePrice.toLocaleString('en-IN')}`;
    });
  }

  // Live price calculation
  function calcPrice() {
    renderRoomOfferPrices();
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

    const discountedPrice = getOfferPrice(price, roomOffer);
    const originalSubtotal = price * nights;
    const subtotal = discountedPrice * nights;
    const discount = originalSubtotal - subtotal;
    const tax = Math.round(subtotal * 0.05);

    if (roomNameEl) roomNameEl.textContent = selectedRoom?.dataset.name || 'Select a room';
    if (nightEl) nightEl.textContent = `${nights} Night${nights > 1 ? 's' : ''}`;

    if (priceEl) {
      priceEl.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    }

    const offerRow = document.getElementById('roomOfferDiscount');
    if (offerRow) {
      offerRow.textContent = discount > 0
        ? `Offer discount: −₹${discount.toLocaleString('en-IN')}`
        : '';
      offerRow.style.display = discount > 0 ? '' : 'none';
    }

    const offerLabel = document.getElementById('roomOfferLabel');
    if (offerLabel) {
      offerLabel.textContent = discount > 0
        ? `${roomOffer.title} applied`
        : '';
    }

    if (taxEl) taxEl.textContent = `₹${tax.toLocaleString('en-IN')}`;
    if (totalEl) totalEl.textContent =
      `₹${(subtotal + tax).toLocaleString('en-IN')}`;

    updateDynamicUpiQr('booking', subtotal + tax);
  }

  async function refreshRoomOffer() {
    try {
      const response = await fetch('/api/offers/current', { cache: 'no-store' });
      if (!response.ok) throw new Error('Offers unavailable');

      const data = await response.json();
      roomOffer = data.success ? data.offers?.room || null : null;
      calcPrice();
    } catch (error) {
      console.warn('Room offer:', error);
    }
  }

  refreshRoomOffer();
  setInterval(refreshRoomOffer, 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshRoomOffer();
  });

  // Room card selection
  document.querySelectorAll('.room-list-card').forEach(card => {
    card.querySelector('.btn-select-room')?.addEventListener('click', () => {
      document.querySelectorAll('.room-list-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      calcPrice();
      loadAvailableRooms();
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

  // Keep only the two actual room types
  const roomCards = [...document.querySelectorAll('.room-list-card')];
  roomCards.forEach((card, index) => {
    if (index > 1) card.style.display = 'none';
  });

  // Load available room numbers for selected type and dates
  const roomSelect = document.getElementById('availableRoomNumber');
  const roomMessage = document.getElementById('roomAvailabilityMessage');
  let roomRequestController = null;

  async function loadAvailableRooms() {
    const selectedRoom = document.querySelector('.room-list-card.selected');
    const roomType = selectedRoom?.dataset.roomType;
    const checkin = checkinEl?.value;
    const checkout = checkoutEl?.value;

    if (!roomSelect || !roomType || !checkin || !checkout ||
        new Date(checkout) <= new Date(checkin)) {
      if (roomSelect) {
        roomSelect.innerHTML = '<option value="">Select valid dates first</option>';
        roomSelect.disabled = true;
      }
      if (roomMessage) roomMessage.textContent = 'Please select valid check-in and check-out dates.';
      return;
    }

    if (roomRequestController) roomRequestController.abort();
    roomRequestController = new AbortController();

    roomSelect.disabled = true;
    roomSelect.innerHTML = '<option value="">Checking availability...</option>';
    if (roomMessage) roomMessage.textContent = 'Checking available rooms...';

    try {
      const params = new URLSearchParams({ roomType, checkin, checkout });
      const response = await fetch(`/api/bookings/rooms?${params}`, {
        signal: roomRequestController.signal
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to check room availability');
      }

      const rooms = data.rooms || [];
      roomSelect.innerHTML = '';

      if (!rooms.length) {
        roomSelect.innerHTML = '<option value="">No rooms available</option>';
        roomSelect.disabled = true;
        if (roomMessage) roomMessage.textContent = `No ${roomType} rooms are available for these dates.`;
        return;
      }

      roomSelect.innerHTML = '<option value="">Choose your room number</option>';
      rooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room.roomNumber;
        option.textContent = `Room ${room.roomNumber}`;
        roomSelect.appendChild(option);
      });

      roomSelect.disabled = false;
      if (roomMessage) roomMessage.textContent = `${rooms.length} ${roomType} room(s) available. Select your preferred room.`;

    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Room availability:', error);
      roomSelect.innerHTML = '<option value="">Availability unavailable</option>';
      roomSelect.disabled = true;
      if (roomMessage) roomMessage.textContent = 'Unable to load rooms. Please try again.';
    }
  }

  // Refresh room numbers when room type or dates change
  ['checkin', 'checkout'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', loadAvailableRooms);
  });

  // Initial availability check
  loadAvailableRooms();

  // Submit booking to MongoDB
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedRoom = document.querySelector('.room-list-card.selected');
    if (!selectedRoom) {
      showToast('Please select a room first', 'error', '❌');
      return;
    }

    const name = document.getElementById('guestName')?.value.trim();
    let phone = document.getElementById('guestPhone')?.value.replace(/\D/g, '');
    const checkin = document.getElementById('checkin')?.value;
    const checkout = document.getElementById('checkout')?.value;
    const guests = Number(document.getElementById('guests')?.value || 1);
    const specialRequests = document.getElementById('specialRequests')?.value.trim() || '';
    const roomNumber = Number(roomSelect?.value);
    const selectedPaymentMethod = document.getElementById('bookingPaymentMethod')?.value || 'Cash';
    const paymentMethod = selectedPaymentMethod === 'Online' ? 'UPI' : 'Cash';
    const transactionId = document.getElementById('bookingTransactionId')?.value.trim() || '';

    if (paymentMethod === 'UPI' && !transactionId) {
      showToast('Please enter your UPI transaction ID.', 'error', '❌');
      document.getElementById('bookingTransactionId')?.focus();
      return;
    }

    // Accept +91 format as well as 10-digit mobile
    if (phone && phone.length === 12 && phone.startsWith('91')) {
      phone = phone.slice(2);
    }

    if (!name || !/^[0-9]{10}$/.test(phone || '')) {
      showToast('Please enter your name and a valid 10-digit mobile number.', 'error', '❌');
      return;
    }

    if (!roomNumber) {
      showToast('No room of this type is currently available.', 'error', '❌');
      return;
    }

    if (!checkin || !checkout || new Date(checkout) <= new Date(checkin)) {
      showToast('Please select valid check-in and check-out dates.', 'error', '❌');
      return;
    }

    const submitButton = form.querySelector('[type="submit"]');
    const originalText = submitButton?.textContent;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Submitting...';
    }

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          roomNumber,
          checkin,
          checkout,
          guests,
          specialRequests,
          paymentMethod,
          transactionId
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Booking could not be submitted.');
      }

      const booking = data.booking;
      showModal(
        '🎉',
        'Booking Request Received!',
        `Thank you, ${name}! Your ${booking.roomName} (Room ${booking.roomNumber}) booking request has been received. The hotel will confirm your booking shortly.`,
        booking.refNo,
        phone
      );

      form.reset();
      document.querySelectorAll('.room-list-card').forEach(card => card.classList.remove('selected'));
      if (firstRoom) firstRoom.classList.add('selected');
      setTimeout(calcPrice, 100);

    } catch (error) {
      showToast(error.message || 'Booking failed. Please try again.', 'error', '❌');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText || '✅ Confirm Booking';
      }
    }
  });
}


// ── Food Order / Cart: Database-driven menu ───────────
function initFoodOrder() {
  const grid = document.getElementById('menuGrid');
  const tabs = document.querySelector('.menu-tabs');
  const cartItemsEl = document.getElementById('cartItems');
  const emptyEl = document.getElementById('cartEmpty');
  const billSection = document.getElementById('billSection');
  const subtotalEl = document.getElementById('billSubtotal');
  const taxEl = document.getElementById('billTax');
  const totalEl = document.getElementById('billTotal');
  const placeOrderBtn = document.getElementById('placeOrderBtn');
  const tableSelect = document.getElementById('tableNo');

  if (!grid || !cartItemsEl) return;

  if (billSection && !document.getElementById('foodOfferDiscount')) {
    const offerLine = document.createElement('div');
    offerLine.id = 'foodOfferDiscount';
    offerLine.style.cssText = 'display:none;justify-content:space-between;margin:8px 0;color:#16803c;font-weight:600;';
    billSection.appendChild(offerLine);
  }

  const icons = {
    'Drinks': '🥤',
    'Pakoda': '🍘',
    'Snacks': '🍟',
    'Chinese Zone': '🍜',
    'Fried Rice': '🍚',
    'Roti / Paratha': '🫓',
    'Rice': '🍚',
    'Dal': '🥣',
    'Roll': '🌯',
    'Soup': '🥣',
    'Biryani': '🍛',
    'Anda Special': '🥚',
    'Sabzi': '🥘',
    'Chicken Curry': '🍗',
    'Papad / Salad / Raita': '🥗',
    'Thali': '🍱'
  };

  let menuItems = [];
  let foodOffer = null;

  function getFoodOfferPrice(price) {
    const base = Math.max(0, Number(price) || 0);
    if (!foodOffer) return base;

    let discount = foodOffer.discountType === 'percentage'
      ? Math.round(base * Number(foodOffer.discountValue) / 100)
      : Math.round(Number(foodOffer.discountValue));

    discount = Math.min(base, Math.max(0, discount));
    return base - discount;
  }

  const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  function getPrice(item, variant) {
    if (variant === 'half' || variant === 'full') {
      const price = item.priceOptions?.[variant];
      return Number.isFinite(price) ? price : null;
    }

    return Number.isFinite(item.price) ? item.price : null;
  }

  function getVariants(item) {
    const options = item.priceOptions || {};
    const variants = [];

    if (Number.isFinite(options.half)) {
      variants.push({ value: 'half', label: 'Half', price: options.half });
    }

    if (Number.isFinite(options.full)) {
      variants.push({ value: 'full', label: 'Full', price: options.full });
    }

    return variants;
  }

  function renderTabs() {
    if (!tabs) return;

    const categories = [...new Set(menuItems.map(item => item.category))];

    tabs.innerHTML = `
      <button class="menu-tab active" data-cat="all">
        <span class="tab-emoji">🍽️</span> All Items
      </button>
      ${categories.map(category => `
        <button class="menu-tab" data-cat="${escapeHTML(category)}">
          <span class="tab-emoji">${icons[category] || '🍽️'}</span>
          ${escapeHTML(category)}
        </button>
      `).join('')}
    `;
  }

  function renderMenu() {
    if (!menuItems.length) {
      grid.innerHTML =
        '<p class="menu-load-message">Menu is currently unavailable.</p>';
      return;
    }

    grid.innerHTML = menuItems.map(item => {
      const variants = getVariants(item);
      const singlePrice = Number.isFinite(item.price);
      const canOrder = item.isAvailable && (singlePrice || variants.length);

      let priceHTML = 'Price not available';

      if (variants.length) {
        priceHTML = variants.map(v => {
          const discounted = getFoodOfferPrice(v.price);

          return discounted < v.price
            ? `${v.label} <del>₹${v.price}</del> <strong>₹${discounted}</strong>`
            : `${v.label} ₹${v.price}`;
        }).join(' / ');
      } else if (singlePrice) {
        const discounted = getFoodOfferPrice(item.price);

        priceHTML = discounted < item.price
          ? `<del>₹${item.price}</del> <strong>₹${discounted}</strong>`
          : `₹${item.price}`;
      }

      const variantSelect = variants.length
        ? `<select class="menu-variant-select">
            ${variants.map(v => {
              const discounted = getFoodOfferPrice(v.price);
              const displayPrice = discounted < v.price
                ? `₹${v.price} (Offer: ₹${discounted})`
                : `₹${v.price}`;

              return `<option value="${v.value}">${v.label} — ${displayPrice}</option>`;
            }).join('')}
          </select>`
        : '';

      const ingredients = item.ingredients?.length
        ? `<p class="menu-ingredients">
            Includes: ${escapeHTML(item.ingredients.join(', '))}
           </p>`
        : '';

      return `
        <article class="menu-item ${canOrder ? '' : 'menu-item-unavailable'}"
          data-id="${escapeHTML(item.itemId)}"
          data-cat="${escapeHTML(item.category)}">

          <div class="menu-item-img">
            <span class="food-emoji">${escapeHTML(item.emoji || '🍽️')}</span>
            <span class="${item.isVegetarian ? 'veg-badge' : 'nonveg-badge'}"></span>
          </div>

          <div class="menu-item-body">
            <h4>
              ${escapeHTML(item.name)}
              <small class="menu-hindi-name">${escapeHTML(item.hindiName || '')}</small>
            </h4>

            ${item.description
              ? `<p>${escapeHTML(item.description)}</p>`
              : ''}

            ${ingredients}

            <div class="menu-item-footer">
              <div class="menu-price-wrap">
                <span class="menu-price">${priceHTML}</span>
                ${variantSelect}
              </div>

              <div class="btn-add-wrap" style="display:flex">
                <button class="btn-add btn-add-to-cart"
                  ${canOrder ? '' : 'disabled'}>
                  ${canOrder ? '+' : 'Unavailable'}
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
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
      const row = document.createElement('div');
      row.className = 'cart-item';

      row.innerHTML = `
        <div class="cart-item-emoji">${escapeHTML(item.emoji)}</div>

        <div class="cart-item-info">
          <h5>${escapeHTML(item.name)}</h5>
          <span>
            ${item.variant === 'single' ? 'Single' : escapeHTML(item.variant)}
            · ${getFoodOfferPrice(item.price) < item.price
              ? `<del>₹${item.price}</del> <strong>₹${getFoodOfferPrice(item.price)}</strong>`
              : `₹${item.price}`} each
          </span>
        </div>

        <div class="cart-item-right">
          <span class="cart-item-price">
            ₹${(getFoodOfferPrice(item.price) * item.qty).toLocaleString('en-IN')}
          </span>

          <div class="cart-qty-control">
            <button class="cart-qty-btn"
              data-id="${escapeHTML(item.id)}"
              data-action="dec">−</button>

            <span class="cart-qty-num">${item.qty}</span>

            <button class="cart-qty-btn"
              data-id="${escapeHTML(item.id)}"
              data-action="inc">+</button>
          </div>
        </div>
      `;

      cartItemsEl.appendChild(row);
    });

    const originalSubtotal = cart.reduce(
      (sum, item) => sum + item.price * item.qty, 0
    );

    const subtotal = cart.reduce(
      (sum, item) => sum + getFoodOfferPrice(item.price) * item.qty, 0
    );

    const discount = originalSubtotal - subtotal;
    const tax = Math.round(subtotal * 0.05);

    if (subtotalEl) subtotalEl.textContent =
      `₹${subtotal.toLocaleString('en-IN')}`;

    if (taxEl) taxEl.textContent =
      `₹${tax.toLocaleString('en-IN')}`;

    if (totalEl) totalEl.textContent =
      `₹${(subtotal + tax).toLocaleString('en-IN')}`;

    updateDynamicUpiQr('food', subtotal + tax);

    const offerLine = document.getElementById('foodOfferDiscount');
    if (offerLine) {
      offerLine.style.display = discount > 0 ? 'flex' : 'none';
      offerLine.textContent = discount > 0
        ? `${foodOffer?.title || 'Offer'} discount: −₹${discount.toLocaleString('en-IN')}`
        : '';
    }
  }

  function addToCart(card) {
    const item = menuItems.find(
      entry => entry.itemId === card.dataset.id
    );

    if (!item || !item.isAvailable) return;

    const variant =
      card.querySelector('.menu-variant-select')?.value || 'single';

    const price = getPrice(item, variant);

    if (price === null) {
      showToast('Is item ka price available nahi hai.', 'error', '⚠️');
      return;
    }

    const id = `${item.itemId}::${variant}`;
    const cart = getCart();
    const existing = cart.find(entry => entry.id === id);

    if (existing) {
      existing.qty++;
    } else {
      cart.push({
        id,
        itemId: item.itemId,
        name: item.name,
        variant,
        price,
        emoji: item.emoji || '🍽️',
        qty: 1
      });
    }

    saveCart(cart);
    renderCart();

    showToast(
      `${item.name} (${variant}) added to order`,
      'success',
      item.emoji || '🍽️'
    );
  }

  if (tabs) {
    tabs.addEventListener('click', event => {
      const tab = event.target.closest('.menu-tab');
      if (!tab) return;

      tabs.querySelectorAll('.menu-tab').forEach(button =>
        button.classList.remove('active')
      );

      tab.classList.add('active');

      const category = tab.dataset.cat;

      grid.querySelectorAll('.menu-item').forEach(card => {
        card.style.display =
          category === 'all' || card.dataset.cat === category
            ? ''
            : 'none';
      });
    });
  }

  grid.addEventListener('click', event => {
    const button = event.target.closest('.btn-add-to-cart');

    if (button && !button.disabled) {
      addToCart(button.closest('.menu-item'));
    }
  });

  cartItemsEl.addEventListener('click', event => {
    const button = event.target.closest('.cart-qty-btn');
    if (!button) return;

    const cart = getCart();
    const index = cart.findIndex(
      item => item.id === button.dataset.id
    );

    if (index === -1) return;

    if (button.dataset.action === 'inc') {
      cart[index].qty++;
    } else {
      cart[index].qty--;

      if (cart[index].qty <= 0) {
        cart.splice(index, 1);
      }
    }

    saveCart(cart);
    renderCart();
  });

  if (placeOrderBtn) {
    placeOrderBtn.addEventListener('click', async () => {
      const cart = getCart();
      if (!cart.length) return;

      const customerName =
        document.getElementById('customerName')?.value.trim();

      let customerPhone =
        document.getElementById('customerPhone')?.value.replace(/\D/g, '') || '';

      // Accept +91 format as well as 10-digit mobile
      if (customerPhone.length === 12 && customerPhone.startsWith('91')) {
        customerPhone = customerPhone.slice(2);
      }

      const table = tableSelect?.value || '';
      const selectedPaymentMethod = document.getElementById('foodPaymentMethod')?.value || 'Cash';
      const paymentMethod = selectedPaymentMethod === 'Online' ? 'UPI' : 'Cash';
      const transactionId = document.getElementById('foodTransactionId')?.value.trim() || '';

      if (paymentMethod === 'UPI' && !transactionId) {
        showToast('Please enter your UPI transaction ID.', 'error', '❌');
        document.getElementById('foodTransactionId')?.focus();
        return;
      }

      if (!table) {
        showToast('Please select a table or room.', 'error', '❌');
        tableSelect?.focus();
        return;
      }

      if (!customerName) {
        showToast('Please enter customer name.', 'error', '❌');
        document.getElementById('customerName')?.focus();
        return;
      }

      if (!/^[0-9]{10}$/.test(customerPhone || '')) {
        showToast(
          'Please enter a valid 10-digit mobile number.',
          'error',
          '❌'
        );
        document.getElementById('customerPhone')?.focus();
        return;
      }

      const originalText = placeOrderBtn.textContent;
      placeOrderBtn.disabled = true;
      placeOrderBtn.textContent = 'Placing Order...';

      try {
        const response = await fetch('/api/food/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName,
            customerPhone,
            table,
            paymentMethod,
            transactionId,
            items: cart.map(item => ({
              itemId: item.itemId,
              variant: item.variant,
              qty: Number(item.qty)
            }))
          })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Unable to place order.');
        }

        saveCart([]);
        renderCart();

        showModal(
          '��️',
          'Order Placed!',
          `Thank you, ${customerName}! Your order for ${table} has been sent to the kitchen. ${data.message}`,
          data.order.refNo,
          customerPhone
        );

      } catch (error) {
        showToast(
          error.message || 'Order failed. Please try again.',
          'error',
          '❌'
        );
      } finally {
        placeOrderBtn.disabled = getCart().length === 0;
        placeOrderBtn.textContent =
          originalText || '🍽️ Place Order';
      }
    });
  }

  // Load current active food offer.
  async function refreshFoodOffer() {
    try {
      const response = await fetch('/api/offers/current', { cache: 'no-store' });
      if (!response.ok) throw new Error('Offers unavailable');

      const data = await response.json();
      foodOffer = data.success ? data.offers?.food || null : null;
      renderMenu();
      renderCart();
    } catch (error) {
      console.warn('Food offer:', error);
    }
  }

  refreshFoodOffer();
  setInterval(refreshFoodOffer, 5000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshFoodOffer();
  });

  // Load current menu and reconcile old localStorage cart entries.
  fetch('/api/food/menu')
    .then(response => {
      if (!response.ok) throw new Error('Menu request failed');
      return response.json();
    })
    .then(data => {
      if (!data.success || !Array.isArray(data.items)) {
        throw new Error('Invalid menu response');
      }

      menuItems = data.items;

      const validCart = getCart().filter(cartItem => {
        const menuItem = menuItems.find(
          item => item.itemId === cartItem.itemId
        );

        if (!menuItem || !menuItem.isAvailable) return false;

        const variant = cartItem.variant || 'single';
        const price = getPrice(menuItem, variant);

        if (price === null) return false;

        // Refresh cached cart prices from the current database menu.
        cartItem.price = price;
        return true;
      });

      saveCart(validCart);
      renderTabs();
      renderMenu();
      renderCart();
    })
    .catch(error => {
      console.error('Load food menu:', error);
      grid.innerHTML =
        '<p class="menu-load-message">Unable to load menu. Please refresh the page.</p>';

      showToast(
        'Menu load nahi ho saka. Please refresh.',
        'error',
        '⚠️'
      );
    });
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
