# #896 기초거래처 적재 2차 — 실제 적재 검증 보고서

작성일: 2026-08-09 (KST)  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`  
기준 HEAD: `bffc39db8`  
공유 DB 쓰기: **0건**  
검증 DB: Testcontainers PostgreSQL 16 일회용 컨테이너

## 1. 결론과 일회용 DB 2회 적재 원문

정본은 `docs/migration/896-sheet/ecount/거래처등록.xlsx`이며 SHA-256은 다음과 같다.

```text
064770396F5586EC7D49E8219DD19086EF48C072F4BA4FF7B1BABB0EC14D4619
```

실행 경로는 `POST /admin/partners/imports/ecount-xlsx` → `EcountPartnerImporter.importXlsx()` →
`staging.ecount_partner_raw` → `partners`이다. 통합 테스트는 같은 XLSX byte를 같은 일회용 DB에
연속 2회 주입했다.

```text
RUN 1: source data rows=7254, loaded rows=7253, imported=7253, updated=0, PARSE_HOLD=0, trailer excluded=1
RUN 2: source data rows=7254, loaded rows=7253, imported=0, updated=7253, PARSE_HOLD=0, trailer excluded=1
RUN 1 날짜 집계: 등록일자 파싱 성공=2423, 적재 시점 사용=4830, 합계=7253
DB after RUN 2: partners=7253, staging rows=7253, outstanding_balance=0 rows=7253
UUID/value snapshot: RUN 1 == RUN 2 (partner_code별 id/name/credit_limit/status/partner_group1/created_at)
```

`updated=7253`은 2회차에 새로운 행을 만들지 않고 `partner_code`로 기존 행을 찾아 같은
정규화 값을 재적용한 논리적 기존 매칭 건수다. 실제 결과 snapshot과 행 수가 완전히 같고,
`outstanding_balance`는 2회 모두 건드리지 않았다. UUID는 생성 시점의 값이 그대로 유지되어
DC 고아 사고와 같은 재생성·재연결을 일으키지 않는다.

검증 테스트: `services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java`

## 2. 필드별 갱신 정책

| 필드 | 신규 | 기존 `partner_code` 매칭 | 사유 |
|---|---|---|---|
| `name` | 저장 | 덮어씀 | 거래처 마스터 원천 |
| `representative`, `sub_biz_no` | 저장 | 덮어씀 | 이카운트 기본정보 |
| `address1`, `address`, `phone`, `mobile` | 저장 | 덮어씀 | 이카운트 연락/주소 |
| `manager_name`, `search_keyword`, `note` | 저장 | 덮어씀 | 이카운트 원천 |
| `partner_group1` | 저장 | 덮어씀 | 그룹 원문을 임의 축약하지 않음 |
| `transfer_info` | 저장 | 덮어씀 | 이체정보 원천 |
| `registration_date` | 저장 | 덮어씀 | 유효한 등록일자만 |
| `created_at` | 원천 등록일 00:00:00 또는 배치 적재 시각 | **덮어쓰지 않음** | audit 생성 시각, 기존 UUID 행 보존 |
| `credit_limit` | 빈칸이면 `NULL`, 숫자면 숫자 | 동일 정책으로 덮어씀 | `NULL`=미설정, `0`과 구별 |
| `status` | `YES` 신규만 `ACTIVE` | **덮어쓰지 않음** | 기존 비활성 거래처 되살림 금지 |
| `outstanding_balance` | 신규 기본 0 | **덮어쓰지 않음** | 거래 결과 필드 |
| `partner_group2`, `website`, 기존 email/fax/zip 등 | 신규는 null | **덮어쓰지 않음** | 이카운트 정본 컬럼 아님 |
| DB에만 있는 55건 | 유지 | 삭제/비활성화 없음 | PM 확정 |

정책 코드 주석 위치:

- 갱신 표/보호 필드: `EcountPartnerImporter.java:531-604`
- `created_at` 날짜/적재시각 정책: `EcountPartnerImporter.java:253-303`, `EcountPartnerImporter.java:540-592`
- 기존 status 보존: `EcountPartnerImporter.java:579`
- `credit_limit` nullable 도메인 및 import setter: `Partner.java:68-76`, `Partner.java:293-299`
- `outstanding_balance` nullable 금지: `Partner.java:76`

## 3. 값 변환 규칙과 보류 행

- `등록일자`: `YYYYMMDD`·`YYYY-MM-DD`·`YYYY.MM.DD`·`YY.MM.DD`·`YYMMDD`를 지원한다.
  `YY`는 2000년대로 해석한다. 성공한 2,423건은 `created_at`에 해당 날짜 00:00:00을
  기록하고 `registration_date`에도 같은 날짜를 기록한다.
- `등록일자` 공란/파싱 실패 4,830건은 `registration_date=NULL`로 두고, 해당 배치의
  `LocalDateTime.now()`를 `created_at`에 기록한다. 따라서 7,253건 모두 적재되며
  `created_at`은 항상 채워진다. 원문상 빈칸 4,804건과 형식/값 실패 26건을 합산한 수치이며,
  실패를 임의 날짜로 대체하지 않는다.
- `최초작성일자`: `YYYY/MM/DD 오전|오후 h:mm:ss`를 검증할 수 있지만, 운영 의미가 다른
  audit `created_at`의 원천으로 사용하지 않는다. 원문은 `staging.ecount_partner_raw.raw_first_created`
  에 그대로 보존해 재파싱한다.
- `여신한도`: 빈칸/`-` → `NULL`; 쉼표·공백·`원` 표기를 제거한 숫자만 `BigDecimal`로 변환한다.
  예: `1,000,000원` → `1000000`. 숫자가 아닌 값은 해당 필드를 `NULL`로 두고 행 자체는
  적재하며, 원문은 staging에서 재처리할 수 있다.
- `그룹`: `SF(밴더)`, `일반업체`, `파트너사`, `조달업체`, 빈값을 포함해 원문을
  `partner_group1`에 그대로 저장한다. `JS`, `기타` 등도 임의로 합치지 않는다.
- `사용구분`: 신규의 `YES`만 `ACTIVE`; 기존 행 status는 보존한다.
- `7256행`: A열 timestamp만 있고 B~P가 빈 trailer로 제외한다.

실제 일회용 DB 결과:

```text
PARSE_HOLD: 0건 (등록일자 실패도 적재 시점 정책으로 적재)
등록일자 파싱 성공: 2423건
created_at 적재 시점 사용: 4830건
TRAILER: 7256행 1건
```

파싱 실패 행은 보류하지 않고 모두 `partners`에 적재했다. 원문은 staging에 남아 있다.

```sql
SELECT source_row_no, reject_reason
  FROM staging.ecount_partner_raw
 WHERE raw_registration IS NULL
 ORDER BY source_row_no;
