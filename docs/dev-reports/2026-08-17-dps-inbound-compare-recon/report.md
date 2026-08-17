# 레거시 「DPS 입고기록 비교」 전수 정찰

> 조사일: 2026-08-17  
> 대상: `tools/legacy-gas/DPS 입고기록 비교/`  
> 조사 원칙: 코드·공유 DB·컨테이너 무변경, 레거시 원문과 현행 구현의 사실만 기록

## 조사 범위

대상 디렉터리의 파일은 3개이며 모두 끝까지 읽었다.

| 파일 | 역할 |
|---|---|
| `appsscript.json` | GAS V8 웹앱 실행 설정. 접속 사용자 권한으로 실행하고 공개 접근을 허용한다 (`appsscript.json:1-9`). |
| `Code.js` | 사용자 인증, Notion 저장·목록·상세·최신 조회 서버 함수 |
| `Index.html` | 이카운트/DPS 엑셀 읽기, 매칭, 결과 표시·편집·필터·저장 UI |

---

## ① 입력 형태(컬럼 전수)

### 1. 레거시 공통 파일 계약

- 좌측은 `[이카운트] 파일 업로드`, 우측은 `[DPS] 파일 업로드`이며 둘 다 `.xlsx, .xls`를 받는다 (`Index.html:159-174`).
- 두 파일 모두 **워크북 첫 번째 시트**만 읽는다. 고정된 시트 이름은 없다 (`Index.html:336-342`).
- 헤더는 고정 행 번호가 아니다. 첫 시트의 모든 행을 위에서부터 찾아 필수 표지가 함께 있는 첫 행을 헤더로 삼는다 (`Index.html:343-355`).
  - 이카운트: 같은 행에 정확한 문자열 `품명 및 규격`, `적요`가 있어야 한다 (`Index.html:344-349`).
  - DPS: 같은 행에 정확한 문자열 `납품일자`, `모델`, `납품번호`가 있어야 한다 (`Index.html:350-355`).
- 찾아낸 헤더 행 자체를 `sheet_to_json(..., { range: hdrIdx })`의 시작점으로 사용하므로 데이터 범위는 그 다음 행부터 시트 끝까지다 (`Index.html:347-353`).
- 레거시는 “전체 헤더 배열”을 별도 상수로 선언하지 않는다. 아래 전수 목록은 매칭·출력 코드가 실제로 이름으로 읽는 열 전부다.

원문 (`tools/legacy-gas/DPS 입고기록 비교/Index.html:339-355`):

```js
let wb = XLSX.read(evt.target.result, { type: 'binary' });
let sheetName = wb.SheetNames[0];
let data = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1 });

if (side === 'left') {
  let hdrIdx = data.findIndex(r => r && r.includes('품명 및 규격') && r.includes('적요'));
  if(hdrIdx > -1) {
    rawLeft = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { range: hdrIdx });
  }
} else {
  let hdrIdx = data.findIndex(r => r && r.includes('납품일자') && r.includes('모델') && r.includes('납품번호'));
  if(hdrIdx > -1) {
    rawRight = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { range: hdrIdx });
  }
}
```

### 2. 이카운트(좌측) 열 전수

| 원문 헤더/SheetJS 키 | 사용 |
|---|---|
| `일자` | 표시와 최종 정렬 |
| `품명 및 규격` | 필수 헤더 표지, 행 필터, 모델명 정규화, 매칭 키, 표시 |
| `수량_1` 또는 `수량` | 비교 수량. 앞 값이 truthy가 아니면 뒤 값 사용 |
| `단가` | 표시만 |
| `공급가액` | 표시만 |
| `부가세_1` 또는 `부가세` | 표시만 |
| `합 계` 또는 `합계` | 비교 합계금액 |
| `구매처명` | 표시와 최종 정렬 |
| `적요` | 필수 헤더 표지, 숫자형 행 필터, 매칭 키, 표시 |

근거: 이카운트 행 선별·비교값 생성은 `Index.html:393-403`, 표시·필터용 값 매핑은 `Index.html:504-507`, 실제 9열 렌더링은 `Index.html:543-552`이다. 결과 헤더 문자열도 `Index.html:196-204`에 같은 순서로 있다.

