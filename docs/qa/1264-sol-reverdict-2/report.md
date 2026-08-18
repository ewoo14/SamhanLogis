# PR #1264 CODEX SOL 적대검증 재판정 2회차

## ① 검증 SHA

- 지정 검증 SHA: `01131a22fd43399d5f3849365486164022d7956e` (`01131a22f`)
- 브랜치 JAR 3종과 Desktop 라이브 화면은 위 SHA에서 기동해 검증했다.
- 검증 도중 PR head가 main 병합 커밋 `b1a66163085681577a953f5ebaf4e75cb4bac6cf`로 이동했다. 일마감 Desktop·accounting-service 대상 파일은 두 SHA 사이에 변경이 없고, 아래 판정 대상은 요청받은 `01131a22f`이다. CI 절에는 게시 직전 PR head 상태를 별도로 적었다.

## ② 금액 네 자리 실측

공유 DB에는 쓰지 않았다. 공유 DB를 복제한 격리 PostgreSQL과 `01131a22f`에서 빌드한 slip/accounting/product JAR을 각각 28186/28187/28184에 기동했다. 매출과 매입을 화면에서 각각 실제 생성한 뒤 API 응답과 격리 DB를 직접 조회했다.

| 구분 | 일마감 표시/API `total` | 생성 회계전표 line total | allocation | DB 저장 header/line/allocation |
|---|---:|---:|---:|---:|
| 매출 OUTBOUND `2026/08/14-6` → 회계 `2026/08/14-123` | 11,000 | 11,000 | 11,000 | 11,000 / 11,000 / 11,000 |
| 매입 INBOUND `2026/08/14-1` → 회계 `2026/08/14-675` | 11,000 | 11,000 | 11,000 | 11,000 / 11,000 / 11,000 |

두 회계전표 모두 DB에서 `unit_price=11000`, `supply_amount=10000`, `vat_amount=1000`, `line_total=11000`, `total_amount=11000`, `allocated_amount=11000`을 확인했다.

11,000원이 맞는 근거는 원천의 VAT 포함 단가가 11,000원이고 공급가액 10,000원 + 부가세 1,000원이며, 일마감 API의 `total`도 그 합계 11,000원을 반환하기 때문이다. 회계 서비스는 VAT 포함 단가 11,000원을 공급가 10,000원과 VAT 1,000원으로 분리한 뒤 합계와 배분을 11,000원으로 저장한다.

증거 무결성상 fix 보고서의 “원천 `line total`이 11,000원” 문구는 실제 DB와 다르다. 격리 원천 DB의 legacy `slip_lines.line_total`은 매출·매입 모두 10,000원이었고, `unit_price_with_vat=11000`, `supply_amount=10000`, `vat_amount=1000`이었다. 결론 11,000원은 맞지만 근거는 raw `line_total`이 아니라 VAT 포함 정본과 `supply+vat`/일마감 API 계약이다.

## ③ 결함1 조회 대상 확인

라벨만 바꾼 수정이 아니다.

1. 매입 토글에서 Desktop은 `getDailyClosingRows(slipDate, 'INBOUND')`를 호출한다.
2. 실제 요청은 `GET /slips/query/daily-closing?slipDate=2026-08-14&slipType=INBOUND`였다.
3. controller가 `SlipType.INBOUND`를 `DailyClosingQueryService.findRows`에 전달하고, 서비스는 non-OUTBOUND 분기에서 `findDailyClosingSlips(date, INBOUND, statuses)`를 호출한다.
4. 라이브 API는 INBOUND 14행, 화면 DOM도 14행이었고 `입고전표 원본행`·`입고일 2026-08-14`를 표시했다. OUTBOUND는 API/DOM 13행과 `출고전표 원본행`·`출고일`이었다.

PR 일마감 경로에서 `출고전표 라인` 잔재는 발견되지 않았다. `dpsCompareApi`와 slip internal DPS API에는 별도 #1271 대상인 “출고전표 라인” 계약이 남아 있지만 이 PR의 일마감 조회·렌더 경로에서는 참조하지 않는다.

## ④ 잃으면 안 되는 것 3개 재현

