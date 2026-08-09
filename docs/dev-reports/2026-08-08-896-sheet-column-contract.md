# #896 레거시 시트 열 계약 코드 분석

- 분석일: 2026-08-08 (KST)
- 범위: 요청된 저장소 소스와 이미 저장된 CSV만 읽기 전용으로 분석
- 금지사항 준수: Google Sheet 접근, DB 접근/쓰기, Docker, git 명령, 코드 수정 없음
- 판정 원칙: 업무 명칭을 추정하지 않고, 코드가 선택·보존·계산하는 동작과 코드로 알 수 없는 업무 의미를 분리한다.

## 1. 결론

이관을 막던 두 열의 **실행 계약**은 확정된다.

1. 싱글 세트는 제목이 같은 `납품가` 열을 모두 찾지만 첫 열은 `priceLeft` 지역변수로 읽고 버린다. 마지막 열만 `priceRight`, `priceRaw`, `price`로 화면에 전달한다.
2. 싱글 구성품은 처음부터 마지막 `납품가` 열만 `price`로 읽는다. 이 행은 `setModel`·`feat`와 함께 보존되고 화면은 선택한 세트의 행을 필터링한 뒤 그 행의 `price`를 쓴다. 따라서 **기본 카탈로그에서 마지막 납품가는 세트/특징 행 문맥 가격으로 동작한다.**
3. 첫 `납품가` 열은 현재 대상 코드의 기본 가격 계산에 쓰이지 않는다. 두 열의 원래 업무 명칭이 무엇인지는 코드에 없다. 즉 “첫 열이 모델 전역 가격이다” 같은 번역은 **모른다**.
4. 예외적으로 가격 오버레이는 `(세트, 특징)`을 버리고 `model` 하나를 키로 축약한다. 같은 모델이 여러 행이면 뒤 행의 양수 가격이 앞 행을 덮는다. 오버레이가 활성화되면 이 모델 전역 값이 문맥 가격보다 우선한다.
5. 현재 저장소의 웹 견적 서버와 GAS 사본은 라이브 정본 전환 설명과 반대로, `_단가인상` 탭을 기본 카탈로그로 읽고 접미사 없는 탭을 가격 오버레이로 읽는다. 이 소스 집합만으로는 “라이브 GAS가 정본 탭을 접미사 없음으로 스왑했다”는 변경이 반영되었다고 판정할 수 없다.

핵심 원문은 다음과 같다.

> `clients/web/estimate-app/lib/code.js:938-940`  
> `const idxPrices = H.map((v, i) => v === '납품가' ? i : -1).filter((i) => i >= 0);`  
> `const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;`

> `clients/web/estimate-app/lib/code.js:965-976`  
> `out.push({ ... setModel, ... price, ... feat, isDefault, ... });`

> `clients/web/estimate-app/views/index.ejs:5192`  
> `function partsForSetStrict_(s){return SINGLE_PARTS.filter(p=>(p?.setModel||'')===(s?.model||''));}`

> `clients/web/estimate-app/views/index.ejs:5242-5248`  
> `const mapped = picked.map(p => ({ ... qty: qty, price: partUnitPrice(p), ... }));`

## 2. 먼저 구분해야 하는 탭 우선순위

### 2.1 현재 웹 견적 서버와 저장소 GAS 사본

기본 카탈로그 탭 상수는 모두 `_단가인상`이다.

> `clients/web/estimate-app/lib/code.js:129-133`  
> `const HOME_NAME = '홈멀티_단가인상';`  
> `const SINGLE_NAME = '싱글 세트_단가인상';`  
> `const SINGLE_PARTS_NAME = '싱글 구성품_단가인상';`  
> `const COMM_NAME = '상업멀티_단가인상';`  
> `const COMM_PARTS_NAME = '상업멀티 구성_단가인상';`

저장소 GAS 원본 사본도 같다.

> `tools/legacy-gas/종합견적서/Code.js:50-54`  
> `const HOME_NAME = '홈멀티_단가인상';` ... `const COMM_PARTS_NAME = '상업멀티 구성_단가인상';`

반대로 접미사 없는 다섯 탭은 `getPriceIncData_()`가 가격 비교/전환 맵으로 읽는다.

> `clients/web/estimate-app/lib/code.js:1795-1799`  
> `readSheetTab('홈멀티', out.home, false);`  
> `readSheetTab('상업멀티', out.comm, false);`  
> `readSheetTab('상업멀티 구성', out.comm, false);`  
> `readSheetTab('싱글 세트', out.single, true);`  
> `readSheetTab('싱글 구성품', out.single, true);`

### 2.2 웹 견적앱의 실제 기본 모드

