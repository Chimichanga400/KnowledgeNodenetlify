# Deploy on Netlify — step by step

This folder is your **"kitchen"**: the AI proxy, the admin dashboard, and a web
copy of the app. Deploy it once and you get a public web address that the phone
app and the dashboard both use. (The paywall is ON — `MANAGED_ONLY: true`.)

## Easiest way: Netlify CLI
1. Install the tool (needs Node.js installed first):
   ```bash
   npm install -g netlify-cli
   ```
2. From **inside this folder**:
   ```bash
   netlify login        # opens your browser to log in (free account)
   netlify deploy --prod
   ```
   When it asks, choose **"Create & configure a new site"** and accept the
   defaults (publish directory: `.`). It will print your live URL, e.g.
   `https://your-site.netlify.app`.

*(Alternative, no terminal: go to app.netlify.com → "Add new site" → "Deploy
manually" → drag this whole folder onto the page. The functions deploy too
because `netlify.toml` declares them.)*

## Set your keys (in Netlify, after the first deploy)
Netlify → your site → **Site configuration → Environment variables → Add**.
Add these, then **re-deploy** (`netlify deploy --prod`) so they take effect.

**Minimum to make AI + dashboard work (start here to confirm it deploys):**
- `ANTHROPIC_API_KEY` = your Claude key  *(or `OPENROUTER_API_KEY` + `DEFAULT_UPSTREAM_PROVIDER=openrouter`)*
- `ADMIN_TOKEN` = a long random password (used to open the dashboard)

**To turn the paywall ON (subscriptions required):**
- `REVENUECAT_SECRET_KEY` = your RevenueCat secret key
- `REVENUECAT_ENTITLEMENT_ID` = `premium`

**For the dashboard to actually switch models live (free Upstash DB):**
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

*(Optional: `OPENROUTER_API_KEY` to switch to cheaper models, `PROXY_APP_TOKEN`,
`DAILY_USER_MAX`, `DAILY_GLOBAL_MAX`.)*

## Your addresses after deploying
- **Web app:** `https://your-site.netlify.app`
- **Admin dashboard:** `https://your-site.netlify.app/admin.html`  ← open in any browser, log in with `ADMIN_TOKEN`
- **The AI proxy (the app uses this):** `https://your-site.netlify.app/.netlify/functions/claude-proxy`

## Quick check it worked
- Open `/admin.html` → enter your `ADMIN_TOKEN` → you should see the current model + a list to switch.
- (If you set only `ANTHROPIC_API_KEY` and skipped RevenueCat, the proxy runs in "dev mode" — fine for confirming the deploy; the paywall turns on once you add `REVENUECAT_SECRET_KEY`.)

## Then connect the phone app
In your Android build, open `www/js/core/AppConfig.js` and set:
```js
PROXY_BASE_URL: 'https://your-site.netlify.app',
```
That's the link between the phone app and this kitchen.
