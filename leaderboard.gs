const MAX_READ_ROWS = 200;
const APPROVED_STATUS = 'approved';
const DENIED_STATUS = 'denied';

const SPREADSHEET_ID = '1-mWr8BbB8SkT8TLoFtjCG3ChdJEK9bdOz4L7_0aDzPQ';

// Per-unit leaderboard tabs are named "leaderboard_<unit>" (e.g. "leaderboard_Unit 8").
// The bare "leaderboard" tab is kept as a legacy fallback for old scores.
const LEADERBOARD_TAB_PREFIX = 'leaderboard_';

const REQUIRED_TRACK_HEADERS = ['enabled', 'genre', 'title', 'composer', 'characteristics', 'link'];

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || '').trim().toLowerCase();
    const sheetParam = String(params.sheet || '').trim();

    if (action === 'sheets') {
      return jsonResponse_({ sheets: getTrackSheets_() });
    }

    if (action === 'tracks') {
      return jsonResponse_({ tracks: getTracks_(sheetParam) });
    }

    // Default: leaderboard read for the given unit (or legacy tab if none given).
    const lb = getOrCreateLeaderboardSheet_(sheetParam);
    const lastRow = lb.getLastRow();
    if (lastRow < 2) {
      return jsonResponse_({ entries: [] });
    }

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

// Returns every visible tab that has the required track headers, in sheet order.
// Leaderboard tabs and the settings tab are excluded.
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
    if (nameLower === 'settings') continue;
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

// Loads enabled tracks from the named sheet.
// Falls back to the first qualifying track sheet if sheetName is empty.
function getTracks_(sheetName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = sheetName ? ss.getSheetByName(sheetName) : null;

  if (!sheet) {
    var trackSheets = getTrackSheets_();
    if (trackSheets.length > 0) {
      sheet = ss.getSheetByName(trackSheets[0].name);
    }
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
      // Keep first non-empty value when duplicate headers exist.
      if (!(header in obj) || (!obj[header] && cell)) {
        obj[header] = cell;
      }
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
        .split('|')
        .map(function(s) { return s.trim(); })
        .filter(Boolean)
    });
  }
  return tracks;
}

// Returns (or creates) the leaderboard tab for a given unit.
// unitName = "Unit 8" → tab "leaderboard_Unit 8"
// unitName = ""       → legacy tab "leaderboard"
function getOrCreateLeaderboardSheet_(unitName) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tabName = unitName ? LEADERBOARD_TAB_PREFIX + unitName : 'leaderboard';
  var sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['nickname', 'accuracy', 'totalQuestions', 'createdAt', 'status']);
    return sheet;
  }

  var statusHeader = String(sheet.getRange(1, 5).getValue() || '').trim().toLowerCase();
  if (!statusHeader) {
    sheet.getRange(1, 5).setValue('status');
  }

  return sheet;
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var sheetParam = String(body.sheet || '').trim();

    var nickname = sanitizeName_(body.nickname);
    var accuracy = sanitizeNumber_(body.accuracy, 0, 100);
    var totalQuestions = sanitizeNumber_(body.totalQuestions, 0, 1000);
    var createdAt = normalizeTimestamp_(body.createdAt);

    if (!nickname) {
      return jsonResponse_({ error: 'name is required' });
    }

    var sheet = getOrCreateLeaderboardSheet_(sheetParam);
    sheet.appendRow([nickname, accuracy, totalQuestions, createdAt, APPROVED_STATUS]);

    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ error: String(err) });
  }
}

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
