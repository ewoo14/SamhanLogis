# SP-09-4 KFTC — Codex 5-agent TM cycle 1

HEAD: `4a49cbee`
PR: #239

## 결정

**APPROVE** — Codex 2 merge blocker + 비차단 권고 모두 cycle 1 내 해소. cycle 2 진입 권고 → 취소.

## Codex blocker → fix

| # | blocker | fix |
|---|---|---|
| 1 | V11 Flyway duplicate version (`V11__add_kftc_deposit_source_type_comment.sql` + 기존 `V11__add_tax_invoice_issuance_fields.sql`) | ✅ V11 → V17 renaming (`3b5755e8`) |
| 2 | KFTC runtime placeholder guard 4 키워드 정책 위반 (`CHANGE_ME_LOCAL_ONLY` 누락 / `test` 포함) | ✅ 정책 4 키워드 정확 일치 (PLACEHOLDER_DEV_ONLY/CHANGE_ME_LOCAL_ONLY/changeme/dummy) |

## 비차단 권고 → fix

- FE mock 502 code `KFTC_GATEWAY_ERROR` → BE 계약 `KFTC_SUBMIT_FAILED` 정합 ✅
- mock 2번째 fixture taxInvoice null → UNMATCHED 정합 ✅
- Playwright T3 client-side `@PastOrPresent` 검증 주석 명확화 + server-side 422 별도 IT carry-over ✅
- IT case 9 Mockito stub 순서 정렬 ✅
- credential-plaintext-guard 화이트리스트 `sp-09-4-kftc-shell/` ✅
- effectiveMethod 이중 계산 제거 (단일 source of truth) ✅
- Designer 4 vendor 토큰 체계 (Aligo 추가) ✅

**TM 결정: APPROVE → CI green 도달 시 머지 가능**

Codex 5-agent TM — 2026-05-18
