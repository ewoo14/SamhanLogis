# PR #1179 (#1094) 재수렴 4회차 적대검증 (SOL)

- 대상: `feat/1094-docno-hyperlink-and-back`, 사용자 제공 HEAD `44a8c85c8`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 제한 준수: git 명령 미사용, 공유 업무 API/화면 미사용, 구현 코드 미변경

## 판정

**있다. 실 사용자 경로 결함 5건을 재현했다.**

| 결함 | 실 사용자 재현 | 관측값 |
|---|---|---|
| F1. 견적 목록 1회 복귀 시 스크롤 유실 | `삼성전자` + `QUOTE_DRAFT` + `640px` → 문서번호 → 상세 → `← 목록` 1회 | 클릭 직전 `640,640,640,640`, 복귀 뒤 `230,230,230,230`. 검색·필터·URL은 유지 |
| F2. 견적 편집·저장 뒤 목록 복귀에 history 1단계가 더 필요 | 위 목록 → 상세 → 편집 → 저장 → 상세의 `← 목록` 1회 | 목록이 아니라 같은 상세 `#/sales/estimates/2026-08-10-9`에 잔류 |
| F3. 입금보고서 목록 1회 복귀 시 스크롤 유실 | `2026/08/07-8` + `MANUAL_RECEIPT` + `640px` → 문서번호 → 상세 → `목록` 1회 | 클릭 직전 `640,640,640,640`, 복귀 뒤 `192,192,192,192`. 검색·필터·URL은 유지 |
| F4. 입금보고서 행 여백으로 상세 진입 불가 | 필터된 입금보고서 행의 문서번호가 아닌 셀 클릭 | URL이 목록에 그대로 남음. `CashReceiptListPage`의 `PagedTable`에도 row click 계약이 전달되지 않음 |
| F5. 입금보고서 편집 hydrate에서 DB 행 금액 유실 | 문서번호 → 상세 → `편집` | clone DB 헤더/행 모두 `1008`, 폼 헤더 `1008`, 폼 첫 행은 빈 값, `행 합계: 0원 / 입금 총액 1,008원`. 저장 시 합계 검증에 막혀 편집 화면 잔류 |

F5가 fix3의 본체다. 단위 fixture와 달리 격리 라이브에서는 저장된 `lines_json[0].amount=1008`이 첫 행 입력으로 hydrate되지 않았다. 따라서 fix3로 금액 유실이 해소됐다고 판정할 수 없다.

## 통과한 경로

- 주문: 검색어 `2026/06/08`, 상태 `DRAFT`, 문서번호 클릭, 목록 1회 복귀, 행 여백 클릭, 편집·저장 후 복귀가 모두 통과했다. 두 복귀 모두 `640,640,640,640`으로 안정했다.
- 견적·주문 문서번호는 각각 `2026/08/10-9`, `2026/06/08-1982` 비즈니스 번호 링크이며 상세 visible UUID는 0건이다.
- 입금보고서도 화면 라벨과 상세 visible text에 UUID가 노출되지 않았다.
- #1175 정본 셸은 견적 `detail-grid=1 / card=5`, 주문 `detail-grid=1 / card=6`으로 유지됐다.
- 복귀 state 없는 직접 URL 상세 진입 후 목록 fallback은 견적·주문·입금보고서 모두 통과했다.
- 주문의 문서번호 전파 차단은 행 클릭을 막지 않았다.

## 라이브 실행 원문과 집계

최종 전체 사용자 경로 실행과 F5 집중 실행의 유효 assertion을 합산했다. 중간 하네스의 `fullPage` 캡처 간섭 가능성과 입금 버튼 라벨 오인(`수정` vs 실제 `편집`)은 폐기하고 재실행한 결과만 사용했다.

