# PR #1126 R5 — 홈 리모컨 옵션 계약 fix

일시: 2026-08-09 KST  
브랜치: `feat/896-qty-sync-chip-track`  
HEAD 기준: `27748d14e`

## 1. RED 원문 — fix 전

실 종합견적서에서 `AM052BN6PBH1=2` 입력:

```text
[R5 fix 전 option=기본] AM052BN6PBH1=2 AWR-WE13N=2 amount=90,750
[R5 fix 전 option=유선] AM052BN6PBH1=2 AWR-WE13N=2 amount=90,750
[R5 fix 전 option=컬러] AM052BN6PBH1=2 AWR-WE13N=2 amount=90,750
[R5 fix 전 option=제외] AM052BN6PBH1=2 AWR-WE13N=2 amount=90,750

Error: 리모컨 제외 옵션이면 AWR-WE13N 수량은 0이어야 한다
Expected: qty=0, amount=0
Received: qty=2, amount=90,750
```

fix 전 `제외` 원문은 R4와 동일하게 잘못된 수량 2·금액 90,750원이었다.

## 2. 레거시 옵션 매핑 표

`recomputeHomeRemotes()` 원문(`index.ejs:8227-8273`)을 직독하고, 현재 표본의 `AM052BN6PBH1=2`를
규칙 실패 fallback으로 실제 확인했다.

| 옵션 | 레거시가 넣는 모델 | 수량 | AWR-WE13N 기준 |
|---|---|---:|---:|
| 기본 | `AR-EC05` 무선(냉방전용) | 2 | 0 |
| 유선 | `AWR-WE13N` 유선(통합) + 유선 키트 | 각 2 | 2 |
| 컬러 | `AWR-WG00N` 유선(컬러) + 유선 키트 | 각 2 | 0 |
| 제외 | 리모컨을 추가하지 않음 | 0 | 0 |

확정 불가 항목: 없음.

R3 불변식은 별도로 보존했다. 서버 규칙 성공 + `기본`에서는 서버가 선언한 `AWR-WE13N=2`를
레거시 기본 매핑의 `AR-EC05=2`와 함께 유지한다. 따라서 레거시 표를 `기본 AWR-WE13N=0`으로
억지로 덮어 R3를 되돌리지 않았다.

## 3. 수정 내용

`clients/web/estimate-app/views/index.ejs`의 서버 규칙 성공 경계에서:

- evaluator와 서버 규칙 소비는 그대로 유지한다.
- 규칙 성공 후에도 리모컨 계약 행을 legacy 계산으로 재수렴한다.
- `기본`은 서버 target을 보존한다.
- `유선`/`컬러`/`제외`는 선택지에 맞는 legacy remote target을 최종 적용한다.
- `AWR-WE13N`/`AWR-WG00N`/`AR-CH01`처럼 이름만으로 `isRemoteRow()`에 잡히지 않는 계약 행도 초기화한다.
- 서버 evaluator 실패 시에는 기존 legacy fallback 경로를 유지한다.

하드코딩된 `제외` 단독 예외는 추가하지 않았다. 네 선택지를 동일한 옵션 축으로 처리했다.

## 4. 8칸 조합 실측

실 Playwright 화면에서 옵션 4개 × 서버 규칙 성공/실패 2개를 모두 밟았다.

| 옵션 | 규칙 성공 AWR 수량/금액 | 규칙 실패 AWR 수량/금액 | 판정 |
|---|---:|---:|---|
| 기본 | 2 / 90,750 | 0 / 0 | R3 기본 동기화 보존 |
| 유선 | 2 / 90,750 | 2 / 90,750 | 레거시 일치 |
| 컬러 | 0 / 0 | 0 / 0 | 레거시 AWR 기준 일치; `AWR-WG00N=2`는 별도 컬러 모델 |
| 제외 | 0 / 0 | 0 / 0 | RED-A 통과 |

서버 성공 4칸 원문:

