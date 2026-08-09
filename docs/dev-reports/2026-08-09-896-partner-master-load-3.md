# #896 거래처 적재 3차 — 등록일자 필드 단위 null 처리

## 결론

2차의 `PARSE_HOLD` 행 전체 보류를 제거했다. 등록일자는 지원 형식이면 `registration_date`에 저장하고, 빈값·`임시`·미해석 값이면 `registration_date = null`로 저장한다. 거래처 행 자체는 계속 적재한다. 원문 `raw_registration`은 `staging.ecount_partner_raw`에 그대로 보존한다.

`최초작성일자`는 `created_at`에 넣지 않는다. staging의 `raw_first_created`에만 보존한다.

## 1. 일회용 DB 2회 적재

검증 코드는 [PartnerMasterLoadIT.java](/C:/dev/Samhan-Public/.claude/worktrees/tpartner/services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java)에 있다. Testcontainers PostgreSQL만 사용하며 공유 DB 접속 정보는 사용하지 않는다.

기대 관문은 다음과 같다.

```text
원문 data rows                 7,254
trailer (7256행) 제외               1
적재 대상                       7,253
RUN 1 신규 + 기존 매칭           7,253
RUN 2 신규                          0
RUN 2 updated                   RUN 1 신규 수
staging rows                   7,253
```

현재 세션에서 IT는 Spring context가 DB 연결 전에 실패했다.

```text
PartnerMasterLoadIT FAILED
org.flywaydb.core.api.FlywayException:
Unable to obtain inputstream for resource:
db/migration/V3__create_partner_attachments.sql
```

따라서 이 보고서에서 실제 DB RUN 1/RUN 2 성공을 주장하지 않는다. 원문 분석·컴파일·단위 테스트는 완료했지만, Testcontainers 2회 적재와 아래 DB 관문 7개는 이 Flyway 기존 리소스 블로커 해소 후 재실행해야 한다.

## 2. 등록일자 원문 전수 표

원문 XLSX의 7,254 데이터행에서 trailer 1건을 제외한 7,253건 기준이다. 날짜 열의 빈칸 4,803건은 trailer의 빈 B열을 제외해 계산했다.

| 형식 | 예시 | 파싱 결과 | 건수 |
|---|---|---:|---:|
| 빈칸 | `(빈칸)` | `null` | 4,803 |
| YYYYMMDD | `20230814` | `2023-08-14` | 342 |
| YYYY-MM-DD | `2025-05-12` | `2025-05-12` | 183 |
| YYYY.MM.DD | `2025.05.12` | `2025-05-12` | 828 |
| YY.MM.DD | `26.07.27` | `2026-07-27` | 908 |
| YYMMDD | `240613` | `2024-06-13` | 158 |
| 미해석 | `240613 임시` 등 | `null` | 31 |
| **합계** |  |  | **7,253** |

여전히 못 읽는 값 31건의 원문 예시는 다음과 같다. 모두 거래처 행은 적재하고 등록일자만 null이다.

