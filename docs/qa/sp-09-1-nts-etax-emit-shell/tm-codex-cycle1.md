# SP-09-1 NTS e-tax 발행 shell — Codex 5-agent TM 통합 cycle 1

브랜치: `feat/sp-09-1-nts-etax-emit-shell`
HEAD (cycle 1 후반 fix 적용): `00f79274`
PR: #236

## 종합 결정

**APPROVE** — Codex cycle 1 후반 cross-check 에서 발견한 4 merge blocker (BE/QA/DevOps/FE) + 6 medium 모두 Claude 5-team cycle 1 후반 fix 로 해소. cycle 2 진입 권고 → 불필요로 갱신.

## Codex 5 agent cycle 1 후반 발견 → cycle 1 후반 fix 결과

### Section A — BE

| 결함 | 분류 | 사후 검증 |
|---|---|---|
| `recordEmitAudit()` REQUIRES_NEW self-invocation 우회 | HIGH | `TaxInvoiceEmitAuditRecorder` 별도 @Service bean 분리 → proxy 경유 REQUIRES_NEW 실 적용. **valid fix** |
| DB unique 위반 → API 409 미변환 | MEDIUM | `markEmitted()` + flush 경계 `DataIntegrityViolationException` catch → `TAX_INVOICE_ALREADY_EMITTED` 409. **valid fix** |
| NTS placeholder runtime guard 부족 | MEDIUM | `ETaxClientImpl.isPlaceholderApiKey()` 추가 — `PLACEHOLDER_DEV_ONLY/changeme/dummy` 명시 차단. **valid fix** |
| Javadoc submitMethod 우선순위 충돌 | LOW | "request submitMethod 우선, null/blank 만 property fallback" 정정. **valid fix** |

### Section B — FE

| 결함 | 분류 | 사후 검증 |
|---|---|---|
| UI DRY_RUN 고정 vs 문서 "DRY_RUN/NTS 선택" 불일치 | MEDIUM | shell 정책: DRY_RUN 고정 + Phase 11 NTS 전환. modal title/CTA 라벨/HTML mock 02/pr-body 일괄 정정. **valid fix** |
| eTaxExternalId 노출 UUID 비공개 watch | MEDIUM | Javadoc "홈택스 접수번호 (사용자 노출 가능)" + Phase 11 vendor 응답 형식 watch 코멘트. **valid fix (watch)** |
| Axios error envelope `code` 미타입 | LOW | `ApiErrorEnvelope { code?; message? }` 정의 + onError 캐스팅. **valid fix** |

### Section C — Designer

| 결함 | 분류 | 사후 검증 |
|---|---|---|
| PR/QA "DRY_RUN/NTS 선택" vs 실 modal 불일치 | MEDIUM | FE M-01 과 함께 정리됨. HTML mock 02 동기화 + DRY_RUN 안내로 갱신. **valid fix** |
| NTS CTA inline style hover/focus 일관성 약함 | LOW | `TaxInvoiceDetailPage.module.css` `.btnNts` — `#0D5920` hover / `#0A4418` active / `--color-nts-primary` focus-ring CSS module 분리. **valid fix** |
| QA PNG HTML mock 정적 한계 | LOW | PR body 명시 "HTML mock evidence", 실 app 캡처는 후속 PR 권장. **valid carry-over** |

### Section D — QA

| 결함 | 분류 | 사후 검증 |
|---|---|---|
| T5 SALES 페이지 컨텍스트 혼동 | HIGH | `test.step` 3단계 분리 — 각 페이지 진입 직후 즉시 assertion. **valid fix** |
| T1 422/409 분기 실 UI 무관 | MEDIUM | `draftTest/duplicateTest` URL 분기 제거 → 실제 NTS 발행 버튼 클릭 후 `role="alert"` + 한국어 배너 assert. **valid fix** |
| T3 emit flow assert 약함 | MEDIUM | `emitNtsCallCount` 추적 + modal confirm 클릭 + route 호출 횟수 + `data-testid="tax-invoice-detail-etax-external-id"` 순서 검증. **valid fix** |
| IT audit 독립 트랜잭션 주석 불일치 | LOW | "self-invocation 으로 REQUIRES_NEW 미적용" → BE fix 이후 정정 적용. **valid fix** |

### Section E — DevOps

| 결함 | 분류 | 사후 검증 |
|---|---|---|
| `PLACEHOLDER_DEV_ONLY` NTS runtime guard 통과 | MEDIUM | env template 빈 값 + ETaxClient 명시 차단 — BE/DevOps 협력 fix. **valid fix** |
| backend compile 환경 lock 미완료 | MEDIUM | `gradlew --stop` + `.lck` 정리 후 BUILD SUCCESSFUL 재검증. **valid fix** |
| Playwright spec CI hard gate 미연결 | LOW | dev-report §8-A carry-over (별도 CHORE PR). **valid carry-over** |

## Codex cross-check 종합

- **HIGH 1건 → FIXED** (BE REQUIRES_NEW self-invocation)
- **MEDIUM 6건 → 5 FIXED + 1 WATCH** (eTaxExternalId Phase 11 응답 형식 watch)
- **LOW 4건 → 3 FIXED + 1 CARRY-OVER** (Playwright CI gate)

Cycle 1 내 모든 merge blocker 해소. cycle 2 진입 권고 → **취소**.

## 컴파일 evidence

```
PS C:\dev\SamhanLogis> ./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava
BUILD SUCCESSFUL in 5s
6 actionable tasks: 1 executed, 5 up-to-date

PS C:\dev\SamhanLogis\clients\desktop> npm run typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
# (PASS, 0 errors)
```

## TM 결정

**APPROVE → CI green 도달 시 머지 가능.**

**Codex 5-agent TM — 2026-05-18**
