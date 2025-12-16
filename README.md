## Civ Music Guesser – Music History Listening Lab

An interactive listening lab for music history. The app randomly selects a piece, plays the audio via Google Drive, and asks you to guess the **genre**. After you answer, it reveals the title, composer, context, and key characteristics.

### How it works

- **Player**: Embeds Google Drive preview links in an iframe so audio can play directly in the browser.
- **Quiz flow**:
  - The playlist is shuffled on load.
  - You type a genre (e.g. `Gregorian Chant`, `Fugue`, `Concerto`, `Madrigal`, etc.).
  - The app loosely matches your text against the correct genre and shows a success or error banner.
  - It then reveals detailed information about the piece.
- **Styling**: Uses Tailwind CSS via CDN plus a small amount of custom CSS (glassmorphism, animated gradient background, and smooth reveal animations).

### Running locally

1. Open `index.html` in your browser (double‑click it or drag it into a browser window).
2. Make sure you are online so the Tailwind, icons, and Google Drive audio all load correctly.

### Deploying to GitHub Pages

1. **Create a Git repository (once per project)**  
   Open a terminal in the project folder:
   ```bash
   cd "/Users/aristusachdev/Desktop/coding/Civ Music Guesser"
   git init
   git add .
   git commit -m "Initial commit: Civ Music Guesser"
   ```

2. **Create a GitHub repository**
   - Go to GitHub and create a new repo (for example `civ-music-guesser`) **without** adding any files (no README, no .gitignore).
   - GitHub will show you a URL like `https://github.com/your-username/civ-music-guesser.git`.

3. **Connect local repo to GitHub and push**
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/civ-music-guesser.git
   git branch -M main
   git push -u origin main
   ```

4. **Enable GitHub Pages**
   - In your GitHub repo, go to **Settings → Pages**.
   - Under **Source**, choose **Deploy from a branch**.
   - Select branch: `main`, folder: `/ (root)`.
   - Save. GitHub will build and give you a Pages URL like `https://your-username.github.io/civ-music-guesser/`.

5. **Visit your app**
   - Open the Pages URL in a browser.
   - The app entry file is `index.html` at the repo root, which GitHub Pages will automatically serve.

### Notes

- All audio links are expected to be valid Google Drive file URLs that support preview.  
- Because the app loads external CDNs (Tailwind, lucide icons, canvas-confetti) and Google Drive embeds, it requires an active internet connection to work correctly.




