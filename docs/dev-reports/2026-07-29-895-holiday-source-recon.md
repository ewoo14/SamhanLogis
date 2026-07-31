# PR #994 / Issue #895 「대시보드 일정관리」
## 한국 공휴일 데이터 출처 정찰 보고서

- 조사일: 2026-07-29 (KST)
- 범위: ① 저장소 기존 공휴일·영업일 처리 ② 공공데이터포털 한국천문연구원 특일 정보 API 계약 ③ 대안 비교 ④ 저장소 접합 제약
- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\t895`
- 코드, 마이그레이션, 설정은 수정하지 않았다. 이 파일만 새로 작성했다.

## 정찰 결론

저장소에는 일반 한국 공휴일을 보관하거나 계산하는 테이블·상수·라이브러리가 없다. 회계 마감은 입력받은 날짜를 그대로 집계하고, `payment_due_days`·`credit_period_days`는 거래처 속성/시드/이력 보존용으로만 존재한다. 다만 슬립 배송일정에는 **일요일만** 건너뛰는 별도 규칙이 있고, 제품 단가 적용일은 `price_change_schedule`에 DB 적재되어 있다. 둘 중 어느 것도 한국 공휴일의 정본은 아니다.

정본 후보는 공공데이터포털의 **한국천문연구원_특일 정보 — 공휴일 정보 조회 `getRestDeInfo`**가 가장 적합하다. 단, 이 API는 인증키가 필요하고, 공식 설명상 대체공휴일은 관보에 정식 공포된 뒤에 반영된다. 음력 설·추석의 실제 payload는 키 없는 정찰에서 확인할 수 없었으므로, “반드시 반영된다”고 단정하지 않는다.

## ① 저장소에 이미 공휴일/영업일 처리가 있는가

### 판정표

| 조사 대상 | 확인 결과 | 실제 근거 |
|---|---|---|
| 공휴일 테이블·마이그레이션 | 없음 | 회계·슬립·파트너 및 저장소 migration을 실제 SQL까지 확인했으며 `holiday/public_holiday/공휴일/영업일` 구조가 없다. 검색 0건만으로 결론내리지 않고 아래 날짜 도메인 코드를 함께 확인했다. |
| 공휴일 상수·전용 라이브러리 | 없음 | 해당 서비스의 Java/Kotlin/build 설정에서 holiday/workday 계열 상수·라이브러리 사용을 확인하지 못했다. |
| 회계 일마감 | 공휴일/주말 건너뜀 없음 | `DailyClosingService`는 `request.closingDate()`를 그대로 받아 같은 날짜의 전표/세금계산서를 집계한다 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/DailyClosingService.java:114-165,321-350`). |
| 회계 월마감 | 영업일 계산 없음 | `MonthEndCloseService.normalize()`는 DAILY는 원래 날짜, MONTHLY는 그 달 1일로만 정규화한다 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/MonthEndCloseService.java:98-103,534-548`). |
| 슬립 배송일정 | **주말 일부만** 처리 | `DeliverySchedule`은 M+1일 후 N이 일요일이면 월요일로 미루되, 야적+토요일은 일요일을 유지한다. 공휴일 조회는 없다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/schedule/DeliverySchedule.java:39-48`). |
| `payment_due_days` / `credit_period_days` | 계산 소비처 없음 | 파트너 migration이 두 정수 컬럼을 추가하고 (`services/partner-service/src/main/resources/db/migration/V2__add_ecount_partner_fields.sql:42-43`), `Partner`가 저장·수정·snapshot에 보존한다 (`services/partner-service/src/main/java/com/samhanair/logis/partner/domain/Partner.java:192-197,432-442`). 소스 전수 참조는 seed/revision까지이며 `plusDays(paymentDueDays)` 같은 계산 경로는 없다. |
| 입금예정일/납기일 | 외부 입력·명시값 보존 | Ecount `MMDD` 값을 같은 연도의 `LocalDate.of(...)`로 파싱할 뿐 주말·공휴일 보정은 없다 (`services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/EcountMig4ImportSupport.java:61-78`). 슬립의 `paymentDueDate`도 요청값을 저장/부분 갱신하는 필드다 (`services/slip-service/src/main/java/com/samhanair/logis/slip/domain/Slip.java:566-567,1680-1701`). |
| `price_change_schedule` | 날짜 DB 적재는 있음, 공휴일 정본은 아님 | `V22`가 카테고리별 `effective_date`를 적재하고 (`services/product-service/src/main/resources/db/migration/V22__add_price_change_schedule.sql:4-19`), 내부 endpoint가 DB의 날짜 맵을 반환한다 (`services/product-service/src/main/java/com/samhanair/logis/product/web/PriceChangeScheduleInternalController.java:46-64`). “KST 업무일 기준”은 적용일의 의미이지 공휴일 계산 구현이 아니다. |

