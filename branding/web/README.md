# branding/web — TENEBRIS web tokens

Single source of truth for the brand on any HTML surface (demo, test harness, future website, PR previews).
**Update here; everything downstream tracks.**

Spec lives in [../Readme.md](../Readme.md) — sections 3 (color), 4 (typography), 6 (iconography). The files here are the executable, copy-no-thinking version of that spec.

## Files

| File | Use |
|---|---|
| [tokens.css](tokens.css) | CSS custom properties — color, spacing, radius, shadow, typography, motion. Import first. |
| [fonts.css](fonts.css) | `@font-face` declarations referencing the local woff2 files. Import second. |
| [fonts/](fonts/) | Vendored Inter (400/500/700), IBM Plex Mono (500/700), JetBrains Mono (400). ~123 KB total. |
| [logo_1bit.svg](logo_1bit.svg) | TENEBRIS monogram, single-fill, `currentColor`-safe. Use for favicon, header, anywhere. |
| [../tenebris_wordmark.png](../tenebris_wordmark.png) | Canonical wordmark lockup (raster). Use at fixed sizes. |
| [../tenebris_favicon_sheet.png](../tenebris_favicon_sheet.png) | Multi-size favicon source. |

## Usage from an HTML surface

```html
<link rel="stylesheet" href="../branding/web/tokens.css">
<link rel="stylesheet" href="../branding/web/fonts.css">
```

Reference tokens semantically — never hard-code hex:

```css
.panel {
  background: var(--bg-panel);
  color: var(--text-primary);
  border: 1px solid var(--border-muted);
  padding: var(--sp-4);
  font-family: var(--font-body);
}
.panel-h {
  font-family: var(--font-display);
  font-size: var(--fs-md);
  letter-spacing: var(--letter-display);
  text-transform: uppercase;
  color: var(--text-secondary);
}
```

## Rules

1. **Never inline a brand hex** in another file — always go through a token. Adding a new color means adding a new token here first.
2. **Never re-declare fonts** with `@font-face` outside this folder.
3. **Never paste the monogram path** inline — link to `logo_1bit.svg` (use `<img src>` or `<svg><use href=…>`).
4. **Voice and copy** (see [../Readme.md](../Readme.md) §7) — use "detect" not "hunt", "identify" not "target", "C&C" or "command-and-control" not "master".

## Consumers (keep this list current)

- [demo/](../../demo/) — main HTML demo + test harness
- _future:_ marketing site, README hero block, PR-preview pages
