# MultiBotV2 Documentation Site

Static HTML — no build step required. Host anywhere that serves HTML files.

## Option 1: GitHub Pages (free, recommended)

1. Push this repository to GitHub
2. Go to **Settings → Pages**
3. Set **Source** to your branch, folder `docs/`
4. Your site will be live at `https://<username>.github.io/<repo>/`

Then set `DOCS_URL=https://<username>.github.io/<repo>/` in your environment variables on Render.

## Option 2: Netlify (free)

1. Drag the `docs/` folder onto [app.netlify.com/drop](https://app.netlify.com/drop)
2. Copy the assigned URL
3. Set `DOCS_URL=<that url>` in your Render environment variables

## Option 3: Vercel (free)

```bash
cd docs
npx vercel
```

## Option 4: Any static host

Upload the contents of `docs/` to any web host that serves static files (Cloudflare Pages, AWS S3, DigitalOcean Spaces, etc.).

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main documentation page |
| `privacy.html` | Privacy policy (legally required if you have EU users) |
| `README.md` | This file |

## Updating the bot's /guide command

After deploying, set the `DOCS_URL` environment variable in your Render dashboard:

```
DOCS_URL=https://your-docs-url.com
```

The `/guide` command reads this variable at runtime.