대시보드 일정 자체는 `groupware-service`의 `schedules` 테이블(`owner_id`, `starts_at`, `ends_at`, `status`)과 기간 겹침 조회로 처리된다. 공휴일 컬럼이나 외부 휴일 join은 없다 (`services/groupware-service/src/main/resources/db/migration/V1__init_groupware.sql:105-131`, `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java:24-39`).

**중복 방지 결론:** 기존 공휴일 정본은 발견되지 않았다. `DeliverySchedule`의 일요일 규칙이나 `price_change_schedule`의 적용일을 재사용해 공휴일을 만들면 의미가 섞이므로 새 기능의 공휴일 정본으로 삼지 않는다.

## ② 공공데이터포털 한국천문연구원 특일 정보 API 실제 계약

### 공식 확인 범위

2026-07-29에 공공데이터포털 공식 페이지를 직접 조회했다. 데이터셋 페이지의 상세기능 목록에서 `공휴일 정보 조회`(내부 operation `24868`)를 선택해 요청주소와 필드 표를 확인했고, 포털이 생성한 cURL 샘플도 확인했다. 인증키를 넣지 않은 live 요청은 `Unauthorized`로 거절되었다. 실제 키를 발급·사용·저장하지 않았다.

### 서비스와 엔드포인트

| 항목 | 공식 계약 |
|---|---|
| 서비스명 | `한국천문연구원_특일 정보` |
| 제공기관 | 한국천문연구원 |
| 기능 | 공휴일 정보 조회 |
| 서비스 URL | `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService` |
| 오퍼레이션 | `getRestDeInfo` |
| 요청주소 | `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo` |
| 공식 데이터 형식 | REST / XML |

공식 페이지가 HTTP 주소를 표시한다. 정식 구현 때 HTTPS 동작 여부와 포털의 최신 샘플을 다시 확인하되, 문서에 적힌 계약 주소 자체는 위와 같다.

### 요청 파라미터

현재 `getRestDeInfo` 상세기능 표와 공식 생성 cURL은 다음과 같다.

```text
curl --include --request GET \
'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=서비스키&solYear=2015&solMonth=09'
```

| 파라미터 | 필수/형식 | 의미 |
|---|---|---|
| `serviceKey` | 필수 인증키 | 공공데이터포털에서 발급받은 API 인증키. 포털의 현재 cURL 샘플은 이 이름을 소문자 `serviceKey`로 생성한다. |
| `solYear` | 필수, 4자리 | 양력 연도. 공식 샘플 `2015`. |
| `solMonth` | 필수, 2자리 | 양력 월. 공식 샘플 `09`. |

현재 공휴일 상세기능의 **요청변수 표에는 연·월이 명시**되어 있으며, 호출 샘플도 연·월만 보낸다. 응답 표에 `numOfRows`, `pageNo`, `totalCount`가 있지만, 이번 상세기능의 요청 샘플에는 페이지 번호/페이지당 건수를 넣지 않았다. 구현 시 undocumented pagination을 전제로 하지 않는다.

### 응답 필드

공식 페이지의 응답 요소 표 기준이다. 공식 데이터 포맷은 XML이다.

| 필드 | 공식 샘플/형식 | 의미와 사용 |
|---|---|---|
| `locdate` | 8자리, `20150301` | 날짜. 하이픈 없는 `yyyyMMdd`로 파싱한다. |
| `seq` | `1` | 같은 조회 결과의 순번. |
| `dateKind` | 2자리, 샘플 `00` | 특일 종류 코드. 현 정찰에서는 코드 전체 목록을 확인하지 못했으므로 이 값만으로 휴일 여부를 판정하지 않는다. |
| `isHoliday` | 공식 샘플 `Y` | 공공기관 휴일 여부 플래그. 달력 표시 대상은 `isHoliday=Y`인 row로 한정하는 것이 안전하다. |
| `dateName` | 최대 50, 샘플 `삼일절` | 사용자에게 표시할 명칭. |
| `numOfRows` | 응답 메타데이터 | 페이지당 항목 수. |
| `pageNo` | 응답 메타데이터 | 페이지 번호. |
| `totalCount` | 응답 메타데이터 | 전체 항목 수. |

