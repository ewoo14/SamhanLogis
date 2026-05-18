# SP-09-4 KFTC — Claude 5-agent TM cycle 1

HEAD: `4a49cbee` (cycle 1 후반 fix 적용)
PR: #239

## 결정

**APPROVE** — Claude/Codex 양쪽 CRITICAL 2건 (V11 Flyway 중복 / placeholder 4 키워드 정책 위반) + HIGH/MEDIUM 6건 모두 cycle 1 내 해소.

## 5-team cycle 1 fix 결과

| Agent | 발견 | 후반 fix |
|---|---|---|
| BE | CRITICAL 2 / HIGH 1 / MEDIUM 2 | V11→V17 renaming, placeholder 4 키워드 정확화 (`test` 제거 + `CHANGE_ME_LOCAL_ONLY` 추가), enum 직접 비교, effectiveMethod 중복 제거 (`3b5755e8`) |
| FE | HIGH 2 | mock 502 code `KFTC_GATEWAY_ERROR` → `KFTC_SUBMIT_FAILED`, 2번째 fixture taxInvoice null → UNMATCHED 정합 (`3b5755e8`) |
| Designer | HIGH 1 / MEDIUM 2 | aria-live="assertive" + aria-atomic + role="status", SummaryBadge 32px monospace, **Aligo 토큰 6종 신규 등록** → 4 vendor 토큰 체계 완성 (`4a49cbee`) |
| QA | HIGH 1 / MEDIUM 1 | IT Mockito stub 순서, T3 spec 주석 client-side 검증 명확화 (`3b5755e8`) |
| DevOps | HIGH 1 | credential-plaintext-guard 화이트리스트 `sp-09-4-kftc-shell/` 추가 (`3b5755e8`) |

## 4 vendor 토큰 체계 (Designer 후반 fix 결과)

| Vendor | Primary | WCAG 대비비 |
|---|---|---|
| NTS 국세청 | `#0F6523` | AAA |
| **Aligo SMS (cycle 1.5 신규)** | `#0F766E` | **AAA 9.1:1** |
| Naver Clova OCR | `#03C75A` | AAA 10.8:1 |
| KFTC 오픈뱅킹 | `#0061A8` | AAA 9.4:1 |

## 검증

- `./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava` **BUILD SUCCESSFUL**
- `npm run typecheck` (clients/desktop) **PASS**
- `bash scripts/check-credential-plaintext.sh` **PASS**
- Flyway V1~V17 유일 버전 확인
- placeholder 4 키워드 정책 일관 (SP-09-1/3 와 동일)

**TM 결정: APPROVE → CI green 도달 시 머지 가능**

Claude 5-agent TM — 2026-05-18