```text
PASS | 격리 로그인 | HTTP=200 role=MASTER
PASS | 견적 클릭 직전 anchor 무결성 | scrollSamples=640,640,640,640
FAIL | 견적 목록 1회 복귀 identity | partner=삼성전자 status=QUOTE_DRAFT scrollSamples=230,230,230,230 url=http://127.0.0.1:52944/#/sales/estimates?partner=...&status=QUOTE_DRAFT
FAIL | 견적 편집·저장 후 1회 목록 복귀 | scrollSamples=NONE url=http://127.0.0.1:52944/#/sales/estimates/2026-08-10-9
PASS | 주문 목록 1회 복귀 identity | keyword=2026/06/08 status=DRAFT scrollSamples=640,640,640,640 url=http://127.0.0.1:52944/#/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
PASS | 주문 편집·저장 후 목록 복귀 | scrollSamples=640,640,640,640 url=http://127.0.0.1:52944/#/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
PASS | 입금보고서 클릭 직전 anchor 무결성 | scrollSamples=640,640,640,640
FAIL | 입금보고서 목록 1회 복귀 identity | slipNo=2026/08/07-8 kind=MANUAL_RECEIPT scrollSamples=192,192,192,192 url=http://127.0.0.1:52944/#/accounting/admin/cash-receipts?slipNo=2026%2F08%2F07-8&kind=MANUAL_RECEIPT
FAIL | 입금보고서 행 여백 클릭 | url=http://127.0.0.1:52944/#/accounting/admin/cash-receipts?slipNo=2026%2F08%2F07-8&kind=MANUAL_RECEIPT
FAIL | 입금보고서 DB 금액 hydrate | dbHeader=1008 dbLine=1008 formHeader=1008 formLine= linesTotal=행 합계: 0원 / 입금 총액 1,008원
FAIL | 입금보고서 편집·저장 후 목록 복귀 | scrollSamples=NONE url=http://127.0.0.1:52944/#/accounting/admin/cash-receipts/a0090411-595e-467b-b5ad-c618d5a541ec/edit
PASS | 입금보고서 직접 URL fallback | url=http://127.0.0.1:52944/#/accounting/admin/cash-receipts
```

분리 집계:

| 범위 | passed | skipped | failed |
|---|---:|---:|---:|
| 전체 경로 assertion | 22 | 0 | 4 |
| F5 집중 assertion | 1 | 0 | 2 |
| 합계 | **23** | **0** | **6** |

F5 집중 실행의 두 번째 실패는 별도 원인 수가 아니라 금액 hydrate 실패 때문에 저장이 차단된 결과다.

## 격리 DB 복제와 인코딩 증거

- network: `recon1094-r4-net`
- PostgreSQL: `127.0.0.1:40532`
- gateway: `127.0.0.1:40580`
- renderer: `127.0.0.1:52944`
- 관련 서비스: `40576`, `40581`, `40583`, `40584`, `40586`, `40587`, `40588`, `40589`, `40595`
- 공유 `samhan-*` 화면/API에는 로그인하거나 업무 요청하지 않았다. 원본 PostgreSQL은 파일 dump와 비교 SELECT에만 사용했다.

복제는 파이프 없이 수행했다.

```text
samhan-postgres 내부 pg_dumpall -f /tmp/recon1094-r4-all.sql
docker cp source:/tmp/recon1094-r4-all.sql host-file
docker cp host-file recon1094-r4-pg:/tmp/recon1094-r4-all.sql
recon1094-r4-pg 내부 psql -f /tmp/recon1094-r4-all.sql
```

복제 직후 한글 SELECT 원문:

```text
SOURCE_SELECT_BEGIN
2026/08/10-9|삼성전자
2026/08/10-8|삼성전자
2026/08/10-7|삼성전자
2026/08/10-6|삼성전자
2026/08/10-5|삼성전자
SOURCE_SELECT_END
CLONE_SELECT_BEGIN
2026/08/10-9|삼성전자
2026/08/10-8|삼성전자
2026/08/10-7|삼성전자
2026/08/10-6|삼성전자
2026/08/10-5|삼성전자
CLONE_SELECT_END
SOURCE_HAS_HANGUL=True
CLONE_HAS_HANGUL=True
UTF8_EXACT_MATCH=True
SOURCE_SHA256=751B076ED18D5E6E3BA0D709E269FF549B2B01A3E50C9430DA3912DAED8A32DF
CLONE_SHA256=751B076ED18D5E6E3BA0D709E269FF549B2B01A3E50C9430DA3912DAED8A32DF
```