현재 `bootstrap()` 기본값은 DB다. `CATALOG_SOURCE=sheet`를 명시한 경우에만 위 시트 파서가 실행된다.

> `clients/web/estimate-app/lib/code.js:1843-1847`  
> `const useDb = String(process.env.CATALOG_SOURCE || 'db').toLowerCase() === 'db';`

> `clients/web/estimate-app/lib/code.js:1893-1902`  
> `} else {` ... `t.singleParts = JSON.stringify(getSingleParts());` ... `t.priceInc = JSON.stringify(getPriceIncData_());`

따라서 아래 열 계약은 **시트 모드/레거시 파서의 계약**이다. DB 기본 모드의 DB 필드 생성 계약과 동일하다고 자동으로 가정하면 안 된다.

## 3. 헤더와 인덱스를 구분하는 공통 규칙

`google-sheets-client`는 탭 전체 `A1:ZZ`를 2차원 배열로 읽고 값과 수식을 별도로 보존한다.

> `clients/web/estimate-app/lib/google-sheets-client.js:120-140`  
> `const range = \`'${sheetName}'!A1:ZZ\`;` ... `valueRenderOption: 'UNFORMATTED_VALUE'` ... `valueRenderOption: 'FORMULA'`

shim은 열을 이름 객체로 바꾸지 않는다. 원래 2차원 배열의 위치를 그대로 유지하며 `row[c1 - 1 + j]`로 자른다.

> `clients/web/estimate-app/lib/apps-script-shim.js:293-307`  
> `getValues: () => vals` ... `getDisplayValues: () => vals.map(...)` ... `getFormulas: () => ...`

> `clients/web/estimate-app/lib/apps-script-shim.js:312-324`  
> `out.push(row[c1 - 1 + j]);`

대부분의 카탈로그 파서는 헤더 문자열을 찾아 0-based 인덱스를 얻는다. 중복 헤더는 `map`으로 모든 위치를 모은 뒤 `[0]` 또는 `[length - 1]`로 구분한다. 즉 **중복 `납품가`는 객체 키가 아니라 열 위치가 계약**이다.

> `clients/web/estimate-app/lib/code.js:324-332`  
> `for (let i = 0; i < headers.length; i++) { if (norm(headers[i]) === target) return i; }`

## 4. 탭별 열 매핑표

열 문자는 저장된 `live_sheet` CSV에서 확인한 위치다. 코드가 문자를 고정하지 않은 곳은 “헤더 검색”으로 표시한다. 저장 CSV의 빈 헤더 때문에 코드와 스냅샷이 충돌하는 곳은 별도 경고한다.

### 4.0 요청한 접미사 없는 정본 탭을 현재 코드가 실제로 읽는 범위

현재 저장소 코드는 접미사 없는 다섯 탭을 기본 카탈로그가 아니라 `getPriceIncData_()` 오버레이로만 읽는다. 따라서 **접미사 없는 탭 자체에 대한 엄밀한 현재 코드 계약**은 아래처럼 가격 열 일부뿐이다. 나머지 열은 이 경로에서 읽지 않는다.

| 접미사 없는 탭 | 실제로 읽는 열 | 인덱스 선택 | 결과 |
|---|---|---|---|
| 홈멀티 | 모델명, 출고가 | 헤더 검색의 첫 일치 | `out.home[model] = 출고가` (`code.js:1768-1770`, `:1788-1790`) |
| 상업멀티 | 모델명, 출고가 | 헤더 검색의 첫 일치 | `out.comm[model] = 출고가` (`code.js:1768-1770`, `:1788-1790`) |
| 상업멀티 구성 | 모델명, 출고가 | 헤더 검색의 첫 일치 | 위와 같은 `out.comm`에 대입. 동일 모델이면 뒤의 양수 값이 앞 값을 덮음 (`code.js:1796-1797`) |
| 싱글 세트 | 모델명, 출고가, 마지막 납품가 | 출고가는 첫 일치, 납품가는 중복 중 마지막 | `out.single[model].list/price` (`code.js:1770-1787`) |
| 싱글 구성품 | 모델명, 출고가, 마지막 납품가 | 출고가는 첫 일치, 납품가는 중복 중 마지막 | 위와 같은 모델 객체에 대입. 세트·특징은 읽지 않아 뒤의 양수 값이 덮음 (`code.js:1775-1787`, `:1798-1799`) |
| 구형 | A:I 고정 위치 | 헤더 검색 없음 | 기본 구형 카탈로그로 직접 읽음 (`code.js:1184-1206`) |

그 아래 표는 `_단가인상` 기본 카탈로그 파서가 같은 계열 스키마에서 어떤 열을 객체로 만드는지 정리한 것이다. 라이브 설계에서 접미사 없는 탭을 정본으로 삼으려면 이 카탈로그 매핑을 무접미사 탭으로 옮겨야 하지만, 현재 대상 소스에는 그 전환이 없다.

