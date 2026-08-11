# GAS 전수조사 v2 — 원본 GAS 금액 계열 7개

> 조사일: 2026-08-11  
> 범위: 사용자 지정 `tools/legacy-gas/` 7개 프로젝트만  
> 금지 준수: 코드·스키마·마이그레이션·git·컨테이너·DB write 없음

## 1. 완결성 집계

**배정 386 / 분류 386 / 4분류 합계 386**

| 프로젝트 | 배정 | 업무규칙 | UI | 인프라 | dead_code | 분류 합계 |
|---|---:|---:|---:|---:|---:|---:|
| 거래처별 원장생성 프로그램 | 65 | 18 | 32 | 15 | 0 | 65 |
| 거래처별 일괄 거래명세서 생성 | 64 | 15 | 34 | 15 | 0 | 64 |
| 계산서일괄등록양식 생성 | 43 | 7 | 24 | 12 | 0 | 43 |
| 일마감 프로그램 | 80 | 24 | 41 | 13 | 2 | 80 |
| 영업수수료 계산 | 35 | 12 | 16 | 7 | 0 | 35 |
| 전표정리리스트 | 53 | 6 | 33 | 7 | 7 | 53 |
| 내일자 전표 이미지 생성 | 46 | 4 | 32 | 10 | 0 | 46 |
| **합계** | **386** | **86** | **212** | **79** | **9** | **386** |

분모는 고정 문서 `docs/dev-reports/2026-08-11-gas-function-inventory-v2.md`의 9개 추출 패턴 결과를 그대로 사용했다. 파일별 배정은 원장 15+50, 거래명세서 15+49, 계산서 12+31, 일마감 27+53, 수수료 7+28, 전표정리 14+39, 내일전표 10+36이다.

### 1.1 생존 진입점과 dead_code 판정

실행한 정적 확인:

```powershell
rg -n "doGet|doPost|onOpen|onEdit|ScriptApp|createMenu|addItem|google\.script\.run|onclick=|onchange=|oninput=|onsubmit=" <각 프로젝트> -g '*.js' -g '*.html' -g '*.json'
Get-Content <각 프로젝트>/appsscript.json -Raw -Encoding UTF8
```

- 7개 `appsscript.json` 모두 `webapp.executeAs=USER_ACCESSING`, `webapp.access=ANYONE`이다. 따라서 각 `doGet`은 외부 웹앱 진입점이다.
- 7개 `window.onload`, HTML 인라인 이벤트, `google.script.run` 서버 호출, 최상위 `addEventListener`를 호출 그래프 루트로 포함했다.
- `doPost`, `onOpen`, `onEdit`, `ScriptApp` 시간 트리거, 커스텀 메뉴 선언은 대상 7개에 없다.
- inventory가 `method-short`로 잡은 영업수수료의 `setTimeout` 2건은 함수 정의가 아니라 살아 있는 `onload` 내부 호출이다. 고정 분모를 바꾸지 않고 UI 2건으로 분류했다.
- 확정 dead 9건만 아래처럼 판정했다. 애매한 항목은 업무규칙/UI/인프라로 보수 분류했다.

| 함수 | 근거 |
|---|---|
| `일마감/Code.js:994 testNotionAPI` | 선언 1회뿐이고 웹앱·HTML·`google.script.run`·트리거 참조 없음. 수동 개발 테스트 함수. |
| `일마감/Index.html:1347 updateMergedVal` | 선언 1회뿐. 실제 `focusout`은 `updateMergedTextVal`을 호출한다(`:746-762`). |
| `전표정리리스트/Code.js:73 getIdFromUrl`, `:82 openSheetByUrl`, `:89 normalizeStr`, `:100 normalizeForMatch`, `:113 cleanValue`, `:122 isAccountingRoom_`, `:133 sheetToObjects` | 서로 일부 연결된 복사 잔재지만 생존 루트에서 이 묶음으로 들어오는 호출이 0이다. 현재 화면은 로컬 XLSX를 `Index.html:383-435`에서 직접 읽는다. |

---

## 2. 우리 스키마·서비스 대응 요약

| 레거시 축 | 대응 | 판정 |
|---|---|---|
| 전잔·판매·수금·조정·후잔 | `accounting-service PartnerLedgerContract.fold`, sales-slip-ledger, journal/cash receipt | **있음**. fold를 정본으로 유지. 단 레거시 외부파일 기초채권·3개 계정코드 특례·0.5원 gate는 결과 차이 |
| 판매전표 | `slip-service slips/slip_lines`, 실제 `slip_type=OUTBOUND` | **있음**. `SALES` 값으로 이식하면 안 됨 |
| 거래처 | partner-service 7,253건 | **있음**. 다만 카톡방·입금연락처·필터단어·계산서 예외는 없음 |
| 품목·구성 | products/classification/bundle_component/quantity_sync_* | **부분**. 문자열 zone, 가격표 version, 출고가/납품가, partner DC, 검증상태 없음 |
| 거래명세서 | OUTBOUND/lines에서 재구성 가능 | **부분**. 문서 snapshot·발행/수신 채널 없음 |
| 세금계산서 | 명시된 대응 없음 | **불가**. header/line, 공급가/VAT snapshot, 발급상태·제외사유 없음 |
| 영업수수료 | 명시된 대응 없음 | **불가**. 정산·요율정책·공제·지급·매입계산서 연결 없음 |
| 일마감 | OUTBOUND + accounting + AccountingAuditLog | **부분**. 마감 상태, 가격 검증, override, 선발행/매출전표X 없음 |
| 전표 발송 정리 | AccountingAuditLog 일부 | **부분**. 발송 event/snapshot/status 없음 |
| 내일전표 이미지 | OUTBOUND/lines/partner/product | **부분**. 허용창고·발송금지·카톡방·배송캘린더·이미지 snapshot 없음 |

## 3. 원본에만 있고 우리에게 없는 규칙 — 유실 후보

1. **원장 대상 채널 gate**: 카톡방 key가 있으면 제외하면서 카톡방/입금전화가 둘 다 없어도 제외하는 이중 조건(`원장 Index.html:688-690,747-759`). 데이터 이식 전 의도 확인이 필요하다.
2. **원장 계정코드 특례**: 9199 대변=판매, 9549 차변=수금, 1089 차변/대변=판매/수금(`:700-709`). 우리 chart/effect 일반화와 결과가 달라지는 legacy journal이 있을 수 있다.
3. **명세서 생성 cohort**: 양수 채권잔액, 주소 분류 체크, 수신번호·카톡방, 필터단어, 거래처 allow-list가 모두 결합된다.
4. **거래명세서 문서 snapshot**: 행별 공급가/VAT 원 단위 반올림, 한글 금액, 공급자/계좌 고정문구, 이미지 보존 모델이 없다.
5. **세금계산서 발급 계약**: 회계반영일자 gate, 첫 유효일 batch 통일, 일반(01)·청구(02), 품목1만 채움, 공급가/VAT 원천 신뢰, 전표번호 예외가 없다.
6. **세금계산서 화면/출력 불일치**: 열 필터·통합검색은 export에 반영되지 않고 예외코드만 반영된다.
7. **영업수수료 전체 엔진**: 카드 3%, 제경비 8%/수기, 원천 3.3%, 설치 8%, 안전관리비, 선지급, 항목별 대칭 원 반올림, 소계 기준 VAT 분할이 전부 없다.
8. **가격표 유효기간**: `2026-07-01` 경계와 `_단가인상` sheet, 인상 전 수동 override가 없다.
9. **partner별 할인 계약**: 홈/상업 rate, 360/4way/1way/스탠드/디럭스/1등급 정액, 할인제외 품목, product 고정DC가 없다.
10. **싱글 세트 검증기**: 실제 행을 수량만큼 pool로 펼쳐 구성품 가격합과 0원 오차로 맞추는 규칙, AR/AF `*S` 제외, 옵션 실제존재 조건이 없다.
11. **일마감 확인 상태**: 검증 생략도 TRUE, 정수% ±0.5%p 비교, 수동 TRUE/FALSE override, main/pre/매출전표X가 없다.
12. **전표정리 발송 상태기계**: base/over/modHistory, 폐기/restored, 1·2·3차 수정 상태가 없다.
13. **내일전표 운영정책**: 허용창고 2개, 발송제한 거래처코드, 회계방 제거, 야적/지방 토요일 날짜, 미출·기상 안내가 없다.

## 4. 🚩 결정 필요 목록

### 결정 1. 원장 출력 대상에서 카톡방 보유 거래처를 제외할 것인가

1. 정할 것: 원장 문서 cohort를 잔액 기준으로 할지, 발송채널 기준으로 추가 제한할지.
2. 레거시: `원장 Index.html:688-690` — `if (isExcludedByName(name)) continue;`; `:759` — `if (!isForced && !roomName && !phonePick) continue;`. 카톡방 key가 있어도 제외, 없어도 전화가 없으면 제외된다.
3. 후보: (a) 잔액 기준 전체—정합성 높음, 발송 UI에서만 채널 필터; (b) 레거시 그대로—재현성은 높지만 거의 모든 비강제 대상이 빠질 위험; (c) 카톡방 또는 전화가 있는 대상만—발송 목적에는 맞지만 원장 조회와 문서발송 cohort가 결합.
4. **권고: (a)**. 원장 정본과 발송대상 정책을 분리한다.

### 결정 2. 세금계산서 작성일자를 행별로 할지 batch 공통으로 할지

1. 정할 것: 서로 다른 전표일자가 섞인 batch의 작성일자.
2. 레거시: `계산서 Index.html:385-390` — 첫 유효 `orgDate`를 `validDateFallback`에 넣고 `let fullDate = validDateFallback || today`를 모든 후속 행에 사용.
3. 후보: (a) 각 OUTBOUND 전표일자—정확하지만 레거시 파일과 달라짐; (b) 사용자가 지정한 batch 작성일자—통제 가능, 입력 단계 추가; (c) 첫 전표일자—레거시 동일, 이종 날짜 오발급 위험.
4. **권고: (a)**, batch 공통 발급이 법적으로 필요한 경우에만 (b)를 명시 선택.

