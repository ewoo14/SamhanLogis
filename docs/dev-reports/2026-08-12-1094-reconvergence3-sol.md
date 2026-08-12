# PR #1179 (#1094) 재수렴 3회차 적대검증 (SOL)

- 대상: `feat/1094-docno-hyperlink-and-back`, 사용자 제공 HEAD `f10cc403d`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 제한 준수: git 명령 미사용, 공유 업무 API/화면 미사용, 구현 코드 미변경

## 판정

**있다. 실 사용자 경로 결함 3건을 재현했다.**

| 결함 | 실 사용자 재현 | 관측값 |
|---|---|---|
| F1. 견적 목록 1회 복귀 시 스크롤 위치 유실 | `삼성전자` + `QUOTE_DRAFT` 필터 → `640px` → N번째 문서번호 → 상세 → `← 목록` 1회 | 검색·필터·URL은 유지됐으나 `640px → 230px`. 안정화 표본도 `230,230,230,230` |
| F2. 견적 편집·저장 뒤 목록 복귀에 history 1단계가 더 필요 | 위 목록 → 상세 → 편집 → 저장 → 상세의 `← 목록` 1회 | 목록이 아니라 같은 상세 `#/sales/estimates/2026-08-10-9`에 잔류 |
| F3. 입금보고서 편집 hydrate에서 저장 행 금액 유실 | `slipNo=2026/08/07-8`, `MANUAL_RECEIPT`, `640px` → 상세 → 편집 → 저장 | clone DB는 총액/행 모두 `1008`이나 라이브 폼은 `행 합계: 0원 / 입금 총액 1,008원`; 클라이언트 검증에 막혀 저장·복귀 불가 |

F1은 요청된 픽셀 기준으로 단정한다. 시작값은 정확히 `640px`, 목록 복귀 안정값은 정확히 `230px`였다. F3 때문에 입금보고서의 100ms 지연 재복원 자체에는 도달하지 못했다. 그보다 앞선 실제 저장 경로가 막히므로 사용자 경로 결함으로 판정했다.

## 통과한 경로

- 주문: 검색어 `2026/06/08`, 상태 `DRAFT`, URL query, 문서번호 클릭, 목록 1회 복귀, 행 여백 클릭, 정식 편집·저장 후 복귀 모두 통과. 스크롤은 두 복귀 모두 `640,640,640,640`으로 안정했다.
- 견적·주문 문서번호 링크는 각각 `#/sales/estimates/2026-08-10-9`, `#/sales/partner-orders/2026-06-08-1982`이며 UUID 경로가 아니다.
- 문서번호 링크의 전파 차단은 행 클릭을 막지 않았다. 문서번호가 아닌 행 우측 여백 클릭으로 견적·주문 상세에 진입했다.
- #1175 정본 셸: 견적 `detail-grid=1 / card-like=5`, 주문 `detail-grid=1 / card-like=6`.
- 견적·주문·입금보고서 상세 visible UUID는 모두 0건.
- 복귀 state 없는 직접 URL 상세 진입 후 목록 fallback은 견적·주문·입금보고서 모두 통과.
- 다른 목록의 이중 스크롤/지연 흔들림은 주문에서 관측되지 않았다. 견적은 잘못된 `230px`에 고정됐으며 추가 이중 이동은 없었다.

## 라이브 실행 원문과 집계

현재 worktree의 `slip-service`, `partner-order-service`, `accounting-service` bootJar를 빌드해 전용 이미지로 실행했다.

```text
BUILD SUCCESSFUL in 18s
28 actionable tasks: 19 executed, 9 from cache
```

최종 라이브 원문 중 판정 축:

```text
PASS | 격리 로그인 | HTTP=200 role=MASTER
PASS | 견적 검색·필터 URL 정본 + 시작 위치 | scroll=640 url=http://127.0.0.1:52943/#/sales/estimates?partner=...&status=QUOTE_DRAFT
FAIL | 견적 목록 1회 복귀 identity | partner=삼성전자 status=QUOTE_DRAFT scrollSamples=230,230,230,230 url=http://127.0.0.1:52943/#/sales/estimates?partner=...&status=QUOTE_DRAFT
PASS | 견적 행 여백 클릭 | url=http://127.0.0.1:52943/#/sales/estimates/2026-08-10-9
FAIL | 견적 편집·저장 후 목록 1회 복귀 | 목록 미도달 url=http://127.0.0.1:52943/#/sales/estimates/2026-08-10-9
PASS | 주문 목록 1회 복귀 identity | keyword=2026/06/08 status=DRAFT scrollSamples=640,640,640,640 url=http://127.0.0.1:52943/#/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
PASS | 주문 편집·저장 후 목록 identity | keyword=2026/06/08 status=DRAFT scrollSamples=640,640,640,640 url=http://127.0.0.1:52943/#/sales/partner-orders?status=DRAFT&keyword=2026%2F06%2F08
PASS | 입금보고서 검색·필터 URL 정본 + 시작 위치 | scroll=640 url=http://127.0.0.1:52943/#/accounting/admin/cash-receipts?slipNo=2026%2F08%2F07-8&kind=MANUAL_RECEIPT
FAIL | 입금보고서 편집·저장 후 목록 복귀 | 목록 미도달 url=http://127.0.0.1:52943/#/accounting/admin/cash-receipts/a0090411-595e-467b-b5ad-c618d5a541ec/edit alerts=행 합계가 입금 총액과 같아야 합니다.
LIVE_QA_SUMMARY passed=16 skipped=0 failed=3
```

