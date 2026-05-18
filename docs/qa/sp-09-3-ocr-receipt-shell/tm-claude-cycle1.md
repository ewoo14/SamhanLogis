# SP-09-3 OCR — Claude 5-agent TM cycle 1

HEAD: `767008ef` (cycle 1 후반 fix 적용)
PR: #238

## 결정

**APPROVE** — 사용자 정정 (ACCOUNTANT 권한) + cycle 1 결함 (FE-H1 BE/FE DTO 불일치 / BE-H1 null 파일 우회 / QA-H1 audit row 누적 / Codex blocker 3/4) 모두 해소.

## 5-team cycle 1 fix 결과

| Agent | 발견 | 후반 fix |
|---|---|---|
| BE | HIGH 1 / MEDIUM 2 / LOW 2 | ACCOUNTANT 권한 추가, validateFile null 차단, INVOKE_URL placeholder guard, IT 12 case 확장 (`2f4f2e25`) |
| FE | HIGH 1 / MEDIUM 2 / LOW 2 | ReceiptParseResponse 5필드 정확 정렬 (slipId/receiptDate/ocrText → slipNo/issuedAt/parseRawJson), slipNo 텍스트만 표시 (UUID 비공개) (`660cd1b7`) |
| Designer | MEDIUM 1 / LOW 2 | 03 mock success teal → clova green badge + 결과 카드 토큰 정합 |
| QA | HIGH 1 / MEDIUM 2 / LOW 2 | T2 mock shape BE 정합 + T5 ACCOUNTANT 허용 / DISPATCH 차단 분리 + data-testid 기반 assertion 강화 |
| DevOps | MEDIUM 2 / LOW 2 | check-credential-plaintext.sh CLOVA placeholder 화이트리스트 우회 차단 + env template SSM Parameter Store 권장 주석 (`3e4ec935`) |

## 사용자 정정 반영 (2026-05-18)

**ACCOUNTANT 권한 추가** — 회계담당자가 매입 영수증 입력 + 분개 통합 실무 흐름 자연스러움.

| Role | OCR 영수증 발급 |
|---|---|
| MASTER / MANAGER | ✅ |
| WAREHOUSE | ✅ |
| **ACCOUNTANT** | ✅ **(사용자 정정 반영)** |
| SALES / DISPATCH | ❌ (403) |

## 검증

- `./gradlew :services:slip-service:compileJava :services:slip-service:compileTestJava` **BUILD SUCCESSFUL**
- `npm run typecheck` (clients/desktop) **PASS**
- `bash scripts/check-credential-plaintext.sh` **PASS**
- false green 가드 0건
- IT 12 case (기존 8 + 신규 4)

**TM 결정: APPROVE → CI green 도달 시 머지 가능**

Claude 5-agent TM — 2026-05-18
