# PR #1271 라벨 정합성 마무리 보고서

## ① 출고 계열 문구 전수 목록과 고친 수

비교 화면·DPS 비교 API·비교 서비스 범위에서 `출고/OUTBOUND` 잔재를 전수 검색했다. 확인한 표현군과 조치는 다음과 같다.

| 잔재 표현군 | 조치 |
|---|---|
| `출고전표 라인` 집계 카드 | `입고전표 라인`으로 수정 |
| `원 출고전표` 감사 안내 | `원 입고전표`로 수정 |
| CSV/Javadoc의 `출고수량` | `입고수량`으로 수정 |
| API 문서의 `출고전표 자동 조회`, `출고전표 조회 기간`, `출고전표 합계/단건 수량` | 모두 `입고전표` 기준으로 수정 |
| `출고 미발견` | `입고전표 미발견`으로 수정 |
| 백엔드 비교 사유의 `출고`, `출고전표에서`, `출고 합계` | 모두 `입고`, `입고전표에서`, `입고 합계`로 수정 |
| 응답 필드 `outboundCount` | `inboundCount`로 FE/BE 계약을 함께 수정 |

화면의 사용자 노출 출고 계열 문구는 **0건**으로 정리했다. `SlipServiceClient`의 기존 일반-purpose `getOutboundSlips()`와 `OutboundSlipLineSummary` 타입명은 다른 호출처 호환을 위해 유지했으며, DPS 비교 실행 경로에서는 사용하지 않는다.

## ② 실제 조회 엔드포인트

실제 호출 경로는 다음과 같다.

```text
DpsCompareService.compare()
  → SlipServiceClient.getInboundSlips(from, to)
  → GET /internal/slips/inbound-lines?from=2025-01-01&to=2026-08-17
```

브랜치 slip-service `28086`에 위 endpoint를 직접 호출해 HTTP 200과 실제 입고전표 **77행**을 확인했다. inventory-service `28085`의 비교 요청도 동일한 INBOUND source를 사용해 `inboundCount: 77`을 반환했다. 공유 DB에는 쓰지 않았다.

## ③ 고친 뒤 C 케이스 캡처

C 캡처 한 장에서 다음을 동시에 확인했다.

- 집계 카드: `입고전표 라인 77`
- 정상 일치 76, 불일치 1
- 전표번호 `2026/08/14-16`, 품번 `0000098`
- `입고수량 1` / `DPS수량 1`
- `입고합계 11,000` / `DPS합계 12,000`
- 분류 `합계금액 불일치`

즉 수량은 같고 금액만 다른 케이스가 라벨 정합성을 유지한 채 검출됐다.

## ④ 잃으면 안 되는 것 재현

실제 DPS 헤더(`납품일자·납품번호·모델·수량·매입단가·공급가·인도처명·부가세·합계`) 엑셀을 업로드했다.

| 케이스 | DPS 행 | 정상 일치 | 불일치 상세 | 결과 |
|---|---:|---:|---:|---|
| A 실제 헤더 | 77 | 77 | 0 | 정상 |
| C 수량 동일·금액 변경 | 77 | 76 | 1 | `합계금액 불일치` |
| D 수량 변경 | 77 | 76 | 1 | `수량 불일치` |
| B 전량 일치 | 77 | 77 | 0 | 정상 |

라이브 응답에서도 C는 `expectedQty=1`, `actualQty=1`, `expectedAmount=11000`, `actualAmount=12000`을 반환했고, D는 `expectedQty=1`, `actualQty=2`를 반환했다.

## ⑤ 스크린샷 — 직접 열어 확인한 행 수와 전체 경로

모든 PNG는 headless Chromium Playwright가 `resolveQaShotsDir()`를 경유하고 `QA_SHOTS_DIR`를 지정한 확정 증거 경로에 저장했다. 2400x1200 PNG를 직접 열어 라벨과 행 수를 확인했다.

- [A 실제 DPS 헤더 — 77행, 불일치 0](C:/dev/Samhan-Public/.claude/worktrees/wdps/docs/qa/1271-label-parity/screenshots/01-A-real-header-77-rows-real-qa.png)
- [C 수량 동일·금액 불일치 — 상세 1행](C:/dev/Samhan-Public/.claude/worktrees/wdps/docs/qa/1271-label-parity/screenshots/02-C-same-qty-amount-mismatch-real-qa.png)
- [D 수량 불일치 — 상세 1행](C:/dev/Samhan-Public/.claude/worktrees/wdps/docs/qa/1271-label-parity/screenshots/03-D-quantity-mismatch-real-qa.png)
- [B 전량 일치 — 불일치 0행](C:/dev/Samhan-Public/.claude/worktrees/wdps/docs/qa/1271-label-parity/screenshots/04-B-all-match-zero-mismatch-real-qa.png)

라이브 스펙: `clients/desktop/playwright/1271-dps-inbound-compare-real-qa/1271-dps-inbound-compare-real-qa.spec.ts`

## ⑥ CI 귀속

PR #1271 현재 GitHub checks에서 통과한 항목은 다수이며, 실패는 다음 두 건이다.

- `Desktop Playwright (mock 회귀 hard gate)`: `sp-08-2-dps-history.spec.ts`의 기존 mock route 테스트 1건 실패. 해당 CI 실행은 이번 라운드의 로컬 미커밋 변경 전 merge SHA에서 실행됐고, 실패 테스트는 라벨 변경 파일과 무관하다.
- `Detox Android (mobile v4, AVD)`: `actions/setup-java` 다운로드 중 GitHub codeload HTTP 429. 코드 실패가 아닌 GitHub runner 외부 장애다.

대조 근거로 `Frontend Desktop`, `JUnit 테스트 결과 (user+product+inventory+logging)`, `slip-it-core`, `Playwright (web + electron + mobile emul)`, 문서·자격·GitGuardian 가드는 통과했다. 로컬에서는 `DpsCompareServiceTest`와 renderer build가 성공했고, 실제 Playwright 라이브 스펙도 **1 passed (9.7s)**였다.

## ⑦ `git status --porcelain` 원문

```text
 M clients/desktop/playwright/1271-dps-inbound-compare-real-qa/1271-dps-inbound-compare-real-qa.spec.ts
 M clients/desktop/src/renderer/api/dpsCompareApi.ts
 M clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx
 M services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/SlipServiceClient.java
 M services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsCompareGroupBy.java
 M services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsCompareService.java
 M services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java
 M services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/DpsCompareResponse.java
?? docs/qa/1271-label-parity/
```

커밋·push·git add는 수행하지 않았다. 시작 지시대로 `git merge origin/main --no-edit`는 실행했으며, 그 명령으로 Git이 병합 커밋을 자동 생성한 사실은 별도로 보고한다.

## ⑧ 프로세스 회수

- 브랜치 slip-service `28086`: 회수 완료
- 브랜치 inventory-service `28085`: 회수 완료
- renderer Vite `5942`: 회수 완료
- Playwright Chromium: 회수 완료
- 이번 라운드 격리 컨테이너: 0개
- 공유 컨테이너: 변경 없이 24개 유지
- 최종 listener 확인: `28085`, `28086`, `5942` 모두 없음