| 탭 | 열 위치/이름 | 코드에서 읽는 곳 | 객체명·쓰이는 곳 | 업무 의미 |
|---|---|---|---|---|
| 홈멀티 | A `품명` | `code.js:769`, 값 `:784` | `name`; 분류·표시 | 품명, 확정 |
| 홈멀티 | B `모델명` | `code.js:770`, 값 `:785` | `model`; 모델 키 | 모델 키, 확정 |
| 홈멀티 | C `단위` | `code.js:771`, 값 `:786` | `unit` | 단위, 확정 |
| 홈멀티 | D `출고가` | `code.js:776`, 값 `:788` | `list`; 할인 기준 후보 | 출고가, 확정 |
| 홈멀티 | F `납품가` | 중복이면 마지막: `code.js:772-773`, 값 `:787` | `price`; 비할인 고정가 | 납품가, 확정 |
| 홈멀티 | 헤더 `용량` | `code.js:774`, 값 `:789-800` | `capacity` | 용량, 확정. 실제 문자 위치는 코드에 고정 안 됨 |
| 홈멀티 | I `규격` | `code.js:775`, 값 `:790` | `spec` | 규격, 확정 |
| 홈멀티 | L `고정DC` | `code.js:777`, 값 `:791` | `고정DC` | 할인율 오버라이드, 확정 |
| 홈멀티 | H `비고` | `code.js:778`, 값 `:792`, 차단 `:796` | `note` | `미판매/단종` 행 제외, 확정 |
| 홈멀티 | X `최대 연결 실내기 대수` | `code.js:779`, 값 `:793` | `maxIndoor` | 최대 연결 대수, 확정 |
| 싱글 세트 | A `품명` | `code.js:849`, 값 `:862-863` | `name`, `nameRaw` | 품명, 확정 |
| 싱글 세트 | B `평형` | `code.js:850`, 값 `:864-865` | `size`, `sizeText` | 평형, 확정 |
| 싱글 세트 | C `모델명` | `code.js:851`, 값 `:866` | `model` | 세트 모델 키, 확정 |
| 싱글 세트 | D `단위` | `code.js:852`, 값 `:867` | `unit` | 단위, 확정 |
| 싱글 세트 | E `출고가`(저장 CSV) / 헤더 `출고가` 검색 | `code.js:854`, 값 `:872-873` | `list` | 출고가, 확정. 헤더가 없으면 0 |
| 싱글 세트 | G/H 또는 실제 중복 헤더의 첫/마지막 `납품가` | `code.js:855-857`, 값 `:869-870` | 첫 열 `priceLeft`는 버림; 마지막 열 `priceRight` | 첫 열 업무 의미 모름, 마지막 열 실행 가격 확정 |
| 싱글 세트 | J `비고` | `code.js:853`, 값 `:868`, 차단 `:876` | `note` | `미판매/단종` 제외, 확정 |
| 싱글 세트 | 마지막 `납품가` 셀 수식 | `code.js:878-882` | `matKey` (`D4/D7/D8`) | 자재 분기 키, 확정 |
| 싱글 구성품 | A `품명` | `code.js:934`, 값 `:951-952` | `name` | 구성품명, 확정 |
| 싱글 구성품 | C `모델명` | `code.js:935`, 값 `:953` | `model` | 구성품 모델, 확정 |
| 싱글 구성품 | D `구분` | `code.js:936`, 값 `:954` | `kind` | 구성품 종류, 확정 |
| 싱글 구성품 | E `단위` | `code.js:937`, 값 `:955` | `unit` | 단위, 확정 |
| 싱글 구성품 | F `출고가` | `code.js:940`, 값 `:957` | `list` | 출고가/납품가 부재 시 fallback, 확정 |
| 싱글 구성품 | G `수량` | **읽는 코드 없음** (`code.js:934-943` 전체 인덱스 목록에 없음) | 객체에 `qty` 없음 | 현재 시트 파서에서는 미사용, 확정 |
| 싱글 구성품 | H `납품가-1` | 모든 `납품가` 위치 수집만 함 `code.js:938`; 값은 읽지 않음 | 없음 | 업무 의미 모름, 실행상 미사용 확정 |
| 싱글 구성품 | I `납품가-2`(마지막) | `code.js:938-939`, 값 `:956` | `price`; 세트 행 가격 | 세트/특징 행 문맥 가격으로 동작, 확정 |
| 싱글 구성품 | L `규격` | `code.js:943`, 값 `:959` | `spec` | 규격, 확정 |
| 싱글 구성품 | M `세트` | `code.js:941`, 값 `:948`, 보존 `:968` | `setModel`; 세트 필터 키 | 관계의 부모 세트, 확정 |
| 싱글 구성품 | N `구성품 특징` | `code.js:942`, 값 `:958`, 기본 판정 `:963` | `feat`, `isDefault` | 특징/기본 여부, 확정 |
| 상업멀티 | A `품명` | `code.js:1033`, 값 `:1049` | `name` | 품명, 확정 |
| 상업멀티 | B `모델명` | `code.js:1034`, 값 `:1050` | `model` | 모델 키, 확정 |
| 상업멀티 | C `용량`(데이터), 헤더 검색 | `code.js:1041`, 값 `:1059-1060` | `capacity` | 용량, 확정. 헤더 위치는 동적 |
| 상업멀티 | D `단위` | `code.js:1035`, 값 `:1051` | `unit` | 단위, 확정 |
| 상업멀티 | E `출고가` | `code.js:1038`, 값 `:1053` | `list` | 할인 기준 후보, 확정 |
| 상업멀티 | G `납품가` | 중복이면 마지막 `code.js:1036-1037`, 값 `:1052` | `price` | 비할인 고정가, 확정 |
| 상업멀티 | 헤더 `규격` | `code.js:1040`, 값 `:1054` | `spec` | 규격, 확정 |
| 상업멀티 | L `고정DC` | `code.js:1039`, 값 `:1055` | `고정DC` | 할인율 오버라이드, 확정 |
| 상업멀티 | 헤더 `대분류` | `code.js:1042`, 값 `:1062-1064` | `catL` | 없으면 코드 분류, 확정 |
| 상업멀티 | I `비고` | `code.js:1043`, 값 `:1056`, 차단 `:1069` | `note` | `미판매/단종` 제외, 확정 |
| 상업멀티 | Z `최대 연결 실내기 대수` | `code.js:1044`, 값 `:1057` | `maxIndoor` | 최대 연결 대수, 확정 |
| 상업멀티 구성 | A `품명` | `code.js:1120`, 값 `:1136-1137` | `name` | 구성품명, 확정 |
| 상업멀티 구성 | B `모델명` | `code.js:1121`, 값 `:1138` | `model` | 구성품 모델, 확정 |
| 상업멀티 구성 | C `단위` | `code.js:1123`, 값 `:1140` | `unit` | 단위, 확정 |
| 상업멀티 구성 | D `출고가` | `code.js:1126`, 값 `:1142` | `list`; 납품가 0이면 가격 fallback | 출고가, 확정 |
| 상업멀티 구성 | E `수량` | `code.js:1128`, 값 `:1141` | `qty` | 구성 배수 후보, 사용 조건은 §7 |
| 상업멀티 구성 | F `납품가` | `code.js:1127`, 값 `:1143-1144` | `price = priceVal || listVal` | 납품가 우선, 0이면 출고가, 확정 |
| 상업멀티 구성 | H `비고` 또는 `규격` | `code.js:1125`, 값 `:1145`, 차단 `:1148` | `spec` | 규격 및 판매 차단 텍스트, 확정 |
| 상업멀티 구성 | I `세트` | `code.js:1124`, 값 `:1135`, 보존 `:1153-1155` | `refModel/setModel` | 관계의 부모 세트, 확정 |
| 상업멀티 구성 | `구분` 헤더가 있으면 | `code.js:1122`, 값 `:1139` | `kind`, `isDefault` | 저장 CSV에는 해당 헤더가 없어 의미 모름 |
| 구형 | A(0) | 고정 범위 `code.js:1184`, 값 `:1198` | `name` | 품명, 확정 |
| 구형 | B(1) | `code.js:1199` | `model` | 모델명, 확정 |
| 구형 | C(2) | `code.js:1200` | `unit` | 단위, 확정 |
| 구형 | D(3) | `code.js:1201` | `price` | 출고가/할인 기준액, 확정 |
| 구형 | F(5) | `code.js:1195`, `:1202` | `sheetPrice`; F 수식의 `$I$1` 여부 → `isDisc` | 납품가 또는 할인 수식 결과, 확정 |
| 구형 | H(7) | `code.js:1204` | `remarks` | 비고, 확정 |
| 구형 | I(8) | `code.js:1205` | `spec` | 규격, 확정 |