F3 집중 재현 원문:

```text
CASH_PRE_SAVE | 행 합계: 0원 / 입금 총액 1,008원
FAIL | 입금보고서 편집·저장 후 목록 복귀 | 목록 미도달 ... alerts=행 합계가 입금 총액과 같아야 합니다.
LIVE_QA_SUMMARY passed=4 skipped=0 failed=1
```

분리 집계:

| 범위 | passed | skipped | failed |
|---|---:|---:|---:|
| 최종 전체 라이브 assertion | 16 | 0 | 3 |
| F3 집중 재현 | 4 | 0 | 1 |

## 격리 DB 복제와 인코딩 증거

- network: `recon1094-r3-net`
- PostgreSQL: `127.0.0.1:40432`
- gateway: `127.0.0.1:40480`
- renderer: `127.0.0.1:52943`
- 관련 서비스: `40476`, `40481`, `40483`, `40484`, `40486`, `40487`, `40488`, `40489`, `40492`, `40495`
- 공유 `samhan-*` 화면/API에는 로그인하거나 업무 요청하지 않았다. 원본 PostgreSQL은 read-only dump와 비교 SELECT에만 사용했다.

복제는 파이프 없이 파일 경유로 수행했다.

```text
samhan-postgres 내부 pg_dumpall -f /tmp/recon1094-r3-all.sql
docker cp source:/tmp/recon1094-r3-all.sql host-file
docker cp host-file recon1094-r3-pg:/tmp/recon1094-r3-all.sql
recon1094-r3-pg 내부 psql -f /tmp/recon1094-r3-all.sql
HOST_DUMP_BYTES=72903145
```

새 PostgreSQL 기본 role 때문에 restore 표준 오류에 `role "samhan" already exists`가 1건 출력됐다. 복원 뒤 원본/clone의 DB와 `estimates` 2,063건을 확인했고, 한글 SELECT와 SHA-256은 일치했다.

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
SOURCE_SHA256=EDE80517487030AD45FA585AC7FB9F97BFBAF04089EF269372883620006613EF
CLONE_SHA256=EDE80517487030AD45FA585AC7FB9F97BFBAF04089EF269372883620006613EF
```

인앱 Browser는 설치된 브라우저 목록이 `[]`여서 제품 판정에 사용하지 않았다. 저장소의 로컬 Playwright Chromium과 `vite.renderer.dev.config.ts` HashRouter renderer를 사용했다. 최초 재사용 backend 이미지와 900px viewport 실행은 각각 문서번호 API 불일치와 최대 스크롤 `196px`라는 증거 무결성 문제가 있어 폐기했고, 현재 worktree backend 이미지 + 420px viewport로 위 최종 결과를 다시 얻었다.

## 스크린샷 전 경로

13장 모두 전용 clone DB + 404xx API + 이 worktree renderer의 실제 화면이며, 1440×420 PNG다. 직접 육안 확인 결과 한글이 정상이다.

- `docs/qa/2026-08-12-1094-reconv3/01-estimate-filtered-list-640.png`
- `docs/qa/2026-08-12-1094-reconv3/02-estimate-detail-docno-shell.png`
- `docs/qa/2026-08-12-1094-reconv3/03-estimate-one-back-restored-230.png`
- `docs/qa/2026-08-12-1094-reconv3/04-estimate-row-margin-detail.png`
- `docs/qa/2026-08-12-1094-reconv3/05-estimate-after-edit-save-one-back-stuck.png`
- `docs/qa/2026-08-12-1094-reconv3/06-order-filtered-list-640.png`
- `docs/qa/2026-08-12-1094-reconv3/07-order-detail-docno-shell.png`
- `docs/qa/2026-08-12-1094-reconv3/08-order-one-back-restored-640.png`
- `docs/qa/2026-08-12-1094-reconv3/09-order-row-margin-detail.png`
- `docs/qa/2026-08-12-1094-reconv3/10-order-after-edit-save-restored-640.png`
- `docs/qa/2026-08-12-1094-reconv3/11-cash-filtered-list-640.png`
- `docs/qa/2026-08-12-1094-reconv3/12-cash-detail-document-shell.png`
- `docs/qa/2026-08-12-1094-reconv3/13-cash-after-edit-save-return-failed.png`

## 변경·종료 확인

- 구현 코드 변경 없음. 영구 산출물은 본 보고서와 QA PNG 13장이다.
- git 명령, commit, push 미수행.
- 임시 하네스·`.codex-tmp/`·`recon1094-r3-*` 컨테이너/network·renderer listener·원본 컨테이너의 `/tmp/recon1094-r3-all.sql`을 제거했다.
- 종료 원문: `TMP_EXISTS=False`, `HARNESS_EXISTS=False`, `RENDERER_LISTENER=False`, `RECON1094_REMAINING=NONE`, `RECON1094_NETWORK_REMAINING=NONE`, `SOURCE_TMP_EXISTS=False`.
- 이번 라운드가 추적 파일을 삭제한 적은 없다. git 금지 때문에 인덱스 전체 대조 명령은 실행하지 않았고, 삭제 대상은 전용 임시 경로/프로세스/컨테이너로 한정했다. 특별 확인 대상 `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 종료 시 존재하며 `42 bytes`다. 복구가 필요하지 않아 `git add -f`도 실행하지 않았다.
