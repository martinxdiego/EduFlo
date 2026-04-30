# EduFlow — Mobile App & PWA Guide

This file documents the mobile-first / PWA / Capacitor work shipped on top of the existing Next.js web app.

## What changed

### 1. Mobile UX
- **Bottom tab bar** (`EduFlow/components/BottomTabBar.js`) — visible on `< sm` viewports, hidden on desktop. Tabs: Start · Bibliothek · Erstellen (primary FAB-style) · Klassen · Mehr. Animated `layoutId` pill with framer-motion.
- **Mobile "Mehr" bottom sheet** (`EduFlow/components/MobileMoreSheet.js`) — opens via the *Mehr* tab and the existing top-bar hamburger. Built on the existing `vaul` Drawer. Contains the full nav (Material / Planung / Classroom) plus Einstellungen + Abmelden.
- **Removed** the legacy mobile dropdown that overlapped the bottom sheet (it shared `mobileNavOpen` state).
- **Chat FAB** moved up on mobile (`bottom-20`/`bottom-32` in edit mode) so it never overlaps the tab bar; `env(safe-area-inset-bottom)` respected.
- **Main content** has `pb-28 sm:pb-32` to clear the tab bar.

### 2. Global mobile CSS (`EduFlow/app/globals.css`)
- Disabled iOS tap-highlight + auto-zoom on inputs (`font-size: 16px` on iOS).
- `overscroll-behavior-y: none` on body to suppress rubber-band.
- `display-mode: standalone` rules disable text-selection/overscroll inside installed PWAs (inputs/contenteditable opt back in).
- Utility classes: `.tap-target` (≥44×44), `.safe-pt/pb/pl/pr/mb/mt`.

