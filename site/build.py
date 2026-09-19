#!/usr/bin/env python3
"""ForgeBoard site generator.

Renders the static pages from one board dataset, so the product pages, the
compare table and the docs index can never drift apart.

    python3 site/build.py

Writes only .html files. Never touches assets/, css/ or js/.
"""

from __future__ import annotations

import html
import pathlib
import sys

import hotspots

ROOT = pathlib.Path(__file__).resolve().parent

# --------------------------------------------------------------------------
# Data — ported from the ForgeBoard v2 design.
# --------------------------------------------------------------------------

BOARDS = [
    {
        "id": "spark",
        "name": "Spark",
        "tag": "Start here.",
        "chip_line": "ESP32-S3 · 240 MHz dual-core",
        "mcu": "ESP32-S3",
        "clock": "240 MHz",
        "wireless": "Wi-Fi 4 + BLE 5.0",
        "gpio": "32",
        "size": "",
        "temp_note": "Dual voltage regulator, breadboard-friendly.",
        "tagline": (
            "Clean, uncluttered and hard to break. 32 pins on breadboard-friendly "
            "headers, wireless built in, and the ForgeBoard IDE ready on day one."
        ),
        "highlights": [
            "Breadboard-friendly, 32 GPIO",
            "Wi-Fi & Bluetooth 5.0 built in",
            "Survives static & reversed power",
            "USB-C — no adapter, no driver hunt",
            "RGB LED for your first “hello”",
            "One-click flash from the ForgeBoard IDE",
        ],
        "specs": [
            ("Processor", "ESP32-S3 dual-core Xtensa 32-bit LX7, 240 MHz"),
            ("Wi-Fi", "IEEE 802.11 b/g/n (2.4 GHz), up to 150 Mbps (HT40)"),
            ("Bluetooth", "Bluetooth 5.0 LE, 125 kbps to 2 Mbps"),
            ("GPIO", "32 programmable pins on headers"),
            ("Interfaces", "2× ADC, 3× UART, 2× SPI, 2× I2C, 2× I2S"),
            ("PWM", "8-channel LED PWM, 2× motor-control PWM"),
            ("USB", "USB Type-C 2.0, data + power"),
            ("Input", "USB-C / 5–12 V DC, dual voltage regulator"),
            ("Protection", "USB ESD protection, reverse-polarity protection"),
            ("LEDs", "1× addressable RGB (16M colours), 1× GPIO LED"),
            ("Buttons", "RST + BOOT"),
            ("Programming", "USB-C, OTA over Wi-Fi / BLE"),
            ("Compliance", "RoHS · CE · FCC pre-certified components"),
        ],
        "works_with": ["ForgeBoard IDE", "USB-C flashing", "OTA over Wi-Fi & BLE"],
    },
    {
        "id": "sprint",
        "name": "Sprint",
        "tag": "Ready before you are.",
        "chip_line": "ESP32-S3 · 240 MHz dual-core",
        "mcu": "ESP32-S3",
        "clock": "240 MHz",
        "wireless": "Wi-Fi 4 + BLE 5.0",
        "gpio": "19",
        "size": "",
        "temp_note": "On-board 1S Li-ion charging with status LEDs.",
        "tagline": (
            "Everything a first real project needs, on one board. Sensors, wireless "
            "and Li-ion charging — so the weekend goes into the idea, not the breadboard."
        ),
        "highlights": [
            "4 sensors & a buzzer on board",
            "Charges a Li-ion cell — runs unplugged",
            "Wi-Fi & Bluetooth 5.0 built in",
            "19 GPIO still free for your parts",
            "USB-C, ESD & thermal protection",
            "Updates over the air — Wi-Fi or BLE",
        ],
        "specs": [
            ("Processor", "ESP32-S3 dual-core Xtensa 32-bit LX7, 240 MHz"),
            ("Wi-Fi", "IEEE 802.11 b/g/n (2.4 GHz), up to 150 Mbps (HT40)"),
            ("Bluetooth", "Bluetooth 5.0 LE, 125 kbps to 2 Mbps"),
            ("Sensors", "IR sensor, light sensor (LDR), DHT11 temperature & humidity, piezo buzzer"),
            ("Battery", "1S Li-ion, 4.2 V charge up to 1 A; charge & standby LEDs"),
            ("GPIO", "19 programmable pins on headers"),
            ("Interfaces", "2× ADC, 3× UART, 2× SPI, 2× I2C, 2× I2S"),
            ("PWM", "8-channel LED PWM, 2× motor-control PWM"),
            ("USB", "USB Type-C 2.0, data + power; 5–12 V DC in"),
            ("Protection", "USB ESD, reverse-polarity, thermal shutdown"),
            ("LEDs", "1× addressable RGB (16M colours), 1× GPIO LED"),
            ("Buttons", "RST + BOOT"),
            ("Programming", "USB-C, OTA over Wi-Fi / BLE"),
            ("Compliance", "RoHS · CE · FCC pre-certified components"),
        ],
        "works_with": ["ForgeBoard IDE", "USB-C flashing", "OTA over Wi-Fi & BLE"],
    },
    {
        "id": "indus",
        "name": "Indus",
        "tag": "For your toughest challenges.",
        "chip_line": "STM32G4 · 170 MHz Cortex-M4F",
        "mcu": "STM32G484",
        "clock": "170 MHz",
        "wireless": "—",
        "gpio": "50",
        "size": "35 × 56 mm",
        "temp_note": "Industrial temperature grade, –40 °C to +85 °C.",
        "tagline": (
            "The board you put in the product. Industrial temperature range, CAN FD, "
            "motor-control timers and hardware encryption — with the protection to "
            "survive the plant floor."
        ),
        "highlights": [
            "Rated –40 to +85 °C",
            "3 CAN FD buses at 8 Mbit/s",
            "Encrypts in hardware, AES-256",
            "Shrugs off ±15 kV static",
            "Drives motors with 184 ps timing",
            "Debug over SWD, 50 GPIO",
        ],
        "specs": [
            ("Processor", "STM32G484RET6 Arm Cortex-M4 with FPU & DSP, 170 MHz, 213 DMIPS / 550 CoreMark"),
            ("Grade", "Industrial temperature, –40 °C to +85 °C"),
            ("Memory", "512 KB dual-bank Flash with ECC, 128 KB SRAM, CCM-SRAM"),
            ("Security", "Hardware AES-256, securable memory area, SRAM parity, secure live upgrade"),
            ("Analogue", "Up to 5× 12-bit ADC at 4 Msps (16-bit oversampling), 7× DAC, 6× op-amp with PGA, 7× comparator"),
            ("Maths", "CORDIC trigonometric engine, FMAC filter accelerator"),
            ("Timers & PWM", "12-channel high-resolution timer (184 ps), motor-control PWM with dead-time insertion"),
            ("Interfaces", "3× CAN FD (8 Mbit/s), 4× I2C, 4× SPI / I2S, USART · UART · LPUART, SAI, Quad-SPI"),
            ("GPIO", "50 programmable pins on 2.54 mm headers"),
            ("USB", "USB Type-C 2.0, data + power, on-board USB-to-serial"),
            ("Power", "2 A synchronous buck, up to 96 % efficient, 1 A 3.3 V rail"),
            ("Protection", "USB ESD (IEC 61000-4-2 level 4, ±15 kV air / ±8 kV contact), reverse-polarity, over-current, thermal shutdown"),
            ("LEDs", "1× addressable RGB (16M colours), 1× GPIO LED"),
            ("Buttons", "RST + BOOT"),
            ("Debug", "SWD (SWCLK, SWDIO, SWO) on headers"),
            ("Board size", "35 × 56 mm"),
        ],
        "works_with": ["ForgeBoard IDE", "USB-C flashing", "SWD debug"],
    },
    {
        "id": "flint",
        "name": "Flint",
        "tag": "Small board. Long reach.",
        "chip_line": "ESP8266 · 80–160 MHz",
        "mcu": "ESP8266EX",
        "clock": "80–160 MHz",
        "wireless": "Wi-Fi 4",
        "gpio": "12",
        "size": "50 × 30 mm",
        "temp_note": "Operating range –40 °C to +85 °C. 20 µA in deep sleep.",
        "tagline": (
            "The node board. Fits where nothing else does, runs for months on a "
            "battery, and talks to your network out of the box."
        ),
        "highlights": [
            "50 × 30 mm",
            "Months on a battery — 20 µA asleep",
            "Wi-Fi with +20 dBm on-board antenna",
            "USB-C, no driver hunt",
            "Reverse-polarity protected",
            "Same ForgeBoard IDE as the rest",
        ],
        "specs": [
            ("Processor", "ESP8266EX Tensilica L106 32-bit RISC, 80 MHz (up to 160 MHz)"),
            ("Memory", "4 MB SPI flash, 50 KB RAM"),
            ("Wi-Fi", "IEEE 802.11 b/g/n (2.4 GHz), up to 72.2 Mbps, WPA / WPA2"),
            ("Network", "Integrated TCP/IP stack — IPv4, TCP, UDP, HTTP; station, soft-AP & combined"),
            ("Radio", "On-board PCB antenna, integrated PA / LNA / balun, TX +20 dBm (802.11b)"),
            ("Analogue", "1× 10-bit SAR ADC, 0–1.0 V"),
            ("Interfaces", "2× UART (UART1 TX-only), SPI & HSPI, I2S with DMA; software I2C (100 kHz), PWM, IR remote"),
            ("GPIO", "12 programmable pins on headers"),
            ("USB", "USB Type-C 2.0, data + power, on-board USB-to-serial, 50 bps to 2 Mbps"),
            ("Power", "1 A low-noise CMOS LDO, 450 mV dropout, over-current & over-temperature protection"),
            ("Protection", "Reverse-polarity — P-channel MOSFET (30 V, 4 A) + 40 V / 3 A Schottky"),
            ("Power saving", "80 mA average, 20 µA deep sleep"),
            ("LEDs", "2× LED (power, GPIO)"),
            ("Buttons", "RST + FLASH"),
            ("Operating temp.", "–40 °C to +85 °C"),
            ("Board size", "50 × 30 mm"),
        ],
        "works_with": ["ForgeBoard IDE", "USB-C flashing", "On-board USB-to-serial"],
    },
]