restore 표준 오류는 새 PostgreSQL 기본 role 중복 1건이었다.

```text
psql:/tmp/recon1094-r4-all.sql:16: ERROR: role "samhan" already exists
```

F5 clone DB 원문:

```text
2026/08/07-8|MANUAL_RECEIPT|DRAFT|1008.00|[{"memo": "S5-1094-08", "bizNo": "165-35-10155", "amount": 1008, "partnerId": "8f2bc08a-c6f3-3bc3-af98-7fdd58d2b38e", "partnerCode": "P-2026-0005", "partnerName": "대구HVAC솔루션"}]
```

인앱 Browser는 설치 목록이 `[]`여서 제품 판정에 쓰지 않았다. 과거 이미지는 복사·합성하지 않았다. 저장소 로컬 Playwright Chromium으로 이 라운드의 격리 화면 15장을 새로 캡처했다.

## 스크린샷 전 경로

15장 모두 격리 clone DB + 405xx API + 현재 worktree renderer의 실제 1440×420 viewport 화면이다. 목록 3종, 견적 상세, 입금 편집/검증 실패 화면을 직접 확인했으며 한글이 정상이다.

- `docs/qa/2026-08-12-1094-reconv4/01-estimate-filtered-list-640.png`
- `docs/qa/2026-08-12-1094-reconv4/02-estimate-detail-docno-shell.png`
- `docs/qa/2026-08-12-1094-reconv4/03-estimate-one-back-restored.png`
- `docs/qa/2026-08-12-1094-reconv4/04-estimate-row-margin-detail.png`
- `docs/qa/2026-08-12-1094-reconv4/05-estimate-after-edit-save-restored.png`
- `docs/qa/2026-08-12-1094-reconv4/06-order-filtered-list-640.png`
- `docs/qa/2026-08-12-1094-reconv4/07-order-detail-docno-shell.png`
- `docs/qa/2026-08-12-1094-reconv4/08-order-one-back-restored.png`
- `docs/qa/2026-08-12-1094-reconv4/09-order-row-margin-detail.png`
- `docs/qa/2026-08-12-1094-reconv4/10-order-after-edit-save-restored.png`
- `docs/qa/2026-08-12-1094-reconv4/11-cash-filtered-list-640.png`
- `docs/qa/2026-08-12-1094-reconv4/12-cash-detail-docno.png`
- `docs/qa/2026-08-12-1094-reconv4/13-cash-one-back-restored.png`
- `docs/qa/2026-08-12-1094-reconv4/14-cash-edit-hydrate-1008.png`
- `docs/qa/2026-08-12-1094-reconv4/15-cash-after-edit-save-return.png`

## 변경·종료 확인

- 구현 코드 변경 없음. 영구 산출물은 본 보고서와 QA PNG 15장이다.
- git 명령, commit, push 미수행.
- 임시 하네스·`.codex-tmp/`·`recon1094-r4-*` 컨테이너/network/renderer listener와 원본 컨테이너의 임시 dump/SELECT 파일을 제거했다.

종료 원문:

```text
RENDERER_LISTENER=False
RECON1094_CONTAINERS=NONE
RECON1094_NETWORKS=NONE
SOURCE_TMP_EXISTS=False
CODEX_TMP_EXISTS=False
CONTAINERS_REMOVED=13
IMAGES_REMOVED=3
```

git 명령 없이 worktree index v2를 직접 읽어 추적 entry의 실제 경로 존재를 전수 확인했다.

```text
INDEX_SIGNATURE=DIRC
INDEX_VERSION=2
TRACKED_ENTRY_COUNT=19413
MISSING_TRACKED_COUNT=0
SPECIAL_EXISTS=True
```

**삭제된 추적 파일 없음.** 복구가 필요하지 않아 `git add -f`는 실행하지 않았다. 특별 확인 대상 `tools/.s24-build-only/build/deep/tracked-writer.mjs`도 존재한다.