`수량_1`, `부가세_1`은 코드가 실제로 조회하는 SheetJS 객체 키다. 원문에는 이 접미사가 어떤 중복 원본 열에서 생성됐는지 설명이 없으므로 원본 엑셀의 물리적 열 위치나 중복 헤더 개수는 이 소스만으로 확정되지 않는다.

### 3. DPS(우측) 열 전수

| 원문 헤더/SheetJS 키 | 사용 |
|---|---|
| `납품일자` | 필수 헤더 표지, 유효행 필터, 날짜 표시·정렬 |
| `납품번호` | 필수 헤더 표지, 매칭 키, 표시 |
| `모델` | 필수 헤더 표지, Adjustment 제외, 모델명 정규화, 매칭 키, 표시 |
| `수량_2` 또는 `수량` | 비교 수량. 앞 값이 truthy가 아니면 뒤 값 사용 |
| `매입단가` | 표시만 |
| `공급가` | 표시만 |
| `인도처명` | 표시와 최종 정렬 |
| `부가세_2` 또는 `부가세` | 표시만 |
| `합계` | 비교 합계금액 |

근거: DPS 유효행 선별과 내부 비교값 생성은 `Index.html:405-433`, 표시·필터용 값 매핑은 `Index.html:504-507`, 실제 9열 렌더링은 `Index.html:556-564`이다. 결과 헤더 문자열은 `Index.html:206-214`에 같은 순서로 있다.

`수량_2`, `부가세_2` 역시 코드가 실제로 조회하는 SheetJS 객체 키이며, 접미사의 물리적 원본 열 위치는 소스에 없다.

### 4. 레거시의 “우리 쪽” 입력과 날짜 범위

- 비교 대상인 우리 쪽 입력은 DB나 Google Sheet가 아니라 사용자가 올린 **이카운트 엑셀 파일**이다 (`Index.html:159-174`, `Index.html:336-355`).
- 비교 실행에는 날짜 입력 UI나 날짜 파라미터가 없다. 두 파일이 모두 유효하면 `매칭 실행` 버튼만 활성화된다 (`Index.html:375-377`).
- 화면의 날짜 범위 입력은 비교 범위가 아니라 **저장내역 생성시각 조회 범위**다 (`Index.html:222-233`, `Index.html:676-696`). 서버는 이를 Notion `created_time`의 시작일 00:00:00Z부터 종료일 23:59:59Z까지로 사용한다 (`Code.js:116-129`).

### 5. 현행 입력

