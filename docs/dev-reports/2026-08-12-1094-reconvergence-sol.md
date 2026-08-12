# PR #1179 (#1094) fix-liveqa4 실서버 재수렴 라이브 QA (SOL)

- 대상 브랜치: `feat/1094-docno-hyperlink-and-back`
- 대상 HEAD: `f6239f387`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로에서 재현되는 결함이 있는가?**

## 판정

**있다. 입금보고서 편집 hydrate 결함 1건이 실 사용자 경로에서 재현된다.**

견적·주문·입금보고서의 문서번호 링크, 목록 버튼 1회 복귀, `640px` 스크롤 복원, 2회 왕복 history 비누적, 브라우저 뒤로가기 상세 비재진입은 모두 통과했다. 주문 검색어도 유지됐다. 입금보고서 상세 금액 `1,008`은 정상이나, 편집 hydrate 뒤 첫 행은 빈 값이고 행 합계는 `0원`이다.

## 격리 clone과 실서비스

- PostgreSQL: `qa1094reconv-pg`, `127.0.0.1:40832`
- network: `qa1094reconv-net`
- gateway: `qa1094reconv-gateway`, `127.0.0.1:40880`
- renderer: current worktree HashRouter Vite, `127.0.0.1:52948`
- 전용 서비스: eureka/auth/user/product/partner/slip/partner-order/dc-config/accounting
- 공유 `samhan-*` 업무 화면/API는 사용하지 않았다. 로그인과 화면 요청은 전용 clone/service에만 수행했다.

복제는 PowerShell 파이프를 사용하지 않았다.

```text
samhan-postgres 내부 pg_dumpall -f /tmp/qa1094reconv-all.sql
docker cp source:/tmp/qa1094reconv-all.sql host-file
docker cp host-file qa1094reconv-pg:/tmp/qa1094reconv-all.sql
qa1094reconv-pg 내부 psql -f /tmp/qa1094reconv-all.sql
```

20개 비-template DB가 복원됐다. 새 PostgreSQL의 기본 role과 dump role이 겹쳐 `role "samhan" already exists` 표준 오류 1건이 있었고 restore는 끝까지 완료됐다.

요청된 한글 확인 원문:

```text
SOURCE_HANGUL_BEGIN
(주)한국냉동물류
(주)서울택배
대한화물서비스(주)
SOURCE_HANGUL_END
CLONE_HANGUL_BEGIN
(주)한국냉동물류
(주)서울택배
대한화물서비스(주)
CLONE_HANGUL_END
```

입금보고서 clone DB 원문:

```text
2026/08/07-8|MANUAL_RECEIPT|DRAFT|1008.00|[{"memo": "S5-1094-08", "bizNo": "165-35-10155", "amount": 1008, "partnerId": "8f2bc08a-c6f3-3bc3-af98-7fdd58d2b38e", "partnerCode": "P-2026-0005", "partnerName": "대구HVAC솔루션"}]
```

## 화면별 실측

각 화면에서 같은 문서를 2회 연속 `목록 → 상세 → 목록` 왕복했다. `history.length`는 브라우저 세션의 절대 길이이며, 목록 버튼은 각 왕복에서 한 번만 클릭했다.

| 화면 | 대상 | 진입 전 scrollY | 1회 복귀 후 | 2회 복귀 후 | history.length (`목록→상세1→목록1→상세2→목록2`) | 브라우저 뒤로가기 |
|---|---|---:|---:|---:|---|---|
| 견적 | `삼성전자`, `QUOTE_DRAFT`, `2026/08/10-9` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4` | `#/` 도달, 상세 재진입 없음 |
| 주문 | `DRAFT`, 검색어 `2026/06/08`, `2026/06/08-1982` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `3→4→4→4→4` | `#/` 도달, 상세 재진입 없음 |
| 입금보고서 | `MANUAL_RECEIPT`, `2026/08/07-8` | `640,640,640,640` | `640,640,640,640` | `640,640,640,640` | `4→5→5→5→5` | 무필터 입금 목록 도달, 상세 재진입 없음 |

주문 검색어 원문:

```text
목록 URL = #/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
1회 왕복 후 input value = 2026/06/08
2회 왕복 후 URL = #/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
```

입금보고서 `1,008` 관측 원문:

```text
clone DB header amount = 1008.00
clone DB lines_json[0].amount = 1008
상세 화면 금액 = 1,008
편집 hydrate 1초 후 첫 행 = ""
화면 합계 = 행 합계: 0원 / 입금 총액 1,008원
```

최종 Playwright 원문 집계:

```text
Running 3 tests using 1 worker
견적 PASS
주문 PASS
입금보고서 FAIL
2 passed / 1 failed
실패 assertion 1: expected first line "1008", received ""
실패 assertion 2: expected "행 합계: 1,008원 / 입금 총액 1,008원",
                  received "행 합계: 0원 / 입금 총액 1,008원"
```

## 재현 가능한 결함

### F1. 입금보고서 편집 hydrate에서 첫 행 `1,008` 유실

