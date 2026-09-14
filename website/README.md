# Space-please website

A single static page with no build step: `index.html`, `styles.css` and the images in `assets/`.

## Preview locally

```bash
cd website
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Host it

Upload the contents of this folder to any static host:

- **GitHub Pages:** in the repository settings, go to Pages and deploy from a branch. Either publish this folder's contents from a `gh-pages` branch, or move them into `docs/` on `main`.
- **Netlify, Vercel or Cloudflare Pages:** create a site from the repository, set the publish directory to `website` and leave the build command empty.
- **Any web server:** copy the files to the web root.

## Download links

The download buttons point to
`https://github.com/Thirumurugan7/Space-please/releases/latest/download/Space-please.dmg`.
This always serves the newest release, as long as each release attaches its installer with the file name `Space-please.dmg`.
