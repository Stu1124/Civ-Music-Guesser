const MAX_READ_ROWS = 200;
const APPROVED_STATUS = 'approved';
const DENIED_STATUS = 'denied';

const SPREADSHEET_ID = '1-mWr8BbB8SkT8TLoFtjCG3ChdJEK9bdOz4L7_0aDzPQ';

const LEADERBOARD_TAB_PREFIX = 'leaderboard_';
const SETTINGS_TAB = 'settings';
const USAGE_LOG_TAB = 'usage_log';
const ADMIN_TOKEN_KEY = 'admin_token';
const USAGE_LOG_MAX_ROWS = 5000;

const REQUIRED_TRACK_HEADERS = ['enabled', 'genre', 'title', 'composer', 'characteristics', 'link'];

// ============================================================================
// HTTP entry points
// ============================================================================

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || '').trim().toLowerCase();
    const sheetParam = String(params.sheet || '').trim();
    const token = String(params.token || '').trim();

    if (action === 'sheets') {
      return jsonResponse_({ sheets: getTrackSheets_() });
    }

    if (action === 'tracks') {
      logUsage_('tracks', sheetParam);
      return jsonResponse_({ tracks: getTracks_(sheetParam) });
    }

    if (action === 'settings') {
      return jsonResponse_({ settings: getPublicSettings_() });
    }

    if (action === 'metrics') {
      if (!isAuthorized_(token)) return jsonResponse_({ error: 'unauthorized' });
      return jsonResponse_(getMetrics_());
    }

    if (action === 'admin_scores') {
      if (!isAuthorized_(token)) return jsonResponse_({ error: 'unauthorized' });
      return jsonResponse_({ scores: getAllScores_(sheetParam) });
    }

    if (action === 'admin_settings') {
      if (!isAuthorized_(token)) return jsonResponse_({ error: 'unauthorized' });
      return jsonResponse_({ settings: getAllSettings_() });
    }

    // Default: leaderboard read for the given unit (or legacy tab if none given).
    logUsage_('leaderboard_view', sheetParam);
    const lb = getOrCreateLeaderboardSheet_(sheetParam);
    const lastRow = lb.getLastRow();
    if (lastRow < 2) return jsonResponse_({ entries: [] });

    const values = lb.getRange(2, 1, Math.min(lastRow - 1, MAX_READ_ROWS), 5).getValues();
    const entries = values
      .filter(function(row) { return normalizeStatus_(row[4]) === APPROVED_STATUS; })
      .map(function(row) {
        return {
          nickname: row[0],
          accuracy: Number(row[1]),
          totalQuestions: Number(row[2]),
          createdAt: row[3]
        };
      });

    return jsonResponse_({ entries: entries });
  } catch (err) {
    return jsonResponse_({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Admin operations are routed through doPost so the token isn't logged
    // in browser history / referer headers.
    if (body.adminOp) {
      if (!isAuthorized_(body.token)) return jsonResponse_({ error: 'unauthorized' });
      return handleAdminOp_(body);
    }

    var sheetParam = String(body.sheet || '').trim();
    var nickname = sanitizeName_(body.nickname);
    var accuracy = sanitizeNumber_(body.accuracy, 0, 100);
    var totalQuestions = sanitizeNumber_(body.totalQuestions, 0, 1000);
    var createdAt = normalizeTimestamp_(body.createdAt);

    if (!nickname) return jsonResponse_({ error: 'name is required' });

    var sheet = getOrCreateLeaderboardSheet_(sheetParam);
    sheet.appendRow([nickname, accuracy, totalQuestions, createdAt, APPROVED_STATUS]);
    logUsage_('score_submit', sheetParam);

    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ error: String(err) });
  }
}

// ============================================================================
// Tracks / sheets discovery
// ============================================================================

function getTrackSheets_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const result = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    var nameLower = name.toLowerCase();
    if (nameLower === 'leaderboard') continue;
    if (nameLower.indexOf(LEADERBOARD_TAB_PREFIX) === 0) continue;
    if (nameLower === SETTINGS_TAB) continue;
    if (nameLower === USAGE_LOG_TAB) continue;
    if (typeof sheet.isSheetHidden === 'function' && sheet.isSheetHidden()) continue;
    if (hasTrackHeaders_(sheet)) {
      result.push({ name: name, gid: sheet.getSheetId() });
    }
  }
  return result;
}

function hasTrackHeaders_(sheet) {
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return false;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h == null ? '' : h).trim().toLowerCase(); });
  return REQUIRED_TRACK_HEADERS.every(function(r) { return headers.indexOf(r) !== -1; });
}

