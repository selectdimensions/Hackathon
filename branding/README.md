**ROLE**

You are a senior brand designer + creative director with experience in defense-tech, tactical equipment, and developer-tooling brands (Anduril, Shield AI, Tailscale, Linear, Meshtastic). You can write production CSS and SVG, and you understand how to balance "serious capability" with "accessible engineering culture" without tipping into operator-bro aesthetics.



**CONTEXT**

- Project: an open-source, hackathon-built counter-drone RF detection and alert system.

- What it does: a distributed mesh of ESP32-C6 sensor pods listens across RF bands (2.4/5.8 GHz FPV video and control, GNSS L1, 900 MHz/ELRS, future 30–88 MHz tactical). A master node fuses detections via TDOA (time-difference-of-arrival, GPS-PPS synchronized) to localize emitters, encrypts traffic with AES-128-CCM under rotating session keys, and pushes short audio alerts ("threat bearing two-seven-zero, FPV") to soldier-worn nodes via LoRa on 868 MHz.

- Subsystems: `LoRaMeshing/`, `Rx/` (soldier hardware), `DataAnalysisLog/`, `UserNotification/`, `ModuleDesign/` (enclosures + PCB), plus a shared protocol/crypto/audio-cue layer.

- Tone target: protective, calm-under-pressure, precise. Quiet-professional / sensor specialist / radio operator. A humanitarian thread runs through it — this protects people, including in civil and defensive contexts.

- Visual themes available to draw from: mesh topology (nodes + edges), hyperbolic curves (TDOA geometry), bearings/compass rose, RF waveforms, frequency spectrum bars, listening ear, sentinel/owl, lighthouse, epoch/cycle (key rotation).

- Audiences: (a) hackathon judges and open-source developers, (b) potential defense and civil-protection buyers, (c) end-user soldiers/operators who'd wear the hardware.

- Constraints: identity must survive as 1-bit silkscreen on a PCB, embroidered on a velcro morale patch, a 16 px favicon, a website hero, and white-on-black on dark tactical gear.



**TASK**

Deliver a complete brand identity package with these eight sections:



1. **Naming** — 3 candidates, each short, pronounceable, and unclaimed-feeling, with a one-line rationale tying it to the system's function.

2. **Tagline** — 3 options, ≤ 8 words each.

3. **Color system**

   - Primary, secondary, accent, alert/warning, success, plus a neutral ramp (50–950).

   - Each color as hex *and* OKLCH.

   - A `:root { --color-… }` CSS variables block, copy-paste ready.

   - The Tailwind v4 `@theme` equivalent.

   - WCAG AA contrast pairs called out (which text on which background passes).

4. **Typography** — one display, one body, one mono. Open-source / Google Fonts only. Specify weights and a one-line rationale per pick.

5. **Logo**

   - Concept in 3–5 sentences.

   - SVG code for: full lockup, monogram, and a 1-bit silkscreen version.

   - Clear-space rule and minimum-size rule.

6. **Iconography rules** — stroke weight, corner radius, geometric grid, so any future icon stays on-brand.

7. **Voice & messaging**

   - 3 brand pillars (one phrase each).

   - 6 do/don't language pairs (e.g., "say 'detect', not 'hunt'").

   - A 50-word boilerplate paragraph usable in README, pitch deck, and website footer.

8. **Applications**

   - Website hero section as a single self-contained HTML+CSS file, ready to render.

   - README header (markdown + ASCII version of the mark).

   - Velcro morale-patch description (shape, threads, dimensions).

   - PCB silkscreen placement note (where the mark sits, minimum trace width).



**FORMAT**

- One markdown document, sectioned exactly as the eight items above.

- All code in fenced blocks, copy-paste ready (CSS, SVG, HTML, markdown).

- No filler, no "hope this helps," no apology — every line is reference material someone will use.

- Length: as long as needed, but tight.



**EXAMPLES** (style references — for calibration, not to copy)

- Color and layout discipline: Linear, Stripe, Vercel.

