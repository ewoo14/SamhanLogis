# PR #1158 (#845) fix1 재수렴 적대검증

- 검증일: 2026-08-12 (Asia/Seoul)
- 판정 질문: **실 사용자 경로로 재현 가능한 결함이 있는가?**
- 규율: 구현 코드 변경 없음, git 명령 미사용, 공유 `samhan-*` 화면/API 미사용, 격리 DB·격리 포트에서만 라이브 QA

## 측정 0 — 선행 증거와 기준값 고정

선행 적대검증의 기준은 실데이터 활성 결재 **70건 열림 / 0건 막힘**이다. 선행 분포는 무참조 65건, 끊긴 `OUTBOUND_SLIP` 참조 5건, 전표·활성 라인이 함께 있는 자연 표본 0건이다. fix1 보고서가 이 재계수를 실행 자산 부재로 건너뛴 사실도 확인했다. 이번 라운드는 같은 방식인 공유 PostgreSQL의 읽기 전용 `pg_dump` 스트림을 별도 PostgreSQL에 복제하고, 별도 서비스·renderer 포트에서 70건 전수 실제 인쇄 경로를 다시 연다.

집계:

- passed: 1 — 선행 기준값과 재현 방법 확인
- skipped: 0
- failed: 0

## 측정 3 — 격리 Playwright 라이브 화면

격리 구성:

```text
renderer=http://127.0.0.1:40275
gateway=http://127.0.0.1:40280
postgres=127.0.0.1:40232
auth=http://127.0.0.1:40281
user=http://127.0.0.1:40283
slip=http://127.0.0.1:40286
groupware=http://127.0.0.1:40292
```

복제본에서 기존 12라인 전표를 `2026/06/14-1`에 연결했고, 같은 실 라인을 4회 복제한 48라인 전표 `2026/08/12-845`를 `2026/06/14-2`에 연결했다. 무참조 `2026/05/16-24`, 끊긴 참조 `2026/06/14-3`은 유지했다. 조건의 좁음을 실측하기 위해 비기본 ACTIVE docType 결재 `2026/07/19-1`에도 12라인 전표를 연결했다. 모든 변경은 격리 DB에만 썼다.

실행 원문:

```text
{"loginHttp":200,"tokenPresent":true,"role":"MASTER"}
{"scenario":"reference-12-lines","printDoc":1,"loadingText":false,"errorBanner":0,"detailLayer":1,"detailRows":12,"expectedRows":12,"headers":["품목","모델명","규격","수량","공급가액","부가세","합계","비고"],"firstRow":["???_6HP ???","AJ060MXHNBC1","?? 1w","1","112,233","11,223","112,233","-"],"modelNameVisible":true,"uuidVisible":false,"documentHeight":1049}
{"scenario":"reference-48-lines","printDoc":1,"loadingText":false,"errorBanner":0,"detailLayer":1,"detailRows":48,"expectedRows":48,"headers":["품목","모델명","규격","수량","공급가액","부가세","합계","비고"],"firstRow":["???_6HP ??? QA-1","AJ060MXHNBC1-QA1","?? 1w","1","112,233","11,223","112,233","-"],"modelNameVisible":true,"uuidVisible":false,"documentHeight":2835}
{"scenario":"no-reference","printDoc":1,"loadingText":false,"errorBanner":0,"detailLayer":0,"detailRows":0,"expectedRows":0,"headers":[],"firstRow":[],"modelNameVisible":false,"uuidVisible":false,"documentHeight":241}
{"scenario":"broken-reference","printDoc":1,"loadingText":false,"errorBanner":0,"detailLayer":0,"detailRows":0,"expectedRows":0,"headers":[],"firstRow":[],"modelNameVisible":false,"uuidVisible":false,"documentHeight":512}
{"scenario":"non-default-connected","printDoc":1,"loadingText":false,"errorBanner":0,"detailLayer":0,"detailRows":0,"expectedRows":0,"headers":[],"firstRow":[],"modelNameVisible":false,"uuidVisible":false,"documentHeight":243}
{"pageErrors":[]}
```

판정:

- `GROUPWARE_DEFAULT + CONNECTED`인 12줄/48줄에서만 DETAIL이 생겼다.
- 무참조와 끊긴 참조는 기존 인쇄물을 막지 않았고 DETAIL도 생기지 않았다.
- `GROUPWARE_LIVEQA848_... + CONNECTED`는 전표 search/query/detail이 모두 200이었지만 DETAIL 0행이다. 비기본 문서유형으로의 과잉 적용은 재현되지 않았다.
- 화면 UUID 노출 및 Playwright `pageerror`는 0건이다.

집계:

- passed: 7 — 로그인, 12행, 48행, 무참조 비차단, 끊긴 참조 비차단, 비기본 docType 비주입, UUID/pageerror 0
- skipped: 0
- failed: 2 — 아래 D-1 금액, D-3 legacy 열 계약

### 결함 D-1 — 인쇄 “합계”가 VAT 포함 합계가 아니라 공급가액을 중복 표시

실 사용자 재현 경로:

1. MASTER로 로그인한다.
2. 출고전표 `2026/08/07-20`을 참조한 결재 `2026/06/14-1`의 인쇄 미리보기를 연다.
3. 첫 품목 `AJ060MXHNBC1`의 `공급가액 / 부가세 / 합계`를 확인한다.

격리 원본 `slip_lines` 첫 행은 다음과 같다.

```text
supply_amount=112233.00
vat_amount=11223.00
supply_amount+vat_amount=123456.00
stored line_total=112233.00
```

실제 인쇄 첫 행은 `112,233 / 11,223 / 112,233`이다. 즉 “합계”가 원본 VAT 포함 합계 `123,456`이 아니라 공급가액을 다시 표시한다. 데이터 흐름 원인은 `projectSlipLineItems()`가 전표 도메인에서 공급가액 의미인 `SlipLineDetail.lineTotal`을 그대로 DETAIL의 VAT 포함 `lineTotal`에 투영한 것이다. 사용자는 인쇄물 한 행에서 공급가액과 합계가 같고 부가세만 별도 존재하는 모순을 본다.

### 결함 D-3 — fallback 8열이 저장소의 legacy 본문 열 구성·순서·문구와 불일치

실 사용자 경로의 실제 헤더는 다음과 같다.

```text
품목 | 모델명 | 규격 | 수량 | 공급가액 | 부가세 | 합계 | 비고
```

저장소의 legacy 판매입력 본문 참조(`docs/design/print-preview-standardization/DESIGN.md`)는 다음과 같다.

```text
품목코드 | 품목명 | 규격 | 수량 | 단가 | 공급가액 | 부가세 | 적요
```

따라서 fix1 출력은 `품목코드·단가`를 누락하고 `모델명·합계`를 넣었으며, 헤더도 `품목명→품목`, `적요→비고`로 바뀌었다. D-DS4-02의 8필드 허용 목록과는 일치하지만, 허용 가능한 필드 집합과 legacy 기본 출력의 구성·순서는 같은 계약이 아니다. 연결 전표 결재를 인쇄하면 모든 사용자에게 그대로 노출되는 차이다. 실운영 baseline PNG/JPG는 현재 디렉터리에 없어 픽셀 비교는 불가능했지만, 저장소가 명시한 열 계약과 실제 DOM/PDF 헤더의 불일치는 직접 재현됐다.

## 측정 4 — PDF 페이지 나눔·잘림·머리말 반복·UUID

Playwright Chromium의 실제 `page.pdf()` 결과를 PyMuPDF로 전 페이지 PNG 렌더하고 pypdf로 텍스트를 대조했다.

실행 원문:

```text
reference-12-lines.pdf|PAGES=1
reference-12-lines.pdf|HEADER_PAGES=1|WRONG_TOTAL_PAGES=1|RIGHT_TOTAL_PAGES=0|UUID=False
reference-48-lines.pdf|PAGES=3
reference-48-lines.pdf|HEADER_PAGES=3|WRONG_TOTAL_PAGES=1|RIGHT_TOTAL_PAGES=0|UUID=False
PAGE=1|LAST_TEXT_Y1=834.9|PAGE_HEIGHT=842.9|BOTTOM_GAP=8.0
PAGE=2|LAST_TEXT_Y1=836.4|PAGE_HEIGHT=842.9|BOTTOM_GAP=6.5
PAGE=3|LAST_TEXT_Y1=476.8|PAGE_HEIGHT=842.9|BOTTOM_GAP=366.0
```