### 4.1 저장 CSV 헤더와 현재 시트 파서의 불일치

다음은 코드만으로 해결되지 않는 실제 위험이다.

- `getSingleParts()`는 **무조건 0-based `vr[1]`, 즉 시트 2행을 헤더**로 본다: `code.js:931-932`.
- 저장된 `live_sheet/싱글 구성품.csv`와 `_단가인상` CSV는 1행이 헤더이고 2행부터 데이터다.
- 저장 CSV를 그대로 이 함수에 넣으면 2행 데이터에서 헤더명을 찾으므로 `idxSetModel` 등이 `-1`이 되고, `setModel`이 비어 모든 행을 건너뛴다(`code.js:948-949`).
- 싱글 세트 저장 CSV의 3행에는 가격 헤더가 비어 있다. 이 경우 코드는 `idxPL=6`, `idxPR=7` fallback을 쓰지만(`code.js:856-857`), `출고가`는 fallback이 없어 `list=0`이 된다(`code.js:854`, `:872-873`).

따라서 저장 CSV 열 위치는 확인되지만, **현재 저장소의 시트 fallback이 그 CSV 스냅샷을 정상 카탈로그로 읽는다고는 확정할 수 없다.** 기본 모드가 DB라서 이 결함이 가려져 있을 수 있다.

