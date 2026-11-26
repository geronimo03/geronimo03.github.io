"""Rebuild the self-hosted font subsets from the characters the site actually uses.

Run from the site root after editing text that adds new characters (for example new
Korean words or IPA symbols):

    pip install fonttools brotli
    python tools/build_fonts.py --sources path/to/full/fonts

--sources must contain the full font files:
    CharisSIL-Regular.ttf, CharisSIL-Italic.ttf, CharisSIL-Bold.ttf
    IBMPlexSans[wdth,wght].ttf, IBMPlexSansKR-Regular.ttf
    NotoSerifCJK-Regular.ttc  (Noto Serif CJK; the KR face is picked automatically)
All are under the SIL Open Font License and available from github.com/google/fonts
and github.com/notofonts/noto-cjk.

Korean inside the example sentences (class "examples") is set in the sans face;
all other Korean is set in the serif face, so each subset only carries what it shows.
"""
from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTCollection, TTFont
from fontTools.varLib import instancer

HANGUL = re.compile(r"[ᄀ-ᇿ㄰-㆏가-힣]")
LATIN_BASE = (
    [chr(c) for c in range(0x20, 0x7F)]
    + [chr(c) for c in range(0xA0, 0x100)]
    + list("‐‑‒–—‘’“”…′″→←−≈×   ")
)
IPA_EXTRA = list("ɕɯʌʰʃəɛɔŋɾʑʨʥːˈˌ")


def rename(font: TTFont, family: str) -> None:
    """Give a subset its own name. Charis SIL ("Charis", "SIL") and IBM Plex ("Plex") have
    Reserved Font Names under the OFL, so modified (subsetted) copies must not use them."""
    name = font["name"]
    style = name.getDebugName(17) or name.getDebugName(2) or "Regular"
    ps = family.replace(" ", "") + "-" + style.replace(" ", "")
    for rec in list(name.names):
        if rec.nameID in (1, 3, 4, 6, 16, 17, 21, 22, 25):
            name.removeNames(nameID=rec.nameID)
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style, 2, 3, 1, 0x409)
    name.setName(f"{ps};subset", 3, 3, 1, 0x409)
    name.setName(f"{family} {style}", 4, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    if "CFF " in font:
        font["CFF "].cff.fontNames = [ps]


def read_site(root: Path) -> tuple[str, str]:
    """Return (all visible-ish text, text inside the examples block)."""
    page = (root / "index.html").read_text(encoding="utf-8")
    scripts = "".join(p.read_text(encoding="utf-8") for p in (root / "assets" / "js").glob("*.js"))
    start = page.find('<div class="examples"')
    end = page.find('<p class="refs">', start)
    examples = page[start:end] if start >= 0 and end > start else ""
    return html.unescape(page + scripts), html.unescape(examples)


def save_subset(font: TTFont, chars: set[str], out: Path, family: str, keep_features: bool = True) -> None:
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"] if keep_features else []
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=sorted({ord(c) for c in chars}))
    sub.subset(font)
    rename(font, family)
    font.flavor = "woff2"
    font.save(out)
    print(f"{out.name:34s} {out.stat().st_size / 1024:7.1f} KB  {len(chars)} chars")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", required=True, type=Path)
    ap.add_argument("--site", default=Path(__file__).resolve().parents[1], type=Path)
    args = ap.parse_args()
    src, site = args.sources, args.site
    out = site / "assets" / "fonts"
    out.mkdir(parents=True, exist_ok=True)

    text, examples = read_site(site)
    non_hangul = {c for c in text if not HANGUL.match(c) and ord(c) >= 0x20}
    latin = set(LATIN_BASE) | {c for c in non_hangul if ord(c) < 0x2400}
    hangul_sans = set(HANGUL.findall(examples))
    outside = text.replace(examples, "") if examples else text
    hangul_serif = set(HANGUL.findall(outside))

    save_subset(TTFont(src / "CharisSIL-Regular.ttf"), latin | set(IPA_EXTRA), out / "text-400.woff2", "Eunsoo Text")
    save_subset(TTFont(src / "CharisSIL-Italic.ttf"), latin, out / "text-400-italic.woff2", "Eunsoo Text")
    save_subset(TTFont(src / "CharisSIL-Bold.ttf"), latin, out / "text-700.woff2", "Eunsoo Text")

    # Subset the variable font first, then pin width and trim the weight axis to 400-600.
    plex = TTFont(src / "IBMPlexSans[wdth,wght].ttf")
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=sorted({ord(c) for c in latin}))
    sub.subset(plex)
    plex = instancer.instantiateVariableFont(plex, {"wdth": 100, "wght": (400, 600)})
    rename(plex, "Eunsoo UI")
    plex.flavor = "woff2"
    target = out / "ui-var.woff2"
    plex.save(target)
    print(f"{target.name:34s} {target.stat().st_size / 1024:7.1f} KB  {len(latin)} chars")

    save_subset(TTFont(src / "IBMPlexSansKR-Regular.ttf"), hangul_sans | {" "}, out / "ui-kr.woff2", "Eunsoo UI KR")

    collection = TTCollection(src / "NotoSerifCJK-Regular.ttc")
    kr = next(f for f in collection.fonts if "KR" in f["name"].getDebugName(1))
    save_subset(kr, hangul_serif | {" "}, out / "text-kr.woff2", "Eunsoo Text KR")


if __name__ == "__main__":
    main()
