#!/usr/bin/env python3
"""Generate the TENEBRIS pitch deck as a flat ODF presentation (.fodp).

Stdlib only. Run this, then convert to .odp with LibreOffice:

    python deck/build_deck.py
    soffice --headless --convert-to odp --outdir . deck/tenebris_pitch.fodp

Brand values come from branding/README.md (TENEBRIS identity package).
"""

import base64
import struct
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
WORDMARK = ROOT / "branding" / "tenebris_wordmark.png"
OUT = Path(__file__).resolve().parent / "tenebris_pitch.fodp"

# --- TENEBRIS palette (branding/README.md, section 3) ---
NIGHT = "#030712"  # primary background (neutral-950)
PANEL = "#111827"  # elevated panel (neutral-900)
BORDER = "#1f2937"  # neutral-800
INK = "#f3f4f6"  # text primary (neutral-100)
DRIFT = "#9ca3af"  # text secondary (neutral-400)
MUTE = "#6b7280"  # neutral-500 (footer)
ACCENT = "#00a9e2"  # Aether Blue
WARN = "#dc2626"  # Trip Red
SUCCESS = "#166534"  # PPS Green

DISPLAY = "IBM Plex Mono"  # headings
BODY = "Inter"  # body

# 16:9 widescreen, in cm
PW, PH = 33.867, 19.05


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", head[16:24])
    return w, h


def b64(path):
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