```text
- (3건), 임시, 240613 임시, 25.06.12., 2023/09/18, 26.7.11,
2405050, 25.06.05., 2025.04.07 첨부 업데이트, 2025. 12. 01,
2023/09/27, 2404013, 2025.1.15, 20204.10.11, 26.06.01`, 2405101,
2025.03.03., 0207, 2024.02.22 (2025.04.03 업데이트), 25.12.12.,
2602274, 0328, 202408024, 폐업일자:2023-09-21, 20230911 / 24.08.16,
240912수정, 0726, 2023/09/19, 2018. 05. 24.
```

등록일자 null 적재 건수는 결과의 `registrationDateNullRows()`로 보고한다. 전수 원문은 `staging.ecount_partner_raw.raw_registration`에서 재파싱할 수 있다.

## 3. YY 2자리 해석 근거

구현 위치: [EcountPartnerImporter.java](/C:/dev/Samhan-Public/.claude/worktrees/tpartner/services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java)의 `parseRegistrationDate()` Javadoc 및 본문.

```java
int year = 2000 + Integer.parseInt(digits.substring(0, 2));
```

현재 업무 데이터의 날짜 범위가 2000년대이고, PM 결정이 `26 → 2026`이므로 2자리 연도는 2000년대로 해석한다. 이 판단이 바뀌어도 staging의 raw 원문에서 다시 파싱할 수 있어 원자료 손실이 없다.

## 4. 잃으면 안 되는 것 — 확인 원문

| 항목 | 코드/검증 원문 |
|---|---|
| ① 멱등 | `staging`은 `(source_file_hash, source_row_no)` ON CONFLICT UPDATE, `partners`는 `partner_code` UPSERT. IT는 RUN 2 `imported=0`, snapshot 동일, UUID 포함 값을 비교하도록 작성됨. 단 실제 RUN은 Flyway 블로커로 미실행. |
| ② status 보존 | `upsertPartner()` 기존 행 분기에는 `changeStatus()`가 없고 주석으로 “기존 비활성 거래처를 파일 YES만으로 되살리지 않는다”를 명시했다. 단위 테스트 `기존_status는_파일이_YES여도_되살리지_않고_credit_limit_빈칸은_null()`이 확인한다. |
| ③ outstanding_balance | 기존 행 갱신에서 `outstandingBalance`를 변경하는 호출이 없고, IT는 `outstanding_balance = 0` 행 수를 확인하도록 작성됐다. |
| ④ DB-only 55건 | importer는 원문 파일의 `partner_code`만 조회·갱신하며 파일에 없는 partner 행을 삭제/비활성화하는 SQL이 없다. 실제 일회용 DB 비교는 Flyway 블로커 해소 후 수행해야 한다. |
| ⑤ credit_limit 빈칸 | `parseCreditLimit()`의 빈값/`-`/형식 실패 결과는 `null`; `replaceCreditLimitFromImport(null)`로 반영한다. `Partner`와 V14가 nullable을 보장한다. 단위 테스트가 빈값 null을 확인한다. |
| ⑥ trailer | `isTrailerRow()`가 A열 timestamp + 나머지 빈 행을 제외하며, 원문 trailer는 7256행 1건이다. IT는 `excludedTrailerRows == 1`을 확인하도록 작성됐다. |
| ⑦ V14 | [V14__allow_unset_partner_credit_limit.sql](/C:/dev/Samhan-Public/.claude/worktrees/tpartner/services/partner-service/src/main/resources/db/migration/V14__allow_unset_partner_credit_limit.sql)과 `Partner.creditLimit` nullable 변경을 유지했다. |

## 5. 신규 파일 경로

- [docs/dev-reports/2026-08-09-896-partner-master-load-3.md](/C:/dev/Samhan-Public/.claude/worktrees/tpartner/docs/dev-reports/2026-08-09-896-partner-master-load-3.md)
- [services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java](/C:/dev/Samhan-Public/.claude/worktrees/tpartner/services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java) — 2차 미커밋 신규 파일, 3차 관문 보강
- [services/partner-service/src/main/resources/db/migration/V14__allow_unset_partner_credit_limit.sql](/C:/dev/Samhan-Public/.claude/worktrees/tpartner/services/partner-service/src/main/resources/db/migration/V14__allow_unset_partner_credit_limit.sql) — 2차 미커밋 신규 파일

## 검증 기록

```text
./gradlew :services:partner-service:test --tests "com.samhanair.logis.partner.service.EcountPartnerImporterTest" --rerun-tasks
→ clean 환경 BUILD SUCCESSFUL

./gradlew :services:partner-service:test --tests "com.samhanair.logis.partner.seed.PartnerMasterLoadIT" ...
→ FAILED before DB run: Flyway V3 resource inputstream
```

커밋·푸시는 수행하지 않았다.
