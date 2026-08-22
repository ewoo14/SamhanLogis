# PR #1268 CODEX SOL 적대 재판정 3회차

## ① 검증 SHA · main 병합

- 검증 브랜치: `feat/option-naming-unify`
- 검증 SHA: `c2de4251d51dba1800c161567727ebb2e9954223`
- 시작 시 `origin/main=74b8080f5`에 대해 `git merge origin/main --no-edit`를 실행했고 결과는 `Already up to date.`였다. 충돌·추가 merge commit은 없었다.
- 검증 도중 다른 워크트리의 push로 공유 remote ref `origin/main`이 `2fc7c8619`, 이어 `0d42992dc`로 이동했다(`git reflog`, 12:45·12:48). 검증 SHA를 바꾸지 않기 위해 재병합하지 않았으며, 이번 실행 증거는 위 SHA에 한정한다.

## ② 신규 variant 재실험 값 대조

공유 product/order DB에는 쓰지 않았다. 공유 product DB를 읽기 전용으로 복제한 격리 PostgreSQL `product_clone`에서 `bundle_component_estimate_setting`의 `SINGLE_SET / REMOTE / AWR-WG00N` 설정 65행에, 주입 전 코드·fixture 어디에도 없던 이름 `검은머리갈매기936274`를 넣었다. `bundle_component.context_delivery_price`는 `137,531원`으로 설정했다. 브랜치 product-service·partner-order-service·dc-config-service·Eureka와 견적/주문 renderer를 별도 포트로 띄우고 headless Chromium Playwright로 실제 화면을 밟았다.

대상 세트는 양쪽 모두 `AC060CS6PBH1SY`다.

| 경로 | 목록 | 선택 | 세트가 | 상세 구성품 | 상세/서버 소계 |
|---|---|---|---:|---|---:|
| 종합견적서 | `기본 / 검은머리갈매기936274 / 유선` | 성공 | `1,653,531원` | `AWR-WG00N × 1`, `137,531원` | `1,653,531원` |
| 주문서웹 | `기본 / 검은머리갈매기936274 / 유선` | 성공 | `1,653,531원` | `AWR-WG00N × 1`, `137,531원` | `1,653,531원` |

주문서웹의 서버 권위 `price-preview`도 HTTP 200으로 3행(`606,000 + 910,000 + 137,531`)과 `totalFinalAmount=1,653,531`을 반환했다.

제거 전 2회차 값은 양쪽 웹 모두 세트가 `1,653,531원`, 상세 단가 `137,531원`이었다. 제거 후 이번 값과 **원 단위까지 동일**하다.

## ③ 핵심 판정 — ② golden fixture가 낡았다

**②다. fallback은 동작을 떠받치던 경로가 아니었다.**

근거는 다음 실행 대조다.

1. fallback literal을 제거한 현 SHA에서 코드에 없는 신규 이름이 설정만으로 목록 → 선택 → 세트가 → 상세 단가를 양쪽 웹에서 완주했다.
2. 제거 전·후 값이 각각 `1,653,531원 / 137,531원`으로 같다.
3. 설정 납품가만 `91,000 → 123,456원`으로 바꾸자 양쪽 웹의 상세 단가는 `123,456원`, 세트가·상세 소계·서버 합계는 `1,607,000 → 1,639,456원`으로 정확히 `+32,456원` 이동했다.
4. 따라서 실제 API가 공급하는 canonical 설정 연결은 살아 있고, 설정 행을 공급하지 않는 golden fixture가 제거된 fallback을 정본처럼 사용한 것이 실패 원인이다.

## ④ golden 실패 원문 · 기대값 변경 근거

GitHub CI 원문에서 대표 실패는 다음과 같다.

```text
Expected pattern: /AR-EH05/
Received function did not throw
```

```text
- "AR-EH05": 3
- "AWR-WE13N": 1
```

```text
C-03-WIRED
- "AWR-WE13N": 2
+ "AWR-VH12N": 2
```

```text
C-03-COLOR
- "AWR-WG00N": 2
```

주문 앱 추출 하네스에서는 아래 원문도 반복됐다.

```text
ReferenceError: configuredRemoteModel_ is not defined
ReferenceError: partsForSetStrict_ is not defined
```

CI 실측은 견적 Jest `2 suites failed / 27 failed, 333 passed, 360 total`, 주문 Vitest `8 files failed / 16 passed`, `Failed Tests 65`다.