- 현행 UI는 시작일·종료일과 `SLIP`/`ITEM` 매칭 단위를 받고 DPS `.xlsx` 한 파일만 올린다 (`clients/desktop/src/renderer/routes/InventoryDpsComparePage.tsx:329-431`).
- 현행 API 파라미터는 multipart `file`, `from`, `to`, `groupBy`다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsCompareController.java:54-80`).
- 우리 쪽 원천은 **입고내역이 아니라 기간 내 OUTBOUND 출고전표 라인**이다. inventory-service가 slip-service의 `/internal/slips/outbound-lines?from=&to=`를 호출한다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/client/SlipServiceClient.java:59-86`). slip-service는 활성 OUTBOUND 전표를 `slipDate BETWEEN :from AND :to`로 조회하므로 양 경계일을 포함한다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/repository/SlipRepository.java:232-245`).
- 현행 DPS 파서는 첫 시트의 **첫 행**만 헤더로 사용한다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsExcelParser.java:61-79`).
- 현행이 인식하는 열은 `품번`, `입고일자`, `수량`, `거래처코드`, `거래처` 5종이며 필수는 `품번`, `수량`뿐이다 (`DpsExcelParser.java:42-47`, `DpsExcelParser.java:73-96`). 공백을 제거한 헤더에 keyword가 포함되면 매칭하고, 수량은 `Qty`도 허용한다 (`DpsExcelParser.java:107-139`).
- 현행 템플릿의 정확한 1행은 `품번`, `입고일자`, `수량`, `거래처코드`, `거래처명`이고 시트 이름은 `DPS 입고`다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsCompareService.java:47-54`, `DpsCompareService.java:121-137`).

---

## ② 매칭 키

### 1. 레거시 기본 키

문자열 정규화 원문은 다음과 같다.

```js
function cleanStr(v) { return String(v || '').trim(); }
function cleanModelName(name) {
  if (!name) return "";
  return cleanStr(name).split('[')[0].split('(')[0].split('.')[0].replace(/\s+/g, '');
}
```

출처: `tools/legacy-gas/DPS 입고기록 비교/Index.html:379-384`.

- 공통 모델 정규화: 앞뒤 공백 제거 → 첫 `[` 뒤 제거 → 남은 문자열의 첫 `(` 뒤 제거 → 남은 문자열의 첫 `.` 뒤 제거 → 모든 공백 제거 (`Index.html:380-384`).
- 대소문자 통일은 없다. 일반 모델명 alias/치환표도 없다.
- 이카운트 키: `trim(적요) + '_' + cleanModelName(품명 및 규격)` (`Index.html:393-401`).
- DPS 키: `납품번호`의 앞뒤 및 모든 내부 공백 제거 + `'_' + cleanModelName(모델)` (`Index.html:420-425`).
- 따라서 실제 1차 키는 **납품번호(이카운트에서는 숫자 적요) + 정규화 모델명**이다. 일자·구매처/인도처·수량·금액은 키가 아니다.

키 생성 원문 (`tools/legacy-gas/DPS 입고기록 비교/Index.html:398-425`):

```js
r._name = cleanModelName(r['품명 및 규격']);
r._key = cleanStr(r['적요']) + '_' + r._name;
r._qty = parseNum(r['수량_1'] || r['수량']);
r._sum = parseNum(r['합 계'] || r['합계']);

r._name = cleanModelName(r['모델']);
let no = cleanStr(r['납품번호']).replace(/\s+/g, '');
r._key = no + '_' + r._name;
r._qty = parseNum(r['수량_2'] || r['수량']);
r._sum = parseNum(r['합계']);
```

### 2. 같은 키 안의 다단계 1:1 짝짓기

같은 키의 좌우 행을 각각 배열로 모은 뒤 DPS 행을 한 번씩만 소비한다 (`Index.html:439-443`). 이카운트 행마다 다음 우선순위로 아직 소비하지 않은 DPS 행을 찾는다.

1. 수량과 합계가 모두 같은 첫 행
2. 없으면 수량만 같은 첫 행
3. 없으면 합계만 같은 첫 행
4. 없으면 남은 첫 행

원문은 `Index.html:444-454`이다. 짝이 없으면 좌측만 존재, 짝짓기 후 남은 DPS 행은 우측만 존재로 남긴다 (`Index.html:455-462`). 별도의 다른 키를 시도하는 2차 매칭은 없다.

다단계 짝짓기 원문 (`tools/legacy-gas/DPS 입고기록 비교/Index.html:444-461`):

```js
let mIdx = rg.findIndex((r, i) => !usedR[i] && l._qty === r._qty && l._sum === r._sum);
if (mIdx === -1) mIdx = rg.findIndex((r, i) => !usedR[i] && l._qty === r._qty);
if (mIdx === -1) mIdx = rg.findIndex((r, i) => !usedR[i] && l._sum === r._sum);
if (mIdx === -1) mIdx = rg.findIndex((r, i) => !usedR[i]);

if (mIdx !== -1) {
  usedR[mIdx] = true;
  let r = rg[mIdx];
  let ok = (l._qty === r._qty && l._sum === r._sum);
  results.push({ l: l, r: r, status: ok ? 'TRUE' : 'FALSE_MISMATCH' });
} else {
  results.push({ l: l, r: null, status: 'FALSE_LEFT' });
}
```

### 3. 현행 키

- `SLIP`: DPS 행을 `productCode | partnerCode | inboundDate`로 버킷화하고 같은 버킷의 수량을 합산한다 (`DpsCompareService.java:168-178`, `DpsCompareService.java:250-253`). 우리 쪽 각 출고 라인도 `productCode | partnerCode | slipDate` 키로 찾는다 (`DpsCompareService.java:182-185`). 전표번호는 키에 포함되지 않는다.
- 정확한 키가 없으면 같은 `productCode + date`이면서 거래처코드만 다른 버킷을 찾아 `PARTNER_MISMATCH`로 삼는다 (`DpsCompareService.java:187-204`, `DpsCompareService.java:232-247`). 이것이 현행의 유일한 2차 시도다.
- `ITEM`: 날짜·거래처·전표를 모두 버리고 `productCode`별 양쪽 수량 합계만 비교한다 (`DpsCompareService.java:257-294`).
- 현행 값 정규화는 파싱 시 품번·거래처코드·거래처명의 앞뒤 공백 제거뿐이다 (`DpsExcelParser.java:85-96`). 키 생성 시 대소문자, 내부 공백, 괄호·대괄호·점 뒤 문자열을 정규화하지 않는다 (`DpsCompareService.java:250-253`).

---

## ③ 비교 규칙과 허용 오차

### 1. 레거시 비교 필드 전수

비교하는 값은 정확히 두 개다.

1. 수량: 이카운트 `수량_1 || 수량` 대 DPS `수량_2 || 수량`
2. 합계금액: 이카운트 `합 계 || 합계` 대 DPS `합계`

원문은 `Index.html:393-425`이다. 최종 정상 판정은 `l._qty === r._qty && l._sum === r._sum` 하나다 (`Index.html:444-454`).

숫자 변환과 최종 판정 원문 (`tools/legacy-gas/DPS 입고기록 비교/Index.html:385-386`, `Index.html:400-401`, `Index.html:424-425`, `Index.html:453-454`):

```js
function parseNum(v) { return Number(String(v || '0').replace(/,/g, '')); }

r._qty = parseNum(r['수량_1'] || r['수량']);
r._sum = parseNum(r['합 계'] || r['합계']);

r._qty = parseNum(r['수량_2'] || r['수량']);
r._sum = parseNum(r['합계']);

let ok = (l._qty === r._qty && l._sum === r._sum);
results.push({ l: l, r: r, status: ok ? 'TRUE' : 'FALSE_MISMATCH' });
```

- 단가, 공급가액/공급가, 부가세, 거래처명, 일자는 표시·필터·정렬에는 쓰지만 일치 판정에는 쓰지 않는다 (`Index.html:504-507`, `Index.html:543-564`).
- 숫자 변환은 빈 값/falsey를 `0`으로 만들고 쉼표만 제거한 뒤 `Number(...)`를 호출한다 (`Index.html:385-386`).
- 반올림, 절사, 원 단위 보정, `±1원` 또는 다른 허용 오차 코드는 없다. 숫자 엄격 동등(`===`)이다 (`Index.html:445-453`).

### 2. 레거시 분류

| 내부 상태 | 조건 | 화면 표현 |
|---|---|---|
| `TRUE` | 짝이 있고 수량·합계 모두 엄격 일치 | `TRUE`, 양방향 화살표, 좌우 연녹색 |
| `FALSE_MISMATCH` | 키로 짝은 있으나 수량 또는 합계 불일치 | `FALSE`, 양방향 화살표, 좌우 연빨강 |
| `FALSE_LEFT` | 이카운트에만 있음 | `FALSE`, 좌향 화살표, 회색 |
| `FALSE_RIGHT` | DPS에만 있음 | `FALSE`, 우향 화살표, 회색 |

상태 생성은 `Index.html:444-462`, 색·화살표는 `Index.html:520-541`이다. `FALSE_MISMATCH` 내부에서 수량이 다르면 양쪽 수량 셀, 합계가 다르면 양쪽 합계 셀에 파란 테두리/광택을 준다 (`Index.html:527-530`, `Index.html:543-564`). 수량만 다름·금액만 다름·둘 다 다름을 별도 상태 문자열로 분류하지는 않는다.

### 3. 현행 비교

- 현행 비교값은 정수 **수량만**이다 (`DpsCompareService.java:171-178`, `DpsCompareService.java:208-214`, `DpsCompareService.java:257-294`). 금액·단가·공급가·부가세 필드가 DPS row와 응답 계약에 없다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/service/DpsExcelRow.java:19-24`, `services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/dto/RowMismatch.java:24-31`).
- 수량 숫자 셀은 `Math.round` 후 `int`로 변환하고, 문자열은 쉼표 제거 후 정수 파싱한다. 빈 값과 파싱 실패는 0이다 (`DpsExcelParser.java:157-176`).
- 비교 자체는 정수 `!=`/`==`이며 추가 허용 오차는 없다 (`DpsCompareService.java:208-214`, `DpsCompareService.java:278-293`).
- 분류는 `QUANTITY_MISMATCH`, `PARTNER_MISMATCH`, `DPS_NOT_FOUND`, `SLIP_NOT_FOUND` 네 가지다 (`RowMismatch.java:33-43`).

---

## ④ 출력과 저장 여부

### 1. 레거시 결과 화면

- 결과표는 이카운트 9열 + 검증 1열 + DPS 9열, 총 19열이다 (`Index.html:183-215`). 열은 ①의 전수 목록 순서다.
- 모든 일치행과 불일치행을 함께 표시한다. 결과가 비면 `매칭된 데이터가 없습니다.`를 표시한다 (`Index.html:520-569`).
- 정렬은 일자/납품일자 → 적요/납품번호 → 구매처명/인도처명 순이다 (`Index.html:465-477`).
- 각 열의 포함·미포함·빈 값 필터와 상태 `ALL/NOTHING/TRUE/FALSE` 필터가 있다 (`Index.html:496-518`, `Index.html:573-635`).
- 결과 셀은 `contenteditable`이다 (`Index.html:543-564`). 다중 선택, 삭제, 복사, 붙여넣기, 우클릭 복사를 지원한다 (`Index.html:742-944`). 편집 내용으로 매칭을 다시 계산하거나 원본 시스템을 갱신하는 코드는 없다.
- 별도의 요약 건수 카드나 파일 다운로드 버튼은 없다. 사용자는 화면에서 필터·편집·복사할 수 있고, 업로드 탭으로 돌아가 재업로드할 수 있다.

### 2. 레거시는 실제로 저장하는가

**저장한다.** 원문상 다음 저장·복원 경로가 모두 존재한다.

- 매칭 실행 직후 결과 전체를 JSON으로 만들어 Notion에 자동 저장한다 (`Index.html:479-487`).
- 사용자가 `수동저장` 버튼을 눌러 주제를 입력하고 같은 저장 함수를 호출할 수 있다 (`Index.html:178-181`, `Index.html:661-674`).
- 서버는 결과 JSON을 gzip+base64로 압축하고 2,000자 조각으로 나눠 Notion 페이지의 `저장내역1/2`에 기록한다 (`Code.js:65-74`, `Code.js:76-113`).
- 저장내역 기간 조회, 특정 내역 복원, 최신 1건 조회가 있다 (`Code.js:116-175`, `Code.js:177-208`).
- 접속 시 최신 결과를 자동 복원하고 결과 탭으로 이동한다 (`Index.html:249-297`). 저장내역 탭에서 과거 결과도 복원한다 (`Index.html:676-730`).

따라서 “즉석 대조이며 이력을 쌓지 않는다”는 2026-08-17 개발책임자 확정 목적은 레거시 저장 동작과 같지 않다.

### 3. 현행 출력과 저장

- 현행은 조회 기간·매칭 단위·출고전표 라인 수·DPS 행 수·정상 일치·불일치 요약을 표시한다 (`InventoryDpsComparePage.tsx:446-464`).
- 상세표에는 **불일치만** 표시하며 열은 카테고리, 전표번호, 품번, 거래처코드, 출고수량, DPS수량, 사유다 (`InventoryDpsComparePage.tsx:486-544`).
- 색은 수량 불일치 주황, 거래처 불일치 빨강, 양쪽 미발견 회색이다 (`clients/desktop/src/renderer/api/dpsCompareApi.ts:138-173`).
- 불일치 CSV 다운로드가 있다 (`InventoryDpsComparePage.tsx:84-119`, `InventoryDpsComparePage.tsx:276-286`, `InventoryDpsComparePage.tsx:466-483`).
- 현행도 저장한다. 성공할 때 `AUTO_LATEST` 저장을 호출하고, `내역으로 저장`은 `MANUAL_NAMED`를 기록한다 (`InventoryDpsComparePage.tsx:156-203`, `InventoryDpsComparePage.tsx:477-483`). DB 테이블은 `dps_save_history`이며 요청조건과 결과 JSON을 보유한다 (`services/inventory-service/src/main/resources/db/migration/V11__add_dps_save_history.sql:1-43`). 저장·목록·상세·최신 API도 존재한다 (`services/inventory-service/src/main/java/com/samhanair/logis/inventory/web/DpsSaveHistoryController.java:49-152`).

---

## ⑤ 예외 처리

### 1. 같은 키가 여러 행

- 레거시: 합산하지 않는다. 같은 키 안에서 수량+합계, 수량, 합계, 남은 첫 행 순으로 1:1 소비한다 (`Index.html:439-462`). 행 순서는 원본 시트 순서이며 명시적인 tie-break 정렬은 없다.
- 현행 `SLIP`: DPS 같은 키 행은 수량을 합산한다 (`DpsCompareService.java:171-178`). 출고 쪽 같은 키 라인은 합산하지 않고 각 라인이 같은 DPS 합계 버킷과 각각 비교되며 DPS 버킷을 1회 소비하는 구조가 아니다 (`DpsCompareService.java:182-215`).
- 현행 `ITEM`: 양쪽 모두 품번별 전 행 수량을 합산한다 (`DpsCompareService.java:265-294`).

### 2. 날짜와 범위 밖 행

- 레거시 비교에는 날짜 범위 자체가 없다. 이카운트 유효행 전체와 DPS 유효행 전체를 비교하며 날짜는 키가 아니라 표시·정렬용이다 (`Index.html:393-477`).
- DPS 날짜가 빈 값, 반복 헤더, `사업장`, `합계`, `합 계`, `0000`을 포함하면 그 행을 제거한다 (`Index.html:405-419`). 숫자 Excel 날짜는 `yyyy-MM-dd`로 바꾸고 `/`는 `-`로 바꾼다 (`Index.html:427-432`). 이카운트 `일자`에는 대응 파싱·제외가 없다.
- 현행 우리 쪽 출고전표는 from/to 포함 범위만 조회한다 (`SlipRepository.java:232-245`).
- 현행 DPS 엑셀 행 자체를 from/to로 거르는 코드는 없다 (`DpsExcelParser.java:77-97`). `SLIP`에서는 날짜가 키라 범위 밖 DPS 행이 우리 출고와 매칭되지 않고 남을 수 있고, `ITEM`에서는 날짜가 키에서 빠지므로 범위 밖 DPS 행도 품번 합계에 들어간다 (`DpsCompareService.java:168-178`, `DpsCompareService.java:257-294`).

### 3. 수량 0·음수·반품

- 레거시: 유효행 필터는 수량 부호를 보지 않는다. 0·음수도 남고 수량·합계 엄격 비교에 참여한다 (`Index.html:393-425`, `Index.html:444-454`). `반품`이라는 별도 분기나 분류는 없다.
- 레거시의 `r['수량_1'] || r['수량']`와 `r['수량_2'] || r['수량']`는 첫 값이 숫자 0이면 뒤 열로 fallback한다 (`Index.html:400`, `Index.html:424`).
- 현행 파서는 0·음수를 보존한다고 명시하고 실제로 행을 제외하지 않는다 (`DpsExcelParser.java:32-37`, `DpsExcelParser.java:77-96`). 비교에서는 일반 정수로 합산·비교되며 반품 전용 분기는 없다 (`DpsCompareService.java:171-214`, `DpsCompareService.java:265-293`).

### 4. 모델명이 다른데 같은 품목인 경우

- 레거시는 `[`, `(`, `.` 중 먼저 나타난 구분자 뒤를 단계적으로 버리고 공백을 제거한 결과가 같으면 같은 모델로 본다 (`Index.html:380-384`). 대소문자 변환과 별칭 매핑은 없다.
- 위 정규화 후에도 다르면 다른 키가 되어 좌측만/우측만으로 남는다 (`Index.html:398-423`, `Index.html:436-462`).
- `품명 및 규격`이 `L-`로 시작하는 이카운트 행은 제외한다 (`Index.html:393-397`). 모델명에 대소문자 무관 `adjustment`가 들어간 DPS 행도 제외한다 (`Index.html:410-417`).
- 현행은 DPS `품번`과 출고 라인의 `productCode`를 직접 비교한다. 출고 쪽 `productCode`는 SlipLine의 모델명 snapshot인 `modelName`을 내려보낸다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java:400-405`). 괄호·점·공백 기반 모델 정규화는 없다.

### 5. 그 밖의 입력 실패

- 레거시 필수 헤더 표지를 못 찾으면 업로드 영역을 `양식 불일치 (재업로드 요망)`으로 표시하고 해당 원본을 비운다 (`Index.html:343-366`). FileReader/XLSX 예외는 `파일 오류`로 표시한다 (`Index.html:367-372`).
- 레거시 이카운트는 `품명 및 규격`이 `L-`가 아니고 `적요`가 빈 값이 아니며 숫자로만 구성된 행만 남긴다 (`Index.html:393-397`).
- 현행은 `.xlsx`만 허용한다 (`InventoryDpsComparePage.tsx:222-237`). 첫 시트 첫 행에 `품번` 또는 `수량` 헤더가 없으면 실패한다 (`DpsExcelParser.java:61-76`, `DpsExcelParser.java:142-146`). 품번 빈 행은 건너뛰고 날짜 형식 실패는 null, 수량 형식 실패는 0으로 보존한다 (`DpsExcelParser.java:77-97`, `DpsExcelParser.java:157-199`).

---

## ⑥ 현행 대조표

| 축 | 레거시 원문 | 현행 | 같음/다름 사실 |
|---|---|---|---|
| 우리 쪽 원천 | 이카운트 엑셀 업로드 | slip-service의 OUTBOUND 출고전표 자동 조회 | 다름 |
| DPS 원천 | DPS 엑셀 업로드 | DPS `.xlsx` 업로드 | 업로드 방식은 같음, 허용 확장자는 다름 |
| DPS 실제 헤더 | `납품일자·납품번호·모델·수량(_2)·매입단가·공급가·인도처명·부가세(_2)·합계` | `품번·입고일자·수량·거래처코드·거래처(명)` | 다름 |
| 시트/헤더 행 | 첫 시트, 표지 3개가 함께 있는 임의 행 탐색 | 첫 시트, 첫 행 고정 | 다름 |
| 비교 날짜 범위 | 없음 | 우리 출고전표만 from/to 포함 조회 | 다름 |
| 기본 키 | 납품번호(적요)+정규화 모델 | SLIP: 거래처코드+품번+일자, ITEM: 품번 | 다름 |
| 중복 키 | 행별 1:1 소비 | DPS 버킷 수량 합산 | 다름 |
| 모델 정규화 | `[`, `(`, `.` 뒤 제거 + 모든 공백 제거 | 앞뒤 trim만 | 다름 |
| 비교값 | 수량 + 합계금액 | 수량 | 금액 축 누락 |
| 거래처 | 키도 판정도 아님 | SLIP 키이며 다른 거래처 2차 탐색/분류 | 다름 |
| 허용 오차 | 없음 | 수량 비교 오차 없음; 숫자 셀은 파싱 때 반올림 | 비교 오차는 없음, 파싱은 다름 |
| 불일치 분류 | 짝 불일치/좌측만/우측만; 수량·합계 셀 강조 | 수량/거래처/DPS 미발견/출고 미발견 | 다름 |
| 결과 행 | 정상+불일치 전체 19열 | 요약 카드 + 불일치만 7열 | 다름 |
| 사용자 후속 | 셀 편집·필터·복사·재업로드·저장/복원 | CSV 다운로드·재업로드·저장/복원 | 다름 |
| 저장 | Notion 자동+수동 저장, 최신/과거 복원 | DB 자동+수동 저장, 최신/과거 복원 | 저장한다는 점은 같음 |
| 이번 확정 목적 | 해당 없음 | 현행 구현과 별도로 “DPS 엑셀 + 날짜범위의 우리 입고내역 대조, 이력 미저장” 확정 | 레거시·현행 모두와 차이 존재 |

---

## ⑦ 구현 시 필요한 것 목록

아래는 이번 정찰에서 구현 계약을 구성하기 위해 식별된 항목이며 선택·판정은 포함하지 않는다.

1. DPS 원본 업로드 계약
   - 레거시 실제 열 9종과 SheetJS 접미사 열(`수량_2`, `부가세_2`)의 원본 물리 헤더/순서
   - `.xls` 포함 여부
   - 첫 시트·동적 헤더 행 탐색 여부
2. 우리 입고내역 조회 계약
   - 현행 OUTBOUND 출고전표 대신 사용할 입고 도메인/API/상태 범위
   - 날짜 기준 필드와 시작·종료 포함 여부
   - 취소·삭제·검수대기·완료·반품 포함 범위
3. 키 계약
   - 레거시의 납품번호+정규화 모델 유지 여부
   - 우리 입고내역에서 DPS `납품번호`, `모델`에 대응하는 업무 식별자
   - 거래처와 날짜를 키에 포함하는지 여부
   - 같은 키 중복을 1:1 소비할지 합산할지 여부
4. 비교 계약
   - 수량과 합계금액 두 축
   - 단가·공급가·부가세의 비교 포함 여부
   - 숫자 반올림·절사·원 단위 허용 오차
   - 0·음수·반품 표시/분류
5. 결과 계약
   - 정상행 포함 여부
   - 한쪽만 있음, 수량 다름, 금액 다름, 둘 다 다름의 표시 단위
   - 화면 복사·필터·CSV 다운로드 범위
6. 비저장 계약
   - 비교 성공 시 현행 `AUTO_LATEST` 호출 제거 범위
   - `저장내역`, `내역으로 저장`, latest 자동 복원 UI/API의 이 화면 노출 범위
   - 비교 입력 파일과 결과 payload가 서버·로그·감사 이벤트에 남지 않는 경계
7. 검증 fixture
   - 실제 DPS export 헤더만 보존하고 업무값은 비식별화한 최소 fixture
   - 같은 키 다중행, 0, 음수, 반품, 범위 경계, 모델 변형, 수량만 불일치, 금액만 불일치, 양쪽 불일치, 양쪽 단독 행 fixture

---

## ⑧ 판단이 필요한 지점(고르지 않음)

1. 이번 확정의 “우리 입고내역”이 어떤 현행 도메인 레코드와 상태를 뜻하는지.
2. DPS 원본의 `납품번호`가 우리 입고내역에 직접 존재하는지, 다른 업무번호와 대응되는지.
3. 레거시 기본 키인 `납품번호+모델`과 현행 키인 `거래처+품번+일자` 중 이번 도구의 키 계약.
4. 실제 DPS export에서 `수량_2`, `부가세_2`를 만드는 중복 원본 헤더의 정확한 위치와 의미.
5. 레거시의 모델 정규화(`[`, `(`, `.` 뒤 제거)가 실제 동일 품목 규칙인지 단순 문자열 편의인지.
6. 같은 키 다중행을 레거시처럼 행별 1:1로 볼지, 현행처럼 수량 합계 bucket으로 볼지.
7. 합계금액 이외에 단가·공급가·부가세도 독립 불일치로 분류할지.
8. 금액 허용 오차와 수량 소수 처리 규칙.
9. 날짜 범위 밖 DPS 행을 제외할지, 한쪽만 존재로 보여줄지.
10. 반품/Adjustment/L- 품목의 제외·포함·별도 분류.
11. 정상행까지 좌우 원문 열로 보여줄지, 불일치만 보여줄지.
12. 개발책임자의 비저장 확정에 따라 기존 DB history API/테이블을 이 화면에서만 끊을지, DPS history 기능 전체 범위에서 다룰지.

---

## ⑨ 프로세스 회수

### 라이브 확인

- 기존 렌더러 `http://127.0.0.1:5942/#/warehouse/dps-compare`는 HTTP 200, 공유 게이트웨이 health는 HTTP 200이었다.
- Browser 런타임의 가용 브라우저 목록이 빈 배열(`[]`)이어서 UI 조작·시각 캡처는 수행할 수 없었다. 별도 Playwright/브라우저/렌더러 서버를 기동하지 않았고 QA 이미지도 생성하지 않았다.
- 실제 엑셀 업로드, 비교 API 실행, 저장/복원 호출은 하지 않았다.

### 회수 상태

- 이 조사에서 기동한 애플리케이션·QA 서버 프로세스: 0개
- Browser 연결 진단이 만든 CUA 런타임 Node 프로세스: 1개, 소유 명령행 확인 후 종료
- 이 조사 기동 프로세스 잔여: 0개
- 이 조사에서 기동한 컨테이너: 0개
- 종료·재시작한 공유 컨테이너: 0개
- 남겨 둔 조사 전용 서버/JAR/바이너리: 0개
- 종료 시 공유 스택: 24개 컨테이너 모두 healthy. 공유 컨테이너에는 어떤 조작도 하지 않았다.
