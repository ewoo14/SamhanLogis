# MIG-20 이카운트 raw 자동 재import 스케줄

> 날짜: 2026-05-21
> 브랜치: `spec/2026-05-21-mig-20-scheduled-reimport`
> 범위: accounting-service 재import trigger + auth PageCode + 운영 가이드

---

## 1. 배경

MIG-19 cutover 가이드 이후 운영자가 매월 이카운트 raw 파일을 같은 디렉토리에 내려받고, 기존 MIG-1~11 importer/transform 흐름을 반복 실행할 수 있는 단일 trigger가 필요했다. Spring `@Scheduled`는 실행 시점과 장애 복구를 서비스 배포에 묶으므로 제외하고, MASTER 전용 수동 endpoint를 외부 cron/Task Scheduler가 호출하는 방식으로 정리했다.

---

## 2. 변경 요약

| 파일 | 변경 |
|---|---|
| `shared/common/.../EcountReimportResult.java` | MIG-20 결과 DTO 추가 |
| `shared/common/.../ErrorCode.java` | `MIG20_SLICE_UNKNOWN`, `MIG20_RAW_DIR_NOT_FOUND`, `MIG20_REIMPORT_FAILED` 추가 |
| `services/accounting-service/.../EcountReimportService.java` | raw 파일 scan, slice whitelist, hash skip, 기존 importer/transform 호출 |
| `services/accounting-service/.../EcountReimportController.java` | `POST /admin/ecount/reimport/{slice}` 추가 |
| `services/accounting-service/.../EcountRemoteImportClient.java` | partner/product/user/inventory 기존 admin import endpoint 호출 |
| `services/accounting-service/.../V33__add_ecount_reimport_file_runs.sql` | cross-service 파일 처리 hash 기록 |
| `services/auth-service/.../PageCode.java` | `ECOUNT_REIMPORT` 추가 |
| `services/auth-service/.../V26__seed_mig20_reimport_page_code.sql` | MASTER edit seed 추가 |
| `docs/migration/ECOUNT-CUTOVER-GUIDE.md` | 자동 재import 절차 추가 |
| `migration/decisions/DECISIONS.md` | D-MIG-20 결정 추가 |

---

## 3. 구현 메모

- slice 입력은 `mig-1`~`mig-11`만 허용하며, `_` 입력은 `-`로 정규화한다.
- 기본 raw directory는 `docs/migration/ecount-data/raw/`이고 `ecount.reimport.raw-dir`로 바꿀 수 있다.
- accounting-service 소유 importer는 직접 호출한다.
- partner/product/user/inventory 소유 importer는 기존 admin endpoint를 `X-User-Id`, `X-User-Role=MASTER` 헤더와 multipart로 호출한다.
- accounting staging table에 `source_file_hash`가 이미 있거나 `staging.ecount_reimport_file_runs`에 같은 slice/target/hash가 있으면 파일 단위 skip한다.
- MIG-7~10은 raw 파일이 아니라 기존 staging/domain 대상 transform 단계이므로 command detail로 실행한다.

---

## 4. 결정

| 결정 | 내용 |
|---|---|
| D-MIG-20-01 | Spring `@Scheduled` 대신 수동 trigger endpoint + 외부 cron/Task Scheduler로 운영한다. |
| D-MIG-20-02 | 단일 endpoint `POST /admin/ecount/reimport/{slice}`가 MIG-1~11 slice를 모두 받는다. |
| D-MIG-20-03 | 실행 권한은 정적 `ROLE_MASTER`와 동적 `ecount.reimport` EDIT를 모두 통과해야 한다. |
| D-MIG-20-04 | raw 파일 scan 위치는 `docs/migration/ecount-data/raw/`를 기본값으로 둔다. |
| D-MIG-20-05 | 멱등성은 기존 `source_file_hash` staging 확인과 MIG-20 run registry를 함께 사용한다. |
| D-MIG-20-06 | 외부 스케줄 실패 알림은 notification-service Slack alert 연동 대상으로 문서화하고, 본 슬라이스에서는 호출 예시와 운영 절차를 제공한다. |

---

## 5. 검증

- RED 확인:
  - `./gradlew :services:accounting-service:compileTestJava :services:auth-service:test --no-daemon`
  - 실패 원인: `EcountReimportService`, `EcountReimportResult`, `MIG20_SLICE_UNKNOWN`, `ECOUNT_REIMPORT` 미존재
- GREEN 확인:
  - `./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava :services:auth-service:test --no-daemon` PASS
  - `./gradlew :services:accounting-service:test --tests "com.samhanair.logis.accounting.it.EcountReimportControllerIT" --no-daemon` PASS

- 최종 통합 검증:
  - `./gradlew :services:accounting-service:test :services:auth-service:test :shared:common:test --no-daemon` PASS
