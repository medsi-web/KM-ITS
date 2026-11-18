/**
 * Archive connector: registered ministry Drive folders -> POST /api/internal/sync/archives.
 *
 * Each document is one Markdown file with YAML frontmatter (see docs/archive.md)
 * next to its PDF in the same folder. Every run lists each folder, sends one
 * observation per metadata file whose state changed, and reports metadata
 * files that disappeared as MISSING. Unchanged files send nothing.
 *
 * Sequences are max(last + 1, now in microseconds), so they keep increasing
 * even if the stored counter is lost. A failed send is not retried with the
 * same delivery: the next run observes the file again under a new sequence,
 * which the backend orders correctly.
 */

var ARCHIVE = {
  PATH: '/api/internal/sync/archives',
  METADATA_KEYS: ['schemaVersion', 'driveFileId', 'title', 'description', 'category', 'year', 'authors'],
  MAX_METADATA_BYTES: 64 * 1024,
  MAX_HASH_BYTES: 45 * 1024 * 1024,
  // Unchanged files are fully re-checked (sharing, checksum) at least this often.
  RECHECK_MS: 6 * 60 * 60 * 1000,
  CONTROL_CHARS: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/,
};

/** Entry point for the time-driven trigger. */
function syncArchive() {
  return kmitsWithLock_('Archive', function () {
    var config = kmitsConfig_();
    if (!config.archiveStreams.length) {
      console.log('Archive: KMITS_ARCHIVE_STREAMS is empty; nothing to sync.');
      return [];
    }
    var deadline = Date.now() + KMITS.TIME_BUDGET_MS;
    var summary = [];
    for (var i = 0; i < config.archiveStreams.length; i++) {
      var stats = archiveSyncStream_(config, config.archiveStreams[i], deadline);
      summary.push(stats);
      console.log('Archive ' + stats.streamId + ': ' + JSON.stringify(stats));
      if (stats.stopped) break;
    }
    return summary;
  });
}

function archiveSyncStream_(config, stream, deadline) {
  var stats = { streamId: stream.streamId, files: 0, sent: 0, unchanged: 0, failed: 0, stopped: false };
  var listing;
  try {
    listing = archiveListFolder_(stream.folderId);
  } catch (error) {
    // Never infer missing files from an incomplete listing.
    var result = archiveSend_(config, stream, {
      metadataFileId: stream.streamId + '-scan', metadataDriveVersion: null, observation: 'SYNC_ERROR',
      diagnostics: 'Folder listing failed: ' + String(error && error.message || error).slice(0, 500),
    });
    stats.failed++;
    stats.stopped = result.kind === 'auth';
    return stats;
  }

  var pdfs = {};
  var metadataFiles = [];
  listing.forEach(function (file) {
    if (file.mimeType === 'application/pdf') pdfs[file.id] = file;
    else if (/\.md$/i.test(file.name || '') && file.mimeType !== 'application/vnd.google-apps.folder') metadataFiles.push(file);
  });
  metadataFiles.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  stats.files = metadataFiles.length;

  // Metadata files that were known but are no longer in the folder.
  var present = {};
  metadataFiles.forEach(function (file) { present[file.id] = true; });
  var filePrefix = 'archive:file:' + stream.streamId + ':';
  var known = kmitsStateKeys_(filePrefix);
  for (var k = 0; k < known.length; k++) {
    var missingId = known[k].slice(filePrefix.length);
    if (present[missingId]) continue;
    var missing = archiveSend_(config, stream, { metadataFileId: missingId, metadataDriveVersion: null, observation: 'MISSING' });
    if (missing.kind === 'ok' || missing.kind === 'rejected') { kmitsStateDelete_(known[k]); stats.sent++; } else stats.failed++;
    if (missing.kind === 'auth') { stats.stopped = true; return stats; }
  }

  for (var i = 0; i < metadataFiles.length; i++) {
    if (Date.now() > deadline) { stats.stopped = true; break; }
    var file = metadataFiles[i];
    var stateKey = filePrefix + file.id;
    var previous = archiveReadState_(stateKey);
    var previousPdf = previous && previous.pdf ? pdfs[previous.pdf] : null;
    if (previous && previous.v === String(file.version) && previousPdf && previous.pv === String(previousPdf.version) &&
        Date.now() - previous.t < ARCHIVE.RECHECK_MS) {
      stats.unchanged++;
      continue;
    }
    var observation = archiveObserve_(stream, file, pdfs);
    var referencedPdf = observation.pdfRef ? pdfs[observation.pdfRef] : null;
    var state = {
      fp: archiveFingerprint_(observation), v: String(file.version),
      pdf: observation.pdfRef || '', pv: referencedPdf ? String(referencedPdf.version) : '', t: Date.now(),
    };
    if (previous && previous.fp === state.fp) {
      kmitsStateSet_(stateKey, JSON.stringify(state));
      stats.unchanged++;
      continue;
    }
    var result = archiveSend_(config, stream, observation);
    if (result.kind === 'ok' || result.kind === 'rejected') {
      kmitsStateSet_(stateKey, JSON.stringify(state));
      stats.sent++;
    } else {
      stats.failed++;
    }
    if (result.kind === 'auth') { stats.stopped = true; break; }
  }
  return stats;
}