열 머리말은 48줄 PDF의 3페이지 모두 반복되며 행 텍스트가 두 페이지에 걸쳐 반으로 나뉘지는 않았다. 그러나 1·2페이지는 표가 물리 페이지 하단까지 내려가 마지막 행의 아래 테두리가 잘린 채 끝난다. PNG 전 페이지 시각 검토에서 1페이지 `AR-EC05-QA2`, 2페이지 `AC060CXAPBH1-QA1` 행의 하단 grid border가 페이지 밖으로 잘리고, 다음 페이지는 다음 행부터 시작한다.

### 결함 D-2 — 다라인 PDF의 중간 페이지 마지막 행 테두리 잘림

실 사용자 재현 경로:

1. 48라인 출고전표를 참조한 결재의 인쇄 화면을 연다.
2. PDF로 출력한다.
3. 3페이지 PDF의 1·2페이지 하단을 확인한다.

실제 결과는 페이지별 하단 여백이 텍스트 기준 8.0pt/6.5pt뿐이고, 표의 마지막 행 아래 테두리가 페이지 경계 밖으로 잘린다. 행 내용 자체와 2·3페이지 열 머리말은 유지되지만, 사용자가 받는 인쇄물의 표 grid가 중간 페이지마다 열린 상태로 끊긴다.

집계:

- passed: 4 — PDF 생성, 12줄 1페이지, 48줄 3페이지 및 머리말 3/3 반복, PDF UUID 0
- skipped: 0
- failed: 2 — D-1의 잘못된 합계가 PDF에도 존재, D-2 중간 페이지 하단 테두리 잘림

## 측정 5 — 실데이터 70건 열림/막힘 fresh 재계수

동일한 격리 MASTER 로그인 세션에서 목록 API로 받은 활성 결재 70건 각각의 실제 `/#/groupware/approvals/:id/print` 경로를 Playwright로 열고 `.print-approval-doc` 도달을 다시 셌다.

실행 원문:

```text
{"allApprovalPaths":{"listHttp":200,"total":70,"opened":70,"blocked":0,"blockedDocs":[]}}
{"pageErrors":[]}
```

기준 **열림 70 / 막힘 0**에서 나빠지지 않았다. fix1 이후에도 **열림 70 / 막힘 0**이다.

집계:

- passed: 1 — 실데이터 70건 열림 / 0건 막힘
- skipped: 0
- failed: 0

## 라이브 QA PNG 전 경로

- `docs/qa/2026-08-12-845-reconv/01-reference-12-lines-preview.png`
- `docs/qa/2026-08-12-845-reconv/02-reference-48-lines-preview.png`
- `docs/qa/2026-08-12-845-reconv/03-no-reference-preview.png`
- `docs/qa/2026-08-12-845-reconv/04-broken-reference-preview.png`
- `docs/qa/2026-08-12-845-reconv/05-non-default-connected-preview.png`
- `docs/qa/2026-08-12-845-reconv/06-reference-12-lines-print-media.png`
- `docs/qa/2026-08-12-845-reconv/07-reference-48-lines-print-media.png`
- `docs/qa/2026-08-12-845-reconv/reference-12-lines-pdf-page-1.png`
- `docs/qa/2026-08-12-845-reconv/reference-48-lines-pdf-page-1.png`
- `docs/qa/2026-08-12-845-reconv/reference-48-lines-pdf-page-2.png`
- `docs/qa/2026-08-12-845-reconv/reference-48-lines-pdf-page-3.png`

## 현재 종합 집계

- passed: 16
- skipped: 1 — DS-3a named/default pin 자연 표본 0건
- failed: 3 — D-1 금액 합계 오류, D-2 PDF 중간 페이지 grid 잘림, D-3 legacy 열 계약 불일치

현재 판정: **실 사용자 경로로 재현 가능한 결함이 있다.**

## 측정 6 — fresh 렌더 회귀 및 산출물 무결성

fix1 렌더 테스트 fresh 실행 원문:

```text
✓ src/renderer/print/DocumentRenderer.test.tsx (20 tests) 130ms
Test Files 1 passed (1)
Tests 20 passed (20)
Duration 10.65s
```

QA 산출물 확인 원문:

```text
PNG_COUNT=11 PNG_ZERO_BYTES=0 PDF_COUNT=2 PDF_ZERO_BYTES=0 RAW_RESULTS_PRESENT=True REPORT_PRESENT=True
```