BY_ID = {b["id"]: b for b in BOARDS}

STATEMENT = (
    "Four boards. One connector, one protection stack, one IDE. Easy to start "
    "with, hard to break — and built to be designed straight into the product."
)

# Home §03: which board for which job. (board id, the situation, why that board)
CHOOSER = [
    ("spark", "Your first project",
     "Breadboard-friendly, Wi-Fi and Bluetooth built in, and the ForgeBoard IDE ready on day one."),
    ("sprint", "Sensors & IoT",
     "Four sensors and a buzzer already on the board, and it charges a Li-ion cell."),
    ("indus", "Your most ambitious project",
     "Rated –40 to +85 °C, 3× CAN FD, motor-control timers and AES-256 in hardware."),
    ("flint", "Small Wi-Fi nodes",
     "20 µA asleep, Wi-Fi with an on-board antenna, and only 50 × 30 mm."),
]

# What people build with them — the band under the chooser.
TICKER = [
    "Robotics",
    "Drones",
    "Motor drives",
    "CAN networks",
    "Weather stations",
    "Smart farms",
    "Classrooms",
    "Data loggers",
    "Home automation",
]

DOWNLOADS = [
    "Datasheet (PDF)",
    "Pinout diagram",
    "Schematic",
    "Mechanical drawing",
    "Getting started guide",
]

COMPARE_ROWS = [
    ("MCU", [b["mcu"] for b in BOARDS]),
    ("Clock", [b["clock"] for b in BOARDS]),
    ("Wireless", [b["wireless"] for b in BOARDS]),
    ("GPIO", [b["gpio"] for b in BOARDS]),
    ("Board size", ["On request", "On request", "35 × 56 mm", "50 × 30 mm"]),
    ("Sensors on board", ["—", "DHT11, LDR, IR, buzzer", "—", "—"]),
    ("Battery charging", ["—", "1S Li-ion, 1 A", "—", "—"]),
    ("CAN", ["CAN (TWAI)", "CAN (TWAI)", "3× CAN FD, 8 Mbit/s", "—"]),
    ("Hardware crypto", ["—", "—", "AES-256", "—"]),
    ("Protection", [
        "ESD, reverse polarity",
        "ESD, reverse polarity, thermal",
        "ESD ±15 kV, reverse polarity, over-current, thermal",
        "Reverse polarity, over-current, over-temp",
    ]),
    ("Debug", ["USB", "USB", "USB + SWD", "USB"]),
    ("Temperature", ["Commercial", "Commercial", "–40 to +85 °C", "–40 to +85 °C"]),
    ("Best for", [
        "Learning, first projects",
        "Sensor & IoT projects",
        "Products, motor control, CAN networks",
        "Battery Wi-Fi nodes",
    ]),
]

# Hero arrangement: (id, hero offset, tilt, column height)
HERO = [
    ("spark", "0", "12", "56vh"),
    ("sprint", "18vh", "10", "50vh"),
    ("indus", "-4vh", "12", "56vh"),
    ("flint", "10vh", "14", "56vh"),
]

# Canonical origin, used for absolute URLs (social previews, canonical links).
# forgeboards.in redirects here.
SITE_URL = "https://forgeboards.com"

CONTACT = {
    "phone": "+91 96377 64898",
    "phone_href": "tel:+919637764898",
    "email": "contact@defenceforgeindustries.com",
    "address": (
        "Defence Forge Laboratory, AIC MIT-ADT Incubator Forum, "
        "Loni Kalbhor, Pune, Maharashtra 412201"
    ),
    "gst": "27AAJCD7152J1ZC",
    "cin": "U29299MH2022PTC394626",
    "dipp": "DIPP121991",
}