function archiveReadState_(key) {
  try { return JSON.parse(kmitsStateGet_(key) || 'null'); } catch (error) { return null; }
}

/** All non-trashed files directly inside the folder, every page. Throws on any page failure. */
function archiveListFolder_(folderId) {
  var files = [];
  var pageToken = null;
  do {
    var options = {
      q: "'" + folderId + "' in parents and trashed = false",
      fields: 'nextPageToken, files(id, name, mimeType, version, size, sha256Checksum)',
      pageSize: 1000, supportsAllDrives: true, includeItemsFromAllDrives: true,
    };
    if (pageToken) options.pageToken = pageToken;
    var page = Drive.Files.list(options);
    files = files.concat(page.files || []);
    pageToken = page.nextPageToken || null;
  } while (pageToken);
  return files;
}

/** Builds the observation for one metadata file (without delivery fields). */
function archiveObserve_(stream, file, pdfs) {
  var base = { metadataFileId: file.id, metadataDriveVersion: String(file.version) };
  var fail = function (kind, reason, pdfRef) {
    return { metadataFileId: base.metadataFileId, metadataDriveVersion: base.metadataDriveVersion, observation: kind, diagnostics: reason, pdfRef: pdfRef || '' };
  };
  if (Number(file.size) > ARCHIVE.MAX_METADATA_BYTES) return fail('INVALID', 'The metadata file is larger than 64 KiB.');
  var text;
  try {
    text = DriveApp.getFileById(file.id).getBlob().getDataAsString('UTF-8');
  } catch (error) {
    return fail('UNAVAILABLE', 'The metadata file could not be read.');
  }
  var parsed = archiveParseMetadata_(text);
  if (parsed.error) return fail('INVALID', parsed.error);
  var metadata = parsed.metadata;
  var pdf = pdfs[metadata.driveFileId];
  if (!pdf) return fail('UNAVAILABLE', 'The PDF named by driveFileId is not in this folder, or it is in the trash.', metadata.driveFileId);

  var sha256 = String(pdf.sha256Checksum || '');
  if (!/^[0-9a-f]{64}$/i.test(sha256)) {
    if (Number(pdf.size) > ARCHIVE.MAX_HASH_BYTES) return fail('UNAVAILABLE', 'Drive has no checksum for this PDF and it is too large to hash.', pdf.id);
    try {
      sha256 = kmitsSha256Bytes_(DriveApp.getFileById(pdf.id).getBlob().getBytes());
    } catch (error) {
      return fail('UNAVAILABLE', 'The PDF could not be read to compute its checksum.', pdf.id);
    }
  }
  var observedPdf = {
    driveFileId: pdf.id, folderId: stream.folderId, mimeType: 'application/pdf',
    sha256: sha256.toLowerCase(), publicReadable: archiveIsPublic_(pdf.id),
  };
  var size = Number(pdf.size);
  if (size >= 1 && size <= Number.MAX_SAFE_INTEGER && Math.floor(size) === size) observedPdf.size = size;
  var name = String(pdf.name || '').trim();
  if (name && name.length <= 300 && !ARCHIVE.CONTROL_CHARS.test(name)) observedPdf.name = name;
  return {
    metadataFileId: base.metadataFileId, metadataDriveVersion: base.metadataDriveVersion,
    observation: 'VALID', metadata: metadata, pdf: observedPdf, pdfRef: pdf.id,
  };
}

/** True when anyone (or anyone with the link) can view the file without signing in. */
function archiveIsPublic_(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var access = file.getSharingAccess();
    var permission = file.getSharingPermission();
    return (access === DriveApp.Access.ANYONE || access === DriveApp.Access.ANYONE_WITH_LINK) &&
      permission !== DriveApp.Permission.NONE;
  } catch (error) {
    return false;
  }
}