## 5. 질문 2 — 두 `납품가` 열은 각각 무엇인가

### 5.1 싱글 세트

코드는 첫 열과 마지막 열을 다음처럼 읽는다.

> `clients/web/estimate-app/lib/code.js:855-870`  
> `const idxPL = idxPrices.length ? idxPrices[0] ...;`  
> `const idxPR = idxPrices.length ? idxPrices[idxPrices.length - 1] ...;`  
> `const priceLeft = parseKRNumber_(row[idxPL]);`  
> `const priceRight = parseKRNumber_(row[idxPR]);`

그러나 출력 객체에는 오른쪽 값만 들어간다.

> `clients/web/estimate-app/lib/code.js:887-903`  
> `const priceRaw = Number(priceRight) || 0;`  
> `const price = priceRaw;`  
> `out.push({ ... priceRight, priceRaw, price, list: listPrice, ... });`

판정:

- 첫 `납품가`: 읽기는 하지만 소비자에게 전달되지 않는 죽은 값. **업무 의미는 모른다.**
- 마지막 `납품가`: 세트 기본 단가로 사용. `price`가 먼저이고 없을 때만 출고가 계열로 fallback한다(`views/index.ejs:5124-5131`).
- 두 값이 다르면 마지막 열이 이긴다. 별도 조건은 없다.

### 5.2 싱글 구성품

코드는 마지막 `납품가`만 선택한다.

> `clients/web/estimate-app/lib/code.js:938-940`  
> `const idxPrice = idxPrices.length ? idxPrices[idxPrices.length - 1] : -1;`

그 가격은 `setModel`, `feat`와 같은 행 객체에 보존된다(`code.js:965-977`). 화면은 해당 세트 모델의 행만 고른다(`views/index.ejs:5192`), 옵션 선택도 그 행 집합에서 `feat`로 고른다(`views/index.ejs:5107-5120`). 최종 구성품 단가는 선택된 `p.price`를 우선한다.

> `clients/web/estimate-app/views/index.ejs:4390-4402`  
> `let basePrice = priceFrom(p,{ priceKeys:['price','unitPrice'], listKeys:['list',...] });`

판정:

- 첫 `납품가`: 싱글 구성품 파서가 값조차 읽지 않는다. **업무 의미는 모른다.**
- 마지막 `납품가`: 기본 카탈로그에서는 `(세트, 구성품, 특징)` 행 문맥 가격으로 동작한다.
- 같은 모델의 마지막 납품가가 세트별로 다르면, 기본 계산은 선택된 세트 행의 값을 쓴다.
- 단, 오버레이 활성 시에는 모델 전역 맵이 이 값을 덮는다. 자세한 조건은 §9.

### 5.3 견적앱과 주문앱 차이

- 견적앱: 기본은 행 문맥 `p.price`; `chkSingleInc`가 체크되고 모델 맵 가격이 양수면 `PRICE_INC.single[p.model].price`로 덮는다(`views/index.ejs:4395-4400`).
- 주문앱: 기본은 행 문맥 `p.price`; 납품일이 변동일보다 이르고 모델 맵이 양수면 `SINGLE_PARTS_INC[p.model]`로 덮는다(`clients/web/order-app/index.html:2745-2757`).
- 두 앱 모두 오버레이 키는 모델 하나이므로 오버레이에서는 세트/특징 문맥이 사라진다.

## 6. 질문 3 — `출고가`와 `납품가`의 관계

### 6.1 홈멀티·상업멀티

서버는 `납품가 → price`, `출고가 → list`로 보낸다(`code.js:787-788`, `:1052-1053`).

견적앱 계산:

> `clients/web/estimate-app/views/index.ejs:4376-4384`  
> `if (isVarChecked && listPrice > 0) { ... computed = Math.round(listPrice * (1 - finalRate)); } else { computed = (sheetPrice > 0 && !homeCustomListPrices.has(model)) ? sheetPrice : listPrice; }`

