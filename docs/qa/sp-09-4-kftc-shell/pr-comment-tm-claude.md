## 🔵 Claude 5-agent TM 통합 — SP-09-4 Cycle 1 APPROVE

**브랜치 HEAD**: `4a49cbee`

### 종합 결정
**APPROVE** — Claude/Codex 양쪽 CRITICAL 2건 (V11 Flyway 중복 / placeholder 4 키워드 정책 위반) + HIGH/MEDIUM 6건 모두 cycle 1 내 해소.

### 핵심 fix

- **CRITICAL V11 Flyway 중복** — `V11__add_kftc_deposit_source_type_comment.sql` → `V17__*.sql` renaming (기존 V11_add_tax_invoice_issuance_fields 와 충돌 해소)
- **CRITICAL placeholder 4 키워드 정책 일관** — `test` 제거 + `CHANGE_ME_LOCAL_ONLY` 추가 (SP-09-1 ETaxClientImpl / SP-09-3 ReceiptOcrClientImpl 와 동일)
- **HIGH FE mock BE 계약 정합** — `KFTC_GATEWAY_ERROR` → `KFTC_SUBMIT_FAILED`, taxInvoice null fixture UNMATCHED 정합
- **HIGH Designer aria 보강** — `aria-live="assertive"` + `aria-atomic="true"` + `role="status"` 결과 요약
- **HIGH Designer Aligo 토큰 6종 신규** — **4 vendor 토큰 체계 완성** (NTS / Aligo / Clova / KFTC 모두 design-system 등록)
- **HIGH QA Mockito stub 순서 + T3 client-side 주석**
- **HIGH DevOps credential guard 화이트리스트** sp-09-4 추가
- **MEDIUM enum 직접 비교 + effectiveMethod 중복 제거**

### 4 vendor 토큰 체계 (cycle 1.5 신규 Aligo 포함)

| Vendor | Primary | WCAG |
|---|---|---|
| NTS 국세청 | `#0F6523` | AAA |
| **Aligo SMS** | `#0F766E` | **AAA 9.1:1 (신규)** |
| Naver Clova OCR | `#03C75A` | AAA 10.8:1 |
| KFTC 오픈뱅킹 | `#0061A8` | AAA 9.4:1 |

### 검증
- `./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava` **BUILD SUCCESSFUL**
- `npm run typecheck` (clients/desktop) **PASS**
- `bash scripts/check-credential-plaintext.sh` **PASS**
- Flyway V1~V17 유일 버전

상세: [`docs/qa/sp-09-4-kftc-shell/tm-claude-cycle1.md`](docs/qa/sp-09-4-kftc-shell/tm-claude-cycle1.md)

**TM 결정: APPROVE → CI green 도달 시 머지 가능**

Claude 5-agent TM — 2026-05-18