# --------------------------------------------------------------------------
# Board callouts
#
# What gets a label on the 3D board, and what each one says. The *position*
# is not here: `hotspots.py` reads it out of the model at build time, by the
# material the part is made of, so a callout cannot end up pointing at bare
# board. All this table does is choose which parts are worth naming and what
# to call them.
#
# The second field is the material, the third picks between parts when one
# material covers several: "x<0" is the left half of the board as the top
# render is framed (+x is render-right on every one of these boards), "big"
# is the body rather than the pins or the lens sitting on it. Which button is
# which comes from the silkscreen in the top renders, not from the model --
# the model knows there are two buttons but not their names.
#
# `spec` ties the callout to a row of the spec table below, so hovering
# either one lights the other. It must match a key in that board's `specs`.
# --------------------------------------------------------------------------

# Only Sprint ships callouts for now — the other three are drafted but not
# wired, so the pattern gets proved on one board before it is repeated.
CALLOUT_BOARDS = {"sprint"}

# (key, material, which one, title, second line, spec row, side)
#
# `which one`: None when the material is one part; "big" for the body rather
# than its pins or lens; "x<0" / "z>0" for a side of the board; "near:x,z"
# for millimetre coordinates when nothing else separates them. "@x,z" hangs
# the callout on a bare point instead of a part, for the pin headers, whose
# pads share one material with every other pad on the board.
#
# `side` is which column the label sits in. Normally None: the side is taken
# from which half of the board the part is actually on, worked out once at
# build time from the board at rest, so no wire has to cross the board to
# reach its label and no label moves as the board turns. The design sheet
# puts them the other way round because it shows the board turned about half
# a revolution from how the page presents it — the module reads right there
# and left here — so its column assignment does not carry over. Set "l" or
# "r" to override.
FEATURES = {
    "sprint": [
        ("dht", "DHT11_Blue", "big", "(DHT11)",
         "Temperature + Humidity", "Sensors", None),
        ("led", "LED_0603_Yellow", None, "LED",
         "", "LEDs", None),
        ("buzzer", "Buzzer_Black", None, "Piezo Buzzer",
         "", "Sensors", None),
        ("ldr", "LDR_Face", None, "LDR Sensor",
         "", "Sensors", None),
        ("ir", "IR_Receiver_Black", "big", "Infrared Sensor",
         "", "Sensors", None),
        # The 8-pin charger between the charge port and the battery pads.
        ("bms", "IC_Body_Black", "near:11.0,4.6", "Battery Charging (BMS)",
         "", "Battery", None),

        ("usb", "USB_Shell_Steel", "z>0", "USB-C for programming",
         "", "USB", None),
        ("antenna", "Module_Antenna_Black", None, "WiFi + BLE 5.0",
         "", "Wi-Fi", None),
        ("mcu", "Module_Shield_Steel", None, "ESP32 S3",
         "Dual Core 240 MHz", "Processor", None),
        ("rgb", "LED_Lens_Orange", None, "RGB LED",
         "16M Colours", "LEDs", None),
        ("gpio", "@-5.4,-19.0", None, "19 GPIO Pins",
         "SPI · I2C · UART · I2S · CAN · USB OTG", "GPIO", None),
        ("charge", "USB_Shell_Steel", "z<0", "USB-C for charging",
         "", "Battery", None),
    ],
}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

e = html.escape

# Terms the design sets with a non-breaking hyphen (U+2011) so they never wrap
# mid-word. Longest first, so "USB-to-serial" wins over "USB-C" style prefixes.
NB_TERMS = sorted(
    [
        "10-bit", "12-bit", "12-channel", "16-bit", "32-bit", "61000-4-2",
        "8-channel", "AES-256", "Breadboard-friendly", "CCM-SRAM",
        "Cortex-M4F", "Cortex-M4", "DPIIT-recognised", "ESP32-S3", "ESP-IDF",
        "Li-ion", "MIT-ADT", "On-board", "P-channel", "Quad-SPI",
        "Reverse-polarity", "TX-only", "Type-C", "USB-to-serial", "USB-C",
        "Wi-Fi", "breadboard-friendly", "dead-time", "dual-bank", "dual-core",
        "getting-started", "high-resolution", "low-noise", "motor-control",
        "on-board", "op-amp", "over-current", "over-temperature", "over-temp",
        "pre-certified", "reverse-polarity", "soft-AP",
    ],
    key=len,
    reverse=True,
)


def nb(text: str) -> str:
    """Swap ASCII hyphens for U+2011 in the terms the design pins."""
    for term in NB_TERMS:
        if term in text:
            text = text.replace(term, term.replace("-", "‑"))
    return text


import hashlib


def version(rel: str) -> str:
    """Short content hash, appended as ?v= so browsers cache aggressively
    yet always fetch a changed file. Vendored three.js is pinned and needs none."""
    return hashlib.md5((ROOT / rel).read_bytes()).hexdigest()[:8]


def asset(r: str, rel: str) -> str:
    return f"{r}{rel}?v={version(rel)}"


def depth_prefix(out_path: str) -> str:
    """Relative path back to site root from a generated page."""
    depth = out_path.count("/")
    return "../" * depth if depth else ""


def render(img_id: str, view: str) -> str:
    return f"assets/boards/{img_id}-{view}.webp"


def render_sm(img_id: str, view: str) -> str:
    """Half-size variant, served to phones via srcset."""
    return f"assets/boards/{img_id}-{view}-sm.webp"


def webp_size(rel: str) -> tuple[int, int]:
    """Intrinsic pixel size of a WebP, read straight from the container.

    Used for srcset width descriptors, so the browser can pick the right
    file. No third-party imaging library needed at build time.
    """
    data = (ROOT / rel).read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError(f"not a WebP: {rel}")
    fmt = data[12:16]
    if fmt == b"VP8X":
        w = int.from_bytes(data[24:27], "little") + 1
        h = int.from_bytes(data[27:30], "little") + 1
    elif fmt == b"VP8L":
        b = int.from_bytes(data[21:25], "little")
        w = (b & 0x3FFF) + 1
        h = ((b >> 14) & 0x3FFF) + 1
    elif fmt == b"VP8 ":
        w = int.from_bytes(data[26:28], "little") & 0x3FFF
        h = int.from_bytes(data[28:30], "little") & 0x3FFF
    else:
        raise ValueError(f"unknown WebP form {fmt!r} in {rel}")
    return w, h


