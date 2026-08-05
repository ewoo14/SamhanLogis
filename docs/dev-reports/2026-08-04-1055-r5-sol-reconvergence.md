# PR #1067 R5 CODEX SOL 5.6 적대검증 재수렴 보고서

- 검증 일자: 2026-08-04 (Asia/Seoul)
- 대상 브랜치: `fix/1055-zero-stock-warehouse-visibility`
- 대상 HEAD: `82c8aeec9bce4c6f5c73eebebe5ae4d909153390`
- 검증 범위: R3 도달 결함의 R4 폐쇄 여부와 R4가 만든 신규 도달 표면
- 제약 준수: 코드 수정 없음, DB 직접 쓰기 없음, 컨테이너 조작 없음

## 검증 기록

### 1. 작업 기준 확인

```text
git -C . rev-parse --show-toplevel
C:/dev/Samhan-Public/.claude/worktrees/t1055

git -C . branch --show-current
fix/1055-zero-stock-warehouse-visibility

git -C . rev-parse HEAD
82c8aeec9bce4c6f5c73eebebe5ae4d909153390
```

요청한 작업 루트·브랜치·HEAD와 모두 일치했다. 조사 전 본 보고서를 신규 생성했다.

### 2. R3 도달 결함 폐쇄 확인

R3 결함의 원인은 화면 렌더가 VIRTUAL 수량을 `—`로 바꾸지만 복사 경로는 원시 `0`을 `String(0)`으로 복사한 계약 불일치였다.

R4 HEAD의 실제 경로는 다음과 같다.

```text
InventoryStockBalancePage 수량 3열
  VIRTUAL     -> copyValue(row) = "—"
  비-VIRTUAL -> copyValue(row) = String(원시 수량)

DataGrid.getCellDisplayValue
  copyValue 존재 -> copyValue(row)
  그 외          -> 기존 format(v) / String(v)

useClipboard
  좌표별 getCellValue -> TSV -> navigator.clipboard.writeText
```

소스뿐 아니라 현재 desktop이 참조하는 로컬 design-system 배포 산출물 `clients/web/design-system/dist/index.js`에도 `copyValue ? copyValue(row) : format ? ...` 분기가 반영돼 있었다. 따라서 R3의 `0 -> String(0) -> writeText` 경로는 대상 세 열에서 더 이상 도달하지 않고, VIRTUAL 세 수량 셀은 `—\t—\t—`로 수렴한다.

판정: **R3 도달 결함 폐쇄 확인**.

## R4 신규 표면 적대검증

### 표면 1 — `copyValue`가 `format`을 가리는 조합

- production 소스 전체에서 `copyValue` 사용처는 재고 현황 수량 3열뿐이다.
- 세 열에는 `format`이 없고 `render`만 있다. 따라서 현재 production에 `copyValue + format` 동시 지정 컬럼은 **0개**다.
- 테스트 fixture에는 두 속성을 동시에 지정한 1개 사례가 있으나 production 화면이 아니다.
- 향후 두 속성을 함께 주면 복사에서 `copyValue`가 우선한다. 화면 표시·필터의 `format` 자체가 제거되는 것은 아니며 복사값만 명시적 `copyValue` 계약을 따른다.

판정: 미래 오용 가능성은 있으나 현재 사용자가 도달할 충돌 조합이 없어 **도달 결함 0**.

### 표면 2 — 비-VIRTUAL 복사 서식 변화

R4 직전 대상 세 열에는 `format`이 없었다. 화면의 천 단위 표시는 `render -> fmtQty()`에서만 적용됐고, 복사는 `format`이 없는 기존 fallback `String(v)`를 사용했다.

따라서 예시는 다음과 같이 전후가 같다.

```text
R4 전: availableQty=1234 -> String(v)                -> "1234"
R4 후: availableQty=1234 -> String(row.availableQty) -> "1234"
```

세 값은 backend `int`이며 R4 복사 결과에는 천 단위 쉼표나 단위 문자가 붙지 않는다. 숫자 토큰 그대로이므로 Excel 계산 경로를 텍스트 서식으로 퇴행시키지 않는다.

판정: **복사 결과 변화 없음, 도달 결함 0**.

### 표면 3 — VIRTUAL `—`와 숫자 행 혼합 복사

TSV는 행·열별 셀 토큰을 유지한다. `—`는 해당 VIRTUAL 셀 하나의 텍스트이고, 같은 열의 비-VIRTUAL 값은 `"0"`, `"1234"` 같은 숫자 토큰으로 남는다. Excel은 붙여넣은 셀을 개별 해석하므로 `—` 한 셀이 같은 열의 숫자 셀 전체를 텍스트로 강제하지 않는다. `SUM` 등 숫자 집계는 텍스트 `—`를 제외하고 숫자 셀을 합산하므로, 수량 개념이 없는 VIRTUAL을 합계에서 빼려는 계약과도 맞는다.

