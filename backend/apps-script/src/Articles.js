/**
 * Articles connector: the article Google Form -> POST /api/internal/sync/articles.
 *
 * Reads responses through FormApp (the response ID stays the same when a
 * contributor edits a response). Each run sends responses submitted since
 * the last accepted run, with a small overlap; resending an unchanged
 * response is a safe retry on the backend. Submissions are never public
 * until an admin publishes them.
 *
 * Form questions are matched to article fields by their title. The defaults
 * are listed in ARTICLES.DEFAULT_FIELDS; KMITS_FORM_FIELDS overrides them,
 * for example {"title": "Judul Tulisan", "body": ["Isi", "Konten"]}.
 */

var ARTICLES = {
  PATH: '/api/internal/sync/articles',
  OVERLAP_MS: 10 * 60 * 1000,
  DEFAULT_FIELDS: {
    title: ['Judul', 'Judul Artikel', 'Title'],
    summary: ['Ringkasan', 'Summary'],
    category: ['Kategori', 'Category'],
    ministry: ['Kementerian', 'Ministry'],
    authors: ['Penulis', 'Nama Penulis', 'Authors'],
    coverImage: ['Gambar Sampul', 'Foto Sampul', 'Cover Image'],
    coverAlt: ['Keterangan Gambar', 'Deskripsi Gambar', 'Cover Alt'],
    body: ['Isi Artikel', 'Isi', 'Body'],
  },
  CONTROL_CHARS: /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,
};

/** Entry point for the form-submit and time-driven triggers. */
function syncArticles() {
  return kmitsWithLock_('Articles', function () {
    var config = kmitsConfig_();
    if (!config.formId) {
      console.log('Articles: KMITS_FORM_ID is empty; nothing to sync.');
      return null;
    }
    var stats = articlesRun_(config);
    console.log('Articles: ' + JSON.stringify(stats));
    return stats;
  });
}

function articlesRun_(config) {
  var stats = { responses: 0, sent: 0, invalid: 0, done: false, error: '' };
  var form = FormApp.openById(config.formId);
  var sinceRaw = kmitsStateGet_('articles:since');
  var responses = sinceRaw ? form.getResponses(new Date(Number(sinceRaw) - ARTICLES.OVERLAP_MS)) : form.getResponses();
  var fields = articlesFieldMap_(config.formFields);
  var newest = Number(sinceRaw || 0);
  var submissions = responses.map(function (response) {
    newest = Math.max(newest, response.getTimestamp().getTime());
    return articlesSubmission_(response, fields);
  });
  stats.responses = submissions.length;
  for (var start = 0; start < submissions.length; start += config.articlesBatchSize) {
    var batch = submissions.slice(start, start + config.articlesBatchSize);
    var result = kmitsPost_(config, ARTICLES.PATH, { protocolVersion: KMITS.PROTOCOL_VERSION, formId: config.formId, submissions: batch });
    if (result.kind !== 'ok') {
      stats.error = 'Submission batch failed: ' + kmitsDescribe_(result);
      return stats; // The watermark stays, so the next run resends these responses.
    }
    stats.sent += batch.length;
    ((result.body && result.body.data && result.body.data.results) || []).forEach(function (item) {
      if (item.outcome === 'invalid' || item.outcome === 'conflict') {
        stats.invalid++;
        console.log('Article response ' + (item.responseId || '#' + item.index) + ': ' + item.outcome + (item.reason ? ' (' + item.reason + ')' : ''));
      }
    });
  }
  kmitsStateSet_('articles:since', String(newest));
  stats.done = true;
  return stats;
}

/** Lower-cased question title -> article field. */
function articlesFieldMap_(overrides) {
  var map = {};
  var add = function (field, titles) {
    (Array.isArray(titles) ? titles : [titles]).forEach(function (title) {
      map[String(title).trim().toLowerCase()] = field;
    });
  };
  Object.keys(ARTICLES.DEFAULT_FIELDS).forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(overrides, field)) add(field, ARTICLES.DEFAULT_FIELDS[field]);
  });
  Object.keys(overrides).forEach(function (field) {
    if (!Object.prototype.hasOwnProperty.call(ARTICLES.DEFAULT_FIELDS, field)) throw new Error('KMITS_FORM_FIELDS has an unknown field "' + field + '".');
    add(field, overrides[field]);
  });
  return map;
}

function articlesText_(value) {
  var text = Array.isArray(value) ? value.join(', ') : String(value === null || value === undefined ? '' : value);
  return text.replace(ARTICLES.CONTROL_CHARS, '').trim();
}

/** Maps one form response to the backend submission. The backend validates lengths. */
function articlesSubmission_(response, fields) {
  var values = {};
  response.getItemResponses().forEach(function (itemResponse) {
    var field = fields[String(itemResponse.getItem().getTitle()).trim().toLowerCase()];
    if (field) values[field] = itemResponse.getResponse();
  });
  var article = { schemaVersion: 1, title: articlesText_(values.title), body: articlesText_(values.body) };
  ['summary', 'category', 'ministry'].forEach(function (field) {
    var text = articlesText_(values[field]);
    if (text) article[field] = text;
  });
  var authors = (Array.isArray(values.authors) ? values.authors : articlesText_(values.authors).split(/[\n,;]+/))
    .map(articlesText_).filter(function (name) { return name; });
  if (authors.length) article.authors = authors;
  // A file-upload question answers with the uploaded Drive file IDs.
  var cover = Array.isArray(values.coverImage) ? values.coverImage[0] : values.coverImage;
  if (cover && /^[A-Za-z0-9_-]{1,200}$/.test(String(cover))) {
    article.coverImage = { driveFileId: String(cover), alt: articlesText_(values.coverAlt).slice(0, 300) };
  }
  var submission = { responseId: response.getId(), submittedAt: response.getTimestamp().toISOString(), article: article };
  var email = String(response.getRespondentEmail() || '').trim();
  if (email.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(email)) submission.submitterEmail = email;
  return submission;
}