def callouts(b: dict) -> str:
    """The callout layer for a board.

    Resolves every row of FEATURES against the board's own model, so the
    lines point at the parts' real positions. A material that is missing, or
    a selector that does not land on exactly one part, stops the build rather
    than shipping a label pointing at bare board.

    The markup is a plain list, readable with no CSS and no JavaScript.
    `fb-board` takes it over once the model is up and holds each label in its
    column with a line drawn to its part; until then, and on anything without
    WebGL, it reads as what it is: a list of what is on the board.
    """
    rows = FEATURES.get(b["id"], []) if b["id"] in CALLOUT_BOARDS else []
    if not rows:
        return ""

    mats = {r[1] for r in rows if not r[1].startswith("@")}
    parts = hotspots.read(ROOT / "assets" / "models" / f"{b['id']}.glb", mats)
    spec_keys = {k for k, _ in b["specs"]}

    items = []
    for key, material, where, title, sub, spec, side in rows:
        if material.startswith("@"):
            x_mm, z_mm = (float(v) for v in material[1:].split(","))
            part = hotspots.at(parts, x_mm, z_mm)
        else:
            try:
                part = hotspots.pick(parts, material, where)
            except LookupError as exc:
                raise SystemExit(f"{b['id']}: callout {key!r} — {exc}") from None
        if spec not in spec_keys:
            raise SystemExit(
                f"{b['id']}: callout {key!r} links to spec {spec!r}, "
                f"which that board does not have")

        # Which column: the half of the board the part is on, unless the
        # table insists. At rest the board faces the camera square on, so the
        # sign of its own x is the side of the screen it appears on.
        side = side or ("l" if part.centre[0] < 0 else "r")
        ax = ",".join(f"{v:.5f}" for v in part.anchor())
        nm = ",".join(f"{v:.0f}" for v in part.normal())
        sub_html = f'<i>{nb(e(sub))}</i>' if sub else ""
        items.append(
            f'<li class="hs-item"><button type="button" class="hs-pt hs-{side}" '
            f'data-hs="{e(key)}" data-p="{ax}" data-n="{nm}" '
            f'data-side="{side}" data-spec="{e(spec)}">'
            f'<span class="hs-txt"><b>{nb(e(title))}</b>{sub_html}</span>'
            f'</button></li>'
        )

    return (
        '<div class="hs" data-hs-layer>'
        '<p class="hs-lede eyebrow mono-muted">On the board</p>'
        f'<ol class="hs-list">{"".join(items)}</ol>'
        '<svg class="hs-wires" aria-hidden="true"></svg>'
        '</div>'
    )


def spec_line(b: dict) -> str:
    """The one-line spec shown under the hero board. Boards with no radio
    (Indus carries an em dash) simply drop that term."""
    bits = [b["mcu"], b["clock"]]
    if b["wireless"] and b["wireless"] not in ("—", "-", ""):
        bits.append(b["wireless"])
    bits.append(f"{b['gpio']} GPIO")
    return " · ".join(bits)


def srcset(full: str, small: str) -> str:
    """srcset pairing the phone-sized render with the full one."""
    return f"{small} {webp_size(small)[0]}w, {full} {webp_size(full)[0]}w"


def shell(*, out_path: str, title: str, description: str, body: str,
          nav_key: str = "", model_preload: str = "") -> str:
    """Wrap page body in the document, header and footer.

    The header has one appearance on every page. It used to take an
    `over_dark` flag for pages that opened on a dark panel, back when the page
    was cream with dark panels cut into it; the site is charcoal throughout
    now, so there is nothing to swap between.
    """
    r = depth_prefix(out_path)
    root = r or "./"          # "" would mean "this document", not the root
    page_url = SITE_URL + "/" + out_path[: -len("index.html")]

    def cur(key: str) -> str:
        return ' aria-current="page"' if key == nav_key else ""

    # "home" is the site root, so it has no path segment of its own.
    nav_items = [("home", "Home"), ("boards", "Boards"), ("compare", "Compare"),
                 ("store", "Store"), ("software", "Software"), ("docs", "Docs"),
                 ("about", "About")]
    nav_html = "".join(
        f'<a href="{root if slug == "home" else r + slug + "/"}"{cur(slug)}>{label}</a>'
        for slug, label in nav_items
    )

    foot_boards = "".join(
        f'<a href="{r}boards/{b["id"]}/">{b["name"]}</a>' for b in BOARDS
    )
    nav_id = "primary-nav"

    needs_board = "<fb-board" in body
    needs_orbit = 'class="hero-scene"' in body
    has_model = "assets/models/" in body
    script_tags = (
        f'<script src="{asset(r, "js/fb-board.js")}" defer></script>' if needs_board else ""
    )
    if needs_orbit:
        script_tags += f'<script src="{asset(r, "js/fb-orbit.js")}" defer></script>'
    if has_model:
        # The import map names the vendored three.js so the loader's bare
        # `import 'three'` resolves to the same copy the component loads.
        # Preloading starts the 650 KB library fetch before any script runs.
        script_tags = (
            # `root`, not `r`: an import map address must start with / ./ or ..
            # A bare "js/…" is not a valid address, so the whole mapping would
            # be dropped — on the home page, the one page where r is empty.
            '<script type="importmap">{"imports":{"three":"' + root + 'js/vendor/three.module.min.js"}}</script>'
            + f'<link rel="modulepreload" href="{r}js/vendor/three.module.min.js">'
            + f'<link rel="modulepreload" href="{r}js/vendor/loaders/GLTFLoader.js">'
            # No `crossorigin`: the loader fetches these same-origin, and a
            # CORS-mode preload is a different cache entry — the model would
            # come down twice.
            # crossorigin is not optional on an as="fetch" preload, even for
            # a same-origin file: fetch() requests default to CORS mode, and a
            # preload without the attribute is recorded with a different
            # credentials mode, so the browser refuses to match the two. The
            # preload is then dropped on the floor and three.js downloads the
            # model a second time — the console says so in as many words.
            + (f'<link rel="preload" href="{model_preload}" as="fetch" crossorigin>'
               if model_preload else '')
            + script_tags
        )

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script>document.documentElement.className+=" js"</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<meta name="theme-color" content="#141210">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="{page_url}">
<meta property="og:image" content="{SITE_URL}/assets/boards/hero-spark.webp">
<link rel="canonical" href="{page_url}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{r}assets/logo-on-light.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,100..900&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{asset(r, "css/site.css")}">
{script_tags}
<script src="{asset(r, "js/motion.js")}" defer></script>
</head>
<body>
<a href="#main" class="skip eyebrow">Skip to content</a>
<div class="scroll-rail" aria-hidden="true"><i></i></div>
<header class="site-head eyebrow">
  <a class="brand" href="{root}" aria-label="ForgeBoard home">
    <img class="mark" src="{r}assets/logo-on-dark.webp" alt="" width="128" height="112" decoding="async">
    <span>ForgeBoard</span>
  </a>
  <nav class="site-nav" id="{nav_id}" aria-label="Primary">{nav_html}</nav>
  <button class="nav-toggle eyebrow" aria-expanded="false" aria-controls="{nav_id}">Menu</button>
  <a class="order-link" href="{r}contact/"><span class="order-dot" aria-hidden="true"></span>Order</a>
