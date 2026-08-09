# PR #1133 R12 SOL 적대검증 재수렴

## 판정

**이번 R12에서 실 사용자 경로로 새로 재현된 결함은 0건이다.** 정상 저장 견적 5건의 현재 `ACTIVE` 5라인은 모두 편집 가능해졌고 부당 잠금은 0건이었다. 다만 R10의 정확한 `ACTIVE → OUT_OF_STOCK → ACTIVE` 왕복은 Google Sheets 쓰기 금지와 현재 품절 3건 전부 BUNDLE이라는 표본 제약 때문에 이번 라운드에서 새로 상태를 만들지 않았다. 이 미실행 범위에는 새 판정을 덧붙이지 않았다.

## 0. 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1095`
- 브랜치: `feat/1095-sheet-product-status`
- Git HEAD: `bd242946d0e81dc88cb995262cf3351838455fa8`
- 데스크톱 web: `127.0.0.1:5295`
- 데스크톱 API proxy: `127.0.0.1:5296`
- Sheets read-through proxy: `127.0.0.1:5297`
- product-service: `t1095-product-r12-bd242`, `127.0.0.1:28084`, label `samhan.qa.source-sha=bd242946d0e81dc88cb995262cf3351838455fa8`, health `UP`
- inventory-service: `t1095-inventory-r12-bd242`, `127.0.0.1:28085`, label `samhan.qa.source-sha=bd242946d0e81dc88cb995262cf3351838455fa8`, health `UP`
- product JAR SHA-256: `5DCFE6C94599D857BB45FA6FBDBF53DE06FF046FB0327A271344A0BC152CC51E`
- inventory JAR SHA-256: `E9BAF1C4460C5780DBB7FA204F843E7ADCD1B632DE7E1CB441CC3723A5A2D429`

실제 호출 API:

- 로그인·견적 목록/상세/저장: `http://127.0.0.1:8080/auth/login`, `/slips/estimates`
- 사용자 화면의 상태 hydration: `http://127.0.0.1:5296/api/products/lookup` → 실제 `http://127.0.0.1:28084/products/lookup`
- 품목 조회·상태 전환: `http://127.0.0.1:28084/products/**`
- 안전재고 알림: `http://127.0.0.1:28085/inventory/alerts/safety-stock`
- 견적 노출 카탈로그: `http://127.0.0.1:28084/products/internal/estimate-catalog/products`

검증 시작/종료 상태 분포에 사용한 SQL 원문:

```sql
SELECT status, count(*)
FROM products
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY status;
```

시작과 종료 원문은 동일했다.

```text
    status    | count
--------------+-------
 ACTIVE       |  2984
 DISCONTINUED |    83
 NOT_FOR_SALE |    14
 OUT_OF_STOCK |     3
(4 rows)
```

## 1. R11 이름 검사 복원 양방향

실 API 결과:

- 활성 동명이 없는 비활성 품목 `AF17B6474GZRS` 재활성화: HTTP 204. 확인 뒤 `DISCONTINUED`로 원복했다.
- 활성 동명이 있는 비활성 품목 `AR07C9180HZS` 재활성화: HTTP 409. 이것은 요구된 정상 거부이며 결함으로 세지 않았다.
- 최종 상태: 두 표본 모두 원래 `DISCONTINUED`.

`update()`와 `reactivate()`는 같은 `assertNameAvailable()`을 지난다.

- `services/product-service/src/main/java/com/samhanair/logis/product/service/ProductService.java:596-597`: 이름이 실제로 바뀌는 update가 자기 ID를 제외해 검사한다.
- 같은 파일 `:639`: 공용 `assertNameAvailable(name, excludedProductId)`.
- 같은 파일 `:685-688`: reactivate가 현재 이름과 자기 ID로 같은 검사를 호출한 뒤 활성화한다.

회귀 울타리는 `services/product-service/src/test/java/com/samhanair/logis/product/service/ProductServiceTest.java:737`의 `reactivate_existingDuplicateName_isRejected_even_whenNameWasNotChanged`로 유지된다. 로컬 `ProductCatalogControllerIT + ProductServiceTest` 실행은 `BUILD SUCCESSFUL`, PR CI는 최종 **53/53 SUCCESS**다.