- Defense-tech without bombast: Anduril, Shield AI.

- Engineer-friendly warmth: Tailscale, Fly.io.

- Open-source mesh aesthetic: Meshtastic — but more refined and cohesive.



**INSTRUCTIONS**

- Think step-by-step. Before producing deliverables, write a short **design rationale** (5–8 bullets) tying each major choice back to the system's actual function: LoRa mesh → nodes and edges, TDOA → hyperbolic curves, RF → waveform, key rotation → cycles/epochs, soldier-worn → durability and low-vis.

- Consider multiple directions for the logo before committing. Sketch one "obvious" direction and one "less obvious" direction in prose, then pick the stronger one and explain why in two sentences.

- Colors must read in both light and dark mode. The accent must survive being printed in a single ink on green FR-4 PCB substrate (specify which ink color works).

- Avoid clichés: no skulls, no spec-ops trident, no red/white/blue, no crosshairs over a silhouette drone, no "tactical" gradient.

- Treat the patch and silkscreen versions as first-class deliverables, not afterthoughts.

- If you have to choose between "looks cool" and "encodes something true about the system," choose the latter.


# Brand Identity Package: TENEBRIS

**Counter-drone RF detection & alert system — decentralized, passive, resilient.**

---

## Design Rationale

The Tenebris identity package is built on the core principle of "Passive Advantage," balancing "serious capability" with an "accessible, open-source engineering culture."

* **TENEBRIS (Passive Silence):** The system *listens* without emitting RF, ensuring it cannot be localized. This passive stance is core to the branding and the selection of the name "Tenebris" (Latin for darkness/shadow). The visual language emphasizes shadows, watchful presence, and non-aggressive observation.
* **Decentralized Mesh Architecture:** The distributed network of ESP32-C6 sensor pods dictates the need for a robust, modular identity that functions independently and collectively. The visual system uses connected grid structures and node motifs.
* **TDOA Precision:** While the aesthetic is non-aggressive, the system must project precision. Subtle geometric language and mathematically precise curved elements (referencing hyperbolic curves) are used to hint at Time-Difference-of-Arrival localization accuracy.
* **Security (Rotating Keys):** The cryptographic layer and rotating session keys are visualized through subtle circular, progressive, and transactional graphics, suggesting rotational symmetry and secure epochs.
* **Soldier-Worn / Tactical Survivability:** This is a crucial constraint. The identity must function on low-visibility, dark tactical gear, embroidered morale patches, and white-on-black PCB silkscreens. This requires a robust, 1-bit-friendly design with standardized line weights and high contrast. The logo must be legible at small sizes (16px favicon) and maintain its impact when embroidered.

---

## 1. Naming

| Candidate | Rationale |
| --- | --- |
| **TENEBRIS** | **(Selected).** Latin for darkness or shadow. Encodes the core passive, silent function of the system. It is a protective watchful entity that operates from the shadows. |
| **AETHERIS** | Refers to the upper atmosphere or clear sky, the medium the drones operate in and the system senses. Emphasizes scope and clarity. |
| **SENTINEL** | A direct descriptor of the system's role: a decentralized, watchful guard. Fits the protective, non-aggressive tone target. |

---

## 2. Tagline

1. **Watchful shadows. Passive defense.** (Focus on name/concept).
2. **Sensing the silent threat.** (Focus on function).
3. **Decentralized awareness. Human protection.** (Focus on humanitarian thread and mesh aspect).

---

## 3. Color System

The system is defined as "dark mode first," using a muted, technical palette that is legible under variable illumination and low-visibility conditions.

### Palette Rationale

* **Primary (Night Shadow):** Deep, dark charcoal. Provides high contrast for critical data and aligns with the "passive/shadow" theme.
* **Secondary (Drift Gray):** Utility gray for body text and background UI elements.
* **Accent (Aether Blue):** Technical, vibrant blue-green for interactive elements and precision data highlights. (Inspired by engineer-friendly warmth).
* **Alert/Warn (Trip Red):** Critical warnings and detection events. Muted but high-visibility.
* **Success (PPS Green):** Confirmed GPS-PPS synchronization and key rotation success. Technical, clean green.