### 결정 3. 공급받는자 등록번호의 출처

1. 정할 것: 세금계산서 등록번호에 partner code와 사업자등록번호 중 무엇을 넣을지.
2. 레거시: `계산서 Index.html:411` — `String(r['거래처코드'] || '').replace(/[^\d]/g, '')`.
3. 후보: (a) partner-service 사업자등록번호—세법 의미와 일치, master 누락 시 발급 차단; (b) 거래처코드 유지—레거시 호환, 내부코드일 때 오발급; (c) 원본 우선+master 검증—유연하지만 충돌 처리 필요.
4. **권고: (a)**. 내부 거래처코드는 추적키로만 보존.

### 결정 4. 영업수수료 수기율·음수 입력 허용 범위

1. 정할 것: 수기 제경비율과 음수 금액의 validation 범위.
2. 레거시: `영업수수료 Index.html:297-301` — 수기값을 단순 `/100`; `:305-309` — 숫자면 제한 없이 수용.
3. 후보: (a) 제경비 0~100%, 금액 음수 금지—안전, 환입/조정 별도 기능 필요; (b) 관리자만 범위 밖 허용—유연, 권한·감사 필요; (c) 무제한 유지—호환성 높지만 비정상 지급 위험.
4. **권고: (b)**, 일반 기본은 (a) 범위.

### 결정 5. 가격표 정본·유효기간·미등록 가격 처리

1. 정할 것: 일마감 출고가/납품가의 저장 위치와 가격이 없을 때 동작.
2. 레거시: `일마감 Code.js:438` — `dateNum >= 20260701`이면 `_단가인상`; `:545` — 미발견 시 `{ price: 0, deliveryPrice: 0, fixedDc: null }`.
3. 후보: (a) 유효기간 있는 DB price version + 미등록 차단—정확, migration 필요; (b) product 현재가 + audit snapshot—구현 단순, 과거 재현 약함; (c) Sheet 계속 정본—즉시 호환, 서비스 정규화 실패.
4. **권고: (a)**. 문서에는 적용 price version과 금액 snapshot을 남긴다.

### 결정 6. partner DC 저장 위치와 45% fallback

1. 정할 것: 홈/상업/정액DC를 어디에 저장하고 미설정 때 45%를 자동 적용할지.
2. 레거시: `일마감 Code.js:721-729` — 고정DC 우선, partner rate, 없으면 `0.45`, zone 불명도 `45`.
3. 후보: (a) partner-product/분류 정책 테이블, 미설정은 검증불가—명확, 정책 모델 필요; (b) 45% 전역 default—레거시 호환, 오할인 위험; (c) partner default + product override—유연, 우선순위·유효기간 필요.
4. **권고: (c)**, 값이 정말 없으면 45% 자동통과가 아니라 `UNVERIFIED`.

### 결정 7. 일마감 공급가/VAT가 단위금액인가 행금액인가

1. 정할 것: 수량>1인 편집행의 공급가·VAT 산식.
2. 레거시: `일마감 Index.html:1233-1237` — `합계=unit*qty`지만 `공급가액=round(unit/1.1)`, `VAT=unit-공급가액`.
3. 후보: (a) 행 총액을 먼저 만든 뒤 `공급가=round(행합계/1.1)`—합계 일치, 품목행 세액 정합; (b) 단위 공급가/VAT×수량—단위 의미 보존, 반올림 누적 차이; (c) 레거시 그대로—호환, 한 행 내부 불일치.
4. **권고: (a)**. 원천 slip의 확정 공급가/VAT가 있으면 재계산 대신 snapshot 사용.

### 결정 8. 일마감 상태를 날짜 문자열로 추론할 것인가

1. 정할 것: main/pre/매출전표X를 명시 상태로 모델링할지.
2. 레거시: `일마감 Code.js:737-739` — 회계반영일자가 날짜 regex면 pre, 아니면 main; `:465-467` — 미전표 특이사항은 `매출전표X - 날짜` 문자열.
3. 후보: (a) enum 상태+별도 accounting date—정규화·감사 용이, migration 필요; (b) 날짜 nullable만—단순, 매출전표X 사유 손실; (c) 문자열 유지—호환, 조회·검증 취약.
4. **권고: (a)** (`UNPOSTED/POSTED/NO_SALES_SLIP` 등) + 사유/날짜 별도.

### 결정 9. 발송완료의 증거를 실제 발송 이벤트로 할지 수동 체크로 할지

1. 정할 것: 전표정리 상태의 authoritative evidence.
2. 레거시: `전표정리 Index.html:1003-1016` — 사용자가 체크한 현재 8필드 문자열을 완료 base로 저장; `:751-756`은 전체 또는 수정내역 조각 일치로 sent 판정.
3. 후보: (a) 실제 메시지 전송 성공 event—정확, 외부 발송 연동 필요; (b) 수동 확인+감사—현재 업무 유지, 사람 오류; (c) 둘 다 저장—운영 유연, 상태 우선순위 필요.
4. **권고: (c)**, 실제 event가 있으면 우선하고 수동은 override 사유 필수.

### 결정 10. 내일전표 허용창고·금지거래처·배송 캘린더의 정책 위치

1. 정할 것: 하드코딩 운영정책을 어떤 설정 단위로 둘지.
2. 레거시: `내일전표 Index.html:439` 허용창고 2개; `:476` 거래처코드 `8428102605`; `:536-538` 토요일 지방 +1일 추가.
3. 후보: (a) DB 정책+유효기간+공휴일 캘린더—정확, 관리 UI 필요; (b) 서비스 config—단순, 변경 배포 필요; (c) 하드코딩 유지—최저 비용, 추적·변경 취약.
4. **권고: (a)**. 창고 ID/partner ID는 내부 참조하되 화면에는 비즈니스 코드만 노출.

## 5. 자동 기본값으로 확정 가능한 항목

- 원장 산식은 `PartnerLedgerContract.fold`; 판매전표는 OUTBOUND; 전잔은 요청 시작일 전날까지 fold.
- 원장 표시 기본 `maxItems=20`, 미수 필터 `closing>0`, 단 금액 정본에는 0.5원 gate를 넣지 않음.
- 거래명세서 합계는 확정 공급가+확정 VAT, 채권 gate는 같은 기준일 closing>0.
- 세금계산서는 일반 `01`, 청구 `02`; 공급가/VAT 원천값이 없으면 임의 10% 역산하지 않음.
- 수수료 레거시 화면 기본 카드, 제경비 8%, 원천징수 적용; 산식 반올림은 항목별 대칭 HALF_UP.
- 일마감 문서일자 `2026-07-01` 포함 이후 인상 version, 사용자가 명시 override 가능; 멀티 검증 기본 OFF는 검증 생략 상태로 기록.
- 정액DC 미설정은 0; 정확 원 단위 세트 일치 허용오차 0원. 단 45% fallback은 결정 6 전까지 자동 확정하지 않음.
- 내일전표 수동 번호 목록이 없으면 전체; 미출목록·비/눈 미지정이면 관련 문구 없음.

---

## 6. 업무규칙 상세 — 전표정리리스트

### R1. 전표·금액 정규화

① `handleFile`, `runProcess` — `Index.html:383-435`, `:524-620`  
② 판매번호에 `-`가 있는 행만 사용하고 처음 두 조각을 날짜·번호로 쓴다. 금액은 쉼표 제거 후 숫자면 `parseInt`하여 천 단위 문자열, 아니면 원문. 출고창고 `삼성창고 (초월 무갑)`은 `초월창고`로 바꾼다. 전표수정내역이 `-` 또는 `숫자%`뿐이면 빈값으로 만든다.  
③ 금액은 **소수점 이하 절사**(`parseInt`, 음수는 0 방향 절사); 날짜 8자리→`YYYY-MM-DD`; 사용자 페이지 최대 5개.  
④ Google Sheet 없음. XLSX `판매번호, 거래처, 배송주소, 품목, 특이사항, 금액, 출고창고, 전표수정내역, 담당자명`.  
⑤ [부분] OUTBOUND slip/lines와 AccountingAuditLog가 있으나 이 도구의 표시 문자열 snapshot은 없다.  
⑥ [자동] 정본 금액은 decimal 그대로 유지하고 표시에서만 원 단위 형식화.  
⑦ 🔑 다름(반올림): 레거시는 이 화면에서 소수금액을 `parseInt` 절사한 문자열로 비교·저장한다.

### R2. 날짜·배송주소 이상 판정

① `runProcess` — `Index.html:564-618`  
② 주소에 `야적.../` 또는 `지방.../`가 있는데 적요에 상·하차 두 날짜가 없거나, 반대로 주소 토큰은 없는데 둘 다 있으면 highlight. 상차일이 전표일과 다르면 날짜오류. 지방 상차가 토요일이고 하차가 일요일이면 주말 경고.  
③ 정규식 상/하 날짜 `1~2자리`; 월 넘김은 상차일 `< actualDay-10`, 하차일 `<상차일 && <10`; 토요일 `6`, 일요일 `0`.  
④ `판매번호` 날짜, `배송주소`, `특이사항`.  
⑤ [불가: 주소 문자열 기반 상·하차 검증 필드 없음].  
⑥ [자동] 구조화 출고/도착예정일이 있으면 그것을 사용; 문자열 추론은 migration 보조.  
⑦ 🔑 다름(기준일/제외): 레거시 Date rollover 휴리스틱은 연·월 경계에서 실제 일정과 다를 수 있다.

### R3. 발송·수정·폐기 상태기계

