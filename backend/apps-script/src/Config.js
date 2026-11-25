/**
 * KM ITS connectors: shared configuration, HTTP and state helpers.
 *
 * Every setting lives in Script Properties (Project Settings > Script
 * Properties). Nothing secret is written in code. See README.md.
 */

var KMITS = {
  PROTOCOL_VERSION: 1,
  // Apps Script stops a run after 6 minutes; leave room to save state.
  TIME_BUDGET_MS: 4.5 * 60 * 1000,
  STATE_PREFIX: 'state:',
};

/** Reads and validates the Script Properties used by every connector. */
function kmitsConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var get = function (key) { return String(properties.getProperty(key) || '').trim(); };
  var json = function (key, fallback) {
    var raw = get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (error) { throw new Error(key + ' is not valid JSON.'); }
  };
  var config = {
    backendUrl: get('KMITS_BACKEND_URL').replace(/\/+$/, ''),
    secret: get('KMITS_INGESTION_SECRET'),
    archiveStreams: json('KMITS_ARCHIVE_STREAMS', []),
    calendarId: get('KMITS_CALENDAR_ID'),
    timelineLookbackDays: Number(get('KMITS_TIMELINE_LOOKBACK_DAYS') || 365),
    timelineBatchSize: Number(get('KMITS_TIMELINE_BATCH_SIZE') || 50),
    timelineDescriptionMax: Number(get('KMITS_TIMELINE_DESCRIPTION_MAX') || 8000),
    formId: get('KMITS_FORM_ID'),
    formFields: json('KMITS_FORM_FIELDS', {}),
    articlesBatchSize: Number(get('KMITS_ARTICLES_BATCH_SIZE') || 20),
  };
  if (!/^https:\/\/[^\s/]+/.test(config.backendUrl)) {
    throw new Error('KMITS_BACKEND_URL must be the HTTPS origin of the backend, for example https://kmits.example.');
  }
  if (config.secret.length < 32) throw new Error('KMITS_INGESTION_SECRET must contain the 32+ character secret from `pnpm integration:secret`.');
  if (!Array.isArray(config.archiveStreams)) throw new Error('KMITS_ARCHIVE_STREAMS must be a JSON array.');
  config.archiveStreams.forEach(function (stream) {
    if (!stream || !kmitsIsId_(stream.streamId) || !kmitsIsId_(stream.folderId)) {
      throw new Error('Each KMITS_ARCHIVE_STREAMS entry needs streamId and folderId, matching the backend archive.sources.');
    }
  });
  return config;
}

function kmitsIsId_(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

/**
 * POSTs JSON to the backend. Returns { status, body, kind } where kind is:
 * ok (2xx), rejected (4xx that a resend cannot fix), auth (401/403),
 * or retry (network error, 429, 5xx).
 */
function kmitsPost_(config, path, payload) {
  var response;
  try {
    response = UrlFetchApp.fetch(config.backendUrl + path, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      headers: { Authorization: 'Bearer ' + config.secret },
      muteHttpExceptions: true,
      followRedirects: false,
    });
  } catch (error) {
    return { status: 0, body: null, kind: 'retry', error: String(error && error.message || error) };
  }
  var status = response.getResponseCode();
  var body = null;
  try { body = JSON.parse(response.getContentText()); } catch (ignored) { body = null; }
  var kind = status >= 200 && status < 300 ? 'ok'
    : status === 401 || status === 403 ? 'auth'
    : status === 429 || status >= 500 || status === 0 ? 'retry'
    : 'rejected';
  return { status: status, body: body, kind: kind };
}

/** A short description of a failed response for the execution log. */
function kmitsDescribe_(result) {
  var code = result.body && result.body.error && result.body.error.code;
  return 'HTTP ' + result.status + (code ? ' ' + code : '') + (result.error ? ' ' + result.error : '');
}

// ---- Durable state (Script Properties, prefixed) ---------------------------

function kmitsStateGet_(key) {
  return PropertiesService.getScriptProperties().getProperty(KMITS.STATE_PREFIX + key);
}

function kmitsStateSet_(key, value) {
  PropertiesService.getScriptProperties().setProperty(KMITS.STATE_PREFIX + key, String(value));
}

function kmitsStateDelete_(key) {
  PropertiesService.getScriptProperties().deleteProperty(KMITS.STATE_PREFIX + key);
}

/** Every state key (without the prefix) that starts with `prefix`. */
function kmitsStateKeys_(prefix) {
  var keys = PropertiesService.getScriptProperties().getKeys();
  var full = KMITS.STATE_PREFIX + prefix;
  return keys.filter(function (key) { return key.indexOf(full) === 0; })
    .map(function (key) { return key.slice(KMITS.STATE_PREFIX.length); });
}

function kmitsHex_(digest) {
  return digest.map(function (byte) { return ('0' + (byte & 0xff).toString(16)).slice(-2); }).join('');
}

function kmitsSha256Text_(text) {
  return kmitsHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

function kmitsSha256Bytes_(bytes) {
  return kmitsHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
}

/** Runs `task` under the script lock so overlapping triggers never interleave. */
function kmitsWithLock_(name, task) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log(name + ': another run is still in progress; skipped.');
    return null;
  }
  try { return task(); } finally { lock.releaseLock(); }
}
