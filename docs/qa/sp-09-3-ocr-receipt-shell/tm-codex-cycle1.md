# SP-09-3 OCR — Codex 5-agent TM cycle 1

HEAD: `767008ef`
PR: #238

## 결정

**APPROVE** — Codex 4 merge blocker + 사용자 정정 (ACCOUNTANT) 모두 해소. cycle 2 진입 권고 → 취소.

## Codex 발견 → fix

| # | blocker | fix |
|---|---|---|
| 1 | BE↔FE DTO shape 불일치 (slipId/receiptDate/ocrText vs slipNo/issuedAt/parseRawJson) | ✅ FE 5필드 BE 정확 정렬 (`660cd1b7`) |
| 2 | QA T2 mock 잘못된 FE shape 주입 false green 위험 | ✅ mock 응답 BE record shape 정렬 + `data-testid` 텍스트 직접 assertion |
| 3 | CLOVA_OCR_INVOKE_URL blank only + placeholder 4 키워드 guard 누락 | ✅ `submitClova()` 3 키 모두 blank + placeholder 차단 (`2f4f2e25`) |
| 4 | UUID 비공개 vs FE slipId 링크 충돌 | ✅ slipNo 텍스트만 표시 (`#/purchases/${slipId}` 링크 제거) |

## 추가 fix

- BE-H1 — validateFile null 우회 차단 (contentType/originalFilename null 422)
- BE-M2 — IT @Transactional + REQUIRES_NEW audit row 누적 → @BeforeEach cleanup
- DevOps placeholder 화이트리스트 — CLOVA_OCR label 시 placeholder 통과 우회 명시 차단
- Designer 결과 카드 success teal → clova green badge 토큰 일관

## 사용자 정정

ACCOUNTANT 권한 추가 — SP-09-1 NTS 발행 (ACCOUNTANT ✅) 과 일관, 매입 영수증 입력 + 분개 통합 흐름.

**TM 결정: APPROVE → CI green 도달 시 머지 가능**

Codex 5-agent TM — 2026-05-18
