/**
 * Functions to run from the Apps Script editor (Run menu). Names ending in
 * an underscore are internal and hidden from that menu.
 *
 *   checkSetup()       Validates Script Properties and access to the backend,
 *                      folders, calendar and form. Run this first.
 *   installTriggers()  Creates the schedules below. Run once, as the account
 *                      that should own the automation.
 *   removeTriggers()   Deletes those schedules.
 *   syncAll()          Runs every configured connector now.
 *   resyncArchive(), resyncTimeline(), resyncArticles()
 *                      Forget what was sent so the next run sends everything
 *                      again. Archive sequences are never reset.
 */

var TRIGGER_HANDLERS = ['syncArchive', 'syncTimeline', 'syncArticles'];

function syncAll() {
  TRIGGER_HANDLERS.forEach(function (name) {
    try {
      globalThis[name]();
    } catch (error) {
      console.error(name + ' failed: ' + (error && error.message || error));
    }
  });
}

function installTriggers() {
  var config = kmitsConfig_();
  removeTriggers();
  var created = [];
  if (config.archiveStreams.length) {
    ScriptApp.newTrigger('syncArchive').timeBased().everyMinutes(5).create();
    created.push('syncArchive every 5 minutes');
  }
  if (config.calendarId) {
    ScriptApp.newTrigger('syncTimeline').timeBased().everyMinutes(15).create();
    created.push('syncTimeline every 15 minutes');
    try {
      ScriptApp.newTrigger('syncTimeline').forUserCalendar(config.calendarId).onEventUpdated().create();
      created.push('syncTimeline on calendar change');
    } catch (error) {
      console.log('Calendar-change trigger not created (' + error.message + '); the 15-minute schedule still runs.');
    }
  }
  if (config.formId) {
    ScriptApp.newTrigger('syncArticles').forForm(config.formId).onFormSubmit().create();
    ScriptApp.newTrigger('syncArticles').timeBased().everyHours(1).create();
    created.push('syncArticles on form submit and every hour');
  }
  console.log('Triggers: ' + (created.join('; ') || 'none (no connector configured)'));
  return created;
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (TRIGGER_HANDLERS.indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  });
}

/** Read-only checks; prints one line per item and returns them. */
function checkSetup() {
  var lines = [];
  var config;
  try {
    config = kmitsConfig_();
    lines.push('OK   Script Properties');
  } catch (error) {
    lines.push('FAIL Script Properties: ' + error.message);
    console.log(lines.join('\n'));
    return lines;
  }
  var check = function (label, task) {
    try { lines.push('OK   ' + label + (task() || '')); } catch (error) { lines.push('FAIL ' + label + ': ' + (error && error.message || error)); }
  };
  check('Backend ' + config.backendUrl, function () {
    var response = UrlFetchApp.fetch(config.backendUrl + '/api/ready', { muteHttpExceptions: true, followRedirects: false });
    if (response.getResponseCode() !== 200) throw new Error('/api/ready answered HTTP ' + response.getResponseCode());
    return ' (ready)';
  });
  config.archiveStreams.forEach(function (stream) {
    check('Archive folder ' + stream.streamId, function () {
      var folder = Drive.Files.get(stream.folderId, { fields: 'id, name, mimeType', supportsAllDrives: true });
      if (folder.mimeType !== 'application/vnd.google-apps.folder') throw new Error(stream.folderId + ' is not a folder');
      return ' "' + folder.name + '"';
    });
  });
  if (config.calendarId) {
    check('Calendar', function () {
      var calendar = Calendar.Calendars.get(config.calendarId);
      return ' "' + calendar.summary + '" (' + calendar.timeZone + ')';
    });
  }
  if (config.formId) {
    check('Form', function () {
      var form = FormApp.openById(config.formId);
      var fields = articlesFieldMap_(config.formFields);
      var mapped = {};
      form.getItems().forEach(function (item) {
        var field = fields[String(item.getTitle()).trim().toLowerCase()];
        if (field) mapped[field] = true;
      });
      var missing = ['title', 'body'].filter(function (field) { return !mapped[field]; });
      if (missing.length) throw new Error('"' + form.getTitle() + '" has no question for: ' + missing.join(', ') + '. Rename the questions or set KMITS_FORM_FIELDS.');
      return ' "' + form.getTitle() + '" (fields: ' + Object.keys(mapped).join(', ') + ')';
    });
  }
  console.log(lines.join('\n'));
  return lines;
}

function resyncArchive() {
  kmitsStateKeys_('archive:file:').forEach(kmitsStateDelete_);
}

function resyncTimeline() {
  ['timeline:syncToken', 'timeline:pageToken', 'timeline:timeMin'].forEach(kmitsStateDelete_);
}

function resyncArticles() {
  kmitsStateDelete_('articles:since');
}