</header>
<main id="main" tabindex="-1">
{body}
</main>
<footer class="site-foot print">
  <div class="foot-inner">
    <div class="foot-cols">
      <div class="eyebrow"><span>Boards</span>{foot_boards}<a href="{r}compare/">Compare</a></div>
      <div class="eyebrow"><span>Support</span><a href="{r}docs/">Documentation</a><a href="{r}software/">Software</a><a href="{r}contact/">Contact</a><a href="mailto:{CONTACT['email']}">Email us</a></div>
      <div class="eyebrow"><span>Company</span><a href="{r}contact/">Defence Forge Industries</a><a href="{CONTACT['phone_href']}">{CONTACT['phone']}</a></div>
      <p>Microcontroller boards designed and manufactured in India by Defence Forge Industries Pvt. Ltd.</p>
    </div>
    <img class="foot-mark" src="{r}assets/logo-on-dark.webp" alt="" width="128" height="112" loading="lazy" decoding="async">
    <p class="wordmark" aria-hidden="true">ForgeBoard</p>
    <div class="foot-legal eyebrow">
      <span>© 2026 Defence Forge Industries Pvt. Ltd.</span>
      <span class="foot-reg"><span>CIN {CONTACT['cin']}</span><span>GST {CONTACT['gst']}</span><span>Startup India {CONTACT['dipp']}</span></span>
    </div>
  </div>
</footer>
</body>
</html>
"""
    return nb(page)


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------

def page_home() -> str:
    r = ""

    # The hero shows ONE board, large and turning, with the other three a
    # hover away. Every hardware site that lands in three seconds — and every
    # 3D site worth copying — sells a single object properly instead of
    # showing four small ones competing for the same frame.
    lead = BOARDS[0]

    def hero_render(bid: str) -> str:
        return f"assets/boards/hero-{bid}.webp"

    def hero_srcset(bid: str) -> str:
        return srcset(hero_render(bid), f"assets/boards/hero-{bid}-sm.webp")

    orbit_items = []
    for i, b in enumerate(BOARDS):
        bid = b["id"]
        orbit_items.append(f"""
        <li class="orbit-item"
            data-board="{bid}"
            data-model="{asset(r, f'assets/models/{bid}.glb')}"
            data-name="{e(b['name'])}"
            data-spec="{e(spec_line(b))}"
            data-mcu="{e(b['mcu'])}"
            data-clock="{e(b['clock'])}"
            data-gpio="{e(b['gpio'])}"
            data-radio="{e(b['wireless'] if b['wireless'] not in ('—', '-', '') else 'Wired')}">
          <a href="boards/{bid}/" aria-label="ForgeBoard {b['name']} — bring forward">
            <img src="{hero_render(bid)}" srcset="{hero_srcset(bid)}"
              sizes="(max-width:860px) 46vw, 26vw" alt="ForgeBoard {b['name']}" decoding="async">
          </a>
        </li>""")

    body = f"""
<section class="hero print" aria-labelledby="hero-h1">
  <h1 class="sr-only" id="hero-h1">ForgeBoard — four microcontroller boards, one toolchain, designed and built in India</h1>
  <div class="hero-meta eyebrow">
    <span>Four boards · One toolchain</span>
    <span>Designed &amp; built in India</span>
  </div>

  <div class="hero-scene">
    <div class="hero-load" data-hero="load" aria-hidden="true">
      <span class="load-bar"><i data-hero="bar"></i></span>
      <b data-hero="num">000</b>
    </div>
    <div class="hero-cursor" data-hero="cursor" aria-hidden="true"><span data-hero="cursor-name">Spark</span><i>→</i></div>
    <ul class="orbit">{"".join(orbit_items)}
    </ul>
  </div>

  <div class="hero-plate">
    <div class="hero-id" aria-live="polite">
      <p class="hero-plate-name"><span class="sup">ForgeBoard</span><b data-hero="name">{e(lead['name'])}</b></p>
      <dl class="hero-specs">
        <div><dd data-hero="mcu">{e(lead['mcu'])}</dd><dt class="eyebrow">Processor</dt></div>
        <div><dd data-hero="clock">{e(lead['clock'])}</dd><dt class="eyebrow">Clock</dt></div>
        <div><dd data-hero="gpio">{e(lead['gpio'])}</dd><dt class="eyebrow">GPIO</dt></div>
        <div><dd data-hero="radio">{e(lead['wireless'])}</dd><dt class="eyebrow">Wireless</dt></div>
      </dl>
    </div>
    <div class="hero-cta">
      <a class="btn btn-brand" href="contact/" data-hero="order">Order {e(lead['name'])}</a>
      <a class="btn btn-quiet" href="boards/{lead['id']}/" data-hero="specs">Full specs <span aria-hidden="true">→</span></a>
    </div>
    <p class="hero-trust eyebrow">DPIIT‑recognised startup · CE · FCC · RoHS pre‑certified</p>
  </div>

  <span class="scroll-cue" aria-hidden="true"><i></i></span>
</section>

<section class="print band" aria-labelledby="mii-h">
  <div class="wrap rail">
    <span class="eyebrow rv" style="color:var(--print-muted)">01 — Made in India</span>
    <div class="stack" style="gap:56px">
      <h2 class="h-xl rv" id="mii-h" style="max-width:14ch">Designed and manufactured in India.</h2>
      <div class="mii-grid">
        <div class="mii-col rv">
        <div class="mii-main">
          <video class="line-video" poster="{asset('', 'assets/video/line-poster.webp')}" data-src-sm="{asset('', 'assets/video/line-sm.mp4')}" width="1280" height="720" muted playsinline loop preload="none" controls aria-label="The pick-and-place line placing components on a ForgeBoard">
            <source src="{asset('', 'assets/video/line.mp4')}" type="video/mp4">
          </video>
        </div>
        <p class="mii-cap eyebrow"><span>Pick‑and‑place · Defence Forge Laboratory, Pune</span><span>16 s</span></p>
        </div>
        <div class="mii-side rv">
          <a class="shot shot-go" href="boards/">
            <img class="photo" src="assets/photos/board-detail.webp" srcset="{srcset("assets/photos/board-detail.webp", "assets/photos/board-detail-sm.webp")}" sizes="(max-width:860px) 92vw, 30vw" alt="Close-up of the board between gloved fingertips" loading="lazy" decoding="async">
            <span class="shot-label eyebrow">See the four boards <i aria-hidden="true">→</i></span>
          </a>
          <p style="font-size:18px;line-height:1.45;color:var(--print-muted);max-width:36ch">Defence Forge Industries designs, builds and supports every ForgeBoard in India. Priced in rupees, shipped across the country, and backed by the engineers who made it.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="print band" aria-labelledby="sw-h">
  <div class="wrap stack" style="gap:64px">
    <div class="rail rail-end rv">
      <span class="eyebrow" style="color:var(--print-muted)">02 — Software</span>
      <h2 class="h-xl" id="sw-h">One install.<br>Every board.</h2>
      <a href="software/" class="eyebrow link-go">The ForgeBoard IDE <i aria-hidden="true">→</i></a>
    </div>
    <div class="sw-grid">
      <div class="sw-shot soon rv" style="aspect-ratio:16/9">
        <img src="assets/logo-on-dark.webp" alt="" width="128" height="112" loading="lazy" decoding="async">
        <span class="eyebrow">ForgeBoard IDE</span>
        <b>Coming soon</b>
      </div>
      <div class="sw-side rv">
        <div class="code">
          <div class="code-bar eyebrow"><span>blink.ino</span><span>ForgeBoard IDE</span></div>
          <pre>#include &lt;ForgeBoard.h&gt;

