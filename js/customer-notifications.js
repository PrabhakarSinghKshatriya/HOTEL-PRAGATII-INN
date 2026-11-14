(() => {
  const PHONE_KEY = 'pragati_customer_phone';
  const API = () => window.API_BASE_URL || '';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  function initCustomerNotifications() {
    const nav = document.querySelector('.nav-links');
    if (!nav || document.getElementById('customerNotificationBell')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'customer-notification-wrap';
    wrapper.innerHTML = `
      <button type="button" id="customerNotificationBell"
        class="customer-notification-bell"
        aria-label="Customer notifications" aria-expanded="false">
        🔔 <span class="customer-notification-count" hidden>0</span>
      </button>
      <div class="customer-notification-panel" hidden>
        <div class="customer-notification-heading">
          <strong>Notifications</strong>
          <button type="button" class="customer-mark-all">Mark all read</button>
        </div>
        <div class="customer-notification-list">
          <p class="customer-notification-empty">Enter your mobile number to view notifications.</p>
        </div>
      </div>
    `;

    const navbar = nav.closest('.navbar');
    const hamburger = navbar?.querySelector('.hamburger');

    if (navbar) {
      navbar.insertBefore(wrapper, hamburger || null);
    } else {
      const cart = nav.querySelector('.nav-cart-btn');
      nav.insertBefore(wrapper, cart || null);
    }

    const bell = wrapper.querySelector('button');
    const panel = wrapper.querySelector('.customer-notification-panel');
    const list = wrapper.querySelector('.customer-notification-list');
    const badge = wrapper.querySelector('.customer-notification-count');

    let phone = localStorage.getItem(PHONE_KEY) || '';
    let busy = false;

    function setCount(count) {
      const value = Math.max(0, Number(count) || 0);
      badge.textContent = value > 99 ? '99+' : value;
      badge.hidden = value === 0;
    }

    function render(items) {
      if (!items.length) {
        list.innerHTML = '<p class="customer-notification-empty">No notifications yet.</p>';
        return;
      }

      list.innerHTML = items.map(item => `
        <article class="customer-notification-item ${item.read ? '' : 'unread'}"
          data-id="${esc(item._id)}">
          <div class="customer-notification-item-title">
            ${esc(item.title)}
            ${item.read ? '' : '<span class="notification-new">NEW</span>'}
          </div>
          <p>${esc(item.message)}</p>
          <small>${esc(new Date(item.createdAt).toLocaleString('en-IN'))}</small>
          ${item.read ? '' : '<button type="button" class="notification-read-btn">Mark as read</button>'}
        </article>
      `).join('');
    }

    async function load() {
      if (busy || !/^[0-9]{10}$/.test(phone)) return;

      busy = true;
      try {
        const response = await fetch(
          `${API()}/api/notifications/customer?phone=${encodeURIComponent(phone)}`,
          { cache: 'no-store' }
        );

        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message);

        setCount(data.unreadCount);
        render(data.notifications || []);
      } catch (error) {
        console.warn('Customer notifications:', error);
      } finally {
        busy = false;
      }
    }

    function getPhone() {
      const entered = prompt('Enter your registered 10-digit mobile number:', phone);
      if (entered === null) return false;

      const value = entered.trim();
      if (!/^[0-9]{10}$/.test(value)) {
        alert('Please enter a valid 10-digit mobile number.');
        return false;
      }

      phone = value;
      localStorage.setItem(PHONE_KEY, phone);
      return true;
    }

    bell.addEventListener('click', async () => {
      if (!/^[0-9]{10}$/.test(phone) && !getPhone()) return;

      const opening = panel.hidden;
      panel.hidden = !opening;
      bell.setAttribute('aria-expanded', String(opening));

      if (opening) await load();
    });

    wrapper.querySelector('.customer-mark-all').addEventListener('click', async () => {
      if (!phone) return;

      try {
        const response = await fetch(
          `${API()}/api/notifications/read-all?phone=${encodeURIComponent(phone)}`,
          { method: 'PATCH' }
        );
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message);
        await load();
      } catch (error) {
        alert(error.message || 'Unable to update notifications.');
      }
    });

    list.addEventListener('click', async event => {
      const button = event.target.closest('.notification-read-btn');
      if (!button) return;

      const item = button.closest('[data-id]');
      if (!item) return;

      try {
        const response = await fetch(
          `${API()}/api/notifications/${encodeURIComponent(item.dataset.id)}/read?phone=${encodeURIComponent(phone)}`,
          { method: 'PATCH' }
        );

        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message);
        await load();
      } catch (error) {
        alert(error.message || 'Unable to update notification.');
      }
    });

    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) {
        panel.hidden = true;
        bell.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('storage', event => {
      if (event.key === PHONE_KEY) {
        phone = event.newValue || '';
        load();
      }
    });

    if (phone) load();
    setInterval(load, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomerNotifications);
  } else {
    initCustomerNotifications();
  }
})();
