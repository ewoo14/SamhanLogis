# -*- coding: utf-8 -*-
"""
PR #921 chore-B SONNET5 R-3(개발책임자 표기) -- pypdf text-extraction cross-check.

Byte-size comparisons alone are not conclusive (task's explicit instruction).
This script extracts real text from each saved PDF and checks:

  1) scroll-top-0.pdf vs scroll-top-max.pdf -- should be text-IDENTICAL after
     the fix (proves the print output no longer depends on modalBody.scrollTop).
  2) full-document.pdf -- should contain both a near-top marker (SAMSUNG logo
     placeholder) and the near-bottom liability-notice text (proves the whole
     document -- not just a pre-fix scrollport slice -- made it into the PDF).
  3) full-document.pdf -- should NOT contain any of the modal-chrome-only
     strings (title "출고전표", description "판매전표 미리보기", close button
     "닫기") -- confirmed via grep to be absent from DispatchDocument.tsx
     itself, so their presence can only come from the modal header/
     description/footer chrome leaking into print (I-6 violation).
  4) short-doc.pdf -- sanity check the synthetic short-document fence also
     carries the liability text through.

⚠️ Empirically (RED baseline run), Chromium's print/PDF text layer inserts
inconsistent inter-character spacing for the SAME underlying render (some
saved PDFs extract "S A M S U N G" / "닫 기", others extract "SAMSUNG" / "닫기"
for what is visually identical content) -- a raw substring search is not
reliable across variants. All comparisons below first strip ALL whitespace
from both the extracted text and the target string before matching, so the
check is robust to this artifact while still being a real substring test
(not a fuzzy/approximate match).

⚠️ Caveat this script does NOT resolve on its own: naive PDF text extraction
reads text-showing operators from the content stream and does not always
respect clip regions, so "text found" is not 100% proof of pixel-visible,
unclipped placement on a valid page. The AUTHORITATIVE, structural signals
for I-5 are the two Playwright-side assertions this script does not replace:
(a) scroll-top-0.pdf vs scroll-top-max.pdf byte-length equality, and
(b) PDF page-object COUNT increasing when a break-before:page marker is
appended after all real content (both are literal PDF-structure facts, immune
to text-extraction ambiguity). This script's job is auxiliary corroboration
plus the I-6 chrome-absence check, which IS reliable (display:none elements
are not part of the render tree and cannot produce text-showing operators at
all -- unlike overflow-clipped-but-still-painted content).
"""
import pathlib
import re
import sys

from pypdf import PdfReader

QA_DIR = pathlib.Path(__file__).resolve().parent

LIABILITY_TEXT = "서명 후 생긴 문제는 당사가 책임지지 않습니다"
RECIPIENT_SIGN_TEXT = "인수자 서명"
LOGO_TEXT = "SAMSUNG"
CHROME_TITLE_SUBSTR = "출고전표"
CHROME_DESC_TEXT = "판매전표 미리보기"
CHROME_CLOSE_TEXT = "닫기"
TAIL_MARKER_TEXT = "SONNET-R2-TAIL-PAGEBREAK-MARKER-7e2d1"

_WS = re.compile(r"\s+")


def norm(s: str) -> str:
    """Collapse/strip all whitespace so inter-character-spacing artifacts
    (observed inconsistently across saved PDFs) don't break substring checks."""
    return _WS.sub("", s)


def extract_text(pdf_path: pathlib.Path) -> str:
    reader = PdfReader(str(pdf_path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def main() -> int:
    failures = []
    warnings = []

    def check_file(name: str):
        p = QA_DIR / name
        if not p.exists():
            failures.append(f"MISSING {name}")
            return None
        return extract_text(p)

    top_text = check_file("scroll-top-0.pdf")
    bottom_text = check_file("scroll-top-max.pdf")
    full_text = check_file("full-document.pdf")
    marker_text = check_file("tail-marker.pdf")
    short_text = check_file("short-doc.pdf")

    print(f"{'file':<22} {'chars':>6} {'norm_chars':>10}")
    for label, text in [
        ("scroll-top-0", top_text),
        ("scroll-top-max", bottom_text),
        ("full-document", full_text),
        ("tail-marker", marker_text),
        ("short-doc", short_text),
    ]:
        c = len(text) if text is not None else -1
        nc = len(norm(text)) if text is not None else -1
        print(f"{label:<22} {c:>6} {nc:>10}")

    # --- 1) scroll-position independence (normalized -- raw text.__eq__ can
    #     differ purely on the spacing artifact even for identical content) ---
    if top_text is not None and bottom_text is not None:
        if norm(top_text) != norm(bottom_text):
            failures.append(
                f"scroll-top-0 vs scroll-top-max: extracted text DIFFERS (normalized) "
                f"(top={len(norm(top_text))} chars, max={len(norm(bottom_text))} chars) "
                f"-- print output still depends on scroll position (I-5 unresolved)"
            )
        if norm(LIABILITY_TEXT) not in norm(top_text):
            failures.append("scroll-top-0: liability-notice tail text MISSING -- document bottom still clipped")
        if norm(LIABILITY_TEXT) not in norm(bottom_text):
            failures.append("scroll-top-max: liability-notice tail text MISSING")

    # --- 2) full document head+tail present ---
    if full_text is not None:
        nfull = norm(full_text)
        if norm(LOGO_TEXT) not in nfull:
            failures.append(f"full-document: head marker '{LOGO_TEXT}' NOT found -- document head missing")
        if norm(RECIPIENT_SIGN_TEXT) not in nfull:
            failures.append(f"full-document: '{RECIPIENT_SIGN_TEXT}' NOT found -- signature section missing")
        if norm(LIABILITY_TEXT) not in nfull:
            failures.append("full-document: liability-notice tail text NOT found -- document bottom clipped (RED)")

        # --- 3) modal chrome must NOT leak into print (I-6) ---
        if norm(CHROME_TITLE_SUBSTR) in nfull:
            failures.append(f"full-document: modal chrome title substring '{CHROME_TITLE_SUBSTR}' FOUND in print output (I-6 violation)")
        if norm(CHROME_DESC_TEXT) in nfull:
            failures.append(f"full-document: modal chrome description '{CHROME_DESC_TEXT}' FOUND in print output (I-6 violation)")
        if norm(CHROME_CLOSE_TEXT) in nfull:
            failures.append(f"full-document: modal chrome close-button text '{CHROME_CLOSE_TEXT}' FOUND in print output (I-6 violation)")

    # --- tail marker fragmentation proof (best-effort; page count in the .spec.ts is authoritative) ---
    if marker_text is not None:
        if norm(TAIL_MARKER_TEXT) not in norm(marker_text):
            warnings.append("tail-marker.pdf: marker text not found via pypdf extraction (page-count delta in spec is the primary/authoritative signal)")

    # --- 4) short-doc sanity ---
    if short_text is not None:
        if norm(LIABILITY_TEXT) not in norm(short_text):
            failures.append("short-doc: liability-notice tail text MISSING -- short-content path also clips")

    print()
    if warnings:
        print(f"WARN -- {len(warnings)} note(s):")
        for w in warnings:
            print(f"  - {w}")
    if failures:
        print(f"FAIL -- {len(failures)} issue(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS -- scroll-position independent, full document head+tail present, modal chrome absent, short-doc unaffected.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
