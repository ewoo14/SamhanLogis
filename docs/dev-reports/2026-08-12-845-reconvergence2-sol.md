# PR #1158 (#845) fix2 재수렴 2회차 적대검증

## 답

**실 사용자 경로로 재현 가능한 결함은 없다.**

오염됐던 `?` 복제본은 D-3 근거에서 완전히 제외했다. PostgreSQL 16 custom dump를 파일로 받은 뒤 격리 PostgreSQL 16에 파일로 복원했고, 화면 QA 전에 원본·격리본의 한글 컬럼 전수 행 수와 실제 한글 표본을 대조했다. 한글이 보존된 격리 화면에서 D-1·D-2·D-3, 70건 전수, UUID, DS-4 게이트, 다른 인쇄물 도달 범위를 다시 확인했다.

## 측정 0 — 제한과 증거 경계

- git 명령: 사용하지 않음
- 공유 화면/API 로그인: 사용하지 않음
- 공유 PostgreSQL: `pg_dump`와 `SELECT`만 실행, 쓰기 0건
- 라이브 화면: `recon845-*` 격리 DB/서비스와 `127.0.0.1:40275` renderer만 사용
- 구현 코드: 변경하지 않음
- QA·보고 산출물만 `docs/qa/2026-08-12-845-reconv2/`, 본 보고서에 추가

집계:

- passed: 0
- skipped: 0
- failed: 0

## 측정 1 — UTF-8 안전 재복제와 복제 직후 한글 원문

지정 브랜치 `chore/qa-clone-utf8-harness`의 `clone-db-utf8.sh`를 API로 읽어 같은 경계인 **custom-format dump 파일 생성 → `docker cp` → 파일 restore**를 사용했다. PowerShell 파이프는 사용하지 않았다.

기존 격리 PostgreSQL 15는 원본 PostgreSQL 16 dump를 읽을 수 없어 삭제하지 않고 `recon845-pg-corrupt-psql15`로 정지·보존했다. 같은 격리 네트워크 별칭과 포트에 PostgreSQL 16 `recon845-pg`를 세워 처음부터 복제했다.

최종 실행 원문:

```text
SOURCE=/samhan-postgres|IMAGE=postgres:16-alpine|STATUS=running
TARGET=/recon845-pg|IMAGE=postgres:16-alpine|STATUS=running|NETWORKS=recon845-net
DUMP_FILE=auth_db|BYTES=484773
RESTORE=auth_db|STATUS=0|ERRORS=0
UTF8_VERIFY=auth_db|KOREAN_COLUMNS=5|FOUND=1|PASS=true
DUMP_FILE=user_db|BYTES=59184
RESTORE=user_db|STATUS=0|ERRORS=0
UTF8_VERIFY=user_db|KOREAN_COLUMNS=4|FOUND=1|PASS=true
DUMP_FILE=groupware_db|BYTES=296001
RESTORE=groupware_db|STATUS=0|ERRORS=0
UTF8_VERIFY=groupware_db|KOREAN_COLUMNS=19|FOUND=1|PASS=true
DUMP_FILE=slip_db|BYTES=1495889
RESTORE=slip_db|STATUS=0|ERRORS=0
UTF8_VERIFY=slip_db|KOREAN_COLUMNS=54|FOUND=1|PASS=true
CLONE_PASS=true
```

복제 직후 원본·격리본에 동일하게 출력된 한글 원문:

```text
[QA-R4] 결재C — ACTIVE 부재 상태 승인
[QA-R4] 결재B — 양식 수정 후 승인
[QA-R4] 결재A — 양식 수정 전 승인
[QA-R3] 결재C — ACTIVE 양식 부재 상태 승인
[QA-R3] 결재B — 양식 수정 후 승인

DVM S2 동시냉난방 12HP|AM120AXVHHR1|
DVM S2 동시냉난방 10HP|AM100AXVHHR1|
24년형 가정용 에어컨 리모컨|AFR-TC9D|
24년형 가정용 에어컨 무풍갤러리 화이트 실외기|AF17DX730DCX|무풍갤러리 화이트
무선리모컨(냉난방전용)|AR-EH05|무선냉난방
```

원본에 한글이 있는 text/varchar/char 컬럼 82개(5+4+19+54)를 대상으로 격리본 한글 행 수 감소와 `?` 행 수 증가가 모두 없었다. 따라서 라이브 QA 시작 조건을 충족했다.

준비 과정 실패 이력은 제품 집계와 분리한다.

```text
attempt1: pg_restore가 /tmp를 Windows 임시경로로 변환 — MSYS_NO_PATHCONV 적용
attempt2: PostgreSQL 15가 PostgreSQL 16 dump를 거부 — unsupported version (1.15)
final: PostgreSQL 16 → 16, 4 DB RESTORE_ERRORS=0, CLONE_PASS=true
```

집계:

