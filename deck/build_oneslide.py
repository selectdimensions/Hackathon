#!/usr/bin/env python3
"""Generate the TENEBRIS one-slide overview (1-minute pitch) as flat ODF.

Constraints (per request):
  * Arial only for all text.
  * Plain ASCII only -- no em-dashes, middots, degree/plus-minus/times/arrow
    glyphs or any byte > 126.

Run:
    python deck/build_oneslide.py
    soffice --headless --convert-to odp --outdir . deck/tenebris_oneslide.fodp
"""

import base64
import struct
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
WORDMARK = ROOT / "branding" / "tenebris_wordmark.png"
OUT = Path(__file__).resolve().parent / "tenebris_oneslide.fodp"

# TENEBRIS palette (colours are fine; only text must be Arial/ASCII)
NIGHT = "#030712"
PANEL = "#111827"
BORDER = "#1f2937"
INK = "#f3f4f6"
DRIFT = "#9ca3af"
MUTE = "#6b7280"
ACCENT = "#00a9e2"
FONT = "Arial"

PW, PH = 33.867, 19.05
MARGIN = 1.65
COL_W = 14.9
RIGHT_X = MARGIN + COL_W + 0.6
ROW_Y = [4.75, 9.2, 13.65]
CARD_H = 4.2

CARDS = [
    (
        "THE PROBLEM",
        [
            "Belgium fields two jammers; drones arrive by the thousand.",
            "Jam everything and you blind your own GPS, radios, ambulances.",
            "RF scanners are suitcase-sized and read only by a specialist.",
        ],
    ),
    (
        "DON'T JAM. LISTEN.",
        [
            "Detect the exact band: FPV video and control, GNSS, ELRS.",
            "Locate the emitter to +/-1 m with three pods and a ns clock.",
            "Warn the operator by voice in under 0.5 second.",
        ],
    ),
    (
        "HOW IT WORKS",
        [
            "Sense: single-sensor pods listen on one band, encrypted.",
            "Fuse: a master node solves TDOA and projects the threat path.",
            "Warn: the person in that path hears a voice cue. No screen.",
        ],
    ),
    (
        "BUILT TO A HARD SPEC",
        [
            "+/-1 m (50 cm goal); detect in under 0.5 s; 99% track continuity.",
            "3-month battery; -40 to +60 C; 0 to 800 km/h targets.",
            "Air-drop, throw, cannon or drone-place; decoys add coverage.",
        ],
    ),
    (
        "WHY IT WINS",
        [
            "$50-80 per pod vs $500k+ per legacy scanner.",
            "Hundreds of gridded listeners vs two national jammers.",
            "20x the coverage at about 1/15 the cost; EU 868 MHz, legal.",
        ],
    ),
    (
        "THE ASK",
        [
            "Fund a 10-site pilot: one airport, one prison, one embassy.",
            "Every detection geolocated, logged and signed. 30 days.",
            "Partner now, before a costlier, blinder answer wins.",
        ],
    ),
]


def png_size(path):
    head = open(path, "rb").read(24)
    return (
        struct.unpack(">II", head[16:24])
        if head[:8] == b"\x89PNG\r\n\x1a\n"
        else (1000, 250)
    )


def b64(path):
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def p(style, text):
    return f'<text:p text:style-name="{style}">{escape(text)}</text:p>'


def frame(style, x, y, w, h, body):
    return (
        f'<draw:frame draw:style-name="{style}" svg:x="{x}cm" svg:y="{y}cm" '
        f'svg:width="{w}cm" svg:height="{h}cm">{body}</draw:frame>'
    )


def card(x, y, title, lines):
    inner = p("CardHead", title) + "".join(p("CardBullet", "- " + ln) for ln in lines)
    return frame("Card", x, y, COL_W, CARD_H, f"<draw:text-box>{inner}</draw:text-box>")


def para(name, size, color, bold=False, align="start", upper=False, spacing=0.1):
    b = ' fo:font-weight="bold"' if bold else ""
    tt = ' fo:text-transform="uppercase" fo:letter-spacing="0.04cm"' if upper else ""
    return (
        f'<style:style style:name="{name}" style:family="paragraph">'
        f'<style:paragraph-properties fo:text-align="{align}" '
        f'fo:margin-top="{spacing}cm" fo:margin-bottom="{spacing}cm"/>'
        f'<style:text-properties fo:color="{color}" fo:font-size="{size}pt"{b}{tt} '
        f'style:font-name="{FONT}" fo:font-family="{FONT}"/></style:style>'
    )


