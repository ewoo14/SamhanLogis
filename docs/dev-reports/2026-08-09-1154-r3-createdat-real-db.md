# PR #1154 R3 — created_at 실 DB 보정 보고서

- 작업일: 2026-08-09 KST
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tpartner`
- 브랜치: `feat/896-partner-master-load`
- 시작 HEAD: `ce7cc9aaa`
- 범위: 결함 1(`registration_date`와 DB `created_at` 불일치)만 수정
- 결함 2(삭제행 UUID 부활): 이번 라운드에 변경하지 않음
- 커밋/푸시: 수행하지 않음

## 1. 원인과 수정

R1의 실 PostgreSQL 결과와 PM 판정이 일치했다. 신규행은 `@CreatedDate` 감사가 `overrideCreatedAtForImport()` 값을 적재 시각으로 덮었고, 기존행은 `BaseEntity.createdAt`의 `updatable = false` 때문에 Hibernate UPDATE에서 `created_at`이 제외됐다.

`BaseEntity`와 전역 auditing 설정은 변경하지 않았다. `PartnerRepository`에만 native `UPDATE partners SET created_at = ...` 메서드를 추가하고, importer가 `save()` 후 `registrationDate != null`일 때만 호출하도록 했다. `@Modifying(flushAutomatically = true)`와 repository 메서드의 `@Transactional`로 신규 INSERT flush 후에도 DB 보정이 수행된다.

등록일자 없는 행에는 보정 호출이 없으므로 기존 `created_at`을 재적재로 변경하지 않는다. `created_by`, `modified_at`, `modified_by`, 정본 imported/updated 분포 및 여신한도 정책은 건드리지 않았다.

## 2. RED 원문

### RED-A — 신규행

명령:

```powershell
.\gradlew.bat --no-daemon --console=plain :services:partner-service:test --tests 'com.samhanair.logis.partner.seed.PartnerMasterLoadIT' --rerun-tasks
```

실행 인프라: Testcontainers PostgreSQL `16.14`, JDBC `jdbc:postgresql://localhost:54181/partner_db`.

테스트 결과 XML 원문:

```text
tests=4, failures=2, errors=0
RED-A failure:
actual "2026-08-09 16:41:36.84498"
expected prefix "2023-08-14 00:00:00"
```

### RED-B — 기존행

같은 실 PostgreSQL IT 실행에서 실패했다.

```text
RED-B failure:
actual "2026-08-09 16:43:03.279953"
expected prefix "2023-08-14 00:00:00"
```

RED-B 선행상태는 DB 직접 INSERT/UPDATE가 아니라 importer 공식 경로로 2023-01-01 행을 적재한 뒤 2023-08-14 행을 재적재해 만들었다.

### RED-C — 등록일자 없는 행

동일 IT에서 통과했다. 1회차와 2회차의 DB 값이 동일했다. 이는 결함 1 수정 전에도 보존되던 반대급부다.

### RED-D — 감사 축 보존

`BaseEntity`와 전역 auditing 설정을 변경하지 않았으므로 해당 없음이다. 따라서 partner 외 엔티티에 대한 별도 RED-D 테스트는 추가하지 않았다.

## 3. GREEN 원문

### GREEN-A~C 실 DB SELECT

명령:

```powershell
.\gradlew.bat --no-daemon --console=plain :services:partner-service:test --tests 'com.samhanair.logis.partner.seed.PartnerMasterLoadIT'
```

종료 코드: `0`

테스트 결과: `4 tests completed, 0 failed`, `BUILD SUCCESSFUL`.

IT가 실행한 SELECT와 출력:

```sql
SELECT created_at::text FROM partners WHERE partner_code = 'RED-A';
-- 2023-08-14 00:00:00

SELECT created_at::text FROM partners WHERE partner_code = 'RED-B';
-- 2023-08-14 00:00:00

SELECT created_at FROM partners WHERE partner_code = 'RED-C';
-- first=2026-08-09T16:49:48.669108
-- second=2026-08-09T16:49:48.669108
```

### 정본 7,253건 회귀

같은 `PartnerMasterLoadIT`의 기존 정본 XLSX 테스트도 통과했다.

```text
first.imported + first.updated = 7253
second.imported = 0
second.updated = first.imported
registrationDateParsedCount = 2423
createdAtLoadTimeCount = 4830
snapshot(UUID/name/credit_limit/status/group/created_at) 1회차 == 2회차
```

### 변경 파일 참조 테스트

```powershell
.\gradlew.bat --no-daemon --console=plain :services:partner-service:test --tests 'com.samhanair.logis.partner.service.EcountPartnerImporterTest'
```

종료 코드: `0`, `BUILD SUCCESSFUL`.

```powershell
.\gradlew.bat --no-daemon --console=plain :services:partner-service:test
```

종료 코드: `0`, `BUILD SUCCESSFUL`.

RED-D는 해당 없음이다. 전역 감사 축을 변경하지 않았으므로 partner 외 엔티티 테스트를 새로 추가하지 않았다.

## 4. R2 mock-only 단정 처리

R2가 추가한 다음 두 단위 테스트는 인메모리 엔티티 상태만 단정해 DB 결함을 가릴 수 있으므로 삭제했다.

- `기존_등록일자가_있으면_createdAt을_등록일_자정으로_교정한다`
- `기존_등록일자가_없으면_createdAt을_재적재로_변경하지_않는다`

두 불변식은 `PartnerMasterLoadIT`의 실 PostgreSQL RED-A/RED-B/RED-C로 교체했다. mock-only 단정은 유지하지 않았다.

## 5. 신규 생성 파일

- `docs/dev-reports/2026-08-09-1154-r3-createdat-real-db.md`

## 6. 변경 파일

- `services/partner-service/src/main/java/com/samhanair/logis/partner/repository/PartnerRepository.java`
- `services/partner-service/src/main/java/com/samhanair/logis/partner/service/EcountPartnerImporter.java`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/seed/PartnerMasterLoadIT.java`
- `services/partner-service/src/test/java/com/samhanair/logis/partner/service/EcountPartnerImporterTest.java`

## 7. 못 한 것

- git commit/push: 사용자 지시대로 수행하지 않음.
- 결함 2 삭제행 UUID 부활: 사용자 지시대로 이번 라운드에 손대지 않음.
- RED-D 실험: 공통 `BaseEntity`/전역 auditing 설정을 변경하지 않아 해당 없음.
- 운영 DB 표본 생성: 수행하지 않음. 모든 RED-A~C 표본은 Testcontainers PostgreSQL과 importer 공식 경로로 만들었고, 직접 INSERT/UPDATE는 사용하지 않음.