- passed: 8 — DB 4개 restore + DB 4개 UTF-8 전수 검증
- skipped: 0
- failed: 0
- setup history: failed 2 — 경로 변환 1, PostgreSQL major 불일치 1(제품 결함 아님)

## 측정 2 — 한글 보존 격리 fixture

공유 원본에는 12라인 전표 `2026/08/07-20`이 존재하지만 48라인 QA 전표는 없다. 기존 손상 복제본의 QA 삽입물을 재사용하지 않고, 격리 `slip_db`에만 원본 12라인을 4회 복제한 48라인 전표를 만들고 두 결재의 격리 첨부 참조만 연결했다.

실행 원문:

```text
INSERT 0 1
INSERT 0 48
UPDATE 1
UPDATE 1
2026/08/12-845|PR #1158 한글 보존 48라인 QA|48|360 CST UV 실내기 QA-1|판넬 (360CST / 원형 / WIFI) QA-4
27d08fba-fc64-492a-9360-f3e75c62b83c|2026/08/12-845
77554976-81f7-4756-bb94-303f65d32e8f|2026/08/07-20
```

집계:

- passed: 4 — 12라인 원본 연결, 48라인 생성, 첨부 참조 2건 연결
- skipped: 0
- failed: 0

## 측정 3 — D-3 한글 화면 legacy 헤더 대조

한글이 보존된 실제 `/#/groupware/approvals/:id/print` DOM에서 직접 읽은 헤더:

```text
품목 | 모델명 | 규격 | 수량 | 공급가액 | 부가세 | 합계 | 비고
```

legacy 계약과 실제 렌더 헤더는 8개 구성·순서·문구가 **8/8 동일**하다. 화면의 첫 행도 `실외기_6HP 단배관 | AJ060MXHNBC1 | 냉전 1w`로 한글이 정상 표시됐다. 이전 `?` 화면 기반 D-3 판정은 근거로 사용하지 않았다.

실행 원문:

```text
"headers":["품목","모델명","규격","수량","공급가액","부가세","합계","비고"]
"firstRow":["실외기_6HP 단배관","AJ060MXHNBC1","냉전 1w","1","112,233","11,223","123,456","-"]
```

집계:

- passed: 2 — 12라인·48라인 한글 화면에서 legacy 헤더 8/8 일치
- skipped: 0
- failed: 0

## 측정 4 — D-1 금액과 전표 원본 일치

공유 원본과 UTF-8 격리본을 각각 직접 조회했다.

```text
SOURCE_ORIGINAL
2026/08/07-20|실외기_6HP 단배관|AJ060MXHNBC1|냉전 1w|1|112233.00|11223.00|123456.00|112233.00
TARGET_CLONE
2026/08/07-20|실외기_6HP 단배관|AJ060MXHNBC1|냉전 1w|1|112233.00|11223.00|123456.00|112233.00
```

열 의미는 `공급가액 | 부가세 | 계산 합계 | 저장 legacy line_total`이다. 원본 불변식은 `112,233 + 11,223 = 123,456`이고, 실제 화면/PDF 합계도 `123,456`이다. 저장 legacy 별칭 `112,233`을 합계로 잘못 재사용하던 D-1은 재현되지 않았다.

집계:

- passed: 3 — 원본·격리본 일치, 화면 합계, PDF 합계
- skipped: 0
- failed: 0

## 측정 5 — D-2 48라인 PDF 전 페이지

Chromium `page.pdf()`로 만든 fresh `reference-48-lines.pdf`를 PyMuPDF로 3페이지 전부 PNG 렌더해 육안 판독하고, 각 페이지의 8개 셀 하단 선이 좌우 전체 폭을 연속 폐쇄하는 좌표를 계산했다.

실행 원문:

```text
PDF_PAGES=3
PAGE=1|HEADERS_8_OF_8=8|UUID=False|TABLE_BOTTOM_Y=831.50|PAGE_HEIGHT=842.88|BOTTOM_GAP=11.38|CLOSED=true
PAGE=2|HEADERS_8_OF_8=8|UUID=False|TABLE_BOTTOM_Y=807.50|PAGE_HEIGHT=842.88|BOTTOM_GAP=35.38|CLOSED=true
PAGE=3|HEADERS_8_OF_8=8|UUID=False|TABLE_BOTTOM_Y=715.50|PAGE_HEIGHT=842.88|BOTTOM_GAP=127.38|CLOSED=true
```

3페이지 모두 헤더가 8/8 반복되고 표가 닫힌다. 1·2페이지 마지막 행의 아래 테두리 잘림은 재현되지 않았다. 행 반쪽 분할·텍스트 잘림·`?`·UUID도 육안상 없었다.

집계:

- passed: 11 — 페이지 수 1, 페이지별 헤더 3, 표 폐쇄 3, UUID 0 3, PDF D-1 합계 1
- skipped: 0
- failed: 0

## 측정 6 — 실데이터 70건 직접 재계수·UUID·물음표

