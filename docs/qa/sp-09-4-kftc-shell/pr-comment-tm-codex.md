## 🟢 Codex 5-agent TM 통합 — SP-09-4 Cycle 1 APPROVE

**브랜치 HEAD**: `4a49cbee`

### 종합 결정
**APPROVE** — Codex 2 merge blocker + 비차단 권고 모두 해소. cycle 2 진입 권고 → 취소.

### Codex blocker → fix

| # | blocker | fix |
|---|---|---|
| 1 | V11 Flyway duplicate version | ✅ V11 → V17 renaming |
| 2 | KFTC placeholder 4 키워드 정책 위반 (`CHANGE_ME_LOCAL_ONLY` 누락 / `test` 포함) | ✅ 정확 일치 (SP-09-1/3 일관) |

### 비차단 권고 → fix

- ✅ FE mock 502 `KFTC_GATEWAY_ERROR` → `KFTC_SUBMIT_FAILED`
- ✅ mock fixture taxInvoice null → UNMATCHED 정합
- ✅ Playwright T3 client-side 검증 명확화
- ✅ IT Mockito stub 순서
- ✅ credential guard 화이트리스트 sp-09-4
- ✅ effectiveMethod 중복 제거
- ✅ Designer 4 vendor 토큰 체계 (Aligo 신규 등록)

상세: [`docs/qa/sp-09-4-kftc-shell/tm-codex-cycle1.md`](docs/qa/sp-09-4-kftc-shell/tm-codex-cycle1.md)

**TM 결정: APPROVE → CI green 도달 시 머지 가능**

Codex 5-agent TM — 2026-05-18