### 3. PWA infra
- `EduFlow/public/manifest.webmanifest` — name, short_name, theme_color (#3b82f6), background_color (#f8fafc), display: standalone, icons (SVG + PNG references), 3 app shortcuts (Erstellen / Bibliothek / Hochladen).
- `EduFlow/public/sw.js` — minimal service worker. Cache-first for `/_next/static/*` + icons, network-first for navigations, **never** caches `/api/*`, `/_next/data/*`, `/_next/webpack-hmr`, or cross-origin requests.
- `EduFlow/components/PWARegister.js` — client-only SW registration. **Disabled in dev** (only active in `production` build) to avoid stale dev caches & HMR conflicts.
- `EduFlow/app/layout.js` — Next.js `viewport` (width=device-width, initialScale=1, maximumScale=5, viewportFit=cover) + `themeColor` for light/dark; `apple-mobile-web-app-*` meta tags; `icons` linking to `/icons/icon.svg`; `<PWARegister />` mounted in body.
- `EduFlow/public/icons/icon.svg` — primary PWA icon (matches existing landing-page branding).

### 4. Capacitor scaffolding
- `EduFlow/capacitor.config.ts` — `appId: ch.eduflow.app`, `appName: EduFlow`, splash + theme colors. **Defaults to remote-server mode** because the app uses Next.js API routes that can't survive a static export without further refactor (see decision below).
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` added as dependencies.

> **Technical decision: Capacitor runs the deployed URL by default.**
> The app uses `/api/*` Next.js routes (MongoDB, OpenAI). A pure `output: 'export'` static build would drop those endpoints. The pragmatic short-term path is to ship the native shell as a thin WebView pointing at the production URL (works exactly like a native app from the user's POV). The long-term path requires splitting the API into a separate service. Both are documented below.

## How to run locally

### Web (with mobile UX active)
```bash
cd EduFlow
npm install
npm run dev
# open http://localhost:3000 in Chrome → DevTools → Toggle device → iPhone 14 Pro
```
The bottom tab bar appears below `sm` (640px). The PWA service worker is **off in dev** by design — see §3.

### PWA (production build, installable)
```bash
cd EduFlow
npm run build
npm run start
# visit http://localhost:3000 in Chrome on desktop OR mobile (same network)
# Chrome → ⋮ → "App installieren" / iOS Safari → Share → "Zum Home-Bildschirm"
```
Then verify in Chrome DevTools → **Application** tab:
- Manifest is parsed (no errors)
- Service worker registered, status `activated`
- Lighthouse → PWA audit passes

### Capacitor (iOS / Android shell)

**Prerequisites:** Xcode (iOS) and/or Android Studio installed.

**Option A — Remote-server mode (recommended first):**
```bash
cd EduFlow
# 1. Set CAPACITOR_SERVER_URL to your deployed Next.js URL (or leave default placeholder)
export CAPACITOR_SERVER_URL=https://your-deployed-eduflow.com
# 2. Add native platforms (one-time)
npx cap add ios
npx cap add android
# 3. Sync config
npx cap sync
# 4. Open native IDE
npx cap open ios       # opens Xcode
npx cap open android   # opens Android Studio
```
The native shell loads the production URL inside a WebView. App icons + splash use the values in `capacitor.config.ts` — replace the SVG-based `public/icons/icon.svg` with proper PNG variants in each platform's resource folder before App Store / Play Store submission.

**Option B — Bundled offline build (later):**
1. Split the API: move `EduFlow/app/api/*` to a standalone backend (e.g. Vercel functions, Express on Railway/Fly).
2. Set `NEXT_PUBLIC_API_URL=https://your-api.example.com` in env.
3. Add `output: 'export'` to `next.config.js`.
4. `npm run build` → produces `EduFlow/out/`.
5. Edit `capacitor.config.ts`: remove the `server.url` block (keep only `webDir: 'out'`).
6. `npx cap sync && npx cap open ios`.

## Important files

| Path | Purpose |
|---|---|
| `EduFlow/app/layout.js` | Viewport, theme color, PWA meta tags, SW registration |
| `EduFlow/app/globals.css` | Mobile base CSS (top of file) |
| `EduFlow/public/manifest.webmanifest` | PWA manifest |
| `EduFlow/public/sw.js` | Service worker (production only) |
| `EduFlow/public/icons/icon.svg` | Primary PWA icon |
| `EduFlow/components/PWARegister.js` | Client-side SW registration guard |
| `EduFlow/components/BottomTabBar.js` | Mobile bottom navigation |
| `EduFlow/components/MobileMoreSheet.js` | Bottom sheet for full nav |
| `EduFlow/components/AppContent.js` | Wires BottomTabBar + MoreSheet at the root |
| `EduFlow/capacitor.config.ts` | Capacitor config (remote-URL mode by default) |

## Open follow-ups

- **PNG icons.** The manifest references `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-maskable-512.png`. These are not yet bundled — the SVG is used as fallback. Generate from the existing brand mark before App Store submission. Suggested tool: [PWA Builder Image Generator](https://www.pwabuilder.com/imageGenerator) or `npx pwa-asset-generator public/icons/icon.svg public/icons --background "#f8fafc" --padding "10%"`.
- **Splash screen images for Capacitor.** Generate from same brand mark and place under `ios/App/App/Assets.xcassets/Splash.imageset/` and `android/app/src/main/res/drawable-*/`.
- **Bottom-sheet versions** of remaining `Dialog` instances (currently only the `Mehr` nav uses Drawer). Settings + ConfirmDelete + Export modals would benefit on mobile.
- **Tables → cards on mobile.** `Exporte` and `Klassen-Roster` still render as `<table>` — works but feels desktop-y on phones. Wrap in `hidden sm:table` and add a card list for `< sm`.
- **Capacitor plugins.** When packaging, consider `@capacitor/status-bar`, `@capacitor/keyboard`, `@capacitor/preferences` (replace localStorage on native), `@capacitor/share`, `@capacitor/camera` (replace the WebRTC camera path in `UploadView.js`).
- **API auth on native.** Cookies behave differently in WKWebView; verify the JWT/Google login flow under Capacitor before shipping to TestFlight.

## Quick verification checklist

- [ ] `npm run dev` — landing page renders, no console errors
- [ ] Resize window < 640px — bottom tab bar appears, top header collapses sensibly
- [ ] Tap "Mehr" → bottom sheet opens with full nav
- [ ] Production: `npm run build && npm run start` — Lighthouse PWA score ≥ 90
- [ ] iOS Safari → Add to Home Screen — opens standalone, status bar matches theme
- [ ] `npx cap add ios && npx cap sync && npx cap open ios` — app builds and shows the deployed site
