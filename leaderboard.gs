const SHEET_NAME = 'leaderboard';
const MAX_READ_ROWS = 200;
const APPROVED_STATUS = 'approved';
const DENIED_STATUS = 'denied';

// Spreadsheet that holds both the leaderboard and the per-unit track tabs.
const SPREADSHEET_ID = '1-mWr8BbB8SkT8TLoFtjCG3ChdJEK9bdOz4L7_0aDzPQ';
// gid of the tab the quiz should pull songs from. 1719666629 = Unit 8.
const TRACKS_GID = 1719666629;

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || '').trim().toLowerCase();

    if (action === 'tracks') {
      return jsonResponse_({ tracks: getTracks_() });
    }

    const sheet = getOrCreateLeaderboardSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse_({ entries: [] });
    }

    const values = sheet.getRange(2, 1, Math.min(lastRow - 1, MAX_READ_ROWS), 5).getValues();
    const entries = values
      .filter((row) => normalizeStatus_(row[4]) === APPROVED_STATUS)
      .map((row) => ({
        nickname: row[0],
        accuracy: Number(row[1]),
        totalQuestions: Number(row[2]),
        createdAt: row[3]
      }));

    return jsonResponse_({ entries: entries });
  } catch (err) {
    return jsonResponse_({ error: String(err) });
  }
}

// Reads the configured tracks tab and returns enabled, validated rows
// in the shape the frontend expects. Tolerates duplicate column headers
// (e.g. the second empty "link" column on the Unit 8 tab) by keeping the
// first non-empty value for each header name.
function getTracks_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getSheetByGid_(ss, TRACKS_GID);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map((h) => String(h == null ? '' : h).trim().toLowerCase());

  const tracks = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      const cell = String(row[idx] == null ? '' : row[idx]).trim();
      if (!(header in obj) || (!obj[header] && cell)) {
        obj[header] = cell;
      }
    });

    const enabled = (obj.enabled || '').toLowerCase();
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
        .map((s) => s.trim())
        .filter(Boolean)
    });
  }
  return tracks;
}

function getSheetByGid_(ss, gid) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    const nickname = sanitizeName_(body.nickname);
    const accuracy = sanitizeNumber_(body.accuracy, 0, 100);
    const totalQuestions = sanitizeNumber_(body.totalQuestions, 0, 1000);
    const createdAt = normalizeTimestamp_(body.createdAt);

    if (!nickname) {
      return jsonResponse_({ error: 'name is required' });
    }

    const sheet = getOrCreateLeaderboardSheet_();
    sheet.appendRow([nickname, accuracy, totalQuestions, createdAt, APPROVED_STATUS]);

    return jsonResponse_({ ok: true });
  } catch (err) {
    return jsonResponse_({ error: String(err) });
  }
}

function getOrCreateLeaderboardSheet_() {
  const ss = SpreadsheetApp.openById('1-mWr8BbB8SkT8TLoFtjCG3ChdJEK9bdOz4L7_0aDzPQ');
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['nickname', 'accuracy', 'totalQuestions', 'createdAt', 'status']);
    return sheet;
  }

  const statusHeader = String(sheet.getRange(1, 5).getValue() || '').trim().toLowerCase();
  if (!statusHeader) {
    sheet.getRange(1, 5).setValue('status');
  }

  return sheet;
}

function sanitizeName_(value) {
  const name = String(value || '').trim().slice(0, 24);
  return isValidName_(name) ? name : '';
}

function isValidName_(value) {
  return value.length >= 2;
}

function normalizeStatus_(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return APPROVED_STATUS;
  if (raw === DENIED_STATUS) return DENIED_STATUS;
  return APPROVED_STATUS;
}

function sanitizeNumber_(value, minValue, maxValue) {
  const num = Number(value);
  if (!isFinite(num)) return minValue;
  return Math.max(minValue, Math.min(maxValue, Math.round(num)));
}

function normalizeTimestamp_(value) {
  const date = value ? new Date(value) : new Date();
  if (isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
