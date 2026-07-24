# -*- coding: utf-8 -*-
"""
PR #921 chore-B SONNET5 R1 -- pypdf text-extraction cross-check.
PDF byte-size comparisons already showed exact equality between control and
gate-modal states, but per the task's explicit instruction we must not
conclude from byte size alone. This script extracts real text from each
saved matrix PDF and verifies:
  1) The document's own distinguishing text is present in every non-blank
     variant (positive evidence the underlying document rendered, not just
     "a same-sized blob").
  2) The synthetic generic-modal marker text is present ONLY in the
     generic-modal variant (positive control proving the injected modal was
     captured by the print, and that its presence didn't crowd out the doc).
  3) No variant's extracted text is suspiciously short (the 1,053B blank
     R-1 regression produced near-zero extractable text).
"""
import pathlib
import sys

from pypdf import PdfReader

QA_DIR = pathlib.Path(__file__).resolve().parent
MARKER = "SONNET-R1-SYNTHETIC-GENERIC-MODAL-MARKER-9f3c1a"

ROUTES = {
    "statement": "거래명세서",
    "dispatch": "출고",
    "purchase": "매 입 전 표",
}
STATES = ["1-no-modal", "2-generic-modal", "3-update-modal", "4-notice-modal"]


def extract_text(pdf_path: pathlib.Path) -> str:
    reader = PdfReader(str(pdf_path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def main() -> int:
    failures = []
    print(f"{'route':<10} {'state':<18} {'chars':>6} {'doc_text_ok':>12} {'marker_ok':>10}")
    for route, doc_marker in ROUTES.items():
        control_text = None
        for state in STATES:
            pdf_path = QA_DIR / f"matrix-{route}-{state}.pdf"
            if not pdf_path.exists():
                failures.append(f"MISSING {pdf_path.name}")
                continue
            text = extract_text(pdf_path)
            chars = len(text)
            doc_ok = doc_marker in text
            marker_present = MARKER in text
            marker_expected = state == "2-generic-modal"
            marker_ok = marker_present == marker_expected
            print(f"{route:<10} {state:<18} {chars:>6} {str(doc_ok):>12} {str(marker_ok):>10}")

            if state == "1-no-modal":
                control_text = text

            if chars < 50:
                failures.append(f"{route}/{state}: extracted text suspiciously short ({chars} chars) -- possible blank-page regression")
            if not doc_ok:
                failures.append(f"{route}/{state}: document marker '{doc_marker}' NOT found in extracted text -- document may be missing")
            if not marker_ok:
                failures.append(
                    f"{route}/{state}: synthetic marker presence={marker_present} but expected={marker_expected}"
                )

        # Byte-identical states (update-modal / notice-modal) should also be
        # text-identical to control -- stronger than byte comparison because
        # it proves the *rendered content*, not merely a same-sized stream.
        for state in ["3-update-modal", "4-notice-modal"]:
            pdf_path = QA_DIR / f"matrix-{route}-{state}.pdf"
            if not pdf_path.exists() or control_text is None:
                continue
            text = extract_text(pdf_path)
            if text != control_text:
                failures.append(
                    f"{route}/{state}: extracted text DIFFERS from no-modal control "
                    f"(control={len(control_text)} chars, this={len(text)} chars)"
                )

    print()
    if failures:
        print(f"FAIL -- {len(failures)} issue(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS -- all matrix PDFs: document text present, marker isolated to generic-modal state, "
          "gate-modal states text-identical to control.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