function getTracks_(sheetName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = sheetName ? ss.getSheetByName(sheetName) : null;
  if (!sheet) {
    var trackSheets = getTrackSheets_();
    if (trackSheets.length > 0) sheet = ss.getSheetByName(trackSheets[0].name);
  }
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function(h) {
    return String(h == null ? '' : h).trim().toLowerCase();
  });

  var tracks = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    headers.forEach(function(header, idx) {
      if (!header) return;
      var cell = String(row[idx] == null ? '' : row[idx]).trim();
      if (!(header in obj) || (!obj[header] && cell)) obj[header] = cell;
    });

    var enabled = (obj.enabled || '').toLowerCase();
    if (enabled !== 'true' && enabled !== '1' && enabled !== 'yes' && enabled !== 'y') continue;
    if (!obj.title || !obj.composer || !obj.genre || !obj.characteristics || !obj.link) continue;

    tracks.push({
      genre: obj.genre,
      title: obj.title,
      composer: obj.composer,
      characteristics: obj.characteristics,
      context: obj.context || 'Not provided',
      link: obj.link,
      altGenres: String(obj.alt_genres || obj.alt_genre || '')
        .split('|').map(function(s) { return s.trim(); }).filter(Boolean)
    });
  }
  return tracks;
}

// ============================================================================
// Leaderboard tabs
// ============================================================================

function getOrCreateLeaderboardSheet_(unitName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tabName = unitName ? LEADERBOARD_TAB_PREFIX + unitName : 'leaderboard';
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) sheet = ss.insertSheet(tabName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['nickname', 'accuracy', 'totalQuestions', 'createdAt', 'status']);
    return sheet;
  }
  var statusHeader = String(sheet.getRange(1, 5).getValue() || '').trim().toLowerCase();
  if (!statusHeader) sheet.getRange(1, 5).setValue('status');
  return sheet;
}

function getAllScores_(unitName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tabName = unitName ? LEADERBOARD_TAB_PREFIX + unitName : 'leaderboard';
  var sheet = ss.getSheetByName(tabName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  return values.map(function(r, i) {
    return {
      row: i + 2,
      tabName: tabName,
      nickname: r[0],
      accuracy: Number(r[1]),
      totalQuestions: Number(r[2]),
      createdAt: r[3] ? new Date(r[3]).toISOString() : '',
      status: String(r[4] || '').trim().toLowerCase() || APPROVED_STATUS
    };
  });
}

// ============================================================================
// Settings
// ============================================================================

// Public settings = everything except the admin token.
function getPublicSettings_() {
  var all = getAllSettings_();
  var pub = {};
  Object.keys(all).forEach(function(k) {
    if (k !== ADMIN_TOKEN_KEY) pub[k] = all[k];
  });
  return pub;
}

function getAllSettings_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SETTINGS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return {};

  var lastCol = Math.max(2, sheet.getLastColumn());
  var values = sheet.getRange(1, 1, sheet.getLastRow(), lastCol).getValues();
  var headers = values[0].map(function(h) { return String(h || '').trim().toLowerCase(); });
  var keyIdx = headers.indexOf('key');
  var valueIdx = headers.indexOf('value');
  if (keyIdx === -1 || valueIdx === -1) return {};

  var result = {};
  for (var i = 1; i < values.length; i++) {
    var key = String(values[i][keyIdx] || '').trim();
    var value = String(values[i][valueIdx] == null ? '' : values[i][valueIdx]).trim();
    if (key) result[key] = value;
  }
  return result;
}

function setSetting_(key, value) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SETTINGS_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_TAB);
    sheet.appendRow(['key', 'value']);
  }
  if (sheet.getLastRow() === 0) sheet.appendRow(['key', 'value']);

  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        return;
      }
    }
  }
  sheet.appendRow([key, value]);
}

// ============================================================================
// Authorization
// ============================================================================

function isAuthorized_(token) {
  if (!token) return false;
  var settings = getAllSettings_();
  var expected = settings[ADMIN_TOKEN_KEY];
  if (!expected) return false; // No token configured = locked.
  return String(token) === String(expected);
}

// ============================================================================
// Usage logging
// ============================================================================

function logUsage_(action, sheet) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var log = ss.getSheetByName(USAGE_LOG_TAB);
    if (!log) {
      log = ss.insertSheet(USAGE_LOG_TAB);
      log.appendRow(['timestamp', 'action', 'sheet']);
    }
    log.appendRow([new Date().toISOString(), action || '', sheet || '']);

    // Trim to keep the log reasonable.
    var rows = log.getLastRow();
    if (rows > USAGE_LOG_MAX_ROWS + 500) {
      log.deleteRows(2, rows - USAGE_LOG_MAX_ROWS - 1);
    }
  } catch (_) { /* never fail the main request */ }
}

// ============================================================================
// Metrics
// ============================================================================

