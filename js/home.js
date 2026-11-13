(() => {
  const totalEl = document.getElementById('homeAvailableTotal');
  const acEl = document.getElementById('homeAcAvailability');
  const nonAcEl = document.getElementById('homeNonAcAvailability');

  if (!totalEl || !acEl || !nonAcEl) return;

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function refreshHomeAvailability() {
    const checkinDate = new Date();
    checkinDate.setHours(0, 0, 0, 0);

    const checkoutDate = new Date(checkinDate);
    checkoutDate.setDate(checkoutDate.getDate() + 1);

    const params = new URLSearchParams({
      checkin: localDateString(checkinDate),
      checkout: localDateString(checkoutDate)
    });

    try {
      const response = await fetch(
        `${window.API_BASE_URL}/api/bookings/availability-summary?${params}`,
        { cache: 'no-store' }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Availability unavailable');
      }

      const available = data.available;

      totalEl.textContent = `${available.total} Rooms`;
      acEl.textContent = `${available.AC} AC rooms available`;
      nonAcEl.textContent = `${available.NonAC} Non-AC rooms available`;

      totalEl.title = `Updated: ${new Date(data.updatedAt).toLocaleTimeString()}`;
    } catch (error) {
      console.error('Homepage room availability:', error);
      totalEl.textContent = 'Unavailable';
      acEl.textContent = 'Availability temporarily unavailable';
      nonAcEl.textContent = 'Availability temporarily unavailable';
    }
  }

  refreshHomeAvailability();
  setInterval(refreshHomeAvailability, 30000);
})();