표준 API XML envelope의 세부 tag를 이번에는 키 없는 live 응답으로 확인하지 못했다. 구현 전 포털의 참고문서/샘플 코드로 `response > body > items > item`의 실제 envelope도 계약 테스트로 고정해야 한다.

### 인증키 발급, 무료 여부, 호출 한도

공식 데이터셋 페이지의 현재 표시값은 다음과 같다.

| 항목 | 공식 페이지 표시값 |
|---|---|
| 비용 | `무료` |
| 신청가능 트래픽 | `개발계정 : 10,000 / 운영계정 : 활용사례 등록시 신청하면 트래픽 증가 가능` |
| 업데이트 주기 | `실시간` |
| 활용승인 | `개발단계 : 자동승인 / 운영단계 : 자동승인` |
| 이용허락 | `이용허락범위 제한 없음` |
| 페이지 수정일 | `2023-03-29` |

호출 한도의 **단위(일/분 등)는 해당 데이터셋 페이지의 문구에 명시되지 않았다.** 따라서 개발계정 10,000을 일일 한도로 단정하지 않고, 운영 사용 전 계정 화면에서 현재 quota를 재확인한다. 포털 일반 이용가이드는 개발계정/운영계정 신청 후 승인 완료 시 1인당 하나의 인증키를 발급한다고 안내하며, 해당 데이터셋 페이지는 자동승인으로 표시한다.

사람이 해야 할 절차는 `공공데이터포털 로그인 → 15012690 데이터셋에서 활용신청 → 개발계정 신청 → 운영계정이 필요하면 운영계정/활용사례 신청 → 승인 완료 확인 → 마이페이지에서 인증키 확인`이다. 일반 이용가이드는 OpenAPI 활용신청이 PC에서만 지원된다고 안내한다.

### 대체공휴일·음력 공휴일·다음 해 공개 시점

| 질문 | 확인 결과 |
|---|---|
| 대체공휴일 | **조건부 반영.** 공휴일 상세기능 공식 설명에 “대체공휴일의 경우, 법제처 심사, 국무회의, 대통령의 승인 등 절차를 거쳐 관보에 정식 공포 된 이후에 적용”이라고 명시되어 있다. 즉 법정 절차가 끝난 뒤의 조회에는 반영되는 계약이지만, 아직 공포되지 않은 대체공휴일을 예측해 주는 API는 아니다. |
| 음력 설·추석 | **이번 정찰에서 live payload로 확인하지 못함.** `getRestDeInfo`가 공휴일 조회 기능이고 `locdate/dateName/isHoliday`를 제공한다는 사실은 확인했지만, 키 없는 상태에서 설·추석 row를 실제 조회할 수 없었다. 공식 상세 표에도 음력 계산 규칙이나 설·추석 보장 문구는 없었다. 따라서 구현 전에 발급된 키로 최근 연도의 설·추석 및 대체공휴일 row를 계약 검증해야 한다. |
| 다음 해 공개 시점 | **공식적으로 확인하지 못함.** 페이지의 `업데이트 주기=실시간`은 변경사항 반영 주기이지 다음 연도 데이터 공개일을 뜻하지 않는다. 다음 해 데이터가 언제 열리는지 공식 문서에 일정이 없다. “매년 특정 월에 공개된다”고 가정하지 않고, 다음 해 범위를 주기적으로 재조회하는 운영 정책이 필요하다. |

## ③ 대안 비교

