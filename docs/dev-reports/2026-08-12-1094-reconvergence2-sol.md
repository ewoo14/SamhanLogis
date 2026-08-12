# PR #1179 (#1094) 재수렴 2회차 적대검증 (SOL)

- 대상: `feat/1094-docno-hyperlink-and-back`, 사용자 제공 HEAD `2ba587542`
- 일시: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 제한 준수: git 명령 미사용, 공유 업무 API/화면 미사용, 구현 코드 미변경

## 판정

**있다. 공통 원인 기준 3건이며, 라이브 assertion 5개가 실패했다.**

| 결함 | 실 사용자 재현 | 관측값 |
|---|---|---|
| F1. 견적·주문 문서번호 링크가 동일 상세를 history에 두 번 쌓음 | 필터 목록에서 문서번호 클릭 → 상세 `← 목록` 1회 클릭 | 견적·주문 모두 URL이 상세에 그대로 남음. 두 번째 history back에서야 목록 도달 |
| F2. 견적·주문 편집 저장 뒤 목록 identity 유실 | 검색·필터·640px 목록 → 상세 → 편집/저장 → 목록 | 견적: `partner=삼성전자,status=QUOTE_DRAFT,640px` → 빈 필터·`0px`; 주문: `keyword=2026/06/08,status=DRAFT,640px` → keyword만 빈 값·`640px` |
| F3. S7 입금보고서 스크롤 복귀 회귀 | `slipNo=2026/08/07-8`, 640px → 상세 → 편집/저장 | URL·필터는 동일하지만 안정화 2초 뒤에도 `640px → 192px` |

F1의 직접 코드 근거는 두 목록 모두 문서번호 `Link`의 클릭 이벤트가 전파되는 구조라는 점이다. 견적은 `EstimateListPage.tsx:220-223`의 `Link`와 `:586-592`의 `onRowClick`이 같은 상세로 각각 navigate한다. 주문도 `SalesPartnerOrderListPage.tsx:248-251`의 `Link`와 `:633`의 `onRowClick={handleRowClick}`이 겹친다. 링크에 `stopPropagation`이 없어 한 번의 실제 클릭으로 동일 상세 entry가 두 번 생성된다.

F2 중 견적 편집 경로는 `EstimateDetailPage.tsx:608`에서 목록 복귀 state 없이 편집으로 이동하고, 저장 성공 시 `EstimateFormPage.tsx:1739`가 state 없이 상세를 replace한다. 두 목록의 검색값도 각각 `EstimateListPage.tsx:111`, `SalesPartnerOrderListPage.tsx:98`의 로컬 state이고 URL에 직렬화되지 않는다.

## 통과한 의심 항목

- 견적 문서번호 링크: `2026/08/10-6 → #/sales/estimates/2026-08-10-6`; UUID 경로 아님.
- 주문 문서번호 링크: `2026/06/08-1980 → #/sales/partner-orders/2026-06-08-1980`; UUID 경로 아님.
- 견적 상세 visible UUID 0건, 주문 상세 visible UUID 0건.
- #1175 정본 셸 유지: 견적 `detail-grid=1 / card-like=5`, 주문 `detail-grid=1 / card-like=6`.
- 복귀 state 없는 직접 URL 상세 진입 후 목록 fallback: 견적·주문 모두 통과.

## 격리 DB 복제와 인코딩 증거

전용 `recon1094-r2-net`, PostgreSQL `127.0.0.1:40332`, gateway `40380`, renderer `52942`만 사용했다. 공유 `samhan-*`에는 로그인·업무 API 호출을 하지 않았다.

복제는 파이프 없이 다음 순서로 수행했다.

```text
samhan-postgres 내부 pg_dumpall -f /tmp/recon1094-r2-all.sql
docker cp source:/tmp/recon1094-r2-all.sql host-file
docker cp host-file recon1094-r2-pg:/tmp/recon1094-r2-all.sql
recon1094-r2-pg 내부 psql -f /tmp/recon1094-r2-all.sql
```

복제 직후 원본/복제 한글 SELECT 원문:

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

restore 중 새 PostgreSQL의 기정의 role 때문에 `current user cannot be dropped`, `role "samhan" already exists` 2건이 표준 오류로 출력됐고, 데이터베이스·테이블·데이터 복원은 완료됐다. 한글 SELECT와 서비스 조회가 원본과 일치했다.

## 격리 라이브 실행

