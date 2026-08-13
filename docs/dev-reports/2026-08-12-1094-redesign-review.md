# PR #1179 (#1094) 재설계 검증 보고

- 대상: `feat/1094-docno-hyperlink-and-back`, 개발책임자 제공 HEAD `36e00d4f8`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**

## 판정

**이번 라운드에서 확인된 재현 가능 결함은 0건이다. 다만 브라우저 런타임이 `[]`여서 세 화면의 실 사용자 경로 24항목을 전부 실행하지 못했으므로, “결함 없음”으로 확정하지 않고 판정 보류한다.**

로컬 Playwright나 과거 이미지는 대체 증거로 사용하지 않았다. 구현 코드는 변경하지 않았다.

## 실 사용자 경로

인앱 브라우저 연결 결과 원문:

```text
No browser is available
[]
```

따라서 견적·주문·입금보고서 각각의 다음 8항목, 합계 24항목은 모두 `skipped`다.

1. 검색어 + 필터 + 스크롤 픽셀 기록
2. N번째 문서번호 클릭 후 상세 진입
3. 뒤로 가기 한 번으로 목록 복귀
4. 검색어·필터·스크롤 픽셀 동일성
5. 상세 수정·저장 후 복귀 동일성
6. 행 여백 클릭 상세 진입
7. 편집 폼 금액과 DB 값 동일성
8. 직접 URL 진입

| 범위 | passed | skipped | failed |
|---|---:|---:|---:|
| 견적 라이브 UI | 0 | 8 | 0 |
| 주문 라이브 UI | 0 | 8 | 0 |
| 입금보고서 라이브 UI | 0 | 8 | 0 |
| **합계** | **0** | **24** | **0** |

## 격리 DB·서비스 확인

전용 자원만 사용했다.

- network: `redesign1094qa-net`
- PostgreSQL: `127.0.0.1:40632`
- gateway: `127.0.0.1:40680`
- renderer: `127.0.0.1:52945`
- 관련 서비스: `40676`, `40681`, `40683`, `40684`, `40686`, `40687`, `40688`, `40689`, `40692`, `40695`

복제는 파이프 없이 파일을 경유했다.

```text
samhan-postgres 내부 pg_dumpall -f /tmp/redesign1094qa-all.sql
docker cp source:/tmp/redesign1094qa-all.sql host-file
docker cp host-file redesign1094qa-pg:/tmp/redesign1094qa-all.sql
redesign1094qa-pg 내부 psql -f /tmp/redesign1094qa-all.sql
```

restore 중 새 PostgreSQL 기본 role과 dump의 role이 겹치는 표준 오류 1건이 있었고, psql은 나머지 restore를 계속 수행했다.

```text
psql:/tmp/redesign1094qa-all.sql:16: ERROR: role "samhan" already exists
```

복제 직후 원본과 clone을 각각 다시 SELECT한 원문:

```text
SOURCE_SELECT_BEGIN
2026/08/10-9|삼성전자
2026/08/10-8|삼성전자
2026/08/10-7|삼성전자
2026/08/10-6|삼성전자
2026/08/10-5|삼성전자
2026/08/07-8|MANUAL_RECEIPT|DRAFT|1008.00|[{"memo": "S5-1094-08", "bizNo": "165-35-10155", "amount": 1008, "partnerId": "8f2bc08a-c6f3-3bc3-af98-7fdd58d2b38e", "partnerCode": "P-2026-0005", "partnerName": "대구HVAC솔루션"}]
SOURCE_SELECT_END
CLONE_SELECT_BEGIN
2026/08/10-9|삼성전자
2026/08/10-8|삼성전자
2026/08/10-7|삼성전자
2026/08/10-6|삼성전자
2026/08/10-5|삼성전자
2026/08/07-8|MANUAL_RECEIPT|DRAFT|1008.00|[{"memo": "S5-1094-08", "bizNo": "165-35-10155", "amount": 1008, "partnerId": "8f2bc08a-c6f3-3bc3-af98-7fdd58d2b38e", "partnerCode": "P-2026-0005", "partnerName": "대구HVAC솔루션"}]
CLONE_SELECT_END
SOURCE_HAS_HANGUL=True
CLONE_HAS_HANGUL=True
UTF8_EXACT_MATCH=True
SOURCE_SHA256=657393D0D08B4F52239AB7CB01931895381A7D8A8DA036395A9243511D033B7B
CLONE_SHA256=657393D0D08B4F52239AB7CB01931895381A7D8A8DA036395A9243511D033B7B
```

격리 gateway API smoke 원문:

```text
LOGIN_HTTP=200 ROLE=MASTER
ESTIMATE_LIST_HTTP=200 COUNT=40
ORDER_LIST_HTTP=200 COUNT=4
CASH_LIST_HTTP=200 COUNT=1
ESTIMATE_DETAIL_HTTP=200 DOCNO=2026/08/10-9
ORDER_DETAIL_HTTP=200 DOCNO=2026/06/08-1982 STATUS=DRAFT
CASH_DETAIL_HTTP=200 DOCNO=2026/08/07-8 HEADER=1008.00 LINE0=1008
```

입금보고서 DB header·첫 line과 상세 API header·첫 line은 모두 `1,008`이다. 브라우저가 없어 편집 폼 렌더 값은 확인하지 못했다.

## 자동 검증

의존성 정합화:

```text
npm ci
added 1017 packages, and audited 1019 packages in 26s
Exit code: 0
```

desktop typecheck:

```text
npm run typecheck
tests 2, pass 2, fail 0, skipped 0
tests 51, pass 51, fail 0, skipped 0
Exit code: 0
```

desktop 전량 테스트는 직전 라운드와 달리 timeout 없이 끝났다.

```text
npm test
pretest: tests 5, pass 5, fail 0, skipped 0
vitest: numTotalTestSuites=677, numPassedTestSuites=677, numFailedTestSuites=0
vitest: numTotalTests=2239, numPassedTests=2237, numFailedTests=0, numPendingTests=2
success=true
Exit code: 0
Wall time: 103.2 seconds
```

PR 관련 집중 suite:

```text
Test Files 6 passed (6)
Tests 64 passed (64)
Exit code: 0
```

집중 범위는 `EstimateListPage`, `EstimateDetailPage`, `SalesPartnerOrderListPage`, `SalesPartnerOrderDetailPage.coedit`, `CashReceiptListPage`, `CashReceiptFormPage`다. `CashReceiptListPage`의 이전 import 실패는 `npm ci` 후 재현되지 않았다. jsdom stderr에는 `window.scrollTo` 미구현 메시지가 있었으나 suite 결과는 6/6, 64/64 통과다. 픽셀 복귀의 라이브 증거로는 세지 않았다.

| 자동 검증 범위 | passed | skipped | failed |
|---|---:|---:|---:|
| desktop pretest | 5 | 0 | 0 |
| desktop vitest 전량 | 2,237 | 2 | 0 |
| typecheck 보조 테스트 | 53 | 0 | 0 |
| PR 집중 suite | 64 | 0 | 0 |

PR 집중 suite 64건은 desktop vitest 전량 2,237건에 포함되므로 총계에 중복 합산하지 않는다.

## 스크린샷

지정 디렉터리: `docs/qa/2026-08-12-1094-redesign-qa/`

스크린샷은 **0장**이다. 브라우저가 없어 새 캡처를 만들지 못했으며 과거 이미지 복사·합성은 하지 않았다. 나열할 파일 경로 없음. `.ps1`, `.cjs`, `.mjs` 드라이버도 이 디렉터리에 남기지 않았다.

## 종료 점검

구현 코드 변경 없음. 영구 산출물은 이 보고서뿐이며 QA 디렉터리는 빈 디렉터리다. commit·push는 수행하지 않았다.

첫 index 전수 대조에서 `tools/.s24-build-only/build/deep/tracked-writer.mjs` 1개가 누락된 것을 발견했다. 다른 worktree 정본의 Git blob SHA-1을 현재 index blob과 직접 비교해 양쪽 모두 `6f4bd99bc47f4e068c446aeedd188660cfdcf553`임을 확인한 후 파일을 복원했고, 개발책임자 지시의 복구 예외에 따라 해당 경로에만 `git add -f`를 실행했다.

```text
INDEX_BLOB=6f4bd99bc47f4e068c446aeedd188660cfdcf553
CANDIDATE_BLOB=6f4bd99bc47f4e068c446aeedd188660cfdcf553
EXACT_BLOB_MATCH=True
GIT_ADD_FORCE_EXIT=0
```

복구 후 Git 명령 없이 worktree index v2를 직접 읽어 19,430개 추적 entry의 실제 경로를 다시 전수 확인했다.

```text
INDEX_SIGNATURE=DIRC
INDEX_VERSION=2
TRACKED_ENTRY_COUNT=19430
MISSING_TRACKED_COUNT=0
SPECIAL_EXISTS=True
SPECIAL_SHA256=F3A735766688747E0E23C5D4155E95D1BF1B2134C845263D784661E8F79603A3
RENDERER_LISTENER=False
REDESIGN_CONTAINERS=0
REDESIGN_NETWORK=0
SOURCE_TMP_EXISTS=False
CODEX_TMP_EXISTS=False
QA_SCREENSHOT_COUNT=0
QA_DRIVER_COUNT=0
```

**라운드 종료 시 삭제된 추적 파일은 없다.** `.codex-tmp`·`redesign1094qa-*` 임시 자원도 남아 있지 않다.
