/**
 * Timeline connector: the shared Google Calendar -> POST /api/internal/sync/events.
 *
 * Uses Calendar incremental sync. The first run lists events from
 * KMITS_TIMELINE_LOOKBACK_DAYS ago; later runs fetch only changes through the
 * stored sync token. Recurring events are expanded (singleEvents) and deleted
 * events arrive as cancelled. The sync token is stored only after every batch
 * of a listing was accepted, so a failed run resends the same changes, which
 * the backend treats as safe retries.
 *
 * Organization comes from a "[Organization] Title" prefix in the event title,
 * or from the shared extended property `kmitsOrganization` when set.
 */

var TIMELINE = {
  PATH: '/api/internal/sync/events',
  CONTROL_CHARS: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
  ID: /^[A-Za-z0-9_-]{1,1024}$/,
};

/** Entry point for the time-driven and calendar-update triggers. */
function syncTimeline() {
  return kmitsWithLock_('Timeline', function () {
    var config = kmitsConfig_();
    if (!config.calendarId) {
      console.log('Timeline: KMITS_CALENDAR_ID is empty; nothing to sync.');
      return null;
    }
    var stats = timelineRun_(config, Date.now() + KMITS.TIME_BUDGET_MS, false);
    console.log('Timeline: ' + JSON.stringify(stats));
    return stats;
  });
}

function timelineRun_(config, deadline, restarted) {
  var stats = { mode: '', pages: 0, events: 0, sent: 0, invalid: 0, done: false, error: '' };
  var syncToken = kmitsStateGet_('timeline:syncToken');
  var timeMin = kmitsStateGet_('timeline:timeMin');
  if (!syncToken && !timeMin) {
    timeMin = new Date(Date.now() - config.timelineLookbackDays * 86400000).toISOString();
    kmitsStateSet_('timeline:timeMin', timeMin);
  }
  stats.mode = syncToken ? 'incremental' : 'full';
  var pageToken = kmitsStateGet_('timeline:pageToken');

  while (true) {
    // The same parameters must be repeated with every page token.
    var options = { singleEvents: true, showDeleted: true, maxResults: 250 };
    if (syncToken) options.syncToken = syncToken; else options.timeMin = timeMin;
    if (pageToken) options.pageToken = pageToken;
    var page;
    try {
      page = Calendar.Events.list(config.calendarId, options);
    } catch (error) {
      var message = String(error && error.message || error);
      if (!restarted && /410|full sync|sync token/i.test(message)) {
        // Expired sync token: start over with a full listing.
        ['timeline:syncToken', 'timeline:pageToken', 'timeline:timeMin'].forEach(kmitsStateDelete_);
        return timelineRun_(config, deadline, true);
      }
      stats.error = 'Calendar listing failed: ' + message.slice(0, 300);
      return stats;
    }
    stats.pages++;
    var timeZone = page.timeZone || 'Asia/Jakarta';
    var events = [];
    (page.items || []).forEach(function (event) {
      var item = timelineEvent_(event, timeZone, config);
      if (item) events.push(item); else stats.invalid++;
    });
    stats.events += events.length;
    for (var start = 0; start < events.length; start += config.timelineBatchSize) {
      var batch = events.slice(start, start + config.timelineBatchSize);
      var result = kmitsPost_(config, TIMELINE.PATH, { protocolVersion: KMITS.PROTOCOL_VERSION, calendarId: config.calendarId, events: batch });
      if (result.kind !== 'ok') {
        // Keep the page token so the next run fetches this page again.
        stats.error = 'Event batch failed: ' + kmitsDescribe_(result);
        return stats;
      }
      stats.sent += batch.length;
      ((result.body && result.body.data && result.body.data.results) || []).forEach(function (item) {
        if (item.outcome === 'invalid' || item.outcome === 'conflict') {
          stats.invalid++;
          console.log('Timeline event ' + (item.eventId || '#' + item.index) + ': ' + item.outcome + (item.reason ? ' (' + item.reason + ')' : ''));
        }
      });
    }
    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
      kmitsStateSet_('timeline:pageToken', pageToken);
      if (Date.now() > deadline) return stats; // Resume from this page next run.
      continue;
    }
    if (page.nextSyncToken) kmitsStateSet_('timeline:syncToken', page.nextSyncToken);
    kmitsStateDelete_('timeline:pageToken');
    kmitsStateDelete_('timeline:timeMin');
    stats.done = true;
    return stats;
  }
}

function timelineClean_(value, max) {
  return String(value || '').replace(TIMELINE.CONTROL_CHARS, '').trim().slice(0, max);
}

/** Maps one Calendar event to the backend item, or null when it cannot be sent. */
function timelineEvent_(event, timeZone, config) {
  if (!event || !TIMELINE.ID.test(String(event.id || '')) || !event.updated) {
    console.log('Timeline: skipped an event without a usable ID or updated time.');
    return null;
  }
  var updated = new Date(event.updated).toISOString();
  if (event.status === 'cancelled') return { eventId: event.id, updated: updated, status: 'cancelled' };
  if (!event.start || !event.end) return null;

  var title = timelineClean_(event.summary, 10000);
  var organization = '';
  var prefixed = /^\[([^\]]{1,200})\]\s*(.*)$/.exec(title);
  if (prefixed) { organization = prefixed[1].trim(); title = prefixed[2].trim(); }
  var shared = event.extendedProperties && event.extendedProperties.shared;
  if (shared && shared.kmitsOrganization) organization = shared.kmitsOrganization;

  var allDay = !!event.start.date;
  var instant = function (edge) {
    return allDay ? timelineMidnight_(edge.date, timeZone) : new Date(edge.dateTime).toISOString();
  };
  return {
    eventId: event.id, updated: updated, status: 'confirmed',
    title: timelineClean_(title, 500) || '(Tanpa judul)',
    description: timelineClean_(event.description, config.timelineDescriptionMax),
    location: timelineClean_(event.location, 500),
    organization: timelineClean_(organization, 200),
    allDay: allDay, startAt: instant(event.start), endAt: instant(event.end),
  };
}

/** Midnight of a calendar date in the calendar's time zone, as a UTC instant. */
function timelineMidnight_(date, timeZone) {
  return Utilities.parseDate(date, timeZone, 'yyyy-MM-dd').toISOString();
}
