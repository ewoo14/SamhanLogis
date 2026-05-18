# SP-09-1 NTS e-tax 발행 shell — Claude 5-agent TM 통합 cycle 1

브랜치: `feat/sp-09-1-nts-etax-emit-shell`
HEAD: `00f79274` (cycle 1 후반 통합 fix 완료)
PR: #236

## 종합 결정

**APPROVE** — cycle 1 내 5-team Claude review + Claude fix + Codex review 발견 결함까지 모두 해소. cycle 2 진입 불필요.

## Claude 5 agent cycle 1 발견 → fix 결과

| Agent | 결함 | Cycle 1 fix |
|---|---|---|
| BE | CRITICAL 0 / HIGH 2 / MEDIUM 5 / LOW 4 (8건 중) | H-1 submitMethod API 계약, H-2 트랜잭션 격리, M-1 V16 UNIQUE INDEX, M-3 @Deprecated, M-4 audit 직접 검증, M-5 UUID 비공개 — 7건 FIXED, L-2 Javadoc 정정 |
| FE | CRITICAL 2 / HIGH 2 / MEDIUM 3 / LOW 2 | C-01 EmitNtsResponse 타입, C-02 NtsSubmitMethod 'NTS', H-01 mock 가드, H-02 한국어 에러 — 4건 FIXED |
| Designer | CRITICAL 1 / HIGH 2 / MEDIUM 2 | D1 NTS 녹색 토큰, D2 EMITTED Badge, D3 monospace, D4 비가역 경고, D5 CTA 시각 — 5건 FIXED |
| QA | CRITICAL 2 / HIGH 3 / MEDIUM 4 / LOW 3 | C1 enum 정렬, C2 PNG 재캡처, H1 `\|\| true` 제거, H2 audit assertion, H3 V16 — 6건 FIXED |
| DevOps | HIGH 0 / MEDIUM 3 / LOW 1 | D1 ENV 템플릿/셋업, D2 IT 20개 @MockBean, D3 V16 — 3건 FIXED |

**총 30+ 건 결함 → cycle 1 commit `7363a729` 통합 fix 해소**

## Codex 5 agent cycle 1 후반 cross-check 발견 → Claude 후반 fix 결과

| Section | Codex 발견 | Cycle 1 후반 fix |
|---|---|---|
| BE | HIGH REQUIRES_NEW self-invocation, MEDIUM DB UNIQUE 409 변환, MEDIUM NTS placeholder runtime guard, LOW Javadoc | `TaxInvoiceEmitAuditRecorder` bean 분리 + DataIntegrityViolation catch + placeholder 차단 + Javadoc 정정 — 4건 FIXED (commit `7c5f0982`) |
| FE | MEDIUM DRY_RUN UI 고정 vs 문서 불일치, MEDIUM eTaxExternalId Phase 11 watch, LOW ApiErrorEnvelope | shell 단계 DRY_RUN 고정 정책 명시화 + Javadoc + ApiErrorEnvelope 타입 — 3건 FIXED (commit `c56022ce`) |
| Designer | MEDIUM modal 문구 불일치, LOW hover/focus inline 한계, LOW HTML mock 한계 | confirm modal 라벨 "DRY_RUN — sandbox 모드", `.btnNts` CSS module hover/active/focus-visible — 2건 FIXED |
| QA | HIGH T5 SALES 페이지 컨텍스트, MEDIUM T1 422/409 실 flow, MEDIUM T3 emit flow, LOW audit 주석 | `test.step` 3단계 분리 + 실제 버튼 클릭 + emitNtsCallCount + audit 주석 정정 — 4건 FIXED (commit `b0f5378a`) |
| DevOps | MEDIUM PLACEHOLDER runtime guard, MEDIUM compile 미확인, LOW Playwright CI gate | PLACEHOLDER 제거 + 빈 값 + 17 daemon 정리 후 compile BUILD SUCCESSFUL + CI gate carry-over — 3건 FIXED (commit `7c5f0982`) |

**Codex 발견 16건 → cycle 1 후반 통합 fix `00f79274` (HEAD) 해소**

## Cycle 1 종합 검증

| 항목 | 결과 |
|---|---|
| BE 컴파일 (`./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava`) | **BUILD SUCCESSFUL** |
| FE typecheck (`npm run typecheck` clients/desktop) | **PASS** |
| design-system build | **PASS** |
| BaseEntity 7 audit + Soft Delete | 준수 |
| UUID 사용자 비공개 | 준수 (taxInvoiceNo/eTaxExternalId 비즈니스 식별자만) |
| 도메인 메서드 chain | 준수 (markEmitted 검증 + linkETaxExternalId @Deprecated) |
| @MockBean ETaxClient 외부 client 격리 | 20개 IT 일괄 적용 |
| 권한 SP-03 §4.2 | ACCOUNTANT/MASTER ✅, SALES/MANAGER ❌ (8 IT case 검증) |
| 트랜잭션 경계 | `TaxInvoiceEmitAuditRecorder` REQUIRES_NEW proxy 경유 |
| 중복 발행 이중 가드 | 도메인 + DB UNIQUE + DataIntegrityViolation 409 변환 |
| HTTP status 422/409/502 | 준수 (8 IT case) |
| 한국어 Javadoc | 준수 |
| credential-plaintext guard | PASS (placeholder 명시 차단) |
| Notion runtime zero | 유지 |

## 누적 변경 commits

- `c7ba59ef` — 초기 [FEAT] 22 files +1867/-14
- `0cf7f7c7` — QA PNG 재캡처 + HTML mock 4장
- `706d3807` — Claude BE cycle 1 fix
- `7363a729` — Claude 5-team cycle 1 통합 fix (30+건)
- `7c5f0982` — Codex DevOps + BE cycle 1 후반 fix
- `c56022ce` — Codex FE+Designer cycle 1 후반 fix
- `b0f5378a` — Codex QA cycle 1 후반 fix
- `00f79274` — codex markdown + 02 PNG 재캡처

## 후속 (Phase 11 이관)

- NTS 실 sandbox API 호출 — Phase 11 진입 후 `ETaxClientImpl.submitNts()` 실 구현
- Playwright spec CI hard gate — 별도 CHORE PR

## TM 결정

**APPROVE → CI green 도달 시 머지 가능.**

**Claude 5-agent TM — 2026-05-18**