void setup() {{ ForgeBoard.begin(); }}

void loop() {{
  ForgeBoard.led(<span class="amber">243, 154, 0</span>);
  delay(500);
  ForgeBoard.led(0, 0, 0);
  delay(500);
}}</pre>
        </div>
        <p style="font-size:18px;line-height:1.45;color:#d9cbb0;max-width:38ch">Plug in over USB-C. The IDE detects which ForgeBoard it is, loads the right examples and flashes with one click. Serial monitor and plotter built in.</p>
        <span class="btn btn-brand">Coming soon</span>
      </div>
    </div>
  </div>
</section>
"""
    return shell(
        out_path="index.html",
        title="ForgeBoard — ESP32 & STM32 dev boards, designed and built in India",
        description=(
            "Four microcontroller boards, one toolchain. Spark, Sprint, Indus and "
            "Flint — USB-C, protected, and made in India by Defence Forge Industries."
        ),
        body=body,
        nav_key="home",
    )


def page_boards() -> str:
    rows = []
    for i, b in enumerate(BOARDS):
        hl = "".join(f"<li>{e(h)}</li>" for h in b["highlights"])
        rows.append(f"""
      <li class="rv">
        <a class="board-row" href="{b['id']}/">
          <span class="eyebrow mono-muted">{str(i+1).zfill(2)}</span>
          <div class="stack" style="gap:10px">
            <h2><span class="nm">{e(b['name'])}</span><span class="tg">{e(b['tag'])}</span></h2>
            <p class="eyebrow mono-muted">{e(b['chip_line'])}</p>
          </div>
          <div class="art"><img src="../{render(b['id'], '3d')}" srcset="{srcset(render(b['id'], '3d'), render_sm(b['id'], '3d')).replace('assets/', '../assets/')}" sizes="(max-width:860px) 70vw, 24vw" alt="ForgeBoard {b['name']} board" loading="lazy" decoding="async"></div>
          <ul class="hl">{hl}</ul>
        </a>
      </li>""")

    body = f"""
<section class="page">
  <div class="rail" style="margin-bottom:80px">
    <span class="eyebrow mono-muted">Boards · 04</span>
    <div class="stack" style="gap:28px">
      <h1 class="h-pg">From first blink to factory floor.</h1>
      <p class="lede">Same USB-C, same protection, same IDE — the only thing that changes is the chip.</p>
    </div>
  </div>
  <ul class="board-rows">{"".join(rows)}
  </ul>
</section>
"""
    return shell(
        out_path="boards/index.html",
        title="Boards — ForgeBoard",
        description="Spark, Sprint, Indus and Flint. Four ForgeBoard microcontroller boards compared at a glance.",
        body=body,
        nav_key="boards",
    )


def page_product(b: dict) -> str:
    idx = BOARDS.index(b)

    model_url = asset("../../", f"assets/models/{b['id']}.glb")
    specs = "".join(
        f'<div data-spec="{e(k)}"><dt>{e(k)}</dt><dd>{e(v)}</dd></div>'
        for k, v in b["specs"]
    )

    chips = "".join(f"<li>{e(i)}</li>" for i in b["works_with"])
    dls = "".join(
        f'<li><a href="../../docs/"><span>{e(d)}</span><span class="eyebrow mono-muted">Soon</span></a></li>'
        for d in DOWNLOADS
    )

    size_note = f"Board size {b['size']}. " if b["size"] else ""

    body = f"""
<article>
  <section class="pdp-hero">
    <nav class="crumb eyebrow" aria-label="Breadcrumb"><a href="../">Boards</a> <span aria-hidden="true">/</span> {e(b['name'])}</nav>
    <div class="pdp-stage">
      <div class="pdp-board">
      <fb-board src="{model_url}"
        data-model="{model_url}"
        data-v-3d="../../{render(b['id'], '3d')}" data-s-3d="{srcset(render(b['id'], '3d'), render_sm(b['id'], '3d')).replace('assets/', '../../assets/')}"
        data-v-top="../../{render(b['id'], 'top')}" data-s-top="{srcset(render(b['id'], 'top'), render_sm(b['id'], 'top')).replace('assets/', '../../assets/')}"
        data-v-bottom="../../{render(b['id'], 'bottom')}" data-s-bottom="{srcset(render(b['id'], 'bottom'), render_sm(b['id'], 'bottom')).replace('assets/', '../../assets/')}"
        fallback="../../{render(b['id'], '3d')}" srcset="{srcset(render(b['id'], '3d'), render_sm(b['id'], '3d')).replace('assets/', '../../assets/')}" sizes="(max-width:860px) 88vw, 55vw" alt="ForgeBoard {b['name']} 3D view" tilt="14">
        <noscript><img src="../../{render_sm(b['id'], '3d')}" alt="ForgeBoard {b['name']} 3D view" style="width:100%;height:100%;object-fit:contain"></noscript>
      </fb-board>
      {callouts(b)}
      </div>
      <div class="pdp-views eyebrow" role="group" aria-label="Board view">
        <button type="button" data-view="3d" aria-pressed="true">3D</button>
        <button type="button" data-view="top" aria-pressed="false">Top</button>
        <button type="button" data-view="bottom" aria-pressed="false">Bottom</button>
      </div>
    </div>
    <div class="pdp-title">
      <h1><span class="sup">ForgeBoard</span>{e(b['name'])}</h1>
      <div class="pdp-intro">
        <p class="tag">{e(b['tag'])}</p>
        <p class="tagline">{e(b['tagline'])}</p>
        <div class="pdp-cta">
          <a class="btn btn-ink" href="../../contact/">Order&nbsp;{e(b['name'])}</a>
          <a class="btn btn-ghost" href="#specs">Tech specs ↓</a>
        </div>
      </div>
    </div>
  </section>

  <section id="specs" class="wrap" style="padding:var(--sect) var(--pad) 0;scroll-margin-top:24px">
    <div class="rail">
      <div class="specs-aside">
        <span class="eyebrow mono-muted">Tech specs</span>
        <p>{e(size_note + b['temp_note'])}</p>
        <a href="../../docs/" class="eyebrow link-ul">Datasheet →</a>
      </div>
      <dl class="specs">{specs}</dl>
    </div>
  </section>

  <section class="wrap" style="padding:clamp(80px,9vw,140px) var(--pad)">
    <div class="works">
      <span class="eyebrow mono-muted">Works with</span>
      <ul class="chips">{chips}</ul>
      <ul class="dl-list">{dls}</ul>
    </div>
  </section>