## 2. fail-closed 반대급부 — 과차단 실측

저장 견적 `2026/08/10-2`부터 `-6`까지 5건을 실제 편집 화면으로 열었다. 각 저장본은 현재 `ACTIVE` 단품 1라인이다.

| 견적 | ACTIVE 라인 | 부당 잠금 | lookup HTTP | 편집 가능 도달 |
|---|---:|---:|---:|---:|
| `2026/08/10-2` | 1 | 0 | 78ms | 763ms |
| `2026/08/10-3` | 1 | 0 | 21ms | 532ms |
| `2026/08/10-4` | 1 | 0 | 27ms | 525ms |
| `2026/08/10-5` | 1 | 0 | 23ms | 536ms |
| `2026/08/10-6` | 1 | 0 | 19ms | 509ms |
| 합계 | **5** | **0** | 19~78ms | 509~763ms |

5초 지연을 준 실 UI 경로에서는 조회 전 잠금이 유지됐고, 화면 진입 후 **6,678ms**에 편집 가능해졌다. 지연 응답 방출은 5,709ms, 응답 뒤 해제까지는 969ms였다. 즉 정상 조회에서는 과차단이 없고, 느린 환경에서는 조회 시간만큼 fail-closed 잠금이 사용자에게 그대로 보인다.

R12 자기 저장본을 실제 UI로 만든 뒤 상태를 바꾼 결과:

- `DISCONTINUED`: 수량 편집 불가, `상태 확인 중` 표시.
- `ACTIVE` 복귀: 수량 편집 가능.
- `NOT_FOR_SALE`: 현재 저장 견적 실표본이 없고 Google Sheets 쓰기를 하지 않아 이번 라운드 실경로 표본은 만들지 않았다. 코드상 `ACTIVE` 이외 상태는 동일하게 잠그지만, 이 문장을 실경로 판정으로 세지 않는다.

증거: [정상 저장본 편집](../qa/2026-08-10-1095-r12/01-normal-saved-estimate-editable.png), [5초 지연 후 해제](../qa/2026-08-10-1095-r12/02-delayed-lookup-unlocked.png), [DISCONTINUED 잠금](../qa/2026-08-10-1095-r12/03-discontinued-saved-line-locked.png), [ACTIVE 복귀](../qa/2026-08-10-1095-r12/04-reactivated-saved-line-editable.png), [원문 JSON](../qa/2026-08-10-1095-r12/r12-overblocking.json).

## 3. R10 경로 유지

R12 자기 표본에서 `ACTIVE → DISCONTINUED → ACTIVE` 저장본 잠금/해제는 재현했다. 그러나 R10의 정확한 아래 경로는 이번 라운드에서 다시 만들지 않았다.

```text
단품 저장 견적 → OUT_OF_STOCK 전환 → 수량 잠김 → ACTIVE 복귀 → 잠금 풀림
```

사유는 (1) Google Sheets 쓰기 금지, (2) DB 직접 쓰기 금지, (3) 현재 실제 `OUT_OF_STOCK` 3건이 모두 BUNDLE이며 부모 상태 승계는 판단 대기 사항이기 때문이다. 기존 R10 증거를 새 R12 실행으로 가장하지 않았다.

## 4. 회귀 울타리와 실경로

`SafetyStockControllerIT.java:293`의 “product lookup 전량 미조회여도 알림 자체는 남는다”는 로컬 전체 클래스 실행이 `BUILD SUCCESSFUL`이었다.

현재 HEAD inventory 실 API는 HTTP 200으로 7행을 반환했다.

- 정상 식별자 보존: 1행, `ACL-KORGHP07 / ACL-KORGHP07`
- stale 식별자 공란: 6행
- 사라진 알림: 0행

따라서 테스트뿐 아니라 실 서비스 경로에서도 lookup 미조회 행이 섞여도 알림 자체는 남고 정상 항목 코드·이름도 보존됐다.

R12 자기 견적의 비고 협업 동기화 3회:

- 1회 388ms
- 2회 383ms
- 3회 379ms
- 실패 0/3, 종료 후 원래 메모로 복원