상업멀티도 동일하다(`views/index.ejs:4487-4495`). 즉:

- 변동DC/수식 플래그가 켜지면 **출고가가 할인 기준가**다.
- 꺼지면 양수 `납품가`를 그대로 쓰고, 납품가가 없으면 출고가를 쓴다.
- 사용자가 출고가를 수정하면 기존 납품가 대신 수정 출고가가 계산 기준이 된다.

주문앱도 기본 구조는 같지만, 고정DC가 있으면 `useK2`가 false여도 출고가 할인 계산을 한다.

> `clients/web/order-app/index.html:2855-2863`  
> `if (r.useK2 ... ) ... else if (fixedDc != null ... ) ... else { computed = currentSheetPrice > 0 ? currentSheetPrice : currentListPrice; }`

### 6.2 싱글 세트·싱글 구성품

공통 `priceFrom()`은 납품가 계열을 먼저 고르고, 0이면 출고가 계열로 fallback한다.

> `clients/web/estimate-app/views/index.ejs:4326-4340`  
> `const p = Number(first(obj, priceKeys)) || 0; if (p) return Math.round(p);`  
> `const l = Number(first(obj, listKeys)) || 0; return Math.round(l);`

싱글 세트의 360/4way/스탠드 등 추가 할인은 이 선택된 **납품가 기반 `base`**에서 정액을 차감한다(`views/index.ejs:4405-4451`). 출고가에 할인율을 적용하는 홈/상업멀티 방식과 다르다.

상업멀티 구성의 서버 파서는 더 명시적이다.

> `clients/web/estimate-app/lib/code.js:1142-1144`  
> `const listVal = ...; const priceVal = ...; const basePrice = priceVal || listVal;`

### 6.3 구형

구형은 D가 출고가, F가 납품가다. F의 수식이 `$I$1`을 참조하면 `isDisc=true`다(`code.js:1194-1203`).

견적앱:

> `clients/web/estimate-app/views/index.ejs:2428-2435`  
> `if(item.isDisc) { p = Math.round(p * (1 - rateVal/100)); } else { ... p = Math.round(Number(item.sheetPrice)||0); }`

주문앱:

> `clients/web/order-app/index.html:4829-4834`  
> `if(item.isDisc === true) { finalPrice = Math.round(listPrice * 0.5); } else { finalPrice = Math.round(Number(item.sheetPrice) || 0); }`

차이:

- 견적앱은 화면/설정의 구형 할인율을 출고가에 적용한다.
- 주문앱은 같은 조건에서 50%를 하드코딩한다.
- 할인 대상이 아니면 두 앱 모두 F 납품가를 그대로 쓴다.

## 7. 질문 4 — `수량` 열을 실제로 쓰는가

### 7.1 싱글 구성품

시트 서버 파서는 수량 열을 읽지 않는다. 인덱스 목록 `code.js:934-943`에 `수량`이 없고 출력 객체 `:965-978`에도 `qty`가 없다.

견적앱은 세트에 해당하는 **모든 행**을 `filter()`로 보존하고(`views/index.ejs:5192`), 각 선택 행에 세트 수량을 그대로 한 번씩 부여한다.

> `clients/web/estimate-app/views/index.ejs:5242-5248`  
> `const mapped = picked.map(p => ({ ... qty: qty, price: partUnitPrice(p), ... }));`

따라서 견적앱의 싱글 구조 수량은 현재 시트 경로에서 **수량 열이 아니라 반복 행 수**로 표현된다.

주문앱은 객체에 `qty`가 있으면 곱한다.

> `clients/web/order-app/index.html:3375-3381`  
> `qty: qty * (parseInt(p.qty, 10) || 1),`

그러나 시트 파서가 `qty`를 만들지 않으므로 시트 경로에서는 항상 `|| 1`이다. DB bootstrap이 `qty`를 제공하는 경우에는 주문앱만 이를 사용하고, 견적앱은 여전히 무시한다. 이것은 두 앱의 명시적 차이다.

### 7.2 상업멀티 구성

서버는 E `수량`을 문자열 `qty`로 보존한다(`code.js:1128`, `:1141`, `:1164`). 두 앱 모두 `parseInt(p.qty, 10) || 1`을 곱한다.

> `clients/web/estimate-app/views/index.ejs:7208-7212`  
> `const q = qtySet * (parseInt(p.qty, 10) || 1);`

> `clients/web/order-app/index.html:4739-4743`  
> `const q = qtySet * (parseInt(p.qty, 10) || 1);`

따라서:

- `수량=0`, 빈칸, 숫자가 아닌 값은 모두 1로 처리된다.
- 같은 `(세트, 구성품)` 행이 반복되면 각 행이 별도로 `map()`되어 반복 횟수만큼 누산된다.
- 양수 정수 수량이 있으면 각 반복 행마다 그 배수를 다시 곱한다.
- 견적앱 전송 경로의 특수 문자열 `Q`도 세트 수량 1배로 처리한다(`views/index.ejs:7242-7249`).

따라서 실측의 “숫자 817쌍이 전부 0”은 코드상 구조 수량 0이 아니다. **0은 1로 강제되고, 반복 행 수가 실제 다중 수량을 만든다.**

## 8. 질문 5 — 괄호 HP 표기

괄호 정규화는 다음과 같다.

> `clients/web/estimate-app/lib/code.js:278-284`  
> `s = s.replace(/\(([^)]*)\)/g, function (m, inner) { return /[가-힣]/.test(inner) ? m : ''; });`

- 괄호 안에 한글이 하나라도 있으면 괄호 전체를 보존한다.
- 한글이 없으면 괄호 전체를 제거한다. 따라서 `(18HP+18HP)`, `(360CST / 원형 / WIFI)`, `(2.5HP)`는 표시 정규화에서 삭제된다.
- 같은 규칙이 `[]`, `{}`, `<>`에도 적용된다(`code.js:281-283`).

`HP` 파서는 괄호 구조나 `+` 항목 수를 세지 않는다. 문자열에서 처음 만나는 숫자+`HP` 또는 숫자+`마력` 하나만 반환한다.

> `clients/web/estimate-app/lib/code.js:296-302`  
> `let m = t.match(/(\d+(?:[.,]\d+)?)\s*hp/i);`  
> `if (!m) m = t.match(/(\d+(?:[.,]\d+)?)\s*마력/i);`  
> `return \`${num}HP\`;`

이 함수는 홈멀티 분류의 실외기 표시값에 사용된다.

> `clients/web/estimate-app/lib/code.js:544-545`  
> `const hp = hpFromText_(n); disp = hp || sanitizeDisp_(...);`

싱글 세트·구성품 이름은 `sanitizeDisp_()`를 거쳐 비한글 괄호가 제거된다(`code.js:862-863`, `:951-952`). 대상 코드에서 `(18HP+18HP)`를 2대로 변환하는 파서는 없다. 따라서 괄호 HP는 **표시/분류 보조일 뿐 구조 수량 원천이 아니다.** 특징 42건·세트 35건의 괄호 차이를 DB 이름 변경으로 흡수해도 되는지는 코드로는 모른다. 원문 보존 여부를 별도로 결정해야 한다.

## 9. 질문 6 — `_단가인상` 오버레이

### 9.1 현재 저장소 코드의 실제 방향

명칭과 달리 현재 서버/GAS 사본은 `_단가인상`을 기본 카탈로그로 읽고, 접미사 없는 탭을 오버레이 맵으로 읽는다(§2). 따라서 개발책임자 배경의 “접미사 없음 정본, `_단가인상` 오버레이” 방향과 **소스가 반대**다.

접미사 없는 탭을 읽는 오버레이 함수는:

- 홈/상업: `출고가`만 모델별 숫자로 저장한다(`code.js:1788-1790`).
- 싱글 세트/구성품: 마지막 `납품가`를 `price`, `출고가`를 `list`로 모델별 객체에 저장한다(`code.js:1778-1787`).
- 동일 모델의 행이 여러 개면 `targetObj[model]`에 뒤 행이 계속 대입되므로 마지막 양수 값이 이긴다. 세트·특징 키는 사용하지 않는다.

### 9.2 견적앱 활성 조건과 우선순위

견적앱은 체크박스로 오버레이를 켠다.

> `clients/web/estimate-app/views/index.ejs:2266-2278`  
> `if (isInc && PRICE_INC.home[model]) return PRICE_INC.home[model];` ...  
> `if (isInc && PRICE_INC.single[model].list) return ...list;`

싱글 구성품/세트 납품가는 `chkSingleInc`가 체크되었을 때 모델 맵의 양수 `price`가 기본 행 가격보다 우선한다(`views/index.ejs:4397-4412`, `:5141-5145`).

### 9.3 주문앱 활성 조건과 우선순위

주문앱은 체크박스가 아니라 납품일과 `PRICE_CHANGE_SCHEDULE`을 비교한다.

> `clients/web/order-app/index.html:1446-1450`  
> `// due<변동일→*_INC(인상전), due>=변동일→base(인상후)`  
> `return due < String(effectiveDate);`

우선순위는 `due < 변동일`이면 `HOME_INC/COMM_INC/SINGLE_INC/SINGLE_PARTS_INC/COMM_PARTS_INC`, 아니면 기본 카탈로그다(`order-app/index.html:2722-2725`, `:2750-2757`, `:2760-2767`, `:2780-2784`, `:2846-2849`).