인앱 Browser 런타임은 사용 가능한 브라우저가 `[]`여서 제품 판정에 쓰지 않았다. 저장소의 로컬 Playwright Chromium과 데스크톱 QA 전용 `vite.renderer.dev.config.ts`(HashRouter)를 사용했다. 중간의 `vite.web.config.ts` BrowserRouter 측정은 증거 무결성상 최종 집계에서 폐기했다.

최종 실행 원문:

```text
LOGIN_HTTP=200 ROLE=MASTER
PASS | 견적 문서번호 하이퍼링크 | label=2026/08/10-6 href=#/sales/estimates/2026-08-10-6
PASS | 견적 DS Card + detail-grid 셸 | detail-grid=1 card-like=5
PASS | 견적 상세 UUID 비노출 | visibleUuidCount=0
FAIL | 견적 목록 1회 복귀 | 상세 동일 entry 잔류 url=http://127.0.0.1:52942/#/sales/estimates/2026-08-10-6
FAIL | 견적 편집 저장 후 목록 identity | before=640 after=0 partner= status= url=http://127.0.0.1:52942/#/sales/estimates
PASS | 견적 직접 URL fallback | url=http://127.0.0.1:52942/#/sales/estimates
PASS | 주문 문서번호 하이퍼링크 | label=2026/06/08-1980 href=#/sales/partner-orders/2026-06-08-1980
PASS | 주문 DS Card + detail-grid 셸 | detail-grid=1 card-like=6
PASS | 주문 상세 UUID 비노출 | visibleUuidCount=0
FAIL | 주문 목록 1회 복귀 | 상세 동일 entry 잔류 url=http://127.0.0.1:52942/#/sales/partner-orders/2026-06-08-1980
FAIL | 주문 편집 저장 후 목록 identity | before=640 after=640 keyword= status=DRAFT url=http://127.0.0.1:52942/#/sales/partner-orders
PASS | 주문 직접 URL fallback | url=http://127.0.0.1:52942/#/sales/partner-orders
FAIL | S7 입금보고서 편집 저장 후 identity | before=640 after=192 url=http://127.0.0.1:52942/#/accounting/admin/cash-receipts?slipNo=2026%2F08%2F07-8
LIVE_QA_SUMMARY passed=8 skipped=0 failed=5
```

집계:

```text
passed  = 8
skipped = 0
failed  = 5
```

## 스크린샷 전 경로

모두 격리 clone DB + 전용 403xx API + 이 worktree renderer의 실제 렌더이며 한글이 정상 표시된다.

- `docs/qa/2026-08-12-1094-reconv2/01-estimate-filtered-list-position.png`
- `docs/qa/2026-08-12-1094-reconv2/02-estimate-detail-ds-document-route.png`
- `docs/qa/2026-08-12-1094-reconv2/03-estimate-after-edit-save-return.png`
- `docs/qa/2026-08-12-1094-reconv2/03-estimate-first-back-stuck-detail.png`
- `docs/qa/2026-08-12-1094-reconv2/04-order-filtered-list-position.png`
- `docs/qa/2026-08-12-1094-reconv2/05-order-detail-ds-document-route.png`
- `docs/qa/2026-08-12-1094-reconv2/06-order-after-edit-save-return.png`
- `docs/qa/2026-08-12-1094-reconv2/06-order-first-back-stuck-detail.png`
- `docs/qa/2026-08-12-1094-reconv2/07-cash-s7-after-edit-return-640.png`

`03-estimate-first-back-stuck-detail.png`와 `06-order-first-back-stuck-detail.png`는 목록 버튼 1회 클릭 후에도 같은 상세가 남은 화면이다. `03-estimate-after-edit-save-return.png`는 견적 필터가 초기화된 화면, `06-order-after-edit-save-return.png`는 주문 keyword가 사라진 화면, `07-cash-s7-after-edit-return-640.png`는 S7 복귀가 192px에 머문 viewport다.

## 변경 범위

- 구현 코드 변경 없음.
- 보고서와 QA PNG 9장만 영구 산출물이다.
- git 명령·commit·push 미수행.

## 종료 정리

검증 전 임시 산출물은 `.codex-tmp/recon1094-r2` 73,785,807 bytes였고, 잘못된 중간 BrowserRouter 캡처 경로는 1,353,269 bytes였다. 둘 다 제거했다. 전용 renderer와 컨테이너 14개를 종료·삭제하고 `recon1094-r2-net` 및 직전 라운드의 빈 `recon1094-net`도 제거했다.

```text
TMP_EXISTS=False
WRONG_EXISTS=False
RENDERER_LISTENER=False
RECON1094_REMAINING=NONE
RECON1094_NETWORK_REMAINING=NONE
```
