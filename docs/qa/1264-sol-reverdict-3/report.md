# PR #1264 SOL 적대검증 최종 재판정 3회차

## ① 검증 SHA·main 병합 여부

- 지정 검증 SHA 및 원격 PR head: `b2f8307f67db1de6911003c080ecd4053d2722a7` (`b2f8307f6`).
- 검증 시작 전 `git merge origin/main --no-edit`를 실행했고 충돌 없이 완료됐다. 이 명령이 만든 로컬 merge commit은 `764b041994519f281322f52dd6a2680e5ee06006`이다.
- 이후 다시 fetch한 최신 `origin/main`은 `eae5578fff8a4decf42c70ba9ca0f93ecc80c1b0`이며, `git merge-base --is-ancestor origin/main HEAD`는 0이었다. 즉 최신 main이 로컬 검증 head에 포함됐다.
- 별도 `git add`·`git commit`·`git push`는 하지 않았다. 로컬 merge commit도 원격 PR에는 게시하지 않았다.
- 브랜치 JAR은 이 로컬 merge head에서 새로 빌드해 격리 DB·별도 포트에서 기동했다. 공유 서비스 이미지는 사용하지 않았다.

## ② A·B·C 재현

공유 PostgreSQL을 읽기 전용으로 복제한 격리 PostgreSQL과 브랜치 `product-service`·`slip-service`·`accounting-service` JAR을 각각 28384·28386·28387에 기동했다. Desktop은 5944에서 띄웠고, 로그인은 공유 auth를 이용하되 일마감·회계 생성 호출은 정확한 URL만 브랜치 포트로 보냈다. 게이트웨이 인증 정보는 `resolveQaCredential()`로 읽고 `SAMHAN_GATEWAY_ATTESTATION` 헤더를 주입했다. 공유 DB에는 쓰지 않았다.

- **A — 성공:** 매출에서 `2026/08/14-6`을 생성한 직후 매입으로 전환했다. 같은 날짜·순번의 매입 버튼은 잠기지 않았고 생성에 성공했다. 매출 회계전표는 `2026/08/14-1711`, 매입 회계전표는 `2026/08/14-2211`이었다.
- **B — 성공:** 각 원천을 생성한 뒤 같은 화면 버튼은 `이미 생성됨`으로 비활성화됐고 금액 입력도 비활성화됐다. 여기에 화면이 실제 전송한 동일 request body를 다시 직접 POST했다. 매출·매입 모두 두 번째 요청은 HTTP 422 `SAS_OVER_ALLOCATION`(`remaining 0.00`)으로 차단됐으며 활성 회계전표 수는 각각 1건으로 유지됐다. 잠금 키를 넓힌 뒤에도 막아야 할 동일 원천 중복은 열리지 않았다.
- **C — 성공:** 화면 입력값 `11,000`, 생성 결과, 회계 라인·배분, 격리 DB 저장값이 모두 일치했다. 세부 수치는 ④에 적는다.
- 실행 결과: 실제 Chromium Playwright 1건 통과(5.2초). `--list`나 typecheck로 대체하지 않았다.

## ③ 잠금 키 충분성 — 실데이터 조합 수

화면 잠금 키는 `원천유형(SALES/PURCHASE)-날짜-순번`이다. 서버 중복 방어는 `sourceSlipType`·`sourceSlipNo`와 실제 source line allocation을 사용한다.

공유 실데이터를 직접 집계한 최신 수치는 다음과 같다.

- 활성 OUTBOUND 173건, `(slip_date, seq_no)` 고유키 173개.
- 활성 INBOUND 63건, `(slip_date, seq_no)` 고유키 63개.
- OUTBOUND/INBOUND를 합쳐 같은 날짜·순번이 양쪽 유형에 함께 존재하는 키 62개.
- 같은 `(날짜, 순번, 원천유형)` 중복 키 0개.
- 같은 `(날짜, 순번, 원천유형)`인데 거래처가 다른 조합 0개, 창고가 다른 조합 0개. 이는 같은 유형 중복 키 자체가 0개이기 때문이다.

따라서 현재 실데이터 236건에서는 원천유형을 포함한 화면 키가 서로 다른 실제 원천을 오잠글 사례가 없었다. 양 유형 충돌 62개 가운데 대표 조합 `2026/08/14-6`도 A에서 분리 생성됐다. 다만 DB에 `(날짜, 순번, 원천유형)` 자체를 보장하는 전용 unique constraint가 있는 것은 아니므로 미래의 비정상 중복 데이터까지 화면 키가 구분한다고 확대 판정하지 않는다.