집계:

- passed: 22 — Vitest 20건 + PNG/PDF/원문·보고서 산출물 2항목
- skipped: 0
- failed: 0

## 라운드 종료 — 삭제된 추적 파일

git 명령 없이 binary index(`DIRC`)를 직접 읽어 현재 추적 경로의 디스크 존재 여부를 대조했다.

```text
INDEX_SIGNATURE=DIRC
INDEX_VERSION=2
INDEX_ENTRIES=19371
UNIQUE_TRACKED_PATHS=19371
MISSING_TRACKED_FILES=0
```

삭제된 추적 파일은 **0개**다.

## 최종 집계와 답

- passed: 38
- skipped: 1 — DS-3a named/default pin 자연 표본 0건
- failed: 3 — D-1 합계 금액 오류, D-2 다라인 PDF 중간 페이지 테두리 잘림, D-3 legacy 열 계약 불일치

**답: 있다.** fix1 이후에도 실 사용자가 참조 전표 결재를 인쇄/PDF 출력하는 경로에서 위 3개 결함이 재현된다. 핵심 불변식인 실데이터 **70건 열림 / 0건 막힘**은 유지됐고 UUID 노출은 화면·PDF 모두 0건이다.

## 측정 2 — 격리 실데이터 복제

공유 PostgreSQL에는 쓰지 않고 `pg_dump` 스트림으로 `auth_db`, `user_db`, `groupware_db`, `slip_db`를 새 `recon845-pg`(`127.0.0.1:40232`)에 복제했다. 공유 화면/API는 사용하지 않았다. 실행 원문은 다음과 같다.

```text
CLONED=auth_db RESTORE_ERRORS=1 EXIT=0
ERROR:  could not create unique index "uq_permission_groups_name_active"
CLONED=user_db RESTORE_ERRORS=0 EXIT=0
CLONED=groupware_db RESTORE_ERRORS=0 EXIT=0
CLONED=slip_db RESTORE_ERRORS=0 EXIT=0
```

`auth_db` 오류 1건은 선행 적대검증과 동일한 원본 활성 권한그룹 이름 중복이다. 로그인 가능 여부는 격리 라이브 경로에서 판정한다.

집계:

- passed: 1 — 4개 DB 격리 복제 완료
- skipped: 0
- failed: 0

## 측정 1 — fix1 정적 도달 경계와 legacy 계약

`DocumentRenderer.tsx`의 fallback DETAIL 조건은 다음 세 항목이다.

```text
template.docType === 'GROUPWARE_DEFAULT'
model.body.lineItemsAvailability === 'CONNECTED'
기존 DETAIL 요소 없음
```

따라서 named document template에는 걸리지 않고, 무참조·끊긴 참조의 `UNAVAILABLE`에도 걸리지 않는다. 반면 `GROUPWARE_DEFAULT`가 선택된 이유가 현재 fallback인지, 승인 당시 default pin인지 compiler 입력만으로 구분하지 않는다. 저장형 pin 재인쇄도 같은 docType/model이면 품목 밴드가 추가될 수 있는 구조다.

실데이터 선행 정찰 원문은 다음과 같다.

```text
결재 70건: named layout pin 0, default pin 0, unpinned 70
```

따라서 DS-3a pin 재인쇄의 자연 표본은 **0건**이다. 이 사실은 결함 없음의 증거로 확대하지 않는다.

추가된 열은 `productName · modelName · specification · quantity · supplyAmount · vatAmount · lineTotal · note`이고 화면 헤더는 `품목 · 모델명 · 규격 · 수량 · 공급가액 · 부가세 · 합계 · 비고`다. 이는 D-DS4-02의 DETAIL 허용 8필드와 정확히 일치한다. 다만 저장소가 legacy 본문 컬럼 참조로 명시한 판매입력은 `품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 적요`이며, 현재 저장소의 legacy 실운영 PNG/JPG 디렉터리에는 README만 있고 비교 원본 이미지는 없다. 실제 출력에서 사용자 기능 결함으로 성립하는지는 라이브 결과와 함께 판정한다.

집계:

- passed: 2 — 비대상 docType 및 `UNAVAILABLE` 비도달 정적 확인, D-DS4-02 8필드 일치
- skipped: 1 — DS-3a pin 재인쇄 자연 표본 0건
- failed: 0