1. 입금보고서 목록에서 전표번호 `2026/08/07-8`, 구분 `수기 입금`으로 검색한다.
2. 문서번호 `2026/08/07-8` 링크를 클릭한다.
3. 상세 화면 금액 `1,008`을 확인한다.
4. `편집`을 클릭한다.
5. 첫 입금 행의 거래처 `대구HVAC솔루션`은 보이지만 금액 입력은 빈 값이다.
6. 1초 후에도 `행 합계: 0원 / 입금 총액 1,008원`으로 불일치한다.

## 스크린샷과 증명 범위

아래 16장은 모두 이번 라운드의 clone DB + 전용 gateway/services + current worktree renderer에서 새로 캡처한 1440×420 PNG다. 직접 열어 확인했으며 증거 화면의 한글은 정상이고 데이터 자리에 `?`가 보이는 캡처는 없다.

- `docs/qa/2026-08-12-1094-reconv/00-estimate-filtered-target-link.png` — 삼성전자/작성중 필터와 `2026/08/10-9` 문서번호 링크.
- `docs/qa/2026-08-12-1094-reconv/01-estimate-list-before-link-640.png` — 견적 클릭 직전 `scrollY=640` viewport.
- `docs/qa/2026-08-12-1094-reconv/02-estimate-detail-after-docno-link.png` — 링크 클릭 뒤 `2026/08/10-9` 상세와 `← 목록`.
- `docs/qa/2026-08-12-1094-reconv/03-estimate-list-after-one-back.png` — 목록 버튼 1회 뒤 복원된 `scrollY=640` viewport.
- `docs/qa/2026-08-12-1094-reconv/04-estimate-browser-back-not-detail.png` — 2회 왕복 뒤 브라우저 back이 상세가 아닌 대시보드에 도달.
- `docs/qa/2026-08-12-1094-reconv/05a-order-filtered-target-link-keyword.png` — 검색어 `2026/06/08`과 `2026/06/08-1982` 문서번호 링크.
- `docs/qa/2026-08-12-1094-reconv/05-order-list-before-link-640-keyword.png` — 주문 클릭 직전 `scrollY=640` viewport.
- `docs/qa/2026-08-12-1094-reconv/06-order-detail-after-docno-link.png` — 링크 클릭 뒤 주문 `2026/06/08-1982` 상세와 `← 목록`.
- `docs/qa/2026-08-12-1094-reconv/07-order-list-after-one-back-keyword-retained.png` — 목록 버튼 1회 뒤 `scrollY=640` 위치와 같은 주문 결과.
- `docs/qa/2026-08-12-1094-reconv/08-order-browser-back-not-detail.png` — 2회 왕복 뒤 브라우저 back이 상세가 아닌 대시보드에 도달.
- `docs/qa/2026-08-12-1094-reconv/09a-cash-filtered-target-link-1008.png` — `2026/08/07-8`, 수기 입금, 대구HVAC솔루션, `1,008` 목록 행.
- `docs/qa/2026-08-12-1094-reconv/09-cash-list-before-link-640.png` — 입금보고서 클릭 직전 `scrollY=640` viewport.
- `docs/qa/2026-08-12-1094-reconv/10-cash-detail-after-docno-link-1008.png` — 링크 클릭 뒤 상세 `1,008`과 목록/편집 버튼.
- `docs/qa/2026-08-12-1094-reconv/11-cash-list-after-one-back.png` — 목록 버튼 1회 뒤 복원된 `scrollY=640` viewport.
- `docs/qa/2026-08-12-1094-reconv/12-cash-browser-back-not-detail.png` — 2회 왕복 뒤 브라우저 back이 상세가 아닌 입금보고서 목록에 도달.
- `docs/qa/2026-08-12-1094-reconv/13-cash-edit-hydrated-first-line-1008-total-1008.png` — 첫 행 금액 빈칸과 `행 합계: 0원 / 입금 총액 1,008원` 결함.

정확한 수치 원문은 `docs/qa/2026-08-12-1094-reconv/measurements.jsonl`에도 저장했다.

## 못 한 것

없다. 요청된 세 화면의 링크 진입, 목록 버튼, 반복 history, 브라우저 뒤로가기, 주문 검색어, 입금 hydrate를 모두 실서비스 GUI에서 수행했다.

## 종료 점검

전용 `qa1094reconv-*` 컨테이너/network, renderer, Playwright 잔여 프로세스, 임시 dump/harness를 제거했다.

```text
RENDERER_LISTENER=False
QA_CONTAINERS=0
QA_NETWORK=0
TEMP_EXISTS=False
HARNESS_EXISTS=False
SOURCE_TMP_EXISTS=False
```

**삭제된 추적 파일은 없다.** `git ls-files --deleted`와 `git diff --name-status origin/main...HEAD`의 `D` 항목이 모두 0건이다.

특별 확인 대상 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 존재하며 42 bytes, SHA-256 `F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3`이다. git add/commit/push/checkout/stash/reset은 수행하지 않았다.