① `renderTable`, `markCompleted`, `unmarkCompleted`, `remarkCompleted` — `Index.html:664-821`, `:996-1099`  
② 전표키 `date_num`별 최초 문자열을 `base`, 수정발송본을 `over`, 수정 이력을 `modHistory`로 보관한다. 현재 데이터가 사라지고 같은 업로드 날짜가 있으면 폐기, 다시 나타나면 restored. `over`와 전체 문자열이 같거나 `전표수정내역` 조각이 같으면 발송으로 본다. 수정횟수 1/2/3+를 별도 상태로 표시한다.  
③ 상태 리터럴 `unsent,sent,discard,restored,mod1,mod2,mod3`; 비교 문자열 구분자 `||`; 수정횟수 경계 `0,1,2,>=3`.  
④ R1의 8개 표시 속성 전부가 snapshot이며, 실제 발송 동작 자체는 없다.  
⑤ [부분] AccountingAuditLog가 변경 이력에 대응하지만 발송 snapshot/status는 없다.  
⑥ 🚩[결정 필요] 발송 상태를 실제 메시지 발송 이벤트로 둘지, 레거시 수동 체크 snapshot으로 둘지.  
⑦ 🔑 다름(상태): 레거시는 현재와 `전표수정내역` 문자열이 같으면 다른 금액·주소 변화가 있어도 발송으로 볼 수 있다.

### R4. 금액의 업무 영향

① `handleFile`, `runProcess`, `renderTable`  
② 금액은 합산·미수·여신 판정에 사용하지 않고 snapshot 비교·표시·수정감지 문자열의 한 조각으로만 사용한다.  
③ 별도 임계·요율 없음.  
④ `금액`.  
⑤ [있음: OUTBOUND 금액], [부분: 발송 snapshot 없음].  
⑥ [자동] 금액 변경은 구조화 decimal 비교로 audit event를 생성.  
⑦ 🔑 다름(금액): 표시 절사 때문에 1원 미만 변경은 레거시 수정감지에서 사라질 수 있다.

---

## 7. 업무규칙 상세 — 내일자 전표 이미지 생성

### N1. 창고·거래처 제외

① `processExcelData` — `Index.html:437-496`  
② 창고가 허용 목록에 없으면 제외. 거래처명이 금지 목록에 있거나 거래처코드가 하드코딩 예외이면 전표는 만들되 메시지를 `발송제한 업체입니다.`로 바꾼다.  
③ 허용창고 전부: `삼성창고 (초월 무갑)`, `상일물류`; 하드코딩 거래처코드 `8428102605`; 카톡방 이름에 `회계방` 포함 시 방 매핑 제거.  
④ XLSX `창고명, 거래처명, 거래처코드`; Notion 금지 거래처와 카톡방.  
⑤ [부분] warehouse/partner는 있으나 금지발송 정책·카톡방 속성은 없다.  
⑥ 🚩[결정 필요] 하드코딩 코드와 허용창고를 설정/정책 테이블로 옮길 위치.  
⑦ 🔑 다름(제외조건): 우리 활성 OUTBOUND 전체와 레거시 이미지 대상은 허용창고 gate 때문에 다르다.

### N2. 전표 그룹·수량

① `processExcelData`, `drawImage` — `Index.html:465-507`, `:697-923`  
② `일자-No.` 또는 `일자-번호`로 그룹화하고 수량은 `parseInt`; 그룹 총수량이 정확히 0이면 전체 제외. 이미지에는 행을 역순으로 그리고 총수량 합을 표시한다.  
③ 수량 소수 절사; invalid→0; 그룹 `totalQty===0` 제외; 양수·음수 상쇄도 제외.  
④ `일자-No., 일자, 번호, 품목명, 수량`.  
⑤ [있음: OUTBOUND/slip_lines], [부분: 이미지 snapshot 없음].  
⑥ [자동] 저장 수량을 사용하고 0그룹 제외.  
⑦ 🔑 다름(수량): quantity가 decimal이면 parseInt 절사, 음수 반품행과 양수행이 상쇄되면 이미지가 사라진다.

### N3. 수동 번호 필터와 중복

① `extractNum`, `checkDuplicates`, `processExcelData` — `Index.html:358-384`, `:441-447`, `:514-516`  
② 야적추가용 셀의 마지막 괄호 안 1~3자리 숫자를 전표번호 필터로 쓴다. 하나라도 있으면 그 번호만 처리하며 중복 번호는 표시 경고한다.  
③ 괄호 숫자 `1~3자리`; 500개 빈 입력행.  
④ 수동 pasted text와 전표번호.  
⑤ [불가: 사용자 임시 대상목록 schema 없음].  
⑥ [자동] 목록이 비면 전체, 있으면 allow-list.  
⑦ 🔑 다름(제외조건): 날짜 없이 번호만 비교하므로 서로 다른 날짜의 같은 번호가 함께 선택된다.

### N4. 하차 예정일

① `processExcelData` — `Index.html:525-580`  
② 일반 수동필터 모드는 전표일+1일. 자동 모드는 기본 주소면 전표일 당일을 “하차 예정 건”, 야적이면 +1일, 지방이면 +1일이며 전표일이 토요일이고 적요에 `일요일`이 없으면 지방만 +2일.  
③ `Date.getDay()==6`; 하루 `+1`; 토요일 지방 `+2`; 주소 regex `야적.*/`, `지방.*/`. 공휴일 처리는 없음.  
④ `일자`, `배송주소`, `특이사항`.  
⑤ [불가: 배송 캘린더/공휴일/주소 분류 정책 없음].  
⑥ 🚩[결정 필요] 공휴일·주말을 포함한 기준 캘린더와 “기본은 당일” 규칙.  
⑦ 🔑 다름(기준일): “내일자” 명칭과 달리 자동 기본 주소는 전표일 당일 문구다.

### N5. 미출품목·기상 문구

① `processExcelData` — `Index.html:582-615`  
② 수동 미출 모델 문자열이 품목명에 포함되면 중복 없는 품목명 목록을 안내문에 추가한다. 비/눈 체크는 상호배타이며 배송지연 문구를 추가한다.  
③ 모델 비교는 case-sensitive `includes`; 비가 우선(`if/else if`); 미출 입력 500행.  
④ `품목명`, 수동 미출목록, UI 비/눈.  
⑤ [부분] products는 있으나 재고 지연 상태·기상 snapshot은 없다.  
⑥ [자동] 수동 지정 없으면 미출 문구 없음.  
⑦ 🔑 다름(제외조건): 미출품목은 품목행을 제거하지 않고 문구만 추가한다.

---

## 8. 업무규칙 상세 — 일마감 프로그램

### D1. Google Sheet 가격표·구성품 읽기

① `money_to_int_` — `Code.js:153-158`; `loadSingleSetCatalog` — `:215-267`; `loadPriceMap_` — `:270-354`  
② 조건→결과:

| 시트/조건 | 결과 |
|---|---|
| `싱글 구성품<suffix>` 없음 | suffix 없는 `싱글 구성품` fallback |
| 구성품 가격 열 | 두 번째 `납품가`, 없으면 첫 번째, 그것도 식별 실패 시 index 8 |
| `구형` 포함 모든 시트 | 3행 header에서 `모델명/품명/출고가/납품가`; 출고가 없으면 납품가 |
| 홈멀티/상업멀티/상업멀티 구성/싱글 세트/싱글 구성품 | 각 지정 header row에서 모델·품명·출고가·납품가·고정DC 읽기 |
| 가격 `<=0` | map에 넣지 않음 |
| 같은 모델 중복 | 첫 객체 유지, 뒤 행은 양수 납품가만 보충 |

③ 리터럴: 원 단위 `Math.round`; 구성품 데이터 3행부터(index 2); 구형 header 3행/index 2, data index 3; 일반 시트 header row `3,3,1,3,2`; fallback price column index `8`.  
④ **Google Sheet 직접 읽음**: URL 상수 `SOURCE_SHEET_URL`; 시트 `싱글 구성품`, `홈멀티`, `상업멀티`, `상업멀티 구성`, `싱글 세트`, 이름에 `구형`; suffix `_단가인상`. 컬럼 `모델명, 세트/Set, 구분, 납품가, 품명, 출고가, 고정DC`.  
⑤ [부분] products/classification/bundle_component/quantity_sync_*가 품목·구성품 축을 가지지만, 가격표 버전·납품가·고정DC와 Google Sheet 행 우선순위는 제시된 스키마에 없다.  
⑥ 🚩[결정 필요] 가격표 정본과 버전 유효기간, 미등록 가격 처리.  
⑦ 🔑 다름(금액): 레거시는 원 단위 반올림한 첫 양수 가격과 이름 기반 fallback을 사용한다.

### D2. 가격 인상 기준일

① `processDailyData` — `Code.js:420-455`; `toggleBeforeHike` — `Index.html:235-259`  
② 업로드 앞 5행에서 첫 파싱 가능 `일자`를 찾는다. 사용자가 `인상 전 적용`을 켜지 않았고 날짜가 `2026-07-01` 이상이면 `_단가인상` 시트를 사용한다. 수동 ON이면 날짜와 무관하게 suffix 없음.  
③ 경계 리터럴: `20260701` **포함**; 탐색 5행; 날짜 숫자 앞 8자리.  
④ 업로드 XLSX `일자`; D1 시트명 suffix.  
⑤ [불가: 가격 유효기간/version schema 없음].  
⑥ [자동] 문서일자 기준 자동 선택, 수동 override는 감사로그와 함께.  
⑦ 🔑 다름(기준일): 첫 5행의 첫 유효일이 batch 전체 가격버전을 정한다. 여러 날짜 batch는 행별 가격이 아니다.

### D3. 품목 토큰·zone·구성품 분류

① `clean_item_name_`, `extractModelToken_`, `isTargetModelCode_`, `classifyComp` — `Code.js:161-212`; `processDailyData` — `:473-545`  
② 조건→결과:

| 패턴 | 결과 |
|---|---|
| `AM...` 7번째 문자 X/N | COMM_MULTI |
| `AJ...` 7번째 문자 X/N | HOME_MULTI |
| `AC/AP/AF/AR` target + 실내/실외/sub | SINGLE |
| `PC*` | PANEL |
| `AWR-/AR-` | REMOTE |
| AC/AP index 6 N/X | INDOOR/OUTDOOR |
| AR index 11 N/X/Q | INDOOR/OUTDOOR/SUB_INDOOR |
| AF index 11 N/X | INDOOR/OUTDOOR |
| 나머지 | MATERIAL 또는 현재 zone 유지 |

③ 토큰 prefix 전부: `AC, AP, AR, AF, AM, AJ, AXJ, PC, AWR, ARR`; 모델 토큰 최소 뒤 4자; 괄호 `[](){} ` 내용 제거.  
④ 업로드 `품목명`; 구성품 시트 `구분`의 `실내기/실외기/판넬/리모컨/자재`.  
⑤ [부분] product classification/bundle_component가 대응하나 레거시는 문자열 위치와 이전 행의 `currentZone`에 의존한다.  
⑥ [자동] 기존 구조화 classification을 우선하고 문자열 추론은 migration 검증용으로만 사용.  
⑦ 🔑 다름(제외/금액): 행 순서가 zone을 바꾸므로 같은 품목도 앞 행에 따라 다른 가격 map을 탈 수 있다.

### D4. 출고가·납품가·실제 할인율

① `loadPriceMap_`, `processDailyData` — `Code.js:519-562`  
② 구형 exact→액세서리 키워드→zone exact→UNKNOWN 모델 순으로 가격을 찾는다. 없으면 `{price:0, deliveryPrice:0, fixedDc:null}`. 납품가가 없으면 출고가. `할인율 = 1 - 단가(VAT포함)/출고가`, 출고가 0이면 0. `총계=단가×수량`.  
③ 액세서리 리터럴: `유연호스` + `1WAY/4WAY/I형`, `방진가대` + `소/중`; `AXJ`는 COMM_MULTI 검색; 숫자·수량 모두 `Math.round`; 수량 빈값 0.  
④ 업로드 `단가(VAT포함), 수량, 품목명`; 가격표 `출고가, 납품가, 고정DC`.  
⑤ [부분] products는 있으나 가격 정본과 partner별 할인은 없음.  
⑥ 🚩[결정 필요] 가격 미등록을 0으로 계속할지 처리 차단할지.  
⑦ 🔑 다름(금액): 레거시의 무가격 0 fallback은 할인율 0을 만들며 일부 후속 분기는 그대로 TRUE가 될 수 있다.

### D5. 멀티 할인율 검증

① `setMultiToggle` — `Index.html:261-267`; `processDailyData` — `Code.js:668-735`; `getDcClass` — `Index.html:981-985`  
② 조건→결과:

| 조건 | 기대값/확인 |
|---|---|
| 기본 `멀티 할인율 미적용` | 관련 품목 확인 TRUE |
| 고정DC 존재 | `round(fixedDc×100)` |
| COMM_MULTI, partner rate 없음 | `round((commRate || 0.45)×100)` = 45 |
| HOME_MULTI, partner rate 없음 | `round((homeRate || 0.45)×100)` = 45 |
| zone 불명 멀티 | 45 |
| 실제 `round(discountRate×100)` = 기대 정수 | 확인 TRUE |

③ 요율 리터럴: 기본 `45%`; 구형 `AM/NJ/NS/AVX`는 `50%`; 색상 경계 정확히 `45,46,47,48,49`; 비교는 퍼센트 정수 반올림이므로 실질 허용폭은 각 정수 주위 약 ±0.5%p.  
④ Notion 거래처 속성 `홈멀티DC, 상업멀티DC`; Google Sheet `고정DC`; 업로드 단가/출고가.  
⑤ [불가: partner-specific DC와 유효기간 필드 없음], [부분: product classification].  
⑥ 🚩[결정 필요] 45% 전역 fallback 및 partner/product override 우선순위의 저장 위치.  
⑦ 🔑 우리 구현 대응이 없어 직접 비교 불가. 정액DC 분류 우선순위(S>M>L, product override)와도 별개 축이다.

### D6. 싱글 세트 정액 할인·정확 일치

① `extractDiscountNumbers` — `Code.js:403-417`; `processDailyData` — `:568-659`  
② 실내기마다 구성품 수가 많은 세트부터 후보를 검사한다. 동일 실외기와 존재하는 옵션을 1개씩 매칭하고 `예상가=구성품 가격합-정액할인`; 실제는 매칭된 각 행 단가 합. `abs(실제)==abs(예상)`일 때만 전 구성품 used.  
③ 정액 분기 리터럴 전부:

| 세트명 조건 | partner 속성 |
|---|---|
| `AC`, index7=`6`, index8=`P` | `360` |
| `AC`, index7=`4`, index8=`P/D` | `4way` |
| `AC`, index7=`1`, index8=`P/D` | `1way` |
| `AP230*`, `AP290*`; 또는 AP index8=P; 또는 AP index10=C & index8=D | `스탠드` |
| AP index8=D & index10=H | `디럭스` |
| AC/AP index8=F | `1등급` |
| AR/AF로 시작하고 S로 끝남 | 정액할인 제외 |
| `할인제외 품목`이 구성품 raw 이름에 포함 | 정액할인 제외 |

할인액은 `abs`; 비교 허용오차 **0원**; 수량은 `abs(round(qty))`, 빈/0이면 1; 옵션은 실제 존재할 때만 예상가에 포함.  
④ Notion `360,4way,1way,스탠드,디럭스,1등급,할인제외 품목`; Google Sheet 구성품 `세트,모델명,구분,납품가`; 업로드 수량·단가.  
⑤ [부분] bundle_component/quantity_sync_*는 구성은 표현하지만 partner별 정액DC와 원 단위 세트 검증 결과는 없다.  
⑥ [자동] 명시된 partner 정액만 적용; 미설정 0.  
⑦ 🔑 다름(금액/구간): 우리 세트 전개는 설정 수량이 정본이다. 레거시는 행 수량만큼 1개 pool로 펼치며 구성품 필요수량 컬럼을 읽지 않고 정확 원 일치만 본다.

### D7. `확인` 판정의 예외 순서

① `processDailyData` — `Code.js:668-735`; `updateVal` — `Index.html:1339-1345`  
② 순서대로 첫 일치가 승리한다:

| 조건 | 확인 |
|---|---|
| 품목명 `운임` 또는 `절삭` | TRUE |
| 구형 + 멀티검증 OFF | TRUE |
| 구형 AM/NJ/NS/AVX + ON | 실제 할인 정수%=50 |
| 나머지 구형 + ON | 단가=납품가 |
| 유연호스/발통세트/일자발/방진가대/AXJ | OFF면 TRUE, ON이면 단가=납품가 |
| SINGLE 구성품이 세트 used | TRUE |
| SINGLE 부속, 주품목 세트 실패 | FALSE |
| SINGLE 부속, 주품목 자체 없음 | TRUE |
| SINGLE 실내/실외/sub | 해당 행 수량 pool 전부 used |
| MULTI | D5 |
| 그 외 | TRUE |

③ 비교는 금액 정확 일치 또는 정수 퍼센트 일치; 사용자가 TRUE/FALSE를 수동 변경할 수 있다.  
④ 품목명·모델분류·단가·납품가·구성품 매칭.  
⑤ [불가: 검증 결과/override 사유 구조 없음]. AccountingAuditLog는 변경 감사에 부분 대응 가능.  
⑥ [자동] 계산 결과와 수동 override를 분리 저장하고 override는 감사 필수.  
⑦ 🔑 다름(제외조건): 레거시는 “정책 미적용”을 TRUE로 취급하여 검증 통과와 검증 생략을 구분하지 않는다.

### D8. 마감 main/pre와 매출전표X

① `processDailyData` — `Code.js:444-468`, `:737-744`; `reclassifyTabs` — `Index.html:1930-1945`  
② 회계반영일자가 정확한 `YYYY/M/D` 또는 `YYYY-M-D`이면 `pre(선발행)`, 아니면 `main`. 특이사항 목록의 거래처코드가 있고 회계반영일자가 정규 날짜가 아니면 `매출전표X - <특이사항 날짜>`로 덮는다. 이 문자열은 main에 남는다.  
③ 날짜 regex는 월·일 1~2자리; 정확한 날짜 유효성(예: 2/31)은 검사하지 않음.  
④ 업로드 `회계반영일자, 거래처코드`; Notion 특이사항 `code,name,date`.  
⑤ [부분] accounting journal과 slip status가 있으나 이 문자열 상태와 선발행 tab 계약은 없다.  
⑥ 🚩[결정 필요] 마감 상태를 날짜 존재로 추론할지 명시 enum으로 둘지.  
⑦ 🔑 다름(상태): 레거시는 날짜 모양 문자열이 상태이며 실제 분개 존재 여부를 확인하지 않는다.

### D9. 사용자가 단가/할인율/출고가를 수정할 때 VAT

① `formatNum`, `formatInput`, `recalcRow` — `Index.html:971-979`, `:1203-1253`  
② 할인율 수정 시 `단가=round(출고가×(1-rate))`; 이후 `합계=단가×수량`, `공급가액=round(단가/1.1)`, `VAT=단가-공급가액`, `총계=단가×수량`. 단가/출고가 입력은 음수 부호를 제거한다.  
③ 원 단위 `Math.round`; rate 입력은 음수·소수 허용; 금액 입력은 `[0-9]`만; divisor `1.1`.  
④ 화면 편집 `단가(VAT포함), 출고가, 할인율`; 저장행 `수량`.  
⑤ [부분] slip_lines 금액과 수량은 있으나 이 편집 계산 경로와 감사 연결은 제시되지 않았다.  
⑥ 🚩[결정 필요] 공급가/VAT가 단위금액인지 행금액인지 결정 필요.  
⑦ 🔑 다름(금액): 수량>1이어도 공급가와 VAT에는 수량을 곱하지 않지만 합계에는 곱한다. `공급가+VAT=단가`, `합계=단가×수량`이라 한 행 내부가 불일치한다.