## ④ 금액 네 자리 11,000원 — DB 직접 조회 포함

- 화면: 매출·매입 대상행 모두 `11,000` 표시.
- 생성 전표: 매출 `2026/08/14-1711`, 매입 `2026/08/14-2211`.
- 두 전표의 DB 직접 조회값은 각각 `total_supply_amount=10000.00`, `total_vat_amount=1000.00`, `total_amount=11000.00`.
- 두 전표 라인은 각각 `quantity=1.000`, `unit_price=11000.00`, `line_total=11000.00`.
- 두 배분은 각각 `allocated_quantity=1.000`, `allocated_amount=11000.00`이고, 원천은 `2026/08/14-6`의 1번 라인이다.
- 중복 시도 뒤에도 활성 매출·매입 전표는 각 1건뿐이었다.

화면 표시·전표 헤더·라인·배분·DB 저장 네 축에서 11,000원이 일치했다.

## ⑤ INBOUND 경로·라벨 잔재

- 매출 조회는 브랜치 slip-service 28386의 `GET /api/slips/query/daily-closing?slipType=OUTBOUND...`로 갔고 13행을 반환했다.
- 매입 조회는 같은 브랜치 서비스의 `GET /api/slips/query/daily-closing?slipType=INBOUND...`로 갔고 14행을 반환했다. 요청 로그와 화면 라벨 `입고전표 원본행`·`입고일`을 함께 확인했다.
- 회계 eligibility와 매출·매입 생성은 모두 브랜치 accounting-service 28387로 갔다.
- `DailyClosingPage`와 일마감 회계 생성 API 경로에서 `출고전표 라인` 잔재는 찾지 못했고, 매입 화면에서 해당 정확 문자열의 DOM 출현 수도 0이었다. 저장소 다른 기능(DPS·세금계산서·기존 migration 등)의 출고 문구는 이 PR의 일마감 매입 경로가 아니다.

## ⑥ 잃으면 안 되는 것

- 매입 생성 뒤 페이지를 새로 고쳐 재진입해도 `2026/08/14-6` 생성 버튼은 `이미 생성됨`으로 비활성화됐고 11,000원 입력도 잠긴 채였다.
- 같은 재진입 화면에서 아직 생성하지 않은 다른 행의 활성 생성 버튼은 12개였다. 정상 미생성 경로는 유지됐다.
- 표의 요구 열 17개를 DOM에서 확인했다. 이전 라운드가 고친 열 정합은 유지됐다.
- 매출 화면은 OUTBOUND, 매입 화면은 INBOUND를 다시 조회했다.

## ⑦ 커밋 캡처 검증 — 장별 행 수

검증 SHA에 커밋된 PNG 7장을 모두 직접 열었다. 보고서가 증거로 열거한 5장은 로그인 화면이나 빈 입력폼이 아니며 주장과 일치했다. 정적 화면에서 눈으로 센 표시 데이터행 수는 다음과 같다.

| 캡처 | 눈에 보이는 데이터행 | 판정 |
|---|---:|---|
| `00-before-create.png` | 3행 | 생성 전 11,000원 대상행 존재 |
| `01-sales-accounting-slip-created.png` | 4행 | 매출 생성 성공·잠금 표시 |
| `02-purchase-accounting-slip-created.png` | 5행 | 매입 생성 성공·INBOUND 화면 |
| `03-duplicate-accounting-slip-blocked.png` | 5행 | 동일 원천 중복 차단 표시 |
| `04-accounting-posted-amount-locked.png` | 5행 | 재진입 후 생성·금액 잠금 |
| `debug.png` | 0행 | 완전한 빈 화면 |
| `debug2.png` | 0행 | 대시보드이며 일마감 데이터행 없음 |

**증거 무결성 예외:** 커밋에는 `debug.png`와 `debug2.png`도 있으나 라이브 보고서의 캡처 표는 이 두 장을 열거하지 않았다. 두 파일은 A·B·C의 증거가 될 수 없다. 다만 나머지 5장이 실제 데이터행과 상태를 담고 있고 이번 라운드 독립 재현도 일치하므로, 이 두 디버그 파일을 제품 도달 결함으로 세지는 않는다.

## ⑧ 이번 재판정 스크린샷

모든 캡처는 `resolveQaShotsDir()`가 결정한 `docs/qa/1264-sol-reverdict-3/screenshots/`에 저장했다.

