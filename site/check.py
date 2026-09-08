#!/usr/bin/env python3
"""Structural check for the generated ForgeBoard site.

Verifies that every internal link, image, script, stylesheet and 3D model
referenced by the built pages actually exists on disk, and that each page
carries the things it is supposed to.

    python3 site/check.py
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent

EXTERNAL = re.compile(r"^(https?:|mailto:|tel:|#|data:)")
REFS = re.compile(r'(?:href|src)="([^"]+)"')
DATA_REFS = re.compile(r'data-(?:img|model)="([^"]+)"')

failures: list[str] = []
checked_refs = 0


def fail(msg: str) -> None:
    failures.append(msg)


def resolve(page: pathlib.Path, ref: str) -> pathlib.Path:
    ref = ref.split("#")[0].split("?")[0]
    target = (page.parent / ref).resolve()
    # Directory URLs map to their index.html
    if ref.endswith("/") or target.is_dir():
        target = target / "index.html"
    return target


def main() -> int:
    global checked_refs

    pages = sorted(ROOT.rglob("*.html"))
    if not pages:
        fail("no HTML pages found — run build.py first")

    expected = {
        "index.html", "boards/index.html", "compare/index.html",
        "software/index.html", "docs/index.html", "contact/index.html",
        "boards/spark/index.html", "boards/sprint/index.html",
        "boards/indus/index.html", "boards/flint/index.html",
    }
    found = {str(p.relative_to(ROOT)) for p in pages}
    for miss in sorted(expected - found):
        fail(f"missing page: {miss}")

    for page in pages:
        rel = page.relative_to(ROOT)
        text = page.read_text(encoding="utf-8")

        # every page needs these
        for needle, label in (
            ("<title>", "title tag"),
            ('name="description"', "meta description"),
            ('lang="en"', "lang attribute"),
            ("css/site.css", "stylesheet link"),
            ("js/motion.js", "motion script"),
            ("</footer>", "footer"),
        ):
            if needle not in text:
                fail(f"{rel}: no {label}")

        for ref in REFS.findall(text) + DATA_REFS.findall(text):
            if EXTERNAL.match(ref):
                continue
            checked_refs += 1
            target = resolve(page, ref)
            if not target.exists():
                fail(f"{rel}: broken reference {ref!r} -> {target.relative_to(ROOT.parent)}")

    # models
    for bid in ("spark", "sprint", "indus", "flint"):
        m = ROOT / "assets" / "models" / f"{bid}.glb"
        if not m.exists():
            fail(f"missing model: {m.relative_to(ROOT)}")
        for view in ("3d", "top", "bottom"):
            img = ROOT / "assets" / "boards" / f"{bid}-{view}.webp"
            if not img.exists():
                fail(f"missing render: {img.relative_to(ROOT)}")
        hero = ROOT / "assets" / "boards" / f"hero-{bid}.webp"
        if not hero.exists():
            fail(f"missing hero render: {hero.relative_to(ROOT)}")

    # the home page must not still be carrying design-canvas machinery
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    for banned in ("<x-dc>", "{{", "sc-for", "sc-if", "image-slot", "support.js"):
        if banned in home:
            fail(f"index.html still contains design-canvas markup: {banned!r}")

    print(f"pages checked : {len(pages)}")
    print(f"refs resolved : {checked_refs}")
    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK — all references resolve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