기대값을 새 actual에 맞춰 리모컨 수량을 지우거나 `AWR-WE13N → AWR-VH12N`으로 바꾸면 안 된다. 라이브 실행이 기존 기대값인 `AR-EH05 / AWR-WE13N / AWR-WG00N`과 `16,000 / 56,000 / 91,000`을 그대로 증명했기 때문이다. 필요한 변경은 다음과 같다.

- positive golden의 기대 수량·모델은 유지한다.
- fixture 입력에 실제 API와 같은 `bundle_component_estimate_setting` 의미를 넣는다. 즉 `componentKind=REMOTE`, `componentVariant`, 부모 세트 연결(`setModel/refModel`), context 구분(360/인피니트/일반)을 공급해야 한다.
- HTML 함수 조각을 추출해 실행하는 테스트 하네스는 새 의존 함수 `configuredRemoteModel_`, `partsForSetStrict_`도 함께 추출해야 한다.
- “설정 행이 없는데도 fallback으로 AR-EH05를 만들어 놓고, 카탈로그에서 AR-EH05만 제거하면 오류”라는 negative fixture는 현실과 계약이 다르다. 설정 누락을 시험하려면 canonical REMOTE 설정 행 자체를 제거하고, 기대를 “설정된 target 없음/설정 누락 신호”로 바꿔야 한다. 반대로 target 카탈로그 누락만 시험하려면 canonical 설정 행은 남긴 채 target product만 제거해야 한다.

즉 변경 대상은 정상 golden 결과가 아니라 **fixture의 설정 연결과 negative case의 전제·기대 신호**다.

## ⑤ 이름→모델 fallback 잔여 수

`1f4d8ce36..c2de4251d` diff에서 제거 대상 6블록(상업멀티 무카탈로그 literal map, 상업멀티 literal 보조 반환, 홈멀티 resolver fallback × 양쪽 웹)을 기준으로 다시 셌다.

- `clients/web/estimate-app/views/index.ejs`: **0블록**
- `clients/web/order-app/index.html`: **0블록**
- 합계: **0블록**

남아 있는 `REMOTE_WIRED*` 등은 `HOMEMULTI.find(...)`로 API 행에서 모델을 찾는 동적 변수이며, 제거 대상이었던 옵션 이름→모델 literal map이 아니다. 신규 이름은 라이브 스펙·이번 증거 디렉터리를 제외한 저장소 검색에서 0건이었다.

## ⑥ 잃으면 안 되는 동작 재현

`AC060CS6PBH1SY`, 수량 1을 양쪽 웹에서 각각 선택했다.

| 상태 | 상세 구성품 | 세트가 = 상세 소계 = 주문 서버 합계 |
|---|---|---:|
| 기본(무선) | `AR-EH05 × 1`, `16,000원` | `1,532,000원` |
| 유선통합 | `AWR-WE13N × 1`, `56,000원` | `1,572,000원` |
| 유선컬러 | `AWR-WG00N × 1`, `91,000원` | `1,607,000원` |
| 제외 | 리모컨 0행, `0원` | `1,516,000원` |

- 설정값 관통: `91,000 → 123,456원` 변경 시 양쪽 웹·주문 서버 합계가 모두 `1,639,456원`으로 이동했다.
- 헤더 = 상세 구성품 소계: 신규 variant, 4상태, 변경 단가 총 6상태에서 전부 일치했다.
- #1241: `explodeSetParts(set, 1, setPrice)`의 실제 renderer 경로에 헤더 세트가를 전달해 본체 천원 단위 배분을 거친 구성품 합을 단언했다. 주문 서버 2/3행 합도 같은 값이었다.
- 판넬·자재: 양쪽 화면에서 판넬 `판넬제외 / 기본 / 블랙 / 승강 / 공청`, 자재 `포함 / 별도`를 확인했고, 모든 시나리오에서 `판넬제외`와 `별도` 선택이 실제 적용된 상태로 가격·상세가 유지됐다. 360판넬은 `원형`을 확인했다.

이번에 밟은 위 축에서 실사용자 화면 결함은 재현되지 않았다.

## ⑦ 마이그레이션 V48

번호를 세 방향으로 확인했다.

1. 현 브랜치 product migration: 47파일, 최대 번호 48, `V48__remote_color_context_delivery_price.sql` 1개.
2. 시작 시 main은 46파일·최대 47·V48 0개였다. 검증 종료 시 모든 `refs/remotes/origin/*`를 다시 훑었고 PR 브랜치 외 V48은 0개였다.
3. 빈 `product_fresh` DB에 브랜치 JAR를 기동해 V1→V48을 실제 적용했다. `flyway_schema_history`는 48행 모두 `success=true`, `installed_rank=48`; V48은 `remote color context delivery price | true`였다.