# ----------------------------------------------------------------------------
# Slide content (verbs-first, all-in vision). Each slide is a dict.
# kinds: title | content | table | section | close
# ----------------------------------------------------------------------------
SLIDES = [
    {"kind": "title"},
    {
        "kind": "content",
        "kicker": "The problem",
        "title": "Two jammers can't guard a nation",
        "bullets": [
            "Jam everything — and you blind your own GPS, radios, and ambulances.",
            "Field two jammers — millions of euros each, slow to move, one frequency at a time.",
            "Deploy RF scanners — suitcase-sized, broadband, readable only by a specialist.",
            "Watch the gap widen — a hobby drone costs less than a phone; the defense costs a fortune.",
        ],
    },
    {
        "kind": "content",
        "kicker": "The flip",
        "title": "Don't jam. Listen.",
        "bullets": [
            "Detect the exact band — FPV video, FPV control, GNSS, ELRS, and beyond.",
            "Locate the emitter to ±1 m — three pods and a nanosecond clock.",
            "Warn the operator by voice — bearing, range, threat — in under half a second.",
            "Decide with the full picture — cue a counter-effector, never blind your own side.",
        ],
    },
    {
        "kind": "content",
        "kicker": "How it works",
        "title": "Three parts. One mission.",
        "bullets": [
            "Sense — single-sensor pods listen on one band, timestamp to the nanosecond, encrypt, send.",
            "Fuse — a beast master node solves the TDOA geometry and projects the threat's path.",
            "Warn — the person in that path hears a voice cue. No screen. No training.",
            "Carry — LoRa 868 MHz, AES-128 encrypted, keys rotate hourly. Capture a pod, learn nothing.",
        ],
    },
    {
        "kind": "content",
        "kicker": "Built to a hard spec",
        "title": "Pinpoint. React. Endure.",
        "bullets": [
            "Pinpoint — ±1 m operational, 50 cm goal: tight enough to cue a counter-effector.",
            "React — detect and localize in under 0.5 second.",
            "Endure — 3-month battery; fast updates when active, near-silent when quiet.",
            "Never blink — 99% of the flight path stays visible, end to end.",
            "Track anything — 0 to 800 km/h, from loitering drone to inbound missile.",
            "Survive the field — −40 °C to +60 °C, air-dropped or thrown into place.",
        ],
    },
    {
        "kind": "content",
        "kicker": "Modular by design",
        "title": "One mesh, many senses",
        "bullets": [
            "Listen across RF today — 2.4 & 5.8 GHz, GNSS L1, 900 MHz / ELRS.",
            "Add acoustic, mmWave, optical — one sensor per pod, mixed to the mission.",
            "Flood the field cheaply — pods cost tens of euros, not hundreds of thousands.",
            "Hide in plain sight — decoy pods (battery + resistor) drain the enemy's jamming budget.",
        ],
    },
    {
        "kind": "content",
        "kicker": "Deploy & resilience",
        "title": "Deploy anywhere. Survive anything.",
        "bullets": [
            "Place pods fast — air-drop, hand-throw, air-cannon, or drone-delivered.",
            "Lose comms, keep watch — a jammed mesh still warns by bearing, offline.",
            "Run redundant masters — fiber-linked, auto-failover, no single blind spot.",
            "Screen the line — cover 10 km × 10 km with ~46 pods + ~50 decoys.",
        ],
    },
    {
        "kind": "table",
        "kicker": "Head to head",
        "title": "Specific beats broadband",
        "head": ["", "Belgium's kit today", "TENEBRIS mesh"],
        "rows": [
            ["Cost", "$500k+ per scanner", "$50–$80 per pod"],
            ["Coverage", "two units, nationally", "hundreds, gridded"],
            ["Form factor", "suitcase / vehicle", "tennis-ball pod"],
            ["Operator", "trained RF technician", "voice cue, no screen"],
            ["Detection", "broadband, noisy", "exact band, surgical"],
            ["If jammed", "blind", "degrades to bearing-only"],
            ["Response", "jam everything", "locate + cue effector"],
        ],
    },
    {
        "kind": "content",
        "kicker": "Scale to Belgium",
        "title": "A national grid, not a national bill",
        "bullets": [
            "Blanket 30,500 km² — one master per cell, pods and decoys per master.",
            "Guard the crown jewels — airports, embassies, prisons, perimeter fences.",
            "Stay legal — EU 868 MHz, license-free, duty-cycle compliant by design.",
            "Swap two jammers for thousands of listeners — 20× the coverage at ~1/15 the cost.",
        ],
    },
    {
        "kind": "content",
        "kicker": "The ask",
        "title": "Fund the pilot. Prove it on Belgian soil.",
        "bullets": [
            "Pilot three sites — one airport, one prison, one embassy. 30 days.",
            "Deliver proof — every detection geolocated, logged, and cryptographically signed.",
            "Scale on success — open architecture, EU-built, export-ready across NATO.",
            "Partner now — before someone sells Belgium a costlier, blinder answer.",
        ],
    },
    {
        "kind": "section",
        "kicker": "Live demo · 3 minutes",
        "title": "See it detect, locate, warn",
        "bullets": [
            "Early warning — a drone closes 10 → 1 km; the earpiece counts the range down and the marker flares red inside 2 km.",
            "GNSS jammer — the master picks the GPS band, surgically, ignoring the rest.",
            "Multi-threat — two cues stack back-to-back; the operator knows both without looking down.",
        ],
    },
    {"kind": "close"},
]


# ----------------------------------------------------------------------------
# ODF builders
# ----------------------------------------------------------------------------
def frame(style, x, y, w, h, body, extra=""):
    return (
        f'<draw:frame draw:style-name="{style}" svg:x="{x}cm" svg:y="{y}cm" '
        f'svg:width="{w}cm" svg:height="{h}cm"{extra}>{body}</draw:frame>'
    )


def textbox(inner):
    return f"<draw:text-box>{inner}</draw:text-box>"


def p(style, text):
    return f'<text:p text:style-name="{style}">{escape(text)}</text:p>'


def bullet_list(items, style="Bullet"):
    lis = "".join(f"<text:list-item>{p(style, t)}</text:list-item>" for t in items)
    return f'<text:list text:style-name="L1">{lis}</text:list>'