### CSS Variables (`:root`)

```css
:root {
  /* Neutral Ramp */
  --color-neutral-50:  #F9FAFB;
  --color-neutral-100: #F3F4F6;
  --color-neutral-200: #E5E7EB;
  --color-neutral-300: #D1D5DB;
  --color-neutral-400: #9CA3AF;
  --color-neutral-500: #6B7280;
  --color-neutral-600: #4B5563;
  --color-neutral-700: #374151;
  --color-neutral-800: #1F2937;
  --color-neutral-900: #111827;
  --color-neutral-950: #030712;

  /* Primary (Night Shadow) */
  --color-primary: var(--color-neutral-950);
  
  /* Secondary (Drift Gray) */
  --color-secondary: var(--color-neutral-400);

  /* Accent (Aether Blue) */
  --color-accent-oklch: oklch(74.43% 0.134 191.01);
  --color-accent: #00A9E2; /* fallback hex */

  /* Functional */
  --color-warn: #DC2626; /* Threat Red */
  --color-success: #166534; /* PPS Green */

  /* Semantic UI tokens (Dark Default) */
  --bg-app: var(--color-primary);
  --bg-elevated: var(--color-neutral-900);
  --text-primary: var(--color-neutral-100);
  --text-secondary: var(--color-secondary);
  --border-muted: var(--color-neutral-800);
  --interactive-normal: var(--color-accent);
}

```

### Tailwind v4 `@theme` Equivalent

```css
@theme {
  /* Default Neutral Ramp */
  --color-gray-50:  #F9FAFB;
  --color-gray-100: #F3F4F6;
  --color-gray-200: #E5E7EB;
  --color-gray-300: #D1D5DB;
  --color-gray-400: #9CA3AF;
  --color-gray-500: #6B7280;
  --color-gray-600: #4B5563;
  --color-gray-700: #374151;
  --color-gray-800: #1F2937;
  --color-gray-900: #111827;
  --color-gray-950: #030712;

  /* Primary Mapping */
  --color-primary: var(--color-gray-950);

  /* Secondary Mapping */
  --color-secondary: var(--color-gray-400);

  /* Accent */
  --color-accent: oklch(74.43% 0.134 191.01);

  /* Functional */
  --color-warn: #DC2626;
  --color-success: #166534;
}

```

### WCAG AA Contrast Pairs

* `--color-gray-100` Text on `--color-primary` BG (passes WCAG AAA 14.5:1). Primary data on dark interface.
* `--color-gray-400` Text on `--color-primary` BG (passes WCAG AA 4.7:1). Body text.
* `--color-accent` Text on `--color-primary` BG (passes WCAG AA 3.1:1). High-contrast technical accents.
* `--color-gray-100` Text on `--color-neutral-800` BG (passes WCAG AA 8.3:1). ElevatedButton UI.

---

## 4. Typography

Typography should be open-source, professionally constructed, and balance technical data display with clean interface design.

| Role | Font Family | Weights | Rationale |
| --- | --- | --- | --- |
| **Display** | **IBM Plex Mono** | Bold (700) | For headings, key labels, and data visualizations. Provides a technical, engineered, transactional feel without being overtly "spec-ops." Acknowledge IBM's strong engineering heritage. |
| **Body** | **Inter** | Regular (400), Medium (500) | A clean, readable sans-serif optimized for screens and interface UI. Highly accessible. |
| **Mono** | **JetBrains Mono** | Regular (400) | For displaying actual code snippets, frequencies, packet data, and transactional headers. Built for developer productivity. |

---

## 5. Logo

The TENEBRIS logo, derived from the provided input image, visualizes the "passive shadow" concept. A watchful sentinel character—faceless, representing the calm, decentralized system rather than individual identity—emerges from jagged, shadow-like shapes. The shadow is decentralized and watchful. The aesthetic is monolithic and robust.

