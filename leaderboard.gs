const SHEET_NAME = 'leaderboard';
const MAX_READ_ROWS = 200;
const APPROVED_STATUS = 'approved';
const DENIED_STATUS = 'denied';

function doGet() {
  try {
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