def title_block(kicker, title):
    out = ""
    out += frame("frPlain", 1.9, 1.15, 30.0, 0.9, textbox(p("Kicker", kicker)))
    out += frame("frPlain", 1.9, 1.95, 30.0, 2.6, textbox(p("Title", title)))
    # accent rule
    out += (
        '<draw:rect draw:style-name="Rule" svg:x="1.95cm" svg:y="4.35cm" '
        'svg:width="6.2cm" svg:height="0.09cm"><text:p/></draw:rect>'
    )
    return out


def footer(page_no):
    out = ""
    out += frame(
        "frPlain",
        1.9,
        18.05,
        22.0,
        0.7,
        textbox(p("Footer", "TENEBRIS  ·  Watchful shadows. Passive defense.")),
    )
    out += frame(
        "frPlainR",
        27.0,
        18.05,
        4.9,
        0.7,
        textbox(p("FooterR", f"{page_no:02d} / {len(SLIDES):02d}")),
    )
    return out


def slide_title(idx, s, wm_b64, wm_w, wm_h):
    body = ""
    # wordmark, centered upper-middle, aspect-preserved to ~16cm wide
    disp_w = 17.0
    disp_h = disp_w * (wm_h / wm_w) if wm_w else 4.0
    wx = (PW - disp_w) / 2
    img = (
        f'<draw:frame draw:style-name="frImg" svg:x="{wx:.2f}cm" svg:y="4.2cm" '
        f'svg:width="{disp_w:.2f}cm" svg:height="{disp_h:.2f}cm">'
        f"<draw:image><office:binary-data>{wm_b64}</office:binary-data></draw:image>"
        f"</draw:frame>"
    )
    body += img
    ty = 4.2 + disp_h + 0.6
    body += frame(
        "frPlainC",
        2.0,
        ty,
        PW - 4.0,
        1.2,
        textbox(p("Tagline", "Watchful shadows. Passive defense.")),
    )
    body += frame(
        "frPlainC",
        2.0,
        ty + 1.3,
        PW - 4.0,
        1.6,
        textbox(
            p(
                "Lede",
                "A distributed passive sensor mesh that detects, locates, and warns — before the threat arrives.",
            )
        ),
    )
    body += frame(
        "frPlainC",
        2.0,
        PH - 1.5,
        PW - 4.0,
        0.8,
        textbox(
            p(
                "Footer",
                "8-minute brief + live demo  ·  Counter-drone defense for Belgium",
            )
        ),
    )
    return draw_page(idx, body)


def slide_close(idx):
    body = ""
    body += frame("frPlainC", 2.0, 7.2, PW - 4.0, 2.4, textbox(p("TitleC", "TENEBRIS")))
    body += frame(
        "frPlainC",
        2.0,
        9.8,
        PW - 4.0,
        1.2,
        textbox(p("Tagline", "Watchful shadows. Passive defense.")),
    )
    body += frame(
        "frPlainC",
        2.0,
        11.2,
        PW - 4.0,
        1.0,
        textbox(
            p(
                "Lede",
                "Detect. Locate. Warn. Save lives — with cheap, silent technology.",
            )
        ),
    )
    return draw_page(idx, body)


def slide_content(idx, s):
    body = title_block(s["kicker"], s["title"])
    body += frame("frPlain", 1.9, 5.1, 30.2, 12.4, textbox(bullet_list(s["bullets"])))
    body += footer(idx + 1)
    return draw_page(idx, body)


def slide_section(idx, s):
    body = title_block(s["kicker"], s["title"])
    body += frame(
        "frPlain",
        1.9,
        5.1,
        30.2,
        11.0,
        textbox(bullet_list(s["bullets"], style="BulletAccent")),
    )
    body += footer(idx + 1)
    return draw_page(idx, body)