</article>
"""
    return shell(
        out_path=f"boards/{b['id']}/index.html",
        title=f"ForgeBoard {b['name']} — {b['tag']}",
        description=b["tagline"],
        body=body,
        nav_key="boards",
        model_preload=model_url,
    )


def page_compare() -> str:
    heads = "".join(
        f'<th scope="col"><a href="../boards/{b["id"]}/">{e(b["name"])}</a><span class="tag">{e(b["tag"])}</span></th>'
        for b in BOARDS
    )
    rows = "".join(
        "<tr><th scope=\"row\" class=\"eyebrow\">{k}</th>{cells}</tr>".format(
            k=e(k), cells="".join(f"<td>{e(v)}</td>" for v in vals)
        )
        for k, vals in COMPARE_ROWS
    )
    body = f"""
<section class="page stack" style="gap:64px">
  <div class="rail">
    <span class="eyebrow mono-muted">Compare</span>
    <div class="stack" style="gap:28px">
      <h1 class="h-pg">Side by side.</h1>
      <p class="lede">Straight from the datasheets. Need a figure that isn’t here? Ask.</p>
    </div>
  </div>
  <div class="cmp-scroll" tabindex="0" role="region" aria-label="Board comparison, scrolls sideways">
    <table class="cmp">
      <thead><tr><th class="spacer"></th>{heads}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </div>
</section>
"""
    return shell(
        out_path="compare/index.html",
        title="Compare — ForgeBoard",
        description="Spark, Sprint, Indus and Flint compared row by row, straight from the datasheets.",
        body=body,
        nav_key="compare",
    )


def page_software() -> str:
    body = f"""
<section class="page stack" style="gap:80px">
  <div class="rail">
    <span class="eyebrow mono-muted">Software</span>
    <div class="stack" style="gap:28px">
      <h1 class="h-pg">ForgeBoard IDE.</h1>
      <p class="lede">One install for the whole family. Plug a board in over USB-C and the IDE detects which ForgeBoard it is, loads the right examples and flashes with one click. Serial monitor and plotter built in.</p>
      <div class="pdp-cta">
        <span class="btn btn-ink">Coming soon</span>
      </div>
      <p class="eyebrow mono-muted">Windows · macOS · Linux</p>
    </div>
  </div>
  <div class="sw-shot soon rv" style="aspect-ratio:16/9">
    <img src="../assets/logo-on-dark.webp" alt="" width="128" height="112" loading="lazy" decoding="async">
    <span class="eyebrow">ForgeBoard IDE</span>
    <b>Coming soon</b>
  </div>
  <ul class="sw-cols">
    <li class="rv"><h2>Knows the board</h2><p>Plug in over USB-C. The IDE detects which ForgeBoard it is and sets up the pins, radios and sensors for you.</p><code>ForgeBoard.begin();</code></li>
    <li class="rv"><h2>Examples that fit</h2><p>Every example is written for the board on your desk — nothing to port, nothing to guess.</p><code>File › Examples › ForgeBoard Sprint</code></li>
    <li class="rv"><h2>Serial monitor &amp; plotter</h2><p>Print values and watch them plot live, without leaving the window.</p><a href="../docs/" class="eyebrow link-ul">Getting started →</a></li>
  </ul>
</section>
"""
    return shell(
        out_path="software/index.html",
        title="Software — ForgeBoard IDE",
        description="One install for every ForgeBoard. Plug in, and the IDE detects the board, loads the right examples and flashes with one click.",
        body=body,
        nav_key="software",
    )


def page_docs() -> str:
    cards = []
    for b in BOARDS:
        items = "".join(
            f'<li><a href="../boards/{b["id"]}/"><span>{e(d)}</span><span class="eyebrow mono-muted">Soon</span></a></li>'
            for d in DOWNLOADS
        )
        cards.append(f"""
      <li class="rv">
        <div class="stack" style="gap:4px">
          <span class="nm">{e(b['name'])}</span>
          <span class="eyebrow mono-muted">{e(b['chip_line'])}</span>
        </div>
        <ul>{items}</ul>
        <a href="../boards/{b['id']}/" class="eyebrow link-ul">Full specs →</a>
      </li>""")

    body = f"""
<section class="page stack" style="gap:80px">
  <div class="rail">
    <span class="eyebrow mono-muted">Docs</span>
    <div class="stack" style="gap:28px">
      <h1 class="h-pg">Documentation.</h1>
      <p class="lede">Datasheets, pinouts, schematics and getting-started guides for every ForgeBoard.</p>
    </div>
  </div>
  <ul class="docs-grid">{"".join(cards)}
  </ul>
</section>
"""
    return shell(
        out_path="docs/index.html",
        title="Documentation — ForgeBoard",
        description="Datasheets, pinouts, schematics and getting-started guides for every ForgeBoard.",
        body=body,
        nav_key="docs",
    )



def page_store() -> str:
    """Where to buy. No prices are printed anywhere in this project, so none are
    invented here — the page routes to the enquiry, which is how the boards are
    actually sold."""
    rows = []
    for i, b in enumerate(BOARDS):
        rows.append(f"""
      <li class="rv">
        <a class="board-row" href="../boards/{b['id']}/">
          <span class="eyebrow mono-muted">{str(i+1).zfill(2)}</span>
          <div class="stack" style="gap:10px">
            <h2><span class="nm">{e(b['name'])}</span><span class="tg">{e(b['tag'])}</span></h2>
            <p class="eyebrow mono-muted">{e(spec_line(b))}</p>
          </div>
          <div class="art"><img src="../{render(b['id'], '3d')}" srcset="{srcset(render(b['id'], '3d'), render_sm(b['id'], '3d')).replace('assets/', '../assets/')}" sizes="(max-width:860px) 70vw, 24vw" alt="ForgeBoard {b['name']} board" loading="lazy" decoding="async"></div>
          <ul class="hl"><li>Ships from Pune</li><li>Priced in ₹, GST invoice</li><li>Specs &amp; order →</li></ul>
        </a>
      </li>""")

    ways = [
        ("Single boards", "One board, or a handful. Dispatched from Pune, usually the next working day."),
        ("Classroom packs", "Ten boards and up for labs and workshops, with a single GST invoice and one point of contact."),
        ("Bulk &amp; OEM", "Volume pricing for products going to market. Tell us the quantity and the schedule."),
    ]
    way_html = "".join(
        f'<li class="rv"><h2>{w}</h2><p>{d}</p></li>' for w, d in ways
    )

    body = f"""