### D10. 합계·export

① `renderTable`, `updateFooterSums`, `exportToExcel` — `Index.html:1020-1201`, `:1255-1326`, `:1716-1871`  
② 화면 필터 후 수량·단가·공급가·VAT·합계를 단순 합산한다. 전표 소계도 동일하며 출고가·총계도 단순합. Excel export 직전 필터를 전부 제거하므로 **전체 행**을 내보낸다. 할인율은 정수% 화면값을 100으로 나눠 Excel `0%`로 저장한다.  
③ 할인색 `45~49`; 숫자 format `#,##0`; export 탭 main/pre/sum과 특이사항; 파일명은 실행일.  
④ FINAL_HEADERS 17개 전부: `DC,일자,번호,창고명,품목명,수량,단가(VAT포함),공급가액,부가세,합계,거래처명,거래처코드,출고가,할인율,총계,확인,회계반영일자`.  
⑤ [부분] OUTBOUND·lines·accounting audit. 일마감 snapshot/export 모델 없음.  
⑥ [자동] 합계는 행 저장값의 합; 필터는 표시 전용임을 명시해야 한다.  
⑦ 🔑 다름 가능(금액/제외): D9의 행 불일치와 숨긴 행 재포함 때문에 화면 인식과 export 총액이 달라질 수 있다.

---

## 9. 업무규칙 상세 — 거래처별 일괄 거래명세서 생성

### S1. 원 단위 입력과 금액 구성

① `toNum`, `fmtAmt`, `numToKorean` — `Index.html:351-392`; `processLocalData` — `:780-800`, `:824-835`; `drawInvoiceCanvas` — `:1182-1185`, `:1210-1255`  
② 조건→결과:

| 입력/조건 | 결과 |
|---|---|
| 수량·단가·공급가·VAT | 각 셀을 `Math.round`하여 정수화 |
| 전표 합계 | `Σ공급가 + ΣVAT` |
| 표시 | `parseInt` 후 천 단위; 한글 금액은 `floor(total)` |
| 품목행 | 입력의 단가(VAT포함), 공급가, VAT를 그대로 각각 표시 |

③ 리터럴: 원 단위 `Math.round`; 한글 단위 `십/백/천/만/억/조/경`; 금액 문구 `금액: <한글> 정`; 최종 `원`; 통장문구의 계좌번호는 출력 상수이나 금액 산식에는 미사용.  
④ Google Sheet 없음. 판매 XLSX `일자/번호/거래처코드/거래처명/배송주소/수량/공급가액·합계·금액/부가세/단가(VAT포함)·단가/품목명/인수자 번호`.  
⑤ [부분] `slips(OUTBOUND)`·`slip_lines`가 품목·수량·line amount를 보유하지만 거래명세서 snapshot/문서 모델은 제시된 대응에 없다.  
⑥ [자동] 합계는 저장된 공급가+VAT.  
⑦ 🔑 다름 가능(반올림): 레거시는 각 입력 셀을 먼저 반올림한 합이다. 우리 line amount가 소수 단가×수량 후 다른 단계에서 반올림되면 합계가 달라진다.

### S2. 채권 양수 거래처만 명세서 대상

① `processLocalData` — `Index.html:690-708`, `:737-753`; `isExcludedByWord` — `:885-890`  
② 채권 잔액 `>0`이고 적요 필터에 걸리지 않은 거래처만 `bondMap`에 들어간다. 판매행은 코드 우선, 이름 정규화 fallback으로 이 map과 매칭되어야 명세서가 생성된다.  
③ 경계: `balance <= 0` 제외; 필터 기본 ON; 이름 키는 공백 제거+소문자.  
④ 채권 XLSX `거래처코드·거래처명·잔액·적요·전화/연락처·사업자주소/주소1/주소`.  
⑤ [부분] accounting 원장으로 미수를 계산할 수 있으나 이 도구는 업로드한 현재 채권잔액을 문서 대상 gate로만 사용하고 명세서 금액에는 넣지 않는다.  
⑥ [자동] `closingBalance > 0`를 미수 gate로 쓰되 문서 자체는 OUTBOUND 전표에서 생성.  
⑦ 🔑 다름(기준일): 레거시 채권 파일 스냅샷 시점과 판매전표 일자가 불일치할 수 있다.

### S3. 일자·배송 분류 선택

① `parseAnyDate`, `extractAndRenderDates` — `Index.html:416-434`, `:503-581`; `processLocalData` — `:710-735`  
② 각 판매 일자마다 `기본/야적/지방/경동/로젠/자가/직배` 체크를 만든다. 기본만 최초 체크된다. 배송주소는 순서대로 `지방/`, `야적/`, `경동/`, `로젠/`, `직배/`, `자가`를 판정하며 선택되지 않은 분류는 제외한다.  
③ 리터럴: Excel serial `>20000`, epoch `25569`, 하루 `86400*1000`; 분류 7개; 우선순위는 위 조건 순서.  
④ 판매 `일자·배송주소`.  
⑤ [부분] slips의 출고일·주소는 있으나 이 주소 문자열 분류 정책은 제시된 스키마에 없다.  
⑥ [자동] `기본=true`, 나머지 false는 레거시 화면 기본.  
⑦ 🔑 다름(제외조건): 우리 OUTBOUND 전체 조회는 주소 토큰 선택에 의해 자동 제외되지 않는다.

### S4. 전표 그룹과 출력 합계

① `processLocalData` — `Index.html:737-837`; `drawInvoiceCanvas` — `:981-1266`  
② 그룹키는 `date.getTime + 번호 + 거래처키`; 같은 그룹의 품목을 모아 `sum_qty`, `sum_supply`, `sum_vat`, `sum_up`을 더한다. 표의 `품목수`는 `sum_qty`가 아니라 `lines.length`; 인쇄 합계금액은 `sum_supply+sum_vat`.  
③ 전표번호는 `- 숫자` 우선, 아니면 숫자변환; 수신번호 우선순위 `채권 적요 전화 > 채권 전화 > 인수자 번호 > "번호없음"`.  
④ S1/S2 컬럼과 Notion 카톡방 매핑.  
⑤ [부분] slip header/lines로 그룹은 가능. 수신채널·인쇄 snapshot 부재.  
⑥ [자동] 전표 식별자는 사용자 공개 슬립번호, 내부 UUID 비공개.  
⑦ 🔑 다름(금액): `sum_up`은 계산하지만 합계에 쓰지 않는다. 전표 총액은 오직 공급가+VAT다.

### S5. 필터와 강제 거래처코드

① `validateExcelFormat`, `isExcludedByWord`, `processLocalData` — `Index.html:472-500`, `:803-817`, `:885-890`  
② 채권 적요 필터단어 포함 시 제외. 거래처코드 목록이 비어 있지 않으면 그 목록에 없는 전표를 제외한다. 판매·채권 파일 둘 다 없으면 실행 불가.  
③ 거래처코드 입력행 초기화 500개; 필터 기본 ON; 코드 숫자만.  
④ 거래처코드·적요.  
⑤ [불가: 사용자별 명세서 대상·필터 설정 저장 위치가 제시된 스키마에 없음].  
⑥ [자동] 필터가 없으면 전체 양수 미수 거래처.  
⑦ 🔑 다름(제외조건): 우리 스키마의 활성 OUTBOUND 403건이라는 사실만으로 레거시 명세서 생성 대상 수를 재현할 수 없다.

---

## 10. 업무규칙 상세 — 계산서일괄등록양식 생성

### T1. 입력행·마감 상태 gate

① `handleFile` — `Index.html:315-332`; `setFilterToggle`, `runProcess` — `:306-312`, `:358-388`  
② 조건→결과:

| 조건 | 결과 |
|---|---|
| `전표번호/거래처코드/일자`가 모두 없음 | 입력 제외 |
| 거래처명 또는 전표번호에 `합계` | 입력 제외 |
| 기본 `excludeEmptyDate=true`이고 `회계반영일자/회계반영여부` 빈값 | 계산서 제외 |
| 사용자가 `모든 전표 포함` 선택 | 위 빈값 gate 해제 |

③ Excel 첫 시트, `range:1`; 기본값 `true`; 토글 두 값.  
④ Google Sheet 없음. 판매조회 XLSX `전표번호, 거래처코드, 일자, 회계반영일자/회계반영여부`.  
⑤ [부분] slip status·회계 journal은 있으나 `회계반영일자`를 OUTBOUND의 계산서 발급 gate로 쓰는 계약은 제시된 스키마에 없다.  
⑥ [자동] 레거시 호환 화면 기본은 회계반영일자 있는 전표만.  
⑦ 🔑 다름(상태/제외): 우리 원장 canonical sale status와 레거시의 “회계반영일자 존재”는 서로 다른 상태축이다.

### T2. 작성일자 fallback

① `runProcess` — `Index.html:365-391`  
② 첫 번째로 정규식에 맞는 원본 `일자`를 `validDateFallback`에 저장하고 **이후 모든 행**에 같은 `YYYYMMDD`를 쓴다. 아직 못 찾았으면 실행일 UTC ISO 날짜를 쓴다. 품목 일자는 그 날짜의 마지막 2자리다.  
③ 날짜 정규식 `YYYY[-/.]MM[-/.]DD`; 출력 `YYYYMMDD`; fallback `new Date().toISOString()`(UTC).  
④ `일자`.  
⑤ [부분] slip별 일자는 있으나 batch 공통 작성일자 정책/세금계산서 엔티티는 없다.  
⑥ 🚩[결정 필요] 행별 전표일자를 쓸지, batch 대표일자를 쓸지 자동 결정 불가.  
⑦ 🔑 다름(기준일): 서로 다른 날짜 전표를 한 파일에 넣으면 레거시는 첫 유효일로 통일한다.