def slide_table(idx, s):
    body = title_block(s["kicker"], s["title"])
    head = s["head"]
    rows = s["rows"]
    cols = len(head)
    colspec = "".join(
        f'<table:table-column table:style-name="co{ i }"/>' for i in range(cols)
    )

    def cell(text, cstyle, pstyle):
        return (
            f'<table:table-cell table:style-name="{cstyle}" office:value-type="string">'
            f"{p(pstyle, text)}</table:table-cell>"
        )

    trs = ""
    # header row
    trs += (
        "<table:table-row>"
        + "".join(
            cell(head[c], "cellHead", "ThAccent" if c == cols - 1 else "Th")
            for c in range(cols)
        )
        + "</table:table-row>"
    )
    for ri, row in enumerate(rows):
        cstyle = "cellAlt" if ri % 2 else "cellBase"
        cells = ""
        for c in range(cols):
            pstyle = "TdKey" if c == 0 else ("TdAccent" if c == cols - 1 else "Td")
            cells += cell(row[c], cstyle, pstyle)
        trs += f"<table:table-row>{cells}</table:table-row>"
    table = f'<table:table table:style-name="tbl">{colspec}{trs}</table:table>'
    body += frame("frPlain", 1.9, 5.1, 30.2, 12.0, table)
    body += footer(idx + 1)
    return draw_page(idx, body)


def draw_page(idx, body):
    return (
        f'<draw:page draw:name="p{idx+1}" draw:style-name="dpBg" '
        f'draw:master-page-name="Tenebris">{body}</draw:page>'
    )


# ----------------------------------------------------------------------------
# Styles
# ----------------------------------------------------------------------------
def styles_xml():
    def para(
        name, font, size, color, bold=False, align="start", spacing=0.15, upper=False
    ):
        b = ' fo:font-weight="bold"' if bold else ""
        tt = ' fo:text-transform="uppercase"' if upper else ""
        ls = ' fo:letter-spacing="0.05cm"' if upper else ""
        return (
            f'<style:style style:name="{name}" style:family="paragraph">'
            f'<style:paragraph-properties fo:text-align="{align}" '
            f'fo:margin-top="{spacing}cm" fo:margin-bottom="{spacing}cm"/>'
            f'<style:text-properties fo:color="{color}" fo:font-size="{size}pt"'
            f'{b}{tt}{ls} style:font-name="{font}" fo:font-family="&apos;{font}&apos;"/>'
            f"</style:style>"
        )

    s = "<office:styles>"
    # list style (bullets)
    s += (
        '<text:list-style style:name="L1">'
        '<text:list-level-style-bullet text:level="1" text:bullet-char="‣">'
        '<style:list-level-properties text:space-before="0cm" text:min-label-width="0.7cm"/>'
        f'<style:text-properties fo:color="{ACCENT}"/>'
        "</text:list-level-style-bullet></text:list-style>"
    )
    s += "</office:styles>"

    # automatic styles (graphic + paragraph + table)
    a = "<office:automatic-styles>"
    # page background graphic style
    a += (
        f'<style:style style:name="dpBg" style:family="drawing-page">'
        f'<style:drawing-page-properties draw:fill="solid" draw:fill-color="{NIGHT}" '
        f'presentation:background-visible="true" presentation:background-objects-visible="true"/>'
        f"</style:style>"
    )
    # frame styles (no border, no fill, vertical centering)
    for nm, valign in [
        ("frPlain", "top"),
        ("frPlainC", "middle"),
        ("frPlainR", "top"),
        ("frImg", "middle"),
    ]:
        a += (
            f'<style:style style:name="{nm}" style:family="graphic">'
            f'<style:graphic-properties draw:fill="none" draw:stroke="none" '
            f'draw:textarea-vertical-align="{valign}" '
            f'fo:padding="0cm" draw:auto-grow-height="false"/>'
            f"</style:style>"
        )
    # accent rule rectangle
    a += (
        f'<style:style style:name="Rule" style:family="graphic">'
        f'<style:graphic-properties draw:fill="solid" draw:fill-color="{ACCENT}" '
        f'draw:stroke="none"/></style:style>'
    )
    # paragraph styles
    a += para("Kicker", BODY, 13, ACCENT, bold=True, upper=True)
    a += para("Title", DISPLAY, 33, INK, bold=True)
    a += para("TitleC", DISPLAY, 44, INK, bold=True, align="center")
    a += para("Tagline", BODY, 17, DRIFT, align="center")
    a += para("Lede", BODY, 15, INK, align="center")
    a += para("Bullet", BODY, 17, INK, spacing=0.22)
    a += para("BulletAccent", BODY, 18, INK, spacing=0.30)
    a += para("Footer", BODY, 9, MUTE)
    a += para("FooterR", BODY, 9, MUTE, align="end")
    # table paragraph styles
    a += para("Th", DISPLAY, 13, DRIFT, bold=True, spacing=0.08)
    a += para("ThAccent", DISPLAY, 13, ACCENT, bold=True, spacing=0.08)
    a += para("Td", BODY, 14, INK, spacing=0.08)
    a += para("TdAccent", BODY, 14, ACCENT, bold=True, spacing=0.08)
    a += para("TdKey", DISPLAY, 13, DRIFT, bold=True, spacing=0.08)
    # table + columns + cells
    a += '<style:style style:name="tbl" style:family="table"><style:table-properties style:width="30.2cm" table:align="left"/></style:style>'
    a += '<style:style style:name="co0" style:family="table-column"><style:table-column-properties style:column-width="6.5cm"/></style:style>'
    a += '<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="11.85cm"/></style:style>'
    a += '<style:style style:name="co2" style:family="table-column"><style:table-column-properties style:column-width="11.85cm"/></style:style>'
    for nm, fill in [("cellHead", NIGHT), ("cellBase", PANEL), ("cellAlt", NIGHT)]:
        a += (
            f'<style:style style:name="{nm}" style:family="table-cell">'
            f'<style:table-cell-properties fo:background-color="{fill}" '
            f'fo:padding="0.18cm" fo:border-bottom="0.01cm solid {BORDER}" '
            f'style:vertical-align="middle"/></style:style>'
        )
    a += "</office:automatic-styles>"

    # master page
    m = (
        "<office:master-styles>"
        '<style:master-page style:name="Tenebris" style:page-layout-name="PL"/>'
        "</office:master-styles>"
    )
    return s, a, m