- 재진입 잠금: 매출 6번과 매입 1번을 생성하고 새로고침해 다시 들어간 뒤 두 대상 모두 `이미 생성됨`/disabled를 확인했다. 단가 입력도 생성 대상에서 잠겼다.
- 정상 미생성 경로: 재진입 뒤 매출·매입 양쪽 모두 다른 미연결 행의 `회계전표 생성` enabled 버튼이 1개 이상 남았다.
- 열 정합: 매출·매입 모두 지정된 17개 헤더를 DOM에서 확인했다. 라벨과 날짜축도 각각 OUTBOUND/INBOUND에 맞았다.

단, 아래 도달 결함 때문에 “정상 미생성” 중 같은 날짜·순번이 반대 전표유형에서 방금 생성된 경우만 현재 세션에서 오잠금된다.

### 도달 결함 1 — 매출 생성 직후 같은 날짜·순번의 미생성 매입이 오잠금

재현 순서:

1. 매출 화면에서 OUTBOUND `2026/08/14-6` 회계전표를 생성한다.
2. 새로고침하지 않고 매입 화면으로 전환한다.
3. 별개의 INBOUND 원천 `2026/08/14-6`은 매입 회계전표가 없는데도 버튼이 `이미 생성됨`/disabled가 된다.
4. 새로고침 후 같은 매입 6번 버튼은 다시 enabled가 된다. 서버 eligibility와 DB에는 해당 매입 allocation이 없었다.

원인은 화면 로컬 생성 상태 키가 전표유형 없이 ``${slipDate}-${seqNo}``라서 매출·매입이 충돌하는 것이다. 두 원천의 내부 식별자가 서로 다르고 서버 조회는 전표유형별로 정상 분리되므로, 화면을 통해 재현되는 클라이언트 상태 결함이다. `03-purchase-before-create.png`의 매입 6번 소계 행에서 확인된다.

## ⑤ 계열 sweep

- `buildDailyClosingAccountingSlipRequest`의 호출부는 `DailyClosingPage` 한 곳이며 SALES/PURCHASE 모두 같은 `row.total` VAT 포함 계약을 사용한다.
- 라이브에서 매출·매입 TAXABLE 11,000원을 각각 생성·배분·저장까지 확인했다.
- 10,000원 원천행도 화면에서 10,000원으로 유지됐고 변환기는 해당 `row.total`을 그대로 사용한다. 다른 화면에서 이 일마감 변환기를 호출하거나 10,000/11,000으로 재분기하는 경로는 찾지 못했다.
- 일반 매출/매입 회계전표 폼은 독립 allocation 계약이며 이번 일마감 자동 생성 경로와 섞이지 않는다.
- 같은 날짜·순번 상태 키 충돌은 금액이 아니라 매출/매입 전환 계열에서 새로 확인된 결함이다.

## ⑥ 커밋된 캡처 4장 검증

네 파일을 모두 직접 열었다. 각 장은 화면 데이터행 1행 + 소계 1행 + 총계 1행으로 0행 stub이 아니다.

| 파일 | 직접 센 화면 데이터행 | 내용 확인 |
|---|---:|---|
| `docs/qa/1264-fix-round1/screenshots/01-sales-before-existing-generation.png` | 1 | 매출, 출고 라벨, 11,000원 데이터 |
| `docs/qa/1264-fix-round1/screenshots/02-purchase-before-existing-generation.png` | 1 | 매입, 입고 라벨·입고일, 11,000원 데이터 |
| `docs/qa/1264-fix-round1/screenshots/03-sales-after-existing-generation.png` | 1 | 매출, 11,000원 데이터 |
| `docs/qa/1264-fix-round1/screenshots/04-purchase-after-existing-generation.png` | 1 | 매입, 입고 라벨·입고일, 11,000원 데이터 |

증거 무결성 예외: 커밋된 캡처 스펙은 네 번 `capture()`만 호출하고 생성 동작이나 전후 상태 전환을 수행하지 않는다. 따라서 파일명과 보고서의 “before/after” 주장은 실제 생성 전후 증거가 아니다. 네 이미지가 비어 있지는 않지만, 이 네 장만으로 생성·저장을 입증할 수는 없다. 제품 결함 수에는 포함하지 않았다.

## ⑦ 직접 촬영한 스크린샷