### T3. 공급가·VAT·합계 구성

① `runProcess` — `Index.html:398-432`; `exportToExcel` — `:824-846`  
② 공급가액과 품목1 공급가액은 `공급가액합계` 우선, 없으면 `공급가액`, 없으면 0. 세액과 품목1 세액은 `부가세합계` 우선, 없으면 `부가세`, 없으면 0. **합계 재계산·VAT 10% 계산·반올림은 하지 않는다.** 숫자열은 내보낼 때 `Number` 변환과 `#,##0` 서식만 적용한다.  
③ 일반 계산서 종류 `01`; 청구 `02`; 공급가/세액의 zero fallback `0`; 한 파일 최대 100행 chunk. 안내문에는 발급 최대 10건이라고 별도 기재.  
④ `공급가액합계/공급가액`, `부가세합계/부가세`, `품목명`. 수량·단가는 품목1에 채우지 않는다.  
⑤ [불가: 세금계산서 header/line/발급상태 스키마가 제시된 대응에 없음]. slip_lines로 원천 금액은 가능하나 발급 snapshot은 없다.  
⑥ [자동] 원천에 확정된 공급가·VAT가 있으면 그대로; 없다고 10% 역산하지 않는다.  
⑦ 🔑 다름(금액/반올림): 레거시는 원천 합계 열을 신뢰한다. 우리 쪽에서 VAT를 재산출하면 1원 차이와 수정전표 차이를 만들 수 있다.

### T4. 공급자·공급받는자·청구 속성

① `cleanCustomerName`, `runProcess` — `Index.html:346-354`, `:402-427`  
② 일반(01), 청구(02) 고정. 공급받는자 등록번호에 숫자만 남긴 `거래처코드`를 넣고, 상호는 괄호(단 `(주)` 제외)·하이픈 뒤·별표·앞 기호를 제거한다.  
③ 공급자 고정값: 등록번호 `2148720659`, 상호 `（주）삼한공조시스템`, 성명 `김미선`, 업태 `도소매`, 종목 `가전제품`; 계산서 종류 `01`; 영수/청구 `02`.  
④ 거래처 `거래처코드, 거래처명, 대표이사, 주소1, 업태, 종목, Email, *mail*2, 배송주소`.  
⑤ [부분] partner-service 7,253 master가 있으나 레거시 `거래처코드=등록번호` 가정은 보장되지 않는다.  
⑥ 🚩[결정 필요] 공급받는자 식별자는 partner business registration number를 쓸지 원본 거래처코드를 유지할지 결정 필요.  
⑦ 🔑 다름(식별축): 코드가 내부 거래처코드이면 세금계산서 등록번호가 잘못된다.

### T5. 전표번호 예외와 화면 필터

① `renderTableData`, `applyExceptionRealtime`, `exportToExcel` — `Index.html:470-530`, `:593-600`, `:738-758`  
② 전표번호는 `- 숫자` 또는 전체 숫자 추출. 예외코드에 일치하면 화면과 export에서 제외한다. 반면 통합검색·열 필터는 화면만 바꾸고 export에는 반영되지 않는다. export는 예외코드만 다시 적용한다.  
③ 예외 입력행 기본 300; export chunk 100.  
④ 전표번호와 사용자 저장 예외코드.  
⑤ [불가: 계산서 발급 제외 사유·정책 스키마 없음].  
⑥ [자동] 예외코드는 사용자 명시 목록만 적용.  
⑦ 🔑 다름(제외조건): 화면에서 숨긴 행이 예외코드가 아니면 실제 export에는 다시 포함된다.

---

## 11. 업무규칙 상세 — 영업수수료 계산

### C1. 기본값과 입력 정규화

① `setPay`, `setWht`, `setExp`, `getExpenseRate`, `parseNum`, `resetForm`, `restoreState` — `Index.html:261-309`, `:429-437`, `:523-545`  
② 기본은 카드결제, 제경비 8%, 원천징수 적용. 수기 제경비는 입력 백분율÷100이며 상·하한 검증이 없다. 복원 데이터가 옛 형식이면 `expenseRate != 0.08`을 수기로 간주한다.  
③ 리터럴: 카드 3%, 제경비 기본 8%, 원천징수 3.3%, 설치비 8%, VAT divisor 1.1; 입력 invalid→0.  
④ Google Sheet 없음. 수기 입력 `총 결제금액, 장비대, 선지급, 설치비, 산업안전관리비, 제경비율`.  
⑤ [불가: 수수료 계약·요율표·정산 엔티티가 제시된 스키마에 없음].  
⑥ [자동] 레거시 화면 기본 카드/8%/원천징수 적용.  
⑦ 🔑 우리 구현 대응이 없어 결과 비교 불가.

### C2. 공제 산식과 반올림

① `xround`, `getValues` — `Index.html:317-355`  
② 조건→결과 및 전체 산식:

| 항목 | 산식 |
|---|---|
| 카드 수수료 | 카드면 `xround(-총액×0.03)`, 현금이면 0 |
| 총 영업수수료 | `총액 - 장비대 + 카드수수료` |
| 제경비 | `xround(총영업수수료×-제경비율)` |
| 원천징수 | 적용이면 `xround(총영업수수료×-0.033)`, 아니면 0 |
| 설치비 공제 | `xround(설치비×-0.08)` |
| 안전관리비 | 입력액의 음수 |
| 소계 | 총영업수수료+제경비+원천징수+설치비공제+안전관리비공제 |
| 차인지급액 | 소계-선지급 |
| 계산서 공급가 | `xround(소계/1.1)` |
| VAT | `소계-공급가` |

③ `xround(n) = sign(n) × Math.round(abs(n))`; 즉 음수도 절댓값 0.5 이상을 0에서 멀어지는 방향으로 반올림한다. 모든 공제는 **각 항목별 먼저 원 단위 반올림** 후 합산한다. 구간표는 없고 수기 제경비율은 무제한 연속값이다.  
④ C1 입력.  
⑤ [불가] 대응 엔티티/서비스 없음.  
⑥ [자동] 이식 시 `RoundingMode.HALF_UP`을 절댓값에 적용한 대칭 반올림으로 명시.  
⑦ 🔑 다름 가능(반올림): Java/DB의 음수 `HALF_UP`, `HALF_EVEN`, 최종합계 1회 반올림 중 무엇을 쓰느냐에 따라 달라진다. 레거시는 항목별 대칭 반올림이다.

### C3. 세금계산서 금액과 지급액의 차이

① `getValues`, `recalc`, `renderDoc` — `Index.html:323-420`  
② 매입계산서 합계는 **소계**, 실제 차인지급액은 `소계-선지급`. 따라서 선지급 수수료는 계산서 공급가/VAT 분할에 영향을 주지 않는다.  
③ VAT 10%를 표현하는 divisor `1.1`; 공급가만 반올림하고 VAT는 잔액.  
④ 수기 선지급액.  
⑤ [불가] 계산서·commission settlement 스키마 없음.  
⑥ [자동] 레거시 호환이면 선지급은 지급액에만 반영.  
⑦ 🔑 다름(금액): 선지급을 과세표준에서 빼는 구현은 레거시와 다르다.

### C4. 요율 경계·검증 부재

① `getExpenseRate`, `parseNum`, `getValues` — `Index.html:297-355`  
② 수기 `%`는 음수·100 초과도 계산 가능하고, 총액·장비대·설치비 등도 음수를 허용한다. 카드/원천/설치 요율은 금액 구간과 무관한 단일 정률이다.  
③ 구간 경계 없음; 유일한 분기값은 결제방식, 원천징수 적용 여부, 제경비 기본/수기.  
④ C1 입력.  
⑤ [불가] validation contract 없음.  
⑥ 🚩[결정 필요] 수기 제경비율과 음수 입력의 허용 범위는 레거시만으로 안전한 기본을 정할 수 없다.  
⑦ 🔑 우리 구현 없음.

---

## 12. 업무규칙 상세 — 거래처별 원장생성 프로그램

### L1. 입력 컬럼 탐색·금액 정규화

① `sStr`, `normCode`, `toNum`, `fmtAmt`, `findCol` — `Index.html:360-395`; `validateExcelFormat` — `:469-505`; `formatDf`, `formatReceipt` — `:803-841`  
② 조건→결과:

| 조건 | 결과 |
|---|---|
| 숫자값·숫자 문자열 | 쉼표·통화기호를 제거해 JS `Number`로 사용 |
| null/빈칸/NaN | `0.0` |
| 표시 금액 | `Math.round`로 원 단위 반올림; 절댓값 `<0.5`면 빈칸 |
| 수금 원본의 행에 `합계` 또는 `총계` 포함 | 해당 행 제외 |
| 헤더 후보가 여러 개 | 후보 배열 순서, 그다음 실제 헤더 왼쪽 순서로 첫 `includes` 일치 |