def build():
    wm_w, wm_h = png_size(WORDMARK) or (1000, 250)
    wm = b64(WORDMARK)
    s, a, m = styles_xml()

    pages = []
    for i, sl in enumerate(SLIDES):
        k = sl["kind"]
        if k == "title":
            pages.append(slide_title(i, sl, wm, wm_w, wm_h))
        elif k == "close":
            pages.append(slide_close(i))
        elif k == "table":
            pages.append(slide_table(i, sl))
        elif k == "section":
            pages.append(slide_section(i, sl))
        else:
            pages.append(slide_content(i, sl))

    ns = (
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
        'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
        'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
        'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/"'
    )

    # NOTE: page-layout must live in document automatic-styles; merge with content
    # automatic styles by concatenating before </office:automatic-styles>.
    a_merged = a.replace(
        "</office:automatic-styles>",
        f'<style:page-layout style:name="PL"><style:page-layout-properties '
        f'fo:page-width="{PW}cm" fo:page-height="{PH}cm" '
        f'style:print-orientation="landscape"/></style:page-layout>'
        "</office:automatic-styles>",
    )

    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<office:document {ns} office:version="1.3" '
        'office:mimetype="application/vnd.oasis.opendocument.presentation">'
        f"{s}{a_merged}{m}"
        "<office:body><office:presentation>"
        + "".join(pages)
        + "</office:presentation></office:body></office:document>"
    )
    OUT.write_text(doc, encoding="utf-8")
    print(f"wrote {OUT}  ({len(doc)//1024} KB, {len(SLIDES)} slides)")


if __name__ == "__main__":
    build()