| 후보 | 무료·공인 여부 | 정본으로 부적합한 이유 |
|---|---|---|
| **KASI `getRestDeInfo`** | 공공데이터포털 등록, 한국천문연구원 제공, 데이터셋 표시상 무료 | 이 조사에서의 **추천 정본**. 다만 인증키, quota 단위 미표기, 다음 해 공개일 미정, 관보 공포 전 대체공휴일 미반영을 운영 제약으로 관리해야 한다. |
| 같은 KASI 서비스의 국경일/기념일 상세기능(`getHoliDeInfo`, `getAnniversaryInfo` 등) | 같은 공식·무료 데이터셋의 기능 | 국경일 또는 기념일만 다루는 기능은 전체 공휴일의 대체재가 아니다. `isHoliday=Y`인 공휴일 조회 기능을 기준으로 삼아야 한다. |
| 법령·관보·법제처 공휴일 고시 | 공인된 법적 출처 | 법적 근거로는 강하지만, 달력용 월별 날짜 feed가 아니다. 음력 날짜·대체공휴일을 직접 계산/추적해야 하므로 이 저장소의 운영 정본으로 쓰기에는 파싱·공포 시점·회귀 관리 부담이 크다. |
| 중앙/지방자치단체의 개별 공개 데이터 | 공공기관 데이터인 경우 무료·공인 | 제공 범위가 기관/지역별이고 전국 공휴일 전체를 단일 계약으로 보장하지 않는다. KASI 데이터와 충돌 시 어느 쪽을 따를지 별도 정책이 필요하다. |
| 코드 하드코딩 표 | 무료처럼 보이지만 공공기관 live source가 아님 | 매년 유지보수해야 하고, 음력·대체공휴일 지정 또는 관보 공포 지연을 놓친다. 이 저장소 규칙상 fake data/하드코딩 fixture로 사용할 수 없다. |
| 서드파티 ICS/휴일 API(예: Google holiday calendar, 일반 iCalendar feed) | 무료인 서비스가 있을 수 있으나 공인 정본 아님 | 공급자별 생성·갱신·이용약관·가용성이 다르고, 한국 법정 공휴일의 법적 정본과 일치한다고 보장할 수 없다. 보조 대조용도 운영 정본으로 승격하지 않는다. |

## ④ 이 저장소에 붙일 때의 제약

### 권장 접합 형태

`달력 화면 → 외부 KASI 직접 호출` 구조는 쓰지 않는다. 이 저장소의 패턴을 적용하면 다음 형태가 맞다.

```text
KASI getRestDeInfo (월별, scheduled sync)
        ↓
공휴일 원문 검증·멱등 upsert (서비스 DB의 별도 holiday 저장소)
        ↓
일정 조회 API가 로컬 DB의 일정 + 공휴일을 반환
        ↓
화면은 내부 API만 호출
```

- `GoogleSheetsClient`는 외부 read를 Caffeine 5분 TTL로 막고 (`services/product-service/src/main/java/com/samhanair/logis/product/client/GoogleSheetsClient.java:32-41,97-155`), `ProductSheetSyncService`가 시트 데이터를 DB에 tab별 upsert한다 (`services/product-service/src/main/java/com/samhanair/logis/product/service/ProductSheetSyncService.java:223-280`). 공휴일도 **외부 원천 → 주기 sync → DB 정본 → 내부 조회** 형태를 따른다.
- `ProductSheetSyncScheduler`는 cron과 수동 trigger를 분리하고, 외부 실패를 log로 처리해 부팅을 막지 않는다 (`services/product-service/src/main/java/com/samhanair/logis/product/scheduler/ProductSheetSyncScheduler.java:64-142`). 공휴일 sync도 화면 진입이 아니라 scheduler/운영 trigger로 실행한다.
- `price_change_schedule`는 이미 `effective_date`를 DB에 적재하고 내부 endpoint가 읽는 패턴이다. 공휴일도 동일하게 DB를 authoritative read model로 둔다. `price_change_schedule` 자체를 확장해 휴일을 섞지는 않는다.
- 다중 instance에서 sync job을 하나만 실행해야 하면 dashboard-service가 이미 쓰는 ShedLock 패턴(`MaterializedViewRefreshConfig.java:47-49`)을 재사용 후보로 삼는다. 이것은 현재 공휴일 기능이 있다는 뜻이 아니라, scheduler 중복 실행을 막는 저장소 precedent다.
- DB read에 짧은 Caffeine TTL을 추가할 수는 있지만, cache는 성능 방어일 뿐 정본이 아니다. 정본은 마지막 성공 sync가 적재한 DB row여야 한다.

### 외부 API 장애 시 실패 거동

1. KASI 호출은 일정 조회 request path 밖의 sync job으로 격리한다. KASI 장애가 일정 API의 5xx가 되면 안 된다.
2. 마지막 성공 sync row는 삭제하지 않고 계속 제공한다. 응답에는 `lastSuccessfulSyncAt` 또는 `holidayDataStatus=FRESH|STALE|UNAVAILABLE` 같은 freshness 신호를 둔다.
3. 최초 적재 전 장애이면 **일정 자체는 정상 표시**하고 공휴일 표시만 비활성화하며 “공휴일 데이터 최신화 지연/조회 불가”를 비차단 안내한다. 이를 공휴일이 없다는 뜻으로 조용히 표시하지 않는다.
4. 오래된 row로 현재 월을 표시할 때도 stale 상태를 숨기지 않는다. sync 성공 전에는 기존 row를 wholesale delete하거나 빈 응답으로 덮어쓰지 않는다.
5. 재시도·알림은 scheduler/운영 모니터링에서 처리한다. 화면 새로고침마다 외부 API를 재호출하지 않는다.

