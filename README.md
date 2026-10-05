# Dynamic Robotics 53

## Run locally
    npm install
    npm run dev

## Publish on GitHub Pages (fixes the blank page)
GitHub Pages cannot run the source code (index.html points to /src/main.tsx). The site must be *built* first.
1. Push this whole folder to your GitHub repo (keep the `.github` folder).
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Push to `main`. The workflow builds and publishes it automatically (Actions tab shows progress).