③ 리터럴: 반올림 1원; 0 표시 경계 `0.5`; 수금 헤더 탐색 상한 20행; 업로드 형식 검사 상한 30행. 판매금액 후보 `합계/총액/금액/판매금액/전표금액/공급가액`, 수금 `금액/수금금액/입금액/수납금액`, 기초 `기초채권/이월잔액/전월잔액`.  
④ Google Sheet 직접 읽기 없음. 브라우저 XLSX의 판매 `판매번호·전표번호·일자-No(.), 거래처코드/ID, 거래처명, 배송주소, 금액 후보`; 수금 `일자-No·전표번호·영수번호, 거래처코드, 금액 후보`; 채권 `거래처코드·거래처명·기초채권·잔액·적요·전화`; 계정별원장 `전표번호·거래처코드·적요·차변·대변`.  
⑤ [부분] `slips(OUTBOUND)`·`slip_lines`와 accounting read model은 정형 컬럼이 있으나 레거시의 다중 헤더 별칭·파일 형식 판별은 없다.  
⑥ [자동] 저장 금액은 스키마 decimal 값을 그대로 사용하고, 표시에서만 원 단위 포맷. 근거: `PartnerLedgerContract.fold`는 `BigDecimal` 합산이다.  
⑦ 🔑 다름(금액): 레거시는 `합계`보다 `공급가액`이 실제 왼쪽에 있거나 후보 탐색 결과가 먼저 잡히면 VAT 제외 금액을 판매로 넣을 수 있다. 우리 정본은 판매·SALE_SUMMARY가 VAT 포함 문서금액이어야 한다(`PartnerLedgerContract.java:93-120`).

### L2. 전표일자·기간 결정

① `parseNoToDate` — `Index.html:398-423`; `parseDateCol`, `parseDateColReceipt` — `:843-888`; `processLocalData` — `:606-638`  
② 조건→결과:

| 조건 | 결과 |
|---|---|
| 채권 파일 첫 3행에서 날짜 2개 발견 | 작은 날짜~큰 날짜를 포함 범위로 사용 |
| 날짜 2개 없음 | 실행일 기준 전월 1일 00:00:00~오늘 23:59:59.999 |
| `YYYY-M-D - slip` 파싱 성공 | 해당 날짜·끝 토큰을 사용 |
| 날짜만 찾고 번호 없음 | 끝의 1~6자리, 그것도 없으면 전표번호 `"1"` |
| 판매·수금 일자가 범위 밖/파싱 실패 | 원장 movement에서 제외 |

③ 리터럴: 채권 상단 3행; 전월 1일; 종료 23:59:59.999; 전표번호 fallback `1`; 날짜 범위 양끝 포함.  
④ L1의 전표번호·일자 컬럼과 채권 파일 상단 자유 텍스트.  
⑤ [있음: `accounting-service /accounting/journals/sales-slip-ledger`] 명시적 `from/to`와 `transactionDate`, 판매일자를 사용하며 시작 전일까지 fold해 전잔을 만든다(`PartnerLedgerReadModelService.java:383-420`).  
⑥ [자동] API 요청 `from/to`; 기본 화면값이 필요하면 전월 1일~오늘을 레거시 호환 기본으로 둘 수 있으나 fold 계약의 일부로 넣지 않는다.  
⑦ 🔑 다름(기준일): 레거시는 업로드 채권 파일에 적힌 기간이 우선이고 로컬 시간 객체를 사용한다. 우리 구현은 명시적 `LocalDate`와 저장 문서일자를 사용한다.

### L3. 판매·수금·조정 movement

① `parseAccountLedger` — `Index.html:890-945`; `processLocalData` — `:693-711`  
② 조건→결과:

| 원천 | 조건 | sale 증가 | receipt 증가 |
|---|---|---:|---:|
| 판매현황 | 범위 내 | 판매 금액 | 0 |
| 수금현황 | 범위 내 | 0 | 수금 금액 |
| 계정 9199 | 범위 내 | 대변 | 0 |
| 계정 9549 | 범위 내 | 0 | 차변 |
| 계정 1089 | 범위 내 | 차변 | 대변 |
| 그 외 계정 | 모두 | 0 | 0 |

③ 계정코드 리터럴 전부: `1089`, `9199`, `9549`; 원장 구간 종료 표식 `합계`, `누계`, 다음 `계정별원장`; 헤더 탐색은 계정 표식 뒤 10행.  
④ 계정별원장 `전표번호·거래처코드·적요·차변·대변`.  
⑤ [부분] 우리 구현은 chart 정본의 receivable/revenue/payable 계정과 `Effect.SALE/PAYMENT/ADJUSTMENT/NONE`으로 일반화하며 `JOURNAL_ONLY`는 fold에 미반영한다. 레거시 3개 코드의 방향 자체는 collection contract가 계정 분류를 통해 흡수할 수 있지만 코드 고정 특례와 1:1은 아니다.  
⑥ [자동] chart-of-account 분류와 `Effect`를 사용.  
⑦ 🔑 다름(금액/제외): 레거시는 9199·9549·1089를 판매/수금에 직접 합산한다. 우리 fold는 `ADJUSTMENT`를 별도 합산하고 `JOURNAL_ONLY`는 합계에서 제외한다.

### L4. 전잔·후잔과 행 절단

① `processLocalData` — `Index.html:674-745`  
② 조건→결과:

| 단계 | 산식/결과 |
|---|---|
| 최초 전잔 | 채권 파일에서 해당 거래처의 **첫 행** `기초채권`, 없으면 0 |
| 기간 movement | 날짜·전표번호 순, 같은 날짜면 판매/수금(`ord=0`)이 조정분개(`ord=2`)보다 먼저 |
| 행 수 `> maxItems` | 오래된 초과 행을 숨기고 `carryBase += sale - receipt` |
| 각 행 후잔 | 직전 잔액 `+ sale - receipt` |
| 최종 후잔 | `carryBase + Σ표시판매 - Σ표시수금` |

③ 리터럴: 기본 `maxItems=20`; 행 순서 `ord 0/2`; 금액 없음 판정 `<0.5`; 잔액만 보기에서 `curBal <= 0.5` 제외.  
④ 채권 `기초채권`; 판매·수금·계정별원장 movement. 채권의 `잔액/현재잔액/미수잔액`은 형식 검사에는 쓰지만 산식에는 쓰지 않는다.  
⑤ [있음: `PartnerLedgerContract.fold`] `closing = opening + sales + adjustments - payments` (`PartnerLedgerContract.java:99-120`).  
⑥ [자동] 전잔은 `from-1`까지 정본 fold, 후잔은 계약 fold. `maxItems=20`은 화면 페이지 기본만 이식 가능.  
⑦ 🔑 기본 산식은 동일. 다름(금액/기준일): 레거시는 외부 파일 첫 `기초채권`, 부동소수점, 0.5원 임계값을 사용하고 우리 구현은 전체 이력 BigDecimal 전잔·별도 adjustment를 사용한다.

### L5. 미수·대상 거래처·제외조건

① `isExcludedByName`, `isExcludedByWord` — `Index.html:947-957`; `processLocalData` — `:659-690`, `:713-759`  
② 조건→결과:

| 조건 | 결과 |
|---|---|
| 수동 거래처코드 목록이 비지 않음 | 목록 포함 코드만 처리; 이후 이름/단어 제외를 우회 |
| 수동 강제 아님 + 거래처명이 `chatMapData` key | 제외 |
| 수동 강제 아님 + 필터 ON + 채권 적요에 필터단어 | 제외 |
| movement 없음 + `abs(기초)<0.5` | 제외 |
| `잔액 있는 거래처만` 기본 TRUE + 후잔 `<=0.5` | 제외(0과 음수 포함) |
| 강제 아님 + 카톡방도 입금 전화번호도 없음 | 제외 |

③ 리터럴: 거래처코드 입력행 기본 300개; 필터 기본 ON; 잔액만 기본 TRUE; 임계 `0.5`; 전화는 `010` 11자리; 적요 전화 탐색 접두 `입금`.  
④ 채권 `거래처명·거래처코드·적요·전화`, Notion 카톡방 매핑과 필터단어.  
⑤ [부분] partner-service master와 원장 잔액은 있으나 카톡방·입금연락처·임의 적요 필터가 원장 cohort 계약에는 없다. 우리 `isActive`는 soft-delete만 제외하고 `SUSPENDED`도 과거 원장에 포함한다(`PartnerLedgerReadModelService.java:493-496`).  
⑥ [자동] 원장 데이터 자체는 잔액 부호와 무관하게 유지; UI `미수만` 필터는 `closingBalance > 0`.  
⑦ 🔑 다름(제외조건): 우리 원장은 채널 정보가 없다는 이유로 거래처를 버리지 않는다. 레거시는 카톡방 key가 있으면 먼저 제외하면서 뒤에서는 카톡방/전화가 없으면 또 제외해, 수동 강제가 아니면 대상 집합이 매우 좁다.

### L6. 원장 정본 대조 결론

① `PartnerLedgerContract.fold` — `shared/common/.../PartnerLedgerContract.java:99-120`; 레거시 `processLocalData` — `Index.html:724-770`  
② `우리 closing = opening + sale + adjustment - payment`; `legacy closing = uploadedBase + sale(including 9199/1089 debit) - receipt(including 9549/1089 credit)`.  
③ 우리 판매 상태 리터럴: `CONFIRMED, DELIVERED, COMPLETED, INSPECTING, SHIPPING` (`PartnerLedgerContract.java:15-18`). 판매전표의 실제 `slip_type`은 **OUTBOUND**이며 `SALES` 값은 없다.  
④ 우리 입력축: OUTBOUND slips/lines, CONFIRMED cash receipt, journal lines, partner master.  
⑤ [있음] fold 정본·조회 endpoint·감사축 `AccountingAuditLog`; [부분] 레거시 외부 연락채널/필터 설정.  
⑥ [자동] 우리 fold를 유지한다. 외부 파일 `기초채권`으로 정본을 덮지 않는다.  
⑦ 🔑 결과는 adjustment 분류, 판매금액 VAT 포함 여부, 기간 전잔 출처, 0.5원 임계, 대상 제외조건에서 달라질 수 있다.

---

## 13. 386개 전수 분류 명세

아래 목록은 같은 이름의 중첩 함수도 inventory 한 건으로 센다. 괄호 안 숫자는 해당 목록의 개수이며 프로젝트별 표의 숫자와 일치한다.

### 13.1 거래처별 원장생성 프로그램 — 65

