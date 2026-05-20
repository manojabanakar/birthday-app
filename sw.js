// ── BIRTHDAY APP SERVICE WORKER ──────────────
// This runs in the background even when the app is closed.
// It checks every day if any birthdays are coming up and fires notifications.

const CACHE_NAME = 'birthdays-v1';

// ── INSTALL ───────────────────────────────────
// Simple explanation: When the app is first installed, cache the key files
// so it works even with slow internet.
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(['/', '/index.html', '/manifest.json']);
    })
  );
});

// ── ACTIVATE ──────────────────────────────────
// Clean up old caches when a new version of the app is deployed.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────
// Serve cached files when offline, otherwise fetch from network.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// ── NOTIFICATION CLICK ────────────────────────
// Simple explanation: When user taps the notification, open the app.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // If app is already open, focus it
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// ── SCHEDULED NOTIFICATION CHECK ─────────────
// Simple explanation: The app sends a message to this worker with all birthdays.
// The worker checks if any notifications should fire today and shows them.
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_NOTIFICATIONS') {
    checkAndNotify(event.data.birthdays, event.data.userTimezone);
  }
});

// ── PUSH (from server) ────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Birthday Reminder', {
      body:    data.body || '',
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     data.tag || 'birthday',
      data:    data,
      vibrate: [200, 100, 200],
    })
  );
});

// ── CHECK BIRTHDAYS & NOTIFY ──────────────────
function checkAndNotify(birthdays, userTimezone) {
  if (!birthdays || !birthdays.length) return;

  const LEAD_DAYS = { on_day: 0, '1_day': 1, '2_days': 2, '1_week': 7 };

  for (const b of birthdays) {
    const leads = Array.isArray(b.leadTimes) ? b.leadTimes : [b.leadTime || 'on_day'];

    for (const lead of leads) {
      const offsetDays = LEAD_DAYS[lead] ?? 0;

      // Get today in user's timezone
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone || 'America/New_York',
        year: 'numeric', month: 'numeric', day: 'numeric',
      });
      const parts  = fmt.formatToParts(new Date());
      const get    = t => parseInt(parts.find(p => p.type === t).value);
      const [tY, tM, tD] = [get('year'), get('month'), get('day')];

      // Birthday this year in their timezone
      const fmt2   = new Intl.DateTimeFormat('en-US', {
        timeZone: b.timezone || 'Asia/Kolkata',
        year: 'numeric', month: 'numeric', day: 'numeric',
      });
      const parts2 = fmt2.formatToParts(new Date());
      const get2   = t => parseInt(parts2.find(p => p.type === t).value);
      const theirY = get2('year');

      // Target date = birthday minus lead days
      const bdayMs    = Date.UTC(theirY, b.month - 1, b.day);
      const targetMs  = bdayMs - offsetDays * 86400000;
      const targetDate= new Date(targetMs);
      const targetFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone || 'America/New_York',
        year: 'numeric', month: 'numeric', day: 'numeric',
      });
      const tParts = targetFmt.formatToParts(targetDate);
      const tGet   = t => parseInt(tParts.find(p => p.type === t).value);
      const [nY, nM, nD] = [tGet('year'), tGet('month'), tGet('day')];

      // Is today the notification day?
      if (tY === nY && tM === nM && tD === nD) {
        const MONTHS = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
        const dateStr = `${MONTHS[b.month - 1]} ${b.day}`;

        let body = '';
        if (offsetDays === 0)      body = `🎂 Today is ${b.name}'s birthday! (${dateStr})`;
        else if (offsetDays === 1) body = `🎁 ${b.name}'s birthday is tomorrow! (${dateStr})`;
        else if (offsetDays === 7) body = `📅 ${b.name}'s birthday is in 1 week! (${dateStr})`;
        else                       body = `🔔 ${b.name}'s birthday is in ${offsetDays} days! (${dateStr})`;

        self.registration.showNotification('Birthday Reminder 🎂', {
          body,
          icon:    '/icon-192.png',
          badge:   '/icon-192.png',
          tag:     `${b.name}-${lead}`,
          vibrate: [200, 100, 200],
          data:    { birthdayId: b.id },
        });
      }
    }
  }
}