```

### `registration_date`와 `created_at`의 관계

코드 확인 결과 둘은 같은 컬럼의 별칭이 아니다.

| 컬럼 | 코드상 의미 | 이번 적재 정책 |
|---|---|---|
| `partners.registration_date` | `Partner`의 회계상 거래 시작일. 응답·revision snapshot에서 별도 사용 | 파싱 성공 날짜만 저장, 실패/빈칸은 `NULL` |
| `BaseEntity.created_at` → `partners.created_at` | 공통 audit 생성 시각. `@CreatedDate`, not-null, update 불가 | 신규 행은 성공 날짜 00:00:00 또는 배치 `now()` |

따라서 한쪽을 버리지 않고 둘 다 유지한다. 유효한 원천 등록일은 두 곳에 같은 날짜를
반영하되, 등록일이 없을 때도 audit 생성 시각은 반드시 채운다. 기존 행의 `created_at`은
JPA `updatable=false`로 보존되어 2회차에도 바뀌지 않는다.

## 4. Flyway 채번

`services/partner-service/src/main/resources/db/migration`와 현재 로컬/원격 브랜치의
partner migration 경로를 확인했다. 최신은 `V13__partner_deleted_by_name.sql`이고 V14 이상
충돌은 확인되지 않았다. 따라서 다음 번호인 **V14**를 사용했다.

`V14__allow_unset_partner_credit_limit.sql` 내용:

- `partners.credit_limit`의 `NOT NULL`/default 제거
- `credit_limit` 주석에 `NULL=미설정`, `0=명시적 한도 0원` 의미 고정
- staging transform check에 `PARSE_HOLD` 추가
- `outstanding_balance`의 `NOT NULL`은 유지

새 컬럼은 추가하지 않았다. `credit_limit`, `registration_date`, `manager_name`,
`partner_group1`, `transfer_info`, `sub_biz_no` 등 기존 컬럼을 사용했다.

## 5. 실행 경로와 회수 확인

운영 재현 경로는 관리자 multipart endpoint다.

```text
POST /admin/partners/imports/ecount-xlsx
Content-Type: multipart/form-data
part: file = 거래처등록.xlsx
header: X-User-Id = 작업자 식별자
```

권한은 기존 관리자 `partners.edit:CREATE`를 사용한다. Google Sheets 런타임 의존성이나
사원(담당)리스트 적재는 없다.

일회용 환경은 `PartnerMasterLoadIT`의 Testcontainers PostgreSQL 16에서만 실행했다.
테스트 종료 시 컨테이너가 종료되고, 테스트 `@BeforeEach`에서 staging/partners를 초기화한다.
공유 `samhan-postgres` 접속·INSERT/UPDATE·DELETE는 실행하지 않았다.

## 6. 검증 명령과 결과

```text
.\gradlew.bat :services:partner-service:test \
  --tests 'com.samhanair.logis.partner.service.EcountPartnerImporterTest' --no-daemon
17 tests completed, BUILD SUCCESSFUL

.\gradlew.bat :services:partner-service:test \
  --tests 'com.samhanair.logis.partner.seed.PartnerMasterLoadIT' --no-daemon
1 test completed, BUILD SUCCESSFUL
```

## 7. 신규/변경 파일

- `docs/dev-reports/2026-08-09-896-partner-master-load-2.md`
- `services/partner-service/src/main/resources/db/migration/V14__allow_unset_partner_credit_limit.sql`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/controller/EcountPartnerImportController.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/domain/Partner.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/dto/EcountPartnerImportResult.java`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/service/EcountPartnerImporterTest.java`
- `services/partner-service/src/main/resources/db/migration/V9__add_partner_ecount_mig1_columns.sql` (상태 주석만 보강)

커밋/푸시는 하지 않았다.
