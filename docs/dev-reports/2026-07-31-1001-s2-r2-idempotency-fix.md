# PR #1003 / Issue #1001 슬라이스 2 fix 라운드 — 멱등 지문 하위 호환

## 판정

배포 전 멱등 키 재시도 회귀를 수정했다. 배송주소가 없는 재시도에 한해 배포 전 지문을 추가로 대조하며, 배송주소가 있는 요청은 새 지문만 대조한다. 저장된 기존 전표의 배송주소가 비어 있지 않으면 legacy fallback도 적용하지 않는다.

따라서 다음 불변식을 동시에 보장한다.

- 배포 전 키 + 동일 본문(배송주소 미전달) → 기존 전표 replay
- 같은 키 + 다른 배송주소 → `409 CONFLICT`
- 단건·병합 race 재조회 경로에도 같은 비교 적용

## RED 원문

수정 전 테스트 명령:

```powershell
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishControllerIT.배포전_단건멱등키_배송주소없는_재시도는_기존전표를_replay한다 --tests com.samhanair.logis.slip.publish.SlipPublishControllerIT.배포전_단건멱등키에_새배송주소를_넣은_재시도는_409다 --rerun-tasks --console=plain
```

종료코드: `1`

```text
SlipPublishControllerIT > 배포전_단건멱등키_배송주소없는_재시도는_기존전표를_replay한다() FAILED
    java.lang.AssertionError at SlipPublishControllerIT.java:201

2 tests completed, 1 failed
BUILD FAILED
```

병합 RED 재현:

```powershell
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishMergeIT.배포전_병합멱등키_배송주소없는_재시도는_기존전표를_replay한다 --rerun-tasks --console=plain
```

종료코드: `1`

```text
SlipPublishMergeIT > 배포전_병합멱등키_배송주소없는_재시도는_기존전표를_replay한다() FAILED
    java.lang.AssertionError at SlipPublishMergeIT.java:512

1 test completed, 1 failed
BUILD FAILED
```

두 RED 모두 기대한 replay 응답이 기존 strict 지문 비교에서 `409`로 막히는 원인으로 실패했다.

## 변경 요지

`SlipPublishService`에 배송주소 필드가 추가되기 전의 단건·병합 canonical 입력을 재현하는 legacy 지문 계산을 추가했다. 발행 요청이 배송주소를 전달하지 않은 경우에만 현행 지문과 legacy 지문을 함께 비교한다. 주소가 전달되면 legacy 지문을 계산하지 않으므로 서로 다른 주소가 같은 키로 replay되지 않는다.

기존 전표의 배송주소가 `NULL`인 경우에만 legacy 일치를 허용했다. 이 조건은 저장 전표의 실제 주소와 요청 주소가 어긋난 비정상 데이터를 느슨하게 replay하지 않도록 하는 방어선이다.

## 실 데이터 실측

공유 DB에는 읽기 전용 SQL만 실행했다. Docker 이미지 재빌드, 서비스 재기동, backfill, 공유 DB 쓰기는 하지 않았다.

명령:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FILTER (WHERE is_deleted=false), count(*) FILTER (WHERE is_deleted=false AND request_fingerprint IS NOT NULL), count(DISTINCT idempotency_key) FILTER (WHERE is_deleted=false), count(*) FILTER (WHERE is_deleted=false AND idempotency_key LIKE 'PO-MRG-%'), count(*) FILTER (WHERE is_deleted=false AND idempotency_key NOT LIKE 'PO-MRG-%') FROM slip_publish_audit WHERE source_type='PARTNER_ORDER';"
```

종료코드: `0`

```text
16|16|16|3|13
```

추가 주소 상태 조회:

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL AND s.idempotency_key IS NOT NULL AND s.delivery_address IS NULL;"
```