다만 `order-app/index.html`은 이 맵을 `window.__SAMHAN_BOOTSTRAP__`에서 받을 뿐 어느 시트 탭에서 만들었는지는 읽지 않는다.

> `clients/web/order-app/index.html:1356-1370`  
> `const __BS = ...;` ... `const SINGLE_PARTS_INC_RAW = __BS.singlePartsInc || {};`

따라서 요청된 주문앱 파일만으로는 `*_INC`가 실제 `_단가인상` 탭인지, 접미사 없는 탭인지, DB 이력인지 **모른다**. 확인하려면 주문앱 bootstrap을 생성하는 서버 코드와 배포 버전을 추가로 추적해야 한다.

## 10. 확정하지 못한 것

1. **첫 번째 `납품가` 열의 업무 의미**  
   코드는 싱글 세트에서 읽고 버리며, 싱글 구성품에서는 읽지 않는다. “모델 전역가”, “원가”, “인상 전 가격” 중 무엇인지 확정할 주석·변수·소비자가 없다. 열 생성 수식, 시트 작성 규칙 또는 운영 담당자의 데이터 사전이 필요하다.

2. **두 `납품가` 열의 원래 명칭**  
   둘 다 헤더가 문자 그대로 `납품가`다. 코드는 첫/마지막 위치로만 구분한다. 의미 있는 별칭은 코드에 없다.

3. **라이브 GAS의 무접미사 정본 전환이 현재 웹 서버에 반영됐는지**  
   대상 저장소 코드는 반대로 되어 있다. 라이브 GAS 최신 `Code.js` 또는 그 변경을 웹 서버로 포팅한 커밋/배포 산출물이 필요하다. 이번 라운드에서는 Google에 접근하지 않았으므로 라이브 자체는 재확인하지 않았다.

4. **저장 CSV와 시트 fallback의 헤더 행 불일치 원인**  
   CSV export가 행을 변형했는지, 실제 Sheet API 배열이 다른지, 파서가 낡은지는 대상 코드와 CSV만으로 모른다. Google 접근 없이 확정하려면 당시 저장한 raw Sheets API JSON 또는 export 스크립트의 원시 응답이 필요하다.

5. **괄호 표기를 사용자 원문으로 보존해야 하는지**  
   코드는 비한글 괄호를 표시명에서 제거하지만, 이것이 데이터 정제 규칙인지 단순 UI 축약인지 설명하지 않는다. 이관 DB의 canonical name과 display name을 나눌지 업무 결정이 필요하다.

6. **주문앱 `*_INC` 맵의 원천 탭**  
   `order-app/index.html`은 bootstrap 결과만 소비한다. 생성 서버 코드/배포 설정을 추가 조사해야 한다.

7. **상업멀티 구성의 `구분`/기본 의미**  
   코드는 `구분` 헤더를 찾고 `/기본/`으로 판정하지만, 저장 CSV에는 `구분` 헤더가 없다. 실제 운영 시트의 별도 헤더/버전이 필요한 영역이다.

## 11. 이관 계약으로 바로 사용할 수 있는 최소 판정

1. 싱글 구성품 기본 가격은 모델 마스터 하나로 평탄화하지 말고 최소 `(세트 모델, 구성품 모델, 특징)` 행에 마지막 `납품가`를 보존해야 레거시 기본 계산을 재현할 수 있다.
2. 첫 `납품가`는 현재 출력 재현에는 필요하지 않지만 의미 미확정이므로 삭제하지 말고 원시 보존 열로 옮기는 것이 안전하다. 이것은 업무 의미 판정이 아니라 손실 방지 조치다.
3. 싱글 구성 수량은 시트 `수량` 열이 아니라 반복 행을 보존해야 견적앱과 일치한다. 주문앱 DB 경로까지 일치시키려면 `qty`와 반복 행을 동시에 넣어 중복 곱하지 않도록 한 가지 표현으로 정규화한 뒤 두 앱 회귀를 해야 한다.
4. 상업멀티 구성의 `수량=0/빈칸`은 1로 이관해야 레거시와 일치하고, 반복 행도 각각 보존해야 한다.
5. 가격 이력/오버레이는 모델 전역 맵이라는 별도 계약이다. 기본 문맥 가격 테이블과 분리해야 한다.
6. 정본/오버레이 탭 방향은 라이브 최신 소스를 기준으로 다시 잠가야 한다. 현재 저장소 파서의 상수만 따라 이관하면 개발책임자 방향과 반대로 들어간다.

## 12. 신규 파일

- `docs/dev-reports/2026-08-08-896-sheet-column-contract.md`
