# SP-09-1 NTS e-Tax 발행 shell — Codex FE Cycle 1 후반 리뷰

브랜치: `feat/sp-09-1-nts-etax-emit-shell`  
HEAD: `7363a729`  
범위: Section B — `clients/desktop` read-only cross-check

## 결론

**cycle 2 진입 권고.** Claude cycle 1의 FE 계약 불일치(`EmitNtsResponse`, `NtsSubmitMethod`)와 409/422/502 분기는 대부분 수정됐다. `npm run typecheck`는 `clients/desktop`에서 통과했다. 다만 실제 화면은 항상 `DRY_RUN`만 호출하며, PR/QA 문서가 “DRY_RUN/NTS 선택”을 주장하는 것과 불일치한다.

## 결함

### MEDIUM — UI에서 `NTS` submitMethod를 선택/전달할 방법이 없음

- 위치: `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx:171`
- 현상: `emitNtsMutation`이 `emitTaxInvoiceToNts(id, 'DRY_RUN')`로 고정되어 있다. API client는 `NtsSubmitMethod = 'DRY_RUN' | 'NTS'`와 2번째 인자를 제공하지만 상세 화면은 항상 DRY_RUN만 전송한다.
- 영향: PR body의 “confirm modal — DRY_RUN/NTS 선택” 및 Section B의 `NtsSubmitMethod` 계약 검증과 화면 동작이 어긋난다. shell 단계에서 DRY_RUN 우선이 정책이면 문서/라벨을 “NTS 발행”보다 “NTS 발행 준비(DRY_RUN)”에 가깝게 명시해야 한다.
- 권고: (a) shell 단계에서는 UI/PR 문서 모두 DRY_RUN 고정으로 정정하거나, (b) 운영/권한/환경 guard 뒤에 `NTS` 선택 UI를 추가한다.

### MEDIUM — `eTaxExternalId` 표시가 UUID 비공개 설명과 충돌 소지가 있음

- 위치: `TaxInvoiceDetailPage.tsx:24`, `:501-529`
- 현상: 파일 상단 Javadoc은 “id / eTaxExternalId 코드 표시 전용”이라고 쓴다. 실제 화면은 `eTaxExternalId`를 그대로 노출한다. 현재 DRY_RUN 값은 `DRY-{taxInvoiceNo}-{epochMilli}`라 UUID가 아니지만, Phase 11 실 NTS 응답 형식이 UUID-like 또는 내부 추적 ID가 될 경우 UUID 비공개 원칙과 충돌할 수 있다.
- 영향: 지금은 실 결함이 아니지만 vendor 연동 시 사용자 화면에 raw external/internal identifier가 그대로 노출될 수 있다.
- 권고: `ETaxClient` 계약에 “사용자 노출 가능한 홈택스 접수번호만 반환”을 명시하고, 필요 시 표시용 `eTaxReceiptNo`와 내부 `eTaxExternalId`를 분리한다.

### LOW — Axios error envelope 타입이 `code`를 모델링하지 않아 ErrorCode 분기 회귀를 잡기 어려움

- 위치: `TaxInvoiceDetailPage.tsx:189-198`
- 현상: `err.response?.data`를 `{ message?: string }`으로만 캐스팅한다. BE envelope은 `code`도 제공하지만 FE가 타입으로 보지 않는다.
- 영향: 현재는 HTTP status로 409/422/502를 분기하므로 사용자 메시지는 동작한다. 그러나 같은 status 안에 세부 ErrorCode가 늘면 FE 분기가 어려워진다.
- 권고: 공통 `ApiErrorEnvelope` 타입을 사용해 `code?: string`을 포함하고, Playwright/단위 테스트에서 409/422/502 envelope을 실제 shape(`code`, `message`)으로 검증한다.

## Claude cycle 1 fix cross-check

| Claude 항목 | Codex 판정 | 근거 |
|---|---|---|
| C-01 `EmitNtsResponse` 타입 불일치 | FIXED | 5필드 interface로 분리됨 |
| C-02 `NtsSubmitMethod` REAL/NTS 불일치 | FIXED | `'DRY_RUN' | 'NTS'`로 정정 |
| H-01 mock handler 상태 검증 없음 | FIXED | `ISSUED`/중복/404 guard 추가 |
| H-02 BE 한국어 메시지 미추출 | PARTIAL | status별 한국어 fallback 추가. envelope `code` 타입은 없음 |
| M-02 DRY_RUN 고정/선택 UI 없음 | REMAINS | 여전히 `DRY_RUN` 하드코딩 |
| M-03 external id 노출 | WATCH | DRY_RUN은 안전. 실 NTS 응답 계약 확정 필요 |

## 검증

- `npm run typecheck` (`clients/desktop`) — PASS

## TM 결정안

**cycle 2 진입 권고.** FE 단독 merge blocker는 아니지만, PR/QA 문서의 “DRY_RUN/NTS 선택” 주장과 실제 UI의 DRY_RUN 고정 동작 중 하나를 정리해야 한다.