```text
[R5 after option=기본] AM052BN6PBH1=2 AWR-WE13N=2 amount=90,750
[R5 after option=유선] AM052BN6PBH1=2 AWR-WE13N=2 amount=90,750
[R5 after option=컬러] AM052BN6PBH1=2 AWR-WE13N=0 amount=0
[R5 after option=제외] AM052BN6PBH1=2 AWR-WE13N=0 amount=0
```

서버 실패 4칸 원문:

```text
[R5 failure option=기본] AM052BN6PBH1=2 AWR-WE13N=0 amount=0
[R5 failure option=유선] AM052BN6PBH1=2 AWR-WE13N=2 amount=90,750
[R5 failure option=컬러] AM052BN6PBH1=2 AWR-WE13N=0 amount=0
[R5 failure option=제외] AM052BN6PBH1=2 AWR-WE13N=0 amount=0
```

## 5. 라이브 캡처

fix 전·후·규칙 실패를 모두 `docs/qa/2026-08-09-896-r5/`에 저장했다. 옵션별 화면과 AWR 행 close-up을
각각 보존했다.

```text
r5-before-기본.png / r5-before-기본-row.png
r5-before-유선.png / r5-before-유선-row.png
r5-before-컬러.png / r5-before-컬러-row.png
r5-before-제외.png / r5-before-제외-row.png
r5-after-기본.png / r5-after-기본-row.png
r5-after-유선.png / r5-after-유선-row.png
r5-after-컬러.png / r5-after-컬러-row.png
r5-after-제외.png / r5-after-제외-row.png
r5-failure-기본.png / r5-failure-기본-row.png
r5-failure-유선.png / r5-failure-유선-row.png
r5-failure-컬러.png / r5-failure-컬러-row.png
r5-failure-제외.png / r5-failure-제외-row.png
```

## 6. RED/검증 결과

```text
fix 전 RED: 3 passed + 1 failed, 제외 Expected 0 / Received 2·90,750
estimate-app Jest: 14 suites passed, 202 tests passed
R5 real QA: 8 passed, failed=0, skipped=0
하드게이트: expected=8 unexpected=0 skipped=0 flaky=0
```

RED-C는 실제 종합견적서가 서버 bootstrap에서 HOME 수량 규칙을 읽은 상태로 화면에 도달했고, R4에서
보존한 실제 endpoint 원문도 다음과 같다.

```text
GET /products/internal/estimate-catalog/quantity-sync-rules?estimateCategory=HOME_MULTI
valid internal token -> HTTP 200, rule 1건, target 3건
```

`OUT_OF_STOCK` 관련 SINGLE_SET·COMMERCIAL_MULTI 경로와 `tools/legacy-gas/**`는 건드리지 않았다.
공유 DB write도 수행하지 않았다.

## 7. 식별자 grep / 표면 닫기

- 제거·이동·개명한 식별자 없음.
- `applyServerHomeQuantitySync_` 호출 경계는 유지됨.
- `recomputeHomeRemotes()`는 서버 성공 후 옵션 계약 후처리와 기존 fallback 양쪽에서 사용됨.
- `clients/web/estimate-app/**` 참조 테스트를 실행했고 모두 통과했다.

## 8. 신규 생성 파일

- `clients/desktop/playwright/896-r5-option-contract-fix-real-qa/playwright.config.ts`
- `clients/desktop/playwright/896-r5-option-contract-fix-real-qa/896-r5-option-contract-fix-real-qa.spec.ts`
- `docs/qa/2026-08-09-896-r5/` PNG 24장
- `docs/dev-reports/2026-08-09-896-r5-option-contract-fix.md`

## 9. 못 한 것

- 커밋·push·main 병합은 하지 않았다.
- 실 DB write는 하지 않았다.
- #1133 잔재인 `OUT_OF_STOCK` 500은 수정하지 않았다.
- desktop 전체 typecheck는 실행 게이트가 의존 `design-system/dist/index.d.ts`의 stale 상태
  (`산출물 2026-08-09T11:25:23Z < 최신 소스 2026-08-09T12:08:20Z`)를 먼저 요구해 중단했다.
  estimate-app Jest와 이번 실 Playwright 8칸은 독립적으로 전체 통과했다.
