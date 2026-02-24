## Civ Music Guesser – Teacher-Managed Content

This app now supports **no-code content management** through Google Sheets.
Your teacher can add/edit tracks (genre, title, composer, characteristics, links) in a sheet, and all students will load the same live data.

### How it works

- The quiz tries to load track data from a published Google Sheet CSV endpoint.
- If remote data fails, the app automatically falls back to local built-in tracks.
- A header badge shows current source:
  - `Content: Live`
  - `Content: Fallback`

## Teacher update workflow

### 1. Create a Google Sheet tab named `tracks`

Use this exact header row:

- `enabled`
- `genre`
- `alt_genres`
- `title`
- `composer`
- `characteristics`
- `context`
- `link`

Field rules:

- `enabled`: use `TRUE` to include row (`FALSE` excludes it)
- `genre`: required
- `alt_genres`: optional, `|` separated (example: `Tone Poem|Symphonic Poem`)
- `title`: required
- `composer`: required
- `characteristics`: required
- `context`: optional
- `link`: required, must be a valid URL

### 2. Optional settings tab

Create a second tab named `settings` with headers:

- `key`
- `value`

Supported keys:

- `notebook_url` (replaces NotebookLM button link)
- `quiz_title` (replaces app title text)

### 3. Publish sheet tabs as CSV

For each tab (`tracks`, optional `settings`):

1. Open the sheet tab.
2. Use **File -> Share -> Publish to web**.
3. Select the specific tab.
4. Choose format: **CSV**.
5. Copy the generated CSV URL.

### 4. Paste URLs into `index.html`

Edit these constants in `index.html`:

- `DATA_SOURCE_URL`: CSV URL for `tracks`
- `SETTINGS_SOURCE_URL`: CSV URL for `settings` (or leave empty)
- `USE_REMOTE_DATA`: keep `true` for live sheet loading

## Data contract used by the app

Each valid `tracks` row is normalized to:

```js
{
  genre: string,
  title: string,
  composer: string,
  characteristics: string,
  context: string,
  link: string,
  altGenres: string[]
}
```

## Validation and safety behavior

- Rows with `enabled != TRUE` are skipped.
- Rows missing required fields are skipped.
- Rows with invalid `link` URLs are skipped.
- If all rows are invalid (or network/publish issue exists), fallback content is used.
- The app displays a non-blocking toast when rows are skipped.

## Troubleshooting

- `Content: Fallback` always appears:
  - Confirm `DATA_SOURCE_URL` is set and publicly readable CSV.
  - Confirm tab headers exactly match required keys.
  - Confirm at least one row has `enabled = TRUE` and valid required fields.
- Settings not applying:
  - Confirm `SETTINGS_SOURCE_URL` points to CSV with `key,value` headers.
  - Check keys are exactly `notebook_url` or `quiz_title`.
- Audio not playing:
  - Verify the `link` URL is valid and embeddable.
  - For Google Drive links, sharing/permissions must allow playback.

## Local run

1. Open `index.html` in a browser.
2. Ensure internet access for external assets and remote sheet loading.

## Live leaderboard setup (shared across users)

The leaderboard UI is built into `index.html` and uses one endpoint for:

- `GET` -> fetch leaderboard entries
- `POST` -> submit a new entry

### 1. Configure endpoint in `index.html`

Set:

- `LEADERBOARD_URL` to your deployed web app URL

### 2. Deploy Google Apps Script backend

Use [`leaderboard.gs`](/Users/aristusachdev/Documents/Desktop - Aristu’s MacBook Air/coding/Civ Music Guesser/leaderboard.gs) as your script code:

1. Create a Google Sheet for leaderboard data.
2. Open **Extensions -> Apps Script**.
3. Paste the contents of `leaderboard.gs`.
4. Save, then click **Deploy -> New deployment -> Web app**.
5. Set access to **Anyone** (or your school domain users).
6. Copy the Web App URL and paste into `LEADERBOARD_URL` in `index.html`.

### 3. Expected payloads

`POST` request body:

```json
{
  "nickname": "Aristu",
  "accuracy": 86,
  "totalQuestions": 14,
  "createdAt": "2026-02-24T20:10:00.000Z"
}
```

Name rule: submissions must include a name (2-24 chars).

Moderation rule: the script writes a `status` column with default `approved`.
Set a row's `status` to `denied` in the sheet to hide it from the leaderboard.

`GET` response can be either:

```json
[
  { "nickname": "Aristu", "accuracy": 86, "totalQuestions": 14, "createdAt": "2026-02-24T20:10:00.000Z" }
]
```

or:

```json
{
  "entries": [
    { "nickname": "Aristu", "accuracy": 86, "totalQuestions": 14, "createdAt": "2026-02-24T20:10:00.000Z" }
  ]
}
```

Ranking is done client-side by `accuracy` only (descending), as requested.
