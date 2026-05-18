# SP-09-2 Aligo SMS — Claude 5-agent TM cycle 1

브랜치 HEAD: `ba083283`
PR: #237

## 종합 결정

**APPROVE** — cycle 1 발견 결함 (BE/FE 계약 불일치 운영 버그 + Playwright URL/data-testid 불일치 + HTML mock 구조 불일치) 모두 cycle 1 내 해소.

## 5-team fix 결과

| Agent | 발견 결함 | Cycle 1 fix |
|---|---|---|
| BE | M-BE-02 enum 비교 / M-BE-03 IT 조건부 / msg_id 미연결 (Codex HIGH) | `NotificationService.sendWithGatewayResult()` + per-entry msgId/gatewayRaw 수집, IT 조건부 제거, enum 직접 비교 |
| FE | **H-FE-01 운영 버그** — extractCounts requestParams vs BE responsePayload | `extractCounts()` responsePayload 우선 + fallback. mock fixture 정렬. ApiErrorEnvelope 적용 |
| Designer | M-D-03 aria-labelledby / M-D-04 role=alert / 발송 계정 노출 / 배치 구조 (Codex HIGH) | HTML mock 01/02 batch audit 8컬럼 재작성, role="alert" 추가, 재발송 disabled, samhan2024 제거, PNG 4장 재캡처 81~181KB |
| QA | **H-QA-03 URL 불일치** / Codex CRITICAL false green / data-testid 정렬 4건 / T1 마스킹 강화 | URL 5곳 정렬, test.skip/page.setContent/bodyText fallback 완전 제거, data-testid 6곳 일괄 정렬, T5 권한 매트릭스 보강 |
| DevOps | H-DO-01 ALIGO_USERID guard 미감지 + env API_URL placeholder | PATTERN_ALIGO_USERID 신규 + scan_pattern 등록, SAMHAN_ALIGO_API_URL 빈 값, alias 병기 제거 |

## 검증

- `./gradlew :services:notification-service:compileJava :services:notification-service:compileTestJava` → **BUILD SUCCESSFUL**
- `npm run typecheck` (clients/desktop) → **PASS**
- `bash scripts/check-credential-plaintext.sh` → **PASS**
- false green 가드 (`|| true` / `test.skip(!ok)` / `page.setContent` fallback / `bodyText` OR) → 0건

## TM 결정

**APPROVE → CI green 도달 시 머지 가능.**

**Claude 5-agent TM — 2026-05-18**