- 업무규칙(18): `sStr`, `normCode`, `toNum`, `fmtAmt`, `findCol`, `parseNoToDate`, `normPhone`, `validateExcelFormat`, `processLocalData`, `extractSheetData`, `extractReceiptData`, `formatDf`, `formatReceipt`, `parseDateCol`, `parseDateColReceipt`, `parseAccountLedger`, `isExcludedByName`, `isExcludedByWord`
- UI(32): `onload`, `checkAutoRestore`, `loadInitialData`, `initSortable`, `switchTab`, `handleFileSelect`, `assignFiles`, `check`, `initDragAndDrop`, `startProcessing`, `readExcel`, `addFilterRow`, `removeFilterRow`, `saveFilterData`, `loadFilterData`, `addClientCodeRow`, `removeClientCodeRow`, `resetClientCodes`, `saveClientCodeData`, `loadClientCodeData`, `drawCanvas`, `drawTextClipped`, `renderTable`, `dataURItoBlob`, `copyCanvas`, `saveCanvas`, `copyTextToClipboard`, `getSelectedText`, `initHistoryDates`, `f`, `loadHistory`, `restoreHistory`
- 인프라(15): `doGet`, `getUserAuth`, `getTitle`, `getSelect`, `getChatMapData`, `saveFilterWordsToNotion`, `getFilterWordsFromNotion`, `saveClientCodesToNotion`, `getClientCodesFromNotion`, `compressString`, `decompressString`, `autoSaveResultToNotion`, `getHistoryFromNotion`, `getSpecificHistory`, `getLatestHistoryFromNotion`
- dead_code(0): 없음

### 13.2 거래처별 일괄 거래명세서 생성 — 64

- 업무규칙(15): `sStr`, `normCode`, `toNum`, `fmtAmt`, `numToKorean`, `normPhone`, `findCol`, `parseAnyDate`, `validateExcelFormat`, `extractAndRenderDates`, `processLocalData`, `extractSheetData`, `formatDf`, `isExcludedByWord`, `drawInvoiceCanvas`
- UI(34): `onload`, `checkAutoRestore`, `loadInitialData`, `initSortable`, `switchTab`, `handleFileSelect`, `assignFiles`, `check`, `initDragAndDrop`, `startProcessing`, `readExcel`, `addClientCodeRow`, `removeClientCodeRow`, `resetClientCodes`, `saveClientCodeData`, `loadClientCodeData`, `addFilterRow`, `removeFilterRow`, `saveFilterData`, `loadFilterData`, `renderTable`, `dataURItoBlob`, `copyCanvas`, `saveCanvas`, `copyTextToClipboard`, `getSelectedText`, `manualSaveResult`, `initHistoryDates`, `f`, `loadHistory`, `restoreHistory`, `drawCenter`, `drawLeftC`, `drawRightC`
- 인프라(15): `doGet`, `getUserAuth`, `getTitle`, `getSelect`, `getChatMapData`, `saveFilterWordsToNotion`, `getFilterWordsFromNotion`, `saveClientCodesToNotion`, `getClientCodesFromNotion`, `compressString`, `decompressString`, `autoSaveResultToNotion`, `getHistoryFromNotion`, `getSpecificHistory`, `getLatestHistoryFromNotion`
- dead_code(0): 없음

### 13.3 계산서일괄등록양식 생성 — 43

- 업무규칙(7): `setFilterToggle`, `handleFile`, `cleanCustomerName`, `runProcess`, `renderTableData`, `applyExceptionRealtime`, `exportToExcel`
- UI(24): `saveState`, `undo`, `redo`, `onload`, `initSortable`, `switchTab`, `renderHeaders`, `openPopup`, `applyFilterRealtime`, `applyEmptyFilter`, `clearFilter`, `clearAllFilters`, `applyGlobalSearch`, `addExceptionRow`, `resetExceptionData`, `saveExceptionData`, `loadExceptionData`, `saveToNotion`, `initHistoryDates`, `loadHistory`, `restoreHistory`, `checkAutoRestore`, `showLoading`, `hideLoading`
- 인프라(12): `doGet`, `getUserAuth`, `getTitle`, `getSelect`, `saveExceptionCodesToNotion`, `getExceptionCodesFromNotion`, `compressString`, `decompressString`, `autoSaveResultToNotion`, `getHistoryFromNotion`, `getSpecificHistory`, `getLatestHistoryFromNotion`
- dead_code(0): 없음

### 13.4 일마감 프로그램 — 80

- 업무규칙(24): `money_to_int_`, `clean_item_name_`, `extractModelToken_`, `isTargetModelCode_`, `classifyComp`, `loadSingleSetCatalog`, `loadPriceMap_`, `notion_extract_dc_`, `fmtMinusUnit`, `extractDiscountNumbers`, `num`, `names`, `processDailyData`, `toggleBeforeHike`, `setMultiToggle`, `handleFile`, `runProcess`, `formatNum`, `formatInput`, `recalcRow`, `updateFooterSums`, `updateVal`, `updateMergedTextVal`, `reclassifyTabs`
- UI(41): `toggleBeforeHike`를 제외한 화면 목록 중 `initSortable`, `onEnd`, `onload`, `saveState`, `undo`, `redo`, `calcSelectionSum`, `setupExcelEvents`, `applyPasteValue`, `makeCellEditable`, `insertBrAtCursor`, `createPages`, `switchTab`, `getDcClass`, `updateFilterUI`, `applyGlobalSearch`, `renderAll`, `renderTable`, `syncOtherTabs`, `openPopup`, `closePopup`, `toggleSort`, `executeSort`, `restoreOriginalSort`, `applyFilterRealtime`, `applyEmptyFilter`, `clearFilter`, `clearAllFilters`, `copyTableImage`, `saveToNotion`, `initHistoryDates`, `loadHistory`, `restoreState`, `checkAutoRestore`, `addPendingRow`, `removePendingRow`, `reindexPendingRows`, `savePendingData`, `loadPendingData`, `exportToExcel`, `addPendingSheetToWorkbook`
- 인프라(13): `doGet`, `getUserAuth`, `getTitle`, `getSelect`, `notionRequest_`, `preload_notion_map_`, `saveHistoryToNotion`, `decompressData`, `savePendingToNotion`, `getPendingFromNotion`, `getHistoryFromNotion`, `getLatestHistoryFromNotion`, `autoSaveToNotion`
- dead_code(2): `testNotionAPI`, `updateMergedVal`

> 주: `toggleBeforeHike`는 업무규칙 목록에만 1회 포함한다. UI 목록 첫 문구는 중복 제외를 명시하기 위한 설명이며 항목 수에 포함하지 않는다.

### 13.5 영업수수료 계산 — 35

- 업무규칙(12): `setPay`, `setWht`, `setExp`, `getExpenseRate`, `parseNum`, `fmt`, `xround`, `getValues`, `recalc`, `renderDoc`, `resetForm`, `restoreState`
- UI(16): `onload`, inventory의 `setTimeout` 2건, `switchTab`, `bindInputs`, `todayStr`, `negCls`, `esc`, `showLoading`, `hideLoading`, `saveToNotion`, `capturePreview`, `copyPreview`, `savePreview`, `initDates`, `loadHistory`
- 인프라(7): `doGet`, `getUserAuth`, `getTitle`, `getSelect`, `saveHistoryToNotion`, `decompressData`, `getHistoryFromNotion`
- dead_code(0): 없음

### 13.6 전표정리리스트 — 53

- 업무규칙(6): `handleFile`, `runProcess`, `renderTable`, `markCompleted`, `unmarkCompleted`, `remarkCompleted`
- UI(33): `onload`, `checkAutoRestore`, `renderTabs`, `switchTab`, `openRenameModal`, `closeRenameModal`, `executeRename`, `createTableFrame`, `addCustomPage`, `openDeleteModal`, `closeDeleteModal`, `executeDelete`, `checkKw`, `openPopup`, `closePopup`, `sortData`, `applyFilterRealtime`, `toggleKeyword`, `applyEmptyFilter`, `clearFilter`, `updateFilterUI`, `toggleAll`, `getCheckedKeys`, `clearCheckboxes`, `saveStateToNotion`, `copyCurrentTable`, `saveCurrentTable`, `getSelectedText`, `copyTextToClipboard`, `initHistoryDates`, `f`, `loadHistory`, `restoreState`
- 인프라(7): `doGet`, `getUserAuth`, `getTitle`, `getSelect`, `saveHistoryToNotion`, `getHistoryFromNotion`, `getLatestHistoryFromNotion`
- dead_code(7): `getIdFromUrl`, `openSheetByUrl`, `normalizeStr`, `normalizeForMatch`, `cleanValue`, `isAccountingRoom_`, `sheetToObjects`

### 13.7 내일자 전표 이미지 생성 — 46

- 업무규칙(4): `extractNum`, `checkDuplicates`, `processExcelData`, `drawImage`
- UI(32): `onload`, `checkAutoRestore`, `loadInitialData`, `switchTab`, `clearSourceData`, `clearUnshippedData`, `handleFile`, `generateResults`, `openPopup`, `closePopup`, `toggleSort`, `executeSort`, `restoreOriginalSort`, `applyFilterRealtime`, `toggleKeyword`, `applyEmptyFilter`, `clearFilter`, `updateFilterUI`, `matchesActiveFilters`, `checkKw`, `getCurrentFilteredList`, `sanitizeFilename`, `saveAllImages`, `renderResultTable`, `dataURItoBlob`, `copyCanvas`, `saveCanvas`, `initHistoryDates`, `loadHistory`, `restoreState`, `getSelectedText`, `copyTextToClipboard`
- 인프라(10): `doGet`, `getUserAuth`, `getTitle`, `getSelect`, `getMappingData`, `getForbiddenData`, `getLogoBase64`, `saveHistoryToNotion`, `getHistoryFromNotion`, `getLatestHistoryFromNotion`
- dead_code(0): 없음

---