모두 `resolveQaShotsDir()`을 경유했다. 라이브 DOM 데이터행은 매출 13행, 매입 14행이며 캡처 내부 고정 높이 영역에 실제 보이는 데이터행은 각 장 10행이다. 헤더만 있는 화면이 아니다.

| 파일 | DOM 데이터행 / 캡처에서 보이는 데이터행 | 확인 |
|---|---:|---|
| `docs/qa/1264-sol-reverdict-2/screenshots/01-sales-before-create.png` | 13 / 10 | 매출 생성 전, 6번 11,000원, 버튼 enabled |
| `docs/qa/1264-sol-reverdict-2/screenshots/02-sales-after-create.png` | 13 / 10 | 매출 생성 후, 6번 `이미 생성됨`, 회계 `2026/08/14-123` 성공 문구 |
| `docs/qa/1264-sol-reverdict-2/screenshots/03-purchase-before-create.png` | 14 / 10 | 매입 생성 전, 1번 enabled; 미생성 6번이 잘못 `이미 생성됨` |
| `docs/qa/1264-sol-reverdict-2/screenshots/04-purchase-after-create.png` | 14 / 10 | 매입 1번 생성 후 `이미 생성됨`, 회계 `2026/08/14-675` 성공 문구 |

라이브 Playwright 명시 스펙은 실제 매출·매입 POST, 생성 응답 변화, 재진입, 17열, 행 수를 검증해 최종 `1 passed (5.2s)`였다. 교차유형 오잠금은 별도 실패 재현에서도 `Expected enabled / Received disabled`로 확인했다. 관련 3개 Vitest 파일은 35/35 통과했고 branch JAR 3종 빌드도 통과했다.

## ⑧ 미검증 축

- 비과세·영세율 원천의 실제 생성/DB 저장은 해당 라이브 데이터가 없어 미검증이다.
- 수량 2 이상·복수 라인 한 전표의 반올림 및 배분 합계 라이브 저장은 미검증이다.
- POSTED 상태 전표의 후속 전기·세금계산서 연결까지는 미검증이다. 이번 검증은 DRAFT 생성·배분·DB 저장까지다.
- PR head가 검증 중 `b1a661630`으로 이동했으므로 그 merge commit 전체 159파일은 이 재판정 범위에서 미검증이다. 지정 SHA의 일마감 대상과 두 SHA 사이 대상 파일 불변만 확인했다.

## ⑨ CI

게시 직전 PR head `b1a661630` 기준으로 CI는 green이 아니다.

- `빌드 + 테스트 (product-quantity-sync-schema)`: fail
- `GitGuardian Security Checks`: fail
- `Desktop Playwright (mock 회귀 hard gate)`: pass
- `Frontend Desktop (typecheck + lint + build)` 등 다수: pending
- `Playwright (web + electron + mobile emul)`: pass
- 이전 라운드의 `Frontend Desktop red`는 이 시점 결과가 아니다. 현재 Desktop Playwright hard gate는 pass이고 Frontend Desktop 빌드는 pending이다.

## ⑩ 머지 가능/불가 — 도달 결함 N건

**머지 불가 — 화면을 통해 재현되는 도달 결함 1건.**

지난 결함1(매입 조회·라벨)과 결함2(11,000원 네 자리)는 수정됐다. 그러나 같은 날짜·순번의 매출 생성 직후 별개 매입 원천을 `이미 생성됨`으로 오잠그는 사용자 도달 결함이 남았다. CI도 현재 green이 아니다.

## ⑪ 프로세스 회수

- 이번 검증에서 기동한 Vite 5943: 종료, 잔여 listener 0.
- 격리 PostgreSQL/product/slip/accounting 컨테이너 4개: 모두 삭제, `sol1264r2-*` 잔여 0.
- 검증 포트 5943/15464/28184/28186/28187: listener 각 0.
- 임시 미추적 live spec과 Playwright `test-results`: 회수 완료.
- 공유 컨테이너: 중지·재시작·교체하지 않았고 실행 중 `samhan-*` 24개 유지.
- 공유 DB write: 0건. 생성 write는 삭제한 격리 DB에만 수행했다.
- `git add`/`commit`/`push`: 수행하지 않았다.