/** A stable hash of everything the backend would see, used to skip unchanged files. */
function archiveFingerprint_(observation) {
  return kmitsSha256Text_(JSON.stringify([
    observation.observation, observation.metadataDriveVersion, observation.metadata || null,
    observation.pdf || null, observation.diagnostics || '',
  ]));
}

/** Adds delivery fields, POSTs one observation and logs the outcome. */
function archiveSend_(config, stream, observation) {
  var sequence = archiveNextSequence_(stream.streamId);
  var body = {
    protocolVersion: KMITS.PROTOCOL_VERSION, streamId: stream.streamId,
    deliveryId: 'd-' + sequence, scanSequence: sequence,
    metadataFileId: observation.metadataFileId, metadataDriveVersion: observation.metadataDriveVersion,
    observation: observation.observation, sourceCheckedAt: new Date().toISOString(), folderId: stream.folderId,
  };
  if (observation.diagnostics) body.diagnostics = String(observation.diagnostics).slice(0, 2000);
  if (observation.observation === 'VALID') { body.metadata = observation.metadata; body.pdf = observation.pdf; }
  var result = kmitsPost_(config, ARCHIVE.PATH, body);
  var outcome = result.kind === 'ok' && result.body && result.body.data ? result.body.data.outcome : kmitsDescribe_(result);
  console.log('Archive ' + stream.streamId + ' ' + observation.metadataFileId + ' ' + observation.observation + ' -> ' + outcome);
  return result;
}

function archiveNextSequence_(streamId) {
  var key = 'archive:seq:' + streamId;
  var last = Number(kmitsStateGet_(key) || 0);
  var next = Math.max(last + 1, Date.now() * 1000);
  kmitsStateSet_(key, String(next));
  return String(next);
}

// ---- Metadata file parsing --------------------------------------------------

/**
 * Parses the YAML frontmatter of a metadata file and validates it with the
 * same rules as the backend. Returns { metadata } or { error }.
 */
function archiveParseMetadata_(text) {
  var lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return { error: 'The file must start with a --- line.' };
  var end = -1;
  for (var i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') { end = i; break; }
  }
  if (end < 0) return { error: 'The frontmatter is not closed with a --- line.' };
  var fields;
  try {
    fields = archiveParseYaml_(lines.slice(1, end));
  } catch (error) {
    return { error: error.message };
  }
  return archiveValidateMetadata_(fields);
}

/** A small YAML subset: `key: value`, quoted strings, `[a, b]`, `- item` lists and `|`/`>` blocks. */
function archiveParseYaml_(lines) {
  var result = {};
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    var lineNumber = i + 2;
    if (!line.trim() || /^\s*#/.test(line)) { i++; continue; }
    var match = /^([A-Za-z][A-Za-z0-9_]*)\s*:(?:\s+(.*?))?\s*$/.exec(line);
    if (!match) throw new Error('Line ' + lineNumber + ' must look like "key: value".');
    var key = match[1];
    if (Object.prototype.hasOwnProperty.call(result, key)) throw new Error('"' + key + '" appears twice.');
    var raw = match[2] === undefined ? '' : archiveStripComment_(match[2]);
    i++;
    if (raw === '') {
      var items = [];
      while (i < lines.length && /^\s+-(\s|$)/.test(lines[i])) {
        items.push(archiveScalar_(lines[i].replace(/^\s+-\s?/, ''), i + 2));
        i++;
      }
      result[key] = items.length ? items : null;
    } else if (/^[|>]-?$/.test(raw)) {
      var block = [];
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || !lines[i].trim())) { block.push(lines[i]); i++; }
      while (block.length && !block[block.length - 1].trim()) block.pop();
      var indent = Math.min.apply(null, block.filter(function (l) { return l.trim(); })
        .map(function (l) { return l.match(/^\s*/)[0].length; }).concat([1000]));
      var body = block.map(function (l) { return l.slice(indent); });
      result[key] = raw[0] === '|' ? body.join('\n') : archiveFold_(body);
    } else if (raw[0] === '[') {
      if (raw[raw.length - 1] !== ']') throw new Error('Line ' + lineNumber + ': a [list] must end with ].');
      result[key] = archiveSplitFlow_(raw.slice(1, -1), lineNumber).map(function (item) { return archiveScalar_(item, lineNumber); });
    } else {
      result[key] = archiveScalar_(raw, lineNumber);
    }
  }
  return result;
}