번호 충돌·fresh 적용 실패는 없다.

## ⑧ 스크린샷 · 행 수

모든 캡처는 `resolveQaShotsDir()`이 반환한 `docs/qa/1268-sol-reverdict-3/screenshots/_local/` 아래에 저장했고, PNG 18장을 `original` 해상도로 직접 열어 선택값·금액·상세행을 확인했다. 행 수는 캡처 직전 DOM 실측이다.

| PNG | 행 수 |
|---|---:|
| `variant-estimate-검은머리갈매기936274.png` | 목록 14 |
| `variant-order-list-검은머리갈매기936274.png` | 목록 1 |
| `variant-order-detail-검은머리갈매기936274.png` | 상세 3 |
| `changed-estimate-컬러.png` | 목록 851 |
| `changed-order-list-컬러.png` | 목록 1 |
| `changed-order-detail-컬러.png` | 상세 3 |
| `baseline-estimate-기본.png` | 목록 851 |
| `baseline-order-list-기본.png` | 목록 1 |
| `baseline-order-detail-기본.png` | 상세 3 |
| `baseline-estimate-유선.png` | 목록 14 |
| `baseline-order-list-유선.png` | 목록 1 |
| `baseline-order-detail-유선.png` | 상세 3 |
| `baseline-estimate-컬러.png` | 목록 14 |
| `baseline-order-list-컬러.png` | 목록 1 |
| `baseline-order-detail-컬러.png` | 상세 3 |
| `baseline-estimate-제외.png` | 목록 851 |
| `baseline-order-list-제외.png` | 목록 1 |
| `baseline-order-detail-제외.png` | 상세 2 |

구조화 실측 원문은 같은 디렉터리의 `variant-measurement.json`, `baseline-measurement.json`, `changed-measurement.json`이다.

## ⑨ CI 귀속

PR head SHA의 REST check-runs를 직접 조회했다. 완료된 check 중 실패는 2개다.

- `빌드 검증 + 단위 테스트`: 실제 Jest 실패. 위 stale fixture/기대 전제에 귀속.
- `Frontend Order-App (typecheck + test + build)`: 실제 Vitest 실패. stale fixture와 함수 추출 하네스의 누락 의존성에 귀속.

`Set up job` 실패는 없으므로 GitHub 장애로 돌릴 항목도 없다. `Desktop Playwright (mock 회귀 hard gate)`와 `Playwright (web + electron + mobile emul)`은 성공했다. 이번 라이브 스펙 파일명은 `-real-qa.spec.ts`였고 명시 경로로만 실행했으므로 mock 게이트 수집 대상에 섞이지 않았다.

## ⑩ 최종 판정

**머지 불가 — 실사용자 도달 결함 0건.**

핵심 질문은 ②로 확정했다. fallback 제거 전후 신규 variant 값이 같으므로 fallback은 죽은 경로였고, 실제 화면의 설정 연결은 충분하다. 다만 현재 필수 CI 2개가 실제 테스트 실패 상태이므로 fixture·추출 하네스를 현실 계약에 맞게 고쳐 green이 되기 전에는 머지할 수 없다. CI 실패를 실사용자 도달 결함으로 환산하지 않았다.

## ⑪ 프로세스 · 격리 자원 회수

- 제가 띄운 listener `5180`, `5183`, `28084`, `28094`, `28089`, `38088`, `38100`: 모두 종료 후 잔존 0개.
- 격리 PostgreSQL `sol1268r3-pg`와 그 안의 clone/fresh DB: 컨테이너 제거 후 잔존 0개.
- 임시 라이브 스펙, Playwright `test-results`, 임시 `.out/.err` 파일: 제거. `.err/.log/.pid` 잔존 0개.
- 공유 `samhan-*` 컨테이너: 시작·종료 모두 **24개**, 중지·변경 없음.
- 격리 product DB는 제거 전에 variant·가격을 `컬러 / 91,000원`으로 복원했다.

환경 무결성 고지: 공유 product/order DB write는 없었다. 다만 실제 인증 화면을 통과하는 동안 공유 partner-auth 로그인 API의 정상 로그인 메타데이터 쓰기는 발생했다. 초기 후보 계정 `1068689215`에 credential이 맞지 않아 실패 3회 후 해당 QA 계정이 `LOCKED`가 됐고, 공유 DB write 금지 때문에 수동 복구하지 않았다. 최종 라이브 증거는 `resolveQaCredential()` 값과 일치하는 QA 계정 `9999000001`로 성공한 세션에서 수집했다. 이 인증 계정 상태는 PR #1268 도달 결함 수에 포함하지 않았다.