종료코드: `0`, 결과: `16`

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT CASE WHEN s.idempotency_key LIKE 'PO-MRG-%' THEN '병합' ELSE '단건' END, count(*) FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL GROUP BY 1 ORDER BY 1;"
```

종료코드: `0`

```text
단건|13
병합|3
```

```powershell
docker exec samhan-postgres psql -U samhan -d slip_db -At -F '|' -c "SELECT count(*) FROM slips s JOIN slip_publish_audit a ON a.slip_id=s.id WHERE s.is_deleted=false AND a.is_deleted=false AND a.source_type='PARTNER_ORDER' AND a.request_fingerprint IS NOT NULL AND s.delivery_address IS NOT NULL;"
```

종료코드: `0`, 결과: `0`

| 구분 | 단건 | 병합 | 합계 |
|---|---:|---:|---:|
| 배포 전 키 노출 실데이터 | 13 | 3 | 16 |
| 수정 전 strict-only 재시도 차단 | 13 | 3 | 16 |
| 수정 후 legacy 지문 replay | 13 | 3 | 16 |
| 수정 후 잘못된 replay | 0 | 0 | 0 |
| 수정으로 새로 막힌 정상 발행 | 0 | 0 | 0 |

수정 전·후의 실데이터 행 자체는 변경하지 않았다. 위 변경 전후 수치는 동일 입력 재시도에 대한 코드 판정 수치다. 새 배송주소를 넣은 재시도는 단건·병합 각각 409로 확인했으며 이는 정상적인 의도된 차단이다.

## 테스트

### 회귀 테스트

명령:

```powershell
.\gradlew.bat :services:slip-service:test --tests com.samhanair.logis.slip.publish.SlipPublishControllerIT.배포전_단건멱등키_배송주소없는_재시도는_기존전표를_replay한다 --tests com.samhanair.logis.slip.publish.SlipPublishControllerIT.배포전_단건멱등키에_새배송주소를_넣은_재시도는_409다 --tests com.samhanair.logis.slip.publish.SlipPublishMergeIT.배포전_병합멱등키_배송주소없는_재시도는_기존전표를_replay한다 --tests com.samhanair.logis.slip.publish.SlipPublishMergeIT.배포전_병합멱등키에_새배송주소를_넣은_재시도는_409다 --rerun-tasks --console=plain
```

종료코드: `0`, 결과: `BUILD SUCCESSFUL`

### 모듈 전체

새 통합 테스트가 기존 통합 테스트에 미치는 영향을 확인하기 위해 모듈 전체를 다시 실행했다.

명령:

```powershell
.\gradlew.bat :services:slip-service:test --rerun-tasks --console=plain
```

종료코드: `0`, 결과: `BUILD SUCCESSFUL in 4m 59s`

테스트 XML 집계: `1,493 tests / 0 failures / 0 errors / 0 skipped`.

중간에 120초·300초 실행 제한으로 종료코드 `124`가 발생한 시도는 통과 증거로 세지 않았다. 남은 로컬 Gradle 테스트 프로세스를 식별·종료한 뒤 900초 제한으로 같은 전체 명령을 끝까지 실행해 종료코드 `0`을 확인했다.

## 신규 파일

- `docs/dev-reports/2026-07-31-1001-s2-r2-idempotency-fix.md` (본 보고서)
- 기존 테스트 파일 2개와 서비스 파일 1개를 수정했다.

`git status --porcelain` 원문:

```text
 M services/slip-service/src/main/java/com/samhanair/logis/slip/publish/SlipPublishService.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishControllerIT.java
 M services/slip-service/src/test/java/com/samhanair/logis/slip/publish/SlipPublishMergeIT.java
?? docs/dev-reports/2026-07-31-1001-s2-r2-idempotency-fix.md
```

## 이번에 안 본 것

- exact SHA를 공유 서버에 배포한 HTTP 라이브QA. Docker 재빌드·서비스 재기동 금지 조건으로 미실행.
- 공유 DB의 V14 실제 적용, DDL lock, 구버전·신버전 동시 접근 및 rollback. 공유 DB 쓰기 금지로 미실행.
- 실데이터의 16개 키 각각에 대한 실제 HTTP 재요청. DB 집계와 exact 코드의 단건·병합 회귀 테스트로 판정했다.
- 슬라이스 3·4·5: 회계 통합 원장 API, 데스크톱 화면·CSV, 실제 인쇄.
- 과거 배송주소 backfill 및 `shipping_address`·적요 파싱 우회.