격리 MASTER 로그인 세션에서 목록 API가 반환한 활성 결재 70건의 실제 인쇄 경로를 하나씩 다시 열고, 각 `.print-approval-doc` 본문을 직접 검사했다.

실행 원문:

```json
{"listHttp":200,"total":70,"opened":70,"blocked":0,"blockedDocs":[],"uuidVisibleDocs":0,"uuidDocs":[],"questionMarkDocs":0,"questionDocs":[],"pageErrors":[]}
```

구현자 수치를 릴레이하지 않고 이번 라운드에 직접 센 결과는 **열림 70 / 막힘 0**이다. 70개 화면 전체에서 UUID 노출 0, `?` 손상 0, pageerror 0이다.

집계:

- passed: 5 — 목록 200, 열림 70, 막힘 0, UUID 0, `?`/pageerror 0
- skipped: 0
- failed: 0

## 측정 7 — fix2 새 표면과 DS-4 게이트

CSS 변경 선택자는 다음 한 종류다.

```text
.document-template-detail table {
  border-collapse: separate;
  border-spacing: 0;
}
```

`document-template-detail` 클래스 생산자는 `DocumentRenderer.tsx` 한 곳뿐이다. 재무제표, 현금흐름표, 거래명세서, 거래처원장, 배차·외부배차 등 다른 인쇄물은 각자 별도 클래스와 `border-collapse` 규칙을 사용하므로 이 CSS가 매치되지 않는다. 상수화된 `LEGACY_FALLBACK_DETAIL_COLUMNS`도 `GROUPWARE_DEFAULT + CONNECTED + 기존 DETAIL 없음` 조건에서만 소비된다.

DS-4 권위 게이트 직접 확인:

```text
BE: ADVANCED_ACTIVATION_GATE_ENABLED = true
FE: ACTIVATION_BLOCKED_ELEMENT_TYPES = new Set(['DETAIL', 'IMAGE'])
```

인쇄 전량 fresh 실행 원문:

```text
Test Files 29 passed (29)
Tests 253 passed (253)
Duration 12.99s
```

전량에는 DS-4 activation gate 6건, 문서 템플릿 schema/renderer, 결재, 배차, 외부배차, 거래명세서, 거래처원장 등 다른 인쇄 소비자가 포함된다. 기존 React Router v7 future warning만 있었고 실패는 없었다.

집계:

- passed: 255 — 인쇄 전량 253 + CSS 도달 범위 1 + DS-4 BE/FE 게이트 유지 1
- skipped: 0
- failed: 0

## 라이브 QA 스크린샷 전 경로

아래 10개 PNG는 모두 0 byte가 아니며 직접 열어 한글 정상 표시를 확인했다.

- `docs/qa/2026-08-12-845-reconv2/01-reference-12-lines-preview.png`
- `docs/qa/2026-08-12-845-reconv2/02-reference-48-lines-preview.png`
- `docs/qa/2026-08-12-845-reconv2/03-no-reference-preview.png`
- `docs/qa/2026-08-12-845-reconv2/04-broken-reference-preview.png`
- `docs/qa/2026-08-12-845-reconv2/05-non-default-connected-preview.png`
- `docs/qa/2026-08-12-845-reconv2/06-reference-12-lines-print-media.png`
- `docs/qa/2026-08-12-845-reconv2/07-reference-48-lines-print-media.png`
- `docs/qa/2026-08-12-845-reconv2/reference-48-lines-pdf-page-1.png`
- `docs/qa/2026-08-12-845-reconv2/reference-48-lines-pdf-page-2.png`
- `docs/qa/2026-08-12-845-reconv2/reference-48-lines-pdf-page-3.png`

산출물 실행 원문:

```text
PNG_COUNT=10|PNG_ZERO=0|PDF_COUNT=2|PDF_ZERO=0
```

집계:

- passed: 2 — PNG 10개 무결성, PDF 2개 무결성
- skipped: 0
- failed: 0

## 라운드 종료 — 삭제된 추적 파일

git 명령 없이 worktree binary index(`DIRC`)를 직접 읽고 19,388개 추적 경로의 디스크 존재를 대조했다.

```text
INDEX_SIGNATURE=DIRC
INDEX_VERSION=2
INDEX_ENTRIES=19388
UNIQUE_TRACKED_PATHS=19388
MISSING_TRACKED_FILES=0
```

삭제된 추적 파일은 **0개**다.

집계:

- passed: 1
- skipped: 0
- failed: 0

## 최종 집계

- passed: 291 — UTF-8 복제 8 + fixture 4 + D-3 2 + D-1 3 + PDF 11 + 70건/UUID 5 + 회귀/게이트 255 + 산출물 2 + 추적 파일 1
- skipped: 0
- failed: 0
- setup history: failed 2 — 최종 검증 전에 해소한 하네스 경로 변환·PostgreSQL major 불일치(제품 결함 아님)

**최종 답: 실 사용자 경로로 재현 가능한 결함은 없다.**