function getMetrics_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var metrics = {
    generatedAt: new Date().toISOString(),
    totalEvents: 0,
    eventsLast24h: 0,
    eventsLast7d: 0,
    eventsLast30d: 0,
    eventsByAction: {},
    eventsByUnit: {},
    eventsByDay: {},
    recentEvents: [],
    leaderboards: []
  };

  var log = ss.getSheetByName(USAGE_LOG_TAB);
  if (log && log.getLastRow() > 1) {
    var values = log.getRange(2, 1, log.getLastRow() - 1, 3).getValues();
    var now = Date.now();
    var day = 24 * 60 * 60 * 1000;

    metrics.totalEvents = values.length;

    for (var i = 0; i < values.length; i++) {
      var ts = values[i][0];
      var action = String(values[i][1] || '');
      var unit = String(values[i][2] || '');

      metrics.eventsByAction[action] = (metrics.eventsByAction[action] || 0) + 1;
      if (unit) metrics.eventsByUnit[unit] = (metrics.eventsByUnit[unit] || 0) + 1;

      var t = new Date(ts).getTime();
      if (!isNaN(t)) {
        if (now - t < day) metrics.eventsLast24h++;
        if (now - t < 7 * day) metrics.eventsLast7d++;
        if (now - t < 30 * day) metrics.eventsLast30d++;
        var dayKey = new Date(t).toISOString().slice(0, 10);
        metrics.eventsByDay[dayKey] = (metrics.eventsByDay[dayKey] || 0) + 1;
      }
    }

    var recentSlice = values.slice(-30).reverse();
    metrics.recentEvents = recentSlice.map(function(r) {
      return {
        timestamp: r[0] ? new Date(r[0]).toISOString() : '',
        action: r[1] || '',
        sheet: r[2] || ''
      };
    });
  }

  // Per-unit leaderboard counts (approved only + total).
  var sheets = ss.getSheets();
  for (var j = 0; j < sheets.length; j++) {
    var s = sheets[j];
    var name = s.getName();
    var nameLower = name.toLowerCase();
    var isLb = nameLower.indexOf(LEADERBOARD_TAB_PREFIX) === 0 || nameLower === 'leaderboard';
    if (!isLb) continue;

    var entries = Math.max(0, s.getLastRow() - 1);
    var approved = 0;
    if (entries > 0) {
      var statusValues = s.getRange(2, 5, entries, 1).getValues();
      for (var k = 0; k < statusValues.length; k++) {
        if (normalizeStatus_(statusValues[k][0]) === APPROVED_STATUS) approved++;
      }
    }
    metrics.leaderboards.push({
      tabName: name,
      unit: name === 'leaderboard' ? '(legacy)' : name.substring(LEADERBOARD_TAB_PREFIX.length),
      total: entries,
      approved: approved,
      denied: entries - approved
    });
  }

  return metrics;
}

// ============================================================================
// Admin operations (POST + adminOp)
// ============================================================================

function handleAdminOp_(body) {
  var op = String(body.op || '').trim();

  if (op === 'updateSetting') {
    var key = String(body.key || '').trim();
    if (!key) return jsonResponse_({ error: 'key required' });
    var value = String(body.value == null ? '' : body.value);
    setSetting_(key, value);
    return jsonResponse_({ ok: true });
  }

  if (op === 'deleteScore') {
    var tabName = String(body.tabName || '').trim();
    var row = Number(body.row);
    if (!tabName || !isFinite(row) || row < 2) return jsonResponse_({ error: 'invalid row' });
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) return jsonResponse_({ error: 'tab not found' });
    sheet.deleteRow(row);
    return jsonResponse_({ ok: true });
  }

  if (op === 'setStatus') {
    var tabName2 = String(body.tabName || '').trim();
    var row2 = Number(body.row);
    var status = String(body.status || '').trim().toLowerCase();
    if (!tabName2 || !isFinite(row2) || row2 < 2) return jsonResponse_({ error: 'invalid row' });
    if (status !== APPROVED_STATUS && status !== DENIED_STATUS) return jsonResponse_({ error: 'invalid status' });
    var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet2 = ss2.getSheetByName(tabName2);
    if (!sheet2) return jsonResponse_({ error: 'tab not found' });
    sheet2.getRange(row2, 5).setValue(status);
    return jsonResponse_({ ok: true });
  }

  if (op === 'clearUsageLog') {
    var ss3 = SpreadsheetApp.openById(SPREADSHEET_ID);
    var log = ss3.getSheetByName(USAGE_LOG_TAB);
    if (log && log.getLastRow() > 1) {
      log.deleteRows(2, log.getLastRow() - 1);
    }
    return jsonResponse_({ ok: true });
  }

  return jsonResponse_({ error: 'unknown op: ' + op });
}

// ============================================================================
// Helpers
// ============================================================================

function sanitizeName_(value) {
  var name = String(value || '').trim().slice(0, 24);
  return name.length >= 2 ? name : '';
}

function normalizeStatus_(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (!raw) return APPROVED_STATUS;
  if (raw === DENIED_STATUS) return DENIED_STATUS;
  return APPROVED_STATUS;
}

function sanitizeNumber_(value, minValue, maxValue) {
  var num = Number(value);
  if (!isFinite(num)) return minValue;
  return Math.max(minValue, Math.min(maxValue, Math.round(num)));
}

function normalizeTimestamp_(value) {
  var date = value ? new Date(value) : new Date();
  if (isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