### Logo Concept

* **Sentinel:** The central figure is a faceless, monolithic watchman. It signifies passive listening, protection, and observation from the taktischen edge.
* **Shadow:** The jagged shapes surrounding the sentinel are abstract shadow forms, reinforcing the name TENEBRIS and the system’s primary capability of operating passively in the RF background.
* **Monolithic 1-bit:** The design uses clean, bold vectors that easily translate to 1-bit formats (刺繍パッチ, silkscreen) without loss of integrity.

### 1-Bit Silkscreen Version

This version uses simplified shapes and pure `#FFFFFF` for contrast on dark tactical gear or green FR-4 PCBs (as seen in input image). It removes the 3D details. Minimum line thickness is `0.35mm`.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <g fill="#FFFFFF">
    <path d="M 28 8 L 8 48 L 18 68 L 3 88 L 28 100 L 58 100 L 78 88 L 68 68 L 88 48 L 68 8 L 28 8 Z M 28 8" />
    <path d="M 50 18 A 8 8 0 0 1 50 34 A 8 8 0 0 1 50 18 Z M 50 18 M 50 38 L 40 43 L 40 68 L 50 78 L 60 68 L 60 43 L 50 38 Z M 50 38" />
  </g>
</svg>

```

### Full Lockup (SVG)

Uses CSS variables defined in [Section 3](#section-3-color-system) for the dark default presentation.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 140" width="250" height="140">
  <defs>
    <style>
      .tb_night { fill: #111827; } /* --color-neutral-900 BG default for this presentation */
      .tb_drift { fill: #9CA3AF; } /* --color-gray-400 default for this presentation */
      .tb_gray { fill: #E5E7EB; }
      .tb_plex { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 26px; }
      .tb_tagline { font-family: Inter, sans-serif; font-weight: 400; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
    </style>
  </defs>

  <rect width="100%" height="100%" class="tb_night"/>

  <g transform="translate(10, 10)">
    <g transform="translate(0, 0)">
      <path class="tb_ drift" d="M 28 8 L 8 48 L 18 68 L 3 88 L 28 100 L 58 100 L 78 88 L 68 68 L 88 48 L 68 8 L 28 8 Z M 28 8" />
      <path class="tb_drift" d="M 50 18 A 8 8 0 0 1 50 34 A 8 8 0 0 1 50 18 Z M 50 18 M 50 38 L 40 43 L 40 68 L 50 78 L 60 68 L 60 43 L 50 38 Z M 50 38" />
    </g>

    <g transform="translate(0, 105)">
      <text x="0" y="0" class="tb_plex tb_drift">TENEBRIS</text>
      <text x="0" y="20" class="tb_tagline tb_drift">Passive Advantage</text>
    </g>
  </g>
</svg>

```

### Logo Constraints

* **Clear Space:** Minimum clear space surrounding the lockup must be equal to the 'cap height' of the uppercase 'T' in TENEBRIS.
* **Minimum Size (Lockup):** For screen legibility of the tagline, the lockup should not be rendered smaller than `120px` wide.
* **Minimum Size (Monogram - 1bit):** For 1-bit formats (silkscreen/patch), the monogram should not be rendered smaller than `16mm` wide to preserve stroke definition.

---

## 6. Iconography Rules

Iconography is technical, monolinear, and robust, functioning on a pixel-perfect grid. It rejects soft UI trends for technical utility.

* **Geometric Grid:** 24px x 24px pixel grid base.
* **Stroke Weight:** Standard technical stroke of `2px` (equivalent). No variable stroke widths.
* **Corner Radius:** Minimal radius of `1px` or square 90-degree corners, reinforcing technical construction. Avoid soft or rounded aesthetics.
* **Style:** Pure monolinear shapes. No fills. Fills are only used in UI for state differentiation (active vs. inactive), not in the icon definition.
* **Themes:** Draw from mesh topology (nodes/edges), RF waveforms (not aggressive FFT spikes), and precise geometry (hyperbolic hints).