증거: [협업 3회](../qa/2026-08-10-1095-r12/05-collaboration-three-runs.png), [안전재고·협업 원문](../qa/2026-08-10-1095-r12/r12-safety-and-collaboration.json).

## 5. R5~R7 회귀

실 카탈로그 내부 API 분포:

```text
HOME_MULTI       total=107 ACTIVE=107
SINGLE_SET       total=226 ACTIVE=223 OUT_OF_STOCK=3
COMMERCIAL_MULTI total=382 ACTIVE=382
LEGACY           total=39  ACTIVE=39
```

합계 `ACTIVE 751`, 누락 0. `OUT_OF_STOCK 3`, 누락 0이다. 품절 후보 `AR60F07D11WS`는 실제 견적 품목 검색 결과에 표시됐다. 부모 상태 승계는 관측만 했고 결함 판정을 하지 않았다.

- 비상품 DB 분포: `NON_GOODS 34`.
- 실제 견적 화면 `운임`: 단가 입력 뒤 수량 `1` 자동 복구.
- 실제 전표 화면 `AC060CS6PBH1SY`: `/slips/expand-line` HTTP 200, 표시 라인 8행.
- 실제 Sheets 읽기: `상업멀티_단가인상!I4`, HTTP 200, 값 `""`. 공란은 유지됐다. 쓰기는 하지 않았다.
- 안전재고 stale 혼합의 정상 코드·이름 보존은 §4와 같다.

증거: [R5 회귀 화면](../qa/2026-08-10-1095-r12/06-r5-regressions.png), [원문 JSON](../qa/2026-08-10-1095-r12/r12-r5-regressions.json).

## 6. 증거 무결성

- `docs/qa/2026-08-10-1095-r12/` 바로 아래에만 기록했고 `_local`은 만들지 않았다.
- Playwright 디렉터리는 `1095-r12-real-qa`로 끝난다.
- 모든 QA 출력 경로는 `resolveQaShotsDir`를 거쳤다.
- `resolveQaCredential`은 각 테스트 본문의 `try/catch` 안에서만 호출했다.
- JSON과 보고서의 UUID·Bearer 값은 `<redacted-id>`/`<redacted>`로 치환했고 로그인 자격은 기록하지 않았다.
- 첫 두 하네스 실패는 반응형 중복 DOM을 라인 2개로 센 선택자 결함이었다. 실제 화면은 1라인이었고 정확한 line test id에 1:1 매핑한 뒤 과차단 테스트가 통과했다. 이를 제품 결함으로 세지 않았다.

## 7. 신규 파일과 R12 표본

신규 파일:

- `clients/desktop/playwright/1095-r12-real-qa/playwright.config.ts`
- `clients/desktop/playwright/1095-r12-real-qa/1095-r12-reconvergence-real-qa.spec.ts`
- `docs/qa/2026-08-10-1095-r12/` 아래 PNG 6개, JSON 5개
- 본 보고서

R12 표본:

- 견적 `2026/08/10-7`, `2026/08/10-8`, `2026/08/10-9`: R12 상태 왕복 실행에서 생성된 저장 견적. 모두 메모 `R12-1095-STATUS 실제 사용자 저장 표본`, 품목 최종 `ACTIVE`.
- 상태 변경 품목 `AM080AXVHHH1`: 최종 `ACTIVE`.
- 이름 양방향 표본 `AF17B6474GZRS`, `AR07C9180HZS`: 최종 둘 다 `DISCONTINUED`.

## 8. 못 한 것

- Google Sheets 쓰기: 권한/지시상 하지 않음.
- 정확한 R10 `OUT_OF_STOCK` 단품 왕복: 위 제약 때문에 새로 만들지 않음.
- 저장된 `NOT_FOR_SALE` 라인 실경로: 현재 표본 0이고 시트 쓰기를 하지 않아 미실행.
- 품절 BUNDLE 부모 상태 승계: 관측만 하고 결함 판정하지 않음.
- main merge, commit, push, DB 직접 INSERT/UPDATE: 하지 않음.
- `tools/legacy-gas/**`: 변경하지 않음.