이 거동은 fake holiday row나 고정 fixture를 추가하지 않는다. 실패 시 “자료 없음/오래됨”을 명시할 뿐, 임의의 설·추석·대체공휴일을 만들어 넣지 않는다.

### 개발책임자께 요청할 항목 목록

1. **공공데이터포털 활용신청 담당자**: 포털 계정 소유자/로그인 주체를 지정하고, 데이터셋 `15012690`의 `한국천문연구원_특일 정보` 활용신청을 진행해 주십시오.
2. **계정 유형**: 개발계정만 필요한지, 운영계정 및 활용사례 등록까지 필요한지 결정해 주십시오. 데이터셋 페이지는 개발계정 10,000, 운영계정은 활용사례 등록 후 증가 가능으로 표시하지만 quota 단위는 재확인해야 합니다.
3. **인증키 전달 방식**: 실제 키를 채팅·소스·`.env` 커밋 파일로 전달하지 말고 Secret Manager/배포 환경변수에 등록해 주십시오. 애플리케이션 설정 이름은 예시로 `KASI_HOLIDAY_SERVICE_KEY`를 사용하고, local/staging/production별 주입 여부만 공유해 주십시오.
4. **음력·대체공휴일 계약 승인**: 키가 준비되면 2025~2027년의 설·추석, 대체공휴일, 일반 공휴일을 실제 API로 검증하는 계약 테스트를 허용할지 결정해 주십시오. 이번 조사에서는 키를 발급·사용하지 않았습니다.
5. **다음 해 sync 정책**: 공식 공개일이 문서화되어 있지 않으므로, 현재 연도와 다음 연도를 얼마 동안 rolling sync할지(권장: 월별 조회를 주기적으로 재시도) 승인해 주십시오.
6. **stale 정책**: API 장애 시 마지막 정상 데이터로 달력에 표시하고 stale 안내를 노출하는 정책, 최초 데이터가 없을 때 일정만 표시하고 공휴일 배지를 비차단으로 숨기는 정책을 확정해 주십시오.

## 이번 정찰이 보지 않은 것

- 인증키를 사용한 `getRestDeInfo`의 실제 XML payload와 2025~2027년 설·추석/대체공휴일 row는 보지 않았다. 키 없는 호출이 `Unauthorized`였기 때문이다.
- 공공데이터포털 참고문서 DOCX의 전체 XML envelope와 오류코드 표는 보지 않았다. 이번 보고서는 공식 HTML 상세기능 표와 공식 생성 cURL 계약까지만 확인했다.
- 다음 연도 데이터가 실제로 API에 공개되는 정확한 날짜는 확인하지 못했다. 공식 페이지에 공개 일정이 없었다.
- PR #994의 일정 화면 구현 파일·현재 diff·실제 배포 Secret Manager 설정은 조사하지 않았다. 이번 범위는 공휴일 source와 접합 제약뿐이다.
- 공휴일 저장 테이블·sync job·화면 fallback 구현은 하지 않았다.

## 인용 및 출처

1. [공공데이터포털 — 한국천문연구원_특일 정보](https://www.data.go.kr/data/15012690/openapi.do) — 서비스명, 제공기관, `getRestDeInfo` 상세기능, 요청/응답 필드, 무료 여부, 신청가능 트래픽, 업데이트 주기, 대체공휴일 설명.
2. [공공데이터포털 — 공공데이터 이용가이드](https://www.data.go.kr/ugs/selectPublicDataUseGuideView.do) — OpenAPI 활용신청, 개발/운영계정, 승인, 인증키 발급 절차.
3. [한국천문연구원 특일 정보 API endpoint](https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo) — 키 없는 HTTPS probe가 `Unauthorized`로 응답함을 확인한 대상 endpoint. 실제 키는 사용하지 않았다.
4. 저장소 근거는 본문 각 항목의 상대 경로와 line 범위에 인용했다.