<section class="page">
  <div class="rail" style="margin-bottom:80px">
    <span class="eyebrow mono-muted">Store</span>
    <div class="stack" style="gap:28px">
      <h1 class="h-pg">Buy direct.</h1>
      <p class="lede">We sell the boards ourselves — no distributor in the middle. Tell us which board and how
        many, and you get pricing in ₹ and a dispatch date within one working day.</p>
      <div class="pdp-cta">
        <a class="btn btn-ink" href="../contact/">Request pricing</a>
        <a class="btn btn-ghost" href="../compare/">Compare the four ↓</a>
      </div>
    </div>
  </div>
  <ul class="board-rows">{"".join(rows)}
  </ul>
  <div class="rail" style="margin-top:var(--sect)">
    <span class="eyebrow mono-muted">How you buy</span>
    <ul class="sw-cols">{way_html}</ul>
  </div>
</section>
"""
    return shell(
        out_path="store/index.html",
        title="Store — buy ForgeBoard direct",
        description=(
            "Buy ForgeBoard boards direct from Defence Forge Industries. Single boards, "
            "classroom packs and bulk, priced in rupees and shipped across India."
        ),
        body=body,
        nav_key="store",
    )


def page_about() -> str:
    facts = [
        ("Company", "Defence Forge Industries Pvt. Ltd."),
        ("CIN", CONTACT["cin"]),
        ("GST", CONTACT["gst"]),
        ("Startup India", CONTACT["dipp"]),
        ("Address", CONTACT["address"]),
    ]
    fact_html = "".join(
        f'<div><dt class="eyebrow mono-muted">{k}</dt><dd>{e(v)}</dd></div>' for k, v in facts
    )

    body = f"""
<section class="page stack" style="gap:80px">
  <div class="rail">
    <span class="eyebrow mono-muted">About</span>
    <div class="stack" style="gap:28px">
      <h1 class="h-pg">We build the boards we wanted.</h1>
      <p class="lede">Defence Forge Industries designs, manufactures and supports every ForgeBoard in India —
        from the schematic to the pick-and-place line to the engineer who answers when something goes wrong.</p>
    </div>
  </div>

  <div class="mii-grid">
    <div class="mii-col rv">
      <div class="mii-main">
        <img class="photo" src="../assets/photos/lab-wide.webp" srcset="{srcset("assets/photos/lab-wide.webp", "assets/photos/lab-wide-sm.webp").replace('assets/', '../assets/')}" sizes="(max-width:860px) 92vw, 58vw" alt="The Defence Forge laboratory" loading="lazy" decoding="async">
      </div>
      <p class="mii-cap eyebrow"><span>Defence Forge Laboratory · Loni Kalbhor, Pune</span></p>
    </div>
    <div class="mii-side rv">
      <a class="shot shot-go" href="../boards/">
        <img class="photo" src="../assets/photos/board-detail.webp" srcset="{srcset("assets/photos/board-detail.webp", "assets/photos/board-detail-sm.webp").replace('assets/', '../assets/')}" sizes="(max-width:860px) 92vw, 30vw" alt="Close-up of the board between gloved fingertips" loading="lazy" decoding="async">
        <span class="shot-label eyebrow">See the four boards <i aria-hidden="true">→</i></span>
      </a>
      <p style="font-size:18px;line-height:1.45;color:var(--muted);max-width:36ch">Priced in rupees, shipped
        across the country, and backed by the people who made it.</p>
    </div>
  </div>

  <ul class="sw-cols">
    <li class="rv"><h2>Designed here</h2><p>Schematic, layout and firmware are done in-house in Pune. Every pin
      on every board is a decision we can explain.</p></li>
    <li class="rv"><h2>Built here</h2><p>Assembled on our own line. RoHS, CE and FCC pre-certified components,
      and the same protection stack on all four boards.</p></li>
    <li class="rv"><h2>Supported here</h2><p>Questions reach the engineers who designed the board, not a queue
      in another time zone.</p><a href="../contact/" class="eyebrow link-ul">Talk to us →</a></li>
  </ul>

  <div class="rail">
    <span class="eyebrow mono-muted">Registered</span>
    <dl class="contact-dl">{fact_html}</dl>
  </div>
</section>
"""
    return shell(
        out_path="about/index.html",
        title="About — Defence Forge Industries",
        description=(
            "Defence Forge Industries designs, manufactures and supports every ForgeBoard "
            "in India, from the schematic to the assembly line."
        ),
        body=body,
        nav_key="about",
    )


def page_contact() -> str:
    opts = "".join(f"<option>{e(b['name'])}</option>" for b in BOARDS)
    body = f"""
<section class="page">
  <div class="contact-grid">
    <span class="eyebrow">Order · Ask</span>
    <div class="stack" style="gap:40px">
      <div class="stack" style="gap:28px">
        <h1 class="h-pg">Let’s talk.</h1>
        <p class="lede" style="max-width:40ch">We sell direct. Tell us which board and how many; you’ll get pricing in ₹ and a dispatch date within one working day.</p>
      </div>
      <dl class="contact-dl">
        <div><dt class="eyebrow mono-muted">Phone</dt><dd><a href="{CONTACT['phone_href']}">{CONTACT['phone']}</a></dd></div>
        <div><dt class="eyebrow mono-muted">Email</dt><dd><a href="mailto:{CONTACT['email']}">{CONTACT['email']}</a></dd></div>
        <div><dt class="eyebrow mono-muted">Address</dt><dd>{e(CONTACT['address'])}</dd></div>
        <div><dt class="eyebrow mono-muted">GST</dt><dd class="gst">{CONTACT['gst']}</dd></div>
      </dl>
    </div>
    <form class="form">
      <label class="eyebrow">Name<input name="name" autocomplete="name" required></label>
      <label class="eyebrow">Email<input name="email" type="email" autocomplete="email" spellcheck="false" required></label>
      <div class="two">
        <label class="eyebrow">Board<select name="board">{opts}<option>Not sure yet</option></select></label>
        <label class="eyebrow">Quantity<input name="qty" inputmode="numeric" placeholder="10"></label>
      </div>
      <label class="eyebrow">Message<textarea name="message" rows="3" placeholder="What are you building?"></textarea></label>
      <button type="submit">Send enquiry</button>
      <p class="eyebrow form-note" aria-live="polite"></p>
    </form>
  </div>
</section>
"""
    return shell(
        out_path="contact/index.html",
        title="Contact — ForgeBoard",
        description="Order ForgeBoard boards direct from Defence Forge Industries. Single boards, classroom packs and bulk.",
        body=body,
        nav_key="",
    )


# --------------------------------------------------------------------------

def main() -> int:
    pages = {
        "index.html": page_home(),
        "boards/index.html": page_boards(),
        "compare/index.html": page_compare(),
        "software/index.html": page_software(),
        "docs/index.html": page_docs(),
        "contact/index.html": page_contact(),
        "store/index.html": page_store(),
        "about/index.html": page_about(),
    }
    for b in BOARDS:
        pages[f"boards/{b['id']}/index.html"] = page_product(b)

    for rel, content in sorted(pages.items()):
        path = ROOT / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"  {rel:32s} {len(content):>7,d} bytes")

    print(f"\n{len(pages)} pages written to {ROOT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