| 캡처 | 눈에 보이는 데이터행 | 내용 |
|---|---:|---|
| `01-sales-before-create.png` | 5행 | 매출 대상 11,000원·생성 전 |
| `02-sales-created-and-blocked.png` | 5행 | 매출 생성 성공·버튼/금액 잠금 |
| `03-purchase-same-seq-enabled.png` | 5행 | 같은 날짜·순번 매입 화면 진입·INBOUND 14행 |
| `04-purchase-created-and-blocked.png` | 5행 | 매입 생성 성공·버튼/금액 잠금 |
| `05-reentry-lock-and-normal-open.png` | 5행 | 재진입 잠금·다른 정상 버튼 12개 활성 |

## ⑨ 미검증 축

- 면세·영세율과 0원 원천의 라이브 생성은 미검증이다.
- 수량 2 이상 또는 복수 라인 전표의 반올림·배분 합계 라이브 저장은 미검증이다.
- DRAFT 생성 이후 POSTED 전기·세금계산서 연결까지는 미검증이다.
- 현재 실데이터에 존재하지 않는 같은 `(날짜, 순번, 원천유형)`의 비정상 중복 자료는 미검증이다.
- 원격 PR head에 최신 main을 실제 push한 뒤의 전체 CI 재실행은 금지 조건상 미검증이다.

위 미검증 축을 결함 0건의 근거로 사용하지 않았다.

## ⑩ CI 귀속

원격 PR head `b2f8307f6`의 게시 직전 상태는 `UNSTABLE`이며 green이 아니다.

- `Frontend Desktop (typecheck + lint + build)`: **fail**. `Set up job`이 아니라 vitest가 실행된 뒤 `mock business document number contract` 1건이 실패했다. PR이 추가·변경한 `DailyClosingPage.test.tsx`와 `dailyClosingAccountingSlip.test.ts`의 `OUT-20260814-6`, `IN-20260814-6`, `ACC-OUT-6`, `2026/08/14-amount` 등 비표준 전표번호 literal 12건이 원문 위반 목록이다.
- 최신 main을 병합한 로컬 head에서도 동일 표적 테스트를 재실행해 같은 12건 실패를 재현했다. 따라서 이 실패는 GitHub `Set up job` 장애도, main의 `SlipSalesUpdateIT R9 (expected: 2 / was: 1)`도 아니다. 이 PR 테스트 fixture에 귀속된다.
- 최신 main run `32071853278`의 Frontend Desktop 실패는 별도 `SalesCommissionSettlementDetailPage.test.tsx` 실패였다. PR의 실패와 동일 원인이 아니다.
- 이 PR의 slip 계열 unit/IT job은 모두 통과했다. 이번 PR run에서 `SlipSalesUpdateIT R9`는 관측되지 않았다.
- `Desktop Playwright (mock 회귀 hard gate)`, 일반 `Playwright (web + electron + mobile emul)`, accounting 및 나머지 표시된 CI job은 통과했다.
- `GitGuardian Security Checks`: **fail**. 외부 대시보드 check라 저장소 측 상세 로그가 없고 이 라운드에서 PR 코드 원인으로 귀속할 근거는 얻지 못했다. 실패 상태 자체는 남아 있다.

## ⑪ 머지 가능/불가 — 도달 결함 N건

**현재 머지 불가(CI 게이트 red) — 실 사용자가 화면을 통해 재현할 수 있는 도달 결함 0건.**

A·B·C와 재진입·정상 미생성 경로를 실제 브라우저와 격리 DB에서 재현한 범위에서는 사용자 도달 결함이 없다. 다만 PR에 귀속되는 Frontend Desktop 테스트 실패가 실제로 남아 있어 현재 상태를 머지 가능으로 승인할 수 없다. 이 CI 실패는 제품 도달 결함 수에는 포함하지 않았다.

## ⑫ 프로세스 회수

- 이번 검증에서 기동한 28384·28386·28387·5944 listener는 모두 종료했고 잔여 listener는 0개다.
- 격리 PostgreSQL `sol1264r3-pg`를 제거했고 15465 listener와 컨테이너 잔여는 0개다.
- 임시 라이브 Playwright spec과 생성된 `.last-run.json`을 제거했다.
- 공유 `samhan-*` 컨테이너는 24개 그대로이며 중단·재시작·변경하지 않았다.
- 다른 검증자가 소유한 `codex1265-fix-pg`, `sol1266-reverdict2-pg` 및 다른 워크트리는 건드리지 않았다.