판정: **열 전체 계산 차단 경로 없음, 도달 결함 0**.

### 표면 4 — Ctrl+V 재입력

재고 현황의 `DataGrid`는 `enablePaste`와 `onPaste`를 전달하지 않는다. 공용 기본값도 `enablePaste=false`이며, production `DataGrid` 소비자 중 붙여넣기를 활성화한 곳은 없었다(Storybook 예시만 존재).

따라서 재고 현황에서 복사한 `—`를 같은 표에 Ctrl+V로 재입력해 수량 데이터나 행 상태를 바꾸는 경로는 없다.

판정: **production 도달 경로 없음, 도달 결함 0**.

### 표면 5 — 비직사각형 선택과 행 길이

Ctrl+토글로 비직사각형 선택이 생겨도 복사는 기존과 동일하게 선택 집합의 최소 bounding box를 계산하고, 모든 행에 대해 `c1..c2`를 빠짐없이 순회한다. 각 좌표에서 `copyValue`는 문자열 하나만 반환하고 탭/줄바꿈을 삽입하지 않는다.

따라서 각 출력 행의 셀 수는 항상 `c2-c1+1`로 같고, VIRTUAL/비-VIRTUAL 혼합 여부가 TSV 행 길이나 열 정렬을 바꾸지 않는다. 선택하지 않은 중간 셀까지 bounding box에 포함하는 동작은 R4 전부터 존재한 명시 계약이며 이번 변경으로 확대되지 않았다.

판정: **행 길이 어긋남 없음, 도달 결함 0**.

## 실 서버·실 데이터 재확인

측정 환경은 현재 이 세션에서 가동 중인 게이트웨이 `http://localhost:8080`, mock OFF, `dev_manager` 로그인, 공유 `samhan-postgres/inventory_db`다. 컨테이너 중지·재빌드 없이 API 호출과 read-only SQL만 사용했다.

```text
POST /auth/login: 200
활성 창고: 6개
GET /inventory/balances: 302행
VIRTUAL: 101행, 0/0/0 계약 이탈 0행
```

현재 read-only SQL의 `stock_rows`는 다음과 같았다.

```text
HQ-001 101 · VH-001 100 · CS-001 0 · VR-001 0
QA-1039-SANGIL 0 · QA-1039-CHOWOL 0
```

PM/R2의 2026-08-04 10:39 배포 직후 스냅샷 `HQ-001=15, 나머지=0`과 비교하면 현재 공유 DB에는 이후 일반 잔액이 추가돼 있다. 활성 창고 6개와 0행 창고 4개는 유지됐다. 이는 측정 시점 데이터 차이이며 PR 코드 결함이나 증거 무결성 결함으로 세지 않는다. QA-1039 두 창고는 조회만 했고 삭제·수정하지 않았다.

## 실행 검증

```text
design-system copy contract: 1 file / 2 tests passed
design-system typecheck: exit 0
desktop typecheck: exit 0
desktop real-QA scope unit set: 50 passed, 0 failed
```

`git status --short`에서 이번 라운드 신규 파일은 본 보고서 하나뿐이었다. 코드 파일은 변경하지 않았다.

## 최종 판정

- R3 도달 결함 폐쇄: **확인**
- R4가 만든 신규 도달 결함: **0건**
- 증거 무결성 결함: **0건**

## 이 라운드가 보지 않은 것

- 인앱 브라우저 런타임에 사용 가능한 브라우저가 없어 R4 HEAD의 실제 GUI에서 클립보드 내용을 직접 읽거나 Excel 붙여넣기를 화면 캡처하지는 못했다. 판정은 R4 production 소스·현재 로컬 배포 산출물·실 서버 응답·TSV/Excel 셀별 형식 계약의 교차 확인에 근거한다.
- R2가 이미 PASS한 VIRTUAL 표시, 일반 0재고 창고 비합성 GUI 시나리오를 반복하지 않았다.
- R3에서 이미 확인한 정상 경로 차단 0/201행, API/DB 수량 합계, 페이지 누락·중복, 역할별 권한 누출은 반복하지 않았다.
- 성능·부하, 테스트 강도, mock 구성, 검증 가드의 품질은 이번 도달성 질문에서 보지 않았다.
- DB 쓰기, 창고·재고 생성/수정/삭제, 컨테이너 중지·재빌드·재배포를 하지 않았다.
- 코드 수정과 `git add`/`commit`/`push`를 하지 않았다.

## 머지 권고

**머지 권고.** 근거는 (1) R3의 사용자 도달 복사 결함이 대상 세 열의 production 복사 경로와 배포 산출물에서 실제로 폐쇄됐고, (2) 우선 검토한 다섯 신규 표면 모두 현재 production 사용자 경로에서 신규 결함으로 도달하지 않으며, (3) 현재 대상 테스트·양 패키지 타입 검증이 통과했기 때문이다.