def build():
    wm_w, wm_h = png_size(WORDMARK)
    wm = b64(WORDMARK)
    disp_w = 11.0
    disp_h = disp_w * (wm_h / wm_w)

    img = frame(
        "frImg",
        MARGIN,
        0.95,
        disp_w,
        disp_h,
        f"<draw:image><office:binary-data>{wm}</office:binary-data></draw:image>",
    )
    head_txt = frame(
        "frPlain",
        13.4,
        1.15,
        19.0,
        2.8,
        "<draw:text-box>"
        + p("Tagline", "Watchful shadows. Passive defense.")
        + p(
            "Lede",
            "Passive counter-drone sensor mesh for Belgium: detect, locate, warn -- before the threat arrives.",
        )
        + "</draw:text-box>",
    )
    rule = (
        f'<draw:rect draw:style-name="Rule" svg:x="{MARGIN}cm" svg:y="4.1cm" '
        f'svg:width="{PW - 2*MARGIN:.2f}cm" svg:height="0.07cm"><text:p/></draw:rect>'
    )

    cards = ""
    for i, (title, lines) in enumerate(CARDS):
        x = MARGIN if i < 3 else RIGHT_X
        y = ROW_Y[i % 3]
        cards += card(x, y, title, lines)

    footer = frame(
        "frPlain",
        MARGIN,
        18.35,
        PW - 2 * MARGIN,
        0.7,
        "<draw:text-box>"
        + p(
            "Footer",
            "TENEBRIS  |  1-minute overview  |  Detect. Locate. Warn. Save lives with cheap, silent technology.",
        )
        + "</draw:text-box>",
    )

    body = img + head_txt + rule + cards + footer

    styles = "<office:styles></office:styles>"
    a = "<office:automatic-styles>"
    a += (
        f'<style:style style:name="dpBg" style:family="drawing-page">'
        f'<style:drawing-page-properties draw:fill="solid" draw:fill-color="{NIGHT}"/></style:style>'
    )
    a += (
        '<style:style style:name="frPlain" style:family="graphic">'
        '<style:graphic-properties draw:fill="none" draw:stroke="none" '
        'draw:textarea-vertical-align="middle" fo:padding="0cm"/></style:style>'
    )
    a += (
        '<style:style style:name="frImg" style:family="graphic">'
        '<style:graphic-properties draw:fill="none" draw:stroke="none" '
        'draw:textarea-vertical-align="middle"/></style:style>'
    )
    a += (
        f'<style:style style:name="Card" style:family="graphic">'
        f'<style:graphic-properties draw:fill="solid" draw:fill-color="{PANEL}" '
        f'draw:stroke="solid" svg:stroke-width="0.02cm" svg:stroke-color="{BORDER}" '
        f'draw:textarea-vertical-align="top" fo:padding="0.3cm"/></style:style>'
    )
    a += (
        f'<style:style style:name="Rule" style:family="graphic">'
        f'<style:graphic-properties draw:fill="solid" draw:fill-color="{ACCENT}" '
        f'draw:stroke="none"/></style:style>'
    )
    a += para("Tagline", 18, ACCENT, bold=True)
    a += para("Lede", 12, INK, spacing=0.12)
    a += para("CardHead", 13, ACCENT, bold=True, upper=True, spacing=0.06)
    a += para("CardBullet", 11, INK, spacing=0.11)
    a += para("Footer", 10, MUTE, align="center")
    a += (
        f'<style:page-layout style:name="PL"><style:page-layout-properties '
        f'fo:page-width="{PW}cm" fo:page-height="{PH}cm" '
        f'style:print-orientation="landscape"/></style:page-layout>'
    )
    a += "</office:automatic-styles>"
    master = (
        '<office:master-styles><style:master-page style:name="Tenebris" '
        'style:page-layout-name="PL"/></office:master-styles>'
    )

    ns = (
        'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" '
        'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" '
        'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" '
        'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" '
        'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"'
    )

    page = (
        f'<draw:page draw:name="overview" draw:style-name="dpBg" '
        f'draw:master-page-name="Tenebris">{body}</draw:page>'
    )
    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<office:document {ns} office:version="1.3" '
        'office:mimetype="application/vnd.oasis.opendocument.presentation">'
        f"{styles}{a}{master}"
        "<office:body><office:presentation>"
        + page
        + "</office:presentation></office:body></office:document>"
    )

    # Guard: the human-readable text must stay pure ASCII. Base64 image data is
    # ASCII by construction, so scanning the whole document is sufficient.
    non_ascii = sorted({c for c in doc if ord(c) > 126})
    if non_ascii:
        raise SystemExit("non-ASCII chars present: " + repr(non_ascii))

    OUT.write_text(doc, encoding="ascii")
    print(f"wrote {OUT} ({len(doc)//1024} KB, 1 slide, ASCII-clean)")


if __name__ == "__main__":
    build()
