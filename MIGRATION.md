# Custom Domain Setup: chessmasti.com on Vercel

Connect your new `chessmasti.com` domain to the existing Vercel deployment.

---

## Step 1: Add Domain in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select the **chess-coach-ai** project
3. Go to **Settings → Domains**
4. Type `chessmasti.com` and click **Add**
5. Vercel will also offer to add `www.chessmasti.com` → accept it (redirects to root)

---

## Step 2: Configure DNS at Your Registrar

Vercel will show you the DNS records to add. Go to wherever you bought `chessmasti.com` and add:

| Type  | Name  | Value                  |
|-------|-------|------------------------|
| A     | `@`   | `76.76.21.21`          |
| CNAME | `www` | `cname.vercel-dns.com` |

> The A record IP is Vercel's standard IP. The www CNAME handles the redirect.

---

## Step 3: Wait for SSL + DNS Propagation

- Vercel automatically provisions a free SSL certificate once DNS is verified
- Usually takes **5-30 minutes**, can take up to 48 hours in rare cases
- Check status in Vercel Dashboard → Settings → Domains (should show green ✓)

---

## Step 4: Update Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/) → Authentication → Settings
2. Under **Authorized domains**, add:
   - `chessmasti.com`
   - `www.chessmasti.com`
3. This allows Google Sign-In to work from the new domain

---

## Step 5: Verify

- [ ] `https://chessmasti.com` loads the app
- [ ] `https://www.chessmasti.com` redirects to `https://chessmasti.com`
- [ ] Google Sign-In works
- [ ] AI Coach chat works
- [ ] Game analysis / Stockfish works
- [ ] SSL padlock shows in browser

---

## Code Changes Made

| File | Change |
|------|--------|
| `src/pages/_document.tsx` | Updated OG/Twitter meta URLs to `chessmasti.com` |
| `src/lib/chess.ts` | Updated PGN Site header to `ChessMasti.com` |
| `src/sections/analysis/panelHeader/loadGame.tsx` | Updated site check to `ChessMasti.com` |
| `package.json` | Updated homepage to `chessmasti.com` |
| `vercel.json` | Updated `NEXT_PUBLIC_SITE_URL` to `chessmasti.com` |
| `cdk/app.ts` | Updated domain to `chessmasti.com` |
| `.env.example` | Added `NEXT_PUBLIC_SITE_URL` |
| `README.md` | Updated all domain references |