---

## 7. Voice & Messaging

The Tenebris voice is calm, precise, and protective. It balances "quiet professional" capability with "accessible engineering" warmth.

### Brand Pillars

1. **Watchful Silence.** (Encodes the passive, non-emitting function).
2. **Decentralized Resilience.** (Encodes the distributed mesh and open-source nature).
3. **Human Resilience.** (Encodes the humanitarian threat targeting civil protection).

### Do / Don’t Language Pairs

| Say | Don't Say | Rationale |
| --- | --- | --- |
| **Detect** | Hunt | We are a passive defensive system, not an offensive kinetic tool. We sense, we do not pursue. |
| **Silent Watch** | Passive Stalking | Stalking implies aggression; watching implies protective observation. |
| **Resilient Mesh** | Combat Swarm | Swarms imply coordinated attack; mesh implies coordinated data resilience. |
| **Identify** | Target | Targeting implies engagement; identifying implies awareness. |
| **Defensive System** | Weapon System | We are a defensive tool targeting drones, not a combat weapon. |
| **Secure Epoch** | Key Rotation | Epoch is the precise technical term for a synchronized cryptographic period. Use technical precision, not simplified terminology. |

### 50-Word Boilerplate Paragraph

> TENEBRIS is an open-source, hackathon-built counter-drone RF detection and alert system. It deploys a distributed mesh of ESP32-C6 sensor pods to passively sense drone signals via time-difference-of-arrival (TDOA). Encrypted with AES-128-CCM, Tenebris pushes immediate audio alerts to soldier-worn nodes via LoRa, enabling resilient, non-kinetic civil and humanitarian protection.

---

## 8. Applications

### Velcro Morale Patch

* **Rationale:** Low-visibility, high-contrast, durable. Uses the 1-bit simplified monogram.
* **Shape:** rounded rectangle (as seen in input image). Hexagonal optional for mesh theme.
* **Dimensions:** 75mm (W) x 75mm (H).
* **Threads:**
* Base: Tactical Black (Neutral-950 equivalent).
* Embroidery: Stark White 1-bit monogram. Merrowed border.


* **Backing:** Heavy-duty hook velcro.

### PCB Silkscreen Placement

* **Rationale:** identity must survive as 1-bit white-on-black (or black-on-white) on dark tactical gear and PCBs.
* **Formatting:** Use the specified 1-bit silkscreen SVG version only (solid shape figure, simplified shadow). Minimum line width is `0.35mm`.
* **Placement:** The module is modular. The logo (monogram only) must be placed in the lower-right corner of the master fusion node PCB (as seen on the module case in the input image) and on the reverse side of each individual sensor pod PCB, adjacent to the ESP32-C6 module.
* **Revision Mapping:** PCBs must be marked with the project name and revision (e.g., `TENEBRIS REV_1.0`).

### README Header

Markdown structure with a reference to the included 1-bit monochrome SVG asset. Acknowledges the "sentinel/shadow" theme from the input image.

```markdown
# [TENEBRIS Passive Advantage](https://tenebris.systems)

> Open-source, hackathon-built counter-drone RF detection. Decentralized, passive, resilient.

<p align="center">
  <img src="ModuleDesign/logos/tenebris_monogram_1bit.svg" width="100" height="100" alt="Tenebris Monogram (1-bit)">
</p>

[ TENEBRIS ]: Latin root for 'darkness' or 'shadow'. Specializes in microsecond-precision localization without adversary localization risk. A watchful sentinel Special Specialist.

```

### Website Hero Section

