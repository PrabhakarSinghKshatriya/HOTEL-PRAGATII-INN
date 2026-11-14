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


  // Live customer reviews
  const reviewsContainer = document.getElementById('homeLatestReviews');
  const averageEl = document.getElementById('reviewsAverage');
  const countEl = document.getElementById('reviewsTotal');
  const heroRating = document.getElementById('homeOverallRating');
  const heroCount = document.getElementById('homeReviewCount');

  function reviewEsc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  }

  async function refreshHomeReviews() {
    if (!reviewsContainer) return;

    try {
      const response = await fetch(
        `${window.API_BASE_URL}/api/customer/feedback/public`,
        { cache: 'no-store' }
      );
      const data = await response.json();

      if (!response.ok || !data.success) throw new Error('Reviews unavailable');

      const average = Number(data.averageRating || 0).toFixed(1);
      const total = Number(data.totalReviews || 0);

      if (averageEl) averageEl.textContent = total ? average : '—';
      if (countEl) countEl.textContent = total;
      if (heroRating) heroRating.textContent = total ? `${average} / 5` : 'No ratings yet';
      if (heroCount) heroCount.textContent = `${total} Customer Reviews`;

      if (!data.latest?.length) {
        reviewsContainer.innerHTML =
          '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);">Be the first to share your experience with us!</p>';
        return;
      }

      reviewsContainer.innerHTML = data.latest.map(review => {
        const rating = Math.max(0, Math.min(5, Number(review.rating) || 0));
        const name = review.customerName || 'Guest';
        const comment = review.comment || 'Rated their experience at Hotel Pragati.';
        const initial = reviewEsc(name.charAt(0).toUpperCase());

        return `
          <article style="background:white;border-radius:var(--radius-lg);padding:25px;border:1px solid var(--border);box-shadow:var(--shadow);">
            <div style="color:var(--gold);font-size:1.15rem;margin-bottom:12px;">
              ${'★'.repeat(rating)}${'☆'.repeat(5-rating)}
            </div>
            <p style="font-size:.9rem;color:var(--text-light);line-height:1.8;margin-bottom:18px;overflow-wrap:anywhere;">
              ${reviewEsc(comment)}
            </p>
            <div style="display:flex;align-items:center;gap:12px;">
              <div style="width:40px;height:40px;flex-shrink:0;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;">
                ${initial}
              </div>
              <div>
                <div style="font-weight:600;color:var(--espresso);">${reviewEsc(name)}</div>
                <div style="font-size:.75rem;color:var(--text-light);">
                  ${review.createdAt ? new Date(review.createdAt).toLocaleDateString('en-IN') : 'Guest Review'}
                </div>
              </div>
            </div>
          </article>`;
      }).join('');
    } catch (error) {
      console.error('Homepage reviews:', error);
      if (reviewsContainer) {
        reviewsContainer.innerHTML =
          '<p style="grid-column:1/-1;text-align:center;">Reviews are temporarily unavailable.</p>';
      }
    }
  }

  refreshHomeReviews();
  setInterval(refreshHomeReviews, 60000);

  refreshHomeAvailability();
  setInterval(refreshHomeAvailability, 30000);
})();