function archiveFold_(lines) {
  var out = '';
  lines.forEach(function (line, index) {
    if (!line.trim()) out += '\n';
    else out += (index && out && out[out.length - 1] !== '\n' ? ' ' : '') + line.trim();
  });
  return out;
}

/** Removes a trailing ` # comment` that is not inside quotes. */
function archiveStripComment_(raw) {
  var quote = null;
  for (var i = 0; i < raw.length; i++) {
    var c = raw[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i).trim();
  }
  return raw.trim();
}

function archiveSplitFlow_(inner, lineNumber) {
  var parts = [];
  var current = '';
  var quote = null;
  for (var i = 0; i < inner.length; i++) {
    var c = inner[i];
    if (quote) { current += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; current += c; continue; }
    if (c === ',') { parts.push(current); current = ''; continue; }
    current += c;
  }
  if (quote) throw new Error('Line ' + lineNumber + ' has an unclosed quote.');
  if (current.trim() || parts.length) parts.push(current);
  return parts.map(function (part) { return part.trim(); }).filter(function (part, index, all) {
    if (!part && !(index === all.length - 1)) throw new Error('Line ' + lineNumber + ' has an empty list item.');
    return part !== '';
  });
}

/** A scalar as a string, or null for `null`, `~` and empty values. */
function archiveScalar_(raw, lineNumber) {
  var value = archiveStripComment_(String(raw));
  if (value === '' || value === '~' || value === 'null') return null;
  if (value[0] === '"') {
    try { return JSON.parse(value); } catch (error) { throw new Error('Line ' + lineNumber + ' has an invalid "quoted" value.'); }
  }
  if (value[0] === "'") {
    if (value.length < 2 || value[value.length - 1] !== "'") throw new Error('Line ' + lineNumber + " has an unclosed 'quote'.");
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** The backend's Archive metadata rules (backend/src/modules/archives/validation.ts). */
function archiveValidateMetadata_(fields) {
  var unknown = Object.keys(fields).filter(function (key) { return ARCHIVE.METADATA_KEYS.indexOf(key) < 0; });
  if (unknown.length) return { error: 'Unknown field "' + unknown[0] + '". Allowed: ' + ARCHIVE.METADATA_KEYS.join(', ') + '.' };
  var text = function (key, max, required) {
    var value = fields[key];
    if (value === null || value === undefined) {
      if (required) throw new Error('"' + key + '" is required.');
      return undefined;
    }
    if (typeof value !== 'string') throw new Error('"' + key + '" must be text, not a list.');
    value = value.trim();
    if (required && !value) throw new Error('"' + key + '" must not be empty.');
    if (value.length > max) throw new Error('"' + key + '" must be at most ' + max + ' characters.');
    if (ARCHIVE.CONTROL_CHARS.test(value)) throw new Error('"' + key + '" contains control characters.');
    return value;
  };
  try {
    if (String(fields.schemaVersion) !== '1') throw new Error('"schemaVersion: 1" is required.');
    var driveFileId = text('driveFileId', 200, true);
    if (!kmitsIsId_(driveFileId)) throw new Error('"driveFileId" must be the PDF\'s Drive file ID.');
    var metadata = { schemaVersion: 1, driveFileId: driveFileId, title: text('title', 300, true) };
    var description = text('description', 5000, false);
    if (description !== undefined) metadata.description = description;
    var category = text('category', 100, false);
    if (category !== undefined) metadata.category = category;
    if (fields.year !== null && fields.year !== undefined) {
      var year = String(fields.year).trim();
      if (!/^\d{4}$/.test(year) || Number(year) < 1900) throw new Error('"year" must be a four-digit year from 1900.');
      metadata.year = Number(year);
    }
    if (fields.authors !== null && fields.authors !== undefined) {
      var authors = typeof fields.authors === 'string' ? [fields.authors] : fields.authors;
      if (authors.length > 30) throw new Error('"authors" allows at most 30 names.');
      metadata.authors = authors.map(function (author) {
        if (typeof author !== 'string' || !author.trim()) throw new Error('"authors" must not contain empty names.');
        if (author.trim().length > 200) throw new Error('Each author must be at most 200 characters.');
        if (ARCHIVE.CONTROL_CHARS.test(author)) throw new Error('"authors" contains control characters.');
        return author.trim();
      });
    }
    return { metadata: metadata };
  } catch (error) {
    return { error: error.message };
  }
}