A self-contained HTML/CSS file that visualizes the hero section. Uses the dark default palette (`Phase Night`), technical Display typography (`IBM Plex Mono`), and prominent use of the 1-bit TENEBRIS monogram.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TENEBRIS - Silent Watch. Passive Defense.</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --color-primary: #030712;
    --color-gray-100: #F3F4F6;
    --color-gray-400: #9CA3AF;
    --color-gray-800: #1F2937;
    --color-gray-900: #111827;
    --color-accent: oklch(74.43% 0.134 191.01);
  }

  body {
    background-color: var(--color-primary);
    color: var(--color-gray-400);
    font-family: 'Inter', sans-serif;
    font-size: 16px;
    margin: 0;
    line-height: 1.5;
  }

  .wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* Logo Presentation - 1-bit for small size in Nav */
  .header-logo {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    font-size: 20px;
    color: var(--color-gray-100);
    text-transform: uppercase;
  }
  .tb-monogram {
    width: 28px;
    height: 28px;
    fill: var(--color-accent);
  }

  .hero {
    display: flex;
    align-items: center;
    gap: 100px;
  }

  .hero-content {
    flex: 1;
  }

  .tb-tagline {
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    color: var(--color-accent);
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  h1 {
    font-size: 56px;
    line-height: 1.1;
    letter-spacing: -0.04em;
    color: var(--color-gray-100);
    margin: 0 0 24px 0;
  }

  .hero-p {
    font-size: 18px;
    max-width: 500px;
    margin-bottom: 40px;
  }

  .cta-row {
    display: flex;
    gap: 16px;
  }

  .btn {
    font-weight: 500;
    padding: 12px 24px;
    border-radius: 6px;
    text-decoration: none;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background-color: var(--color-accent);
    color: var(--color-gray-950);
  }

  .btn-primary:hover {
    background-color: oklch(79% 0.134 191.01);
  }

  .btn-secondary {
    border: 1px solid var(--color-gray-800);
    color: var(--color-gray-100);
  }

  .btn-secondary:hover {
    background-color: var(--color-gray-900);
  }

  .hero-graphic {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
  }

  /* Echoing the watchful, emerging shadow from the input image */
  .watchman-graphic {
    width: 250px;
    height: 250px;
    fill: var(--color-gray-100);
    opacity: 0.1;
  }

</style>
</head>
<body>
<div class="wrapper">
  
  <header class="wrapper" style="height: auto; padding: 40px 0;">
    <div class="header-logo">
      <svg class="tb-monogram" viewBox="0 0 100 100">
          <path d="M 28 8 L 8 48 L 18 68 L 3 88 L 28 100 L 58 100 L 78 88 L 68 68 L 88 48 L 68 8 L 28 8 Z M 28 8" />
          <path d="M 50 18 A 8 8 0 0 1 50 34 A 8 8 0 0 1 50 18 Z M 50 18 M 50 38 L 40 43 L 40 68 L 50 78 L 60 68 L 60 43 L 50 38 Z M 50 38" />
      </svg>
      Tenebris
    </div>
  </header>

  <section class="hero">
    <div class="hero-content">
      <div class="tb-tagline">Silent Watch. Passive Defense.</div>
      <h1>Decentralized RF Detection.</h1>
      <p class="hero-p">A distributed mesh of ESP32-C6 sensor pods localizes emitters with микросекундная precision. Open-source awareness for civil protection.</p>
      <div class="cta-row">
        <a href="#build" class="btn btn-primary">Build a Node</a>
        <a href="#github" class="btn btn-secondary">Review Codebase</a>
      </div>
    </div>
    
    <div class="hero-graphic">
      <svg class="tb-monogram watchman-graphic" viewBox="0 0 100 100">
          <path d="M 28 8 L 8 48 L 18 68 L 3 88 L 28 100 L 58 100 L 78 88 L 68 68 L 88 48 L 68 8 L 28 8 Z M 28 8" />
          <path d="M 50 18 A 8 8 0 0 1 50 34 A 8 8 0 0 1 50 18 Z M 50 18 M 50 38 L 40 43 L 40 68 L 50 78 L 60 68 L 60 43 L 50 38 Z M 50 38" />
      </svg>
    </div>
  </section>
</div>
</body>
</html>

```