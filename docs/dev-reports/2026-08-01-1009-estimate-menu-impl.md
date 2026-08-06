# 종합견적서 `견적서` 메뉴 구현 보고서

## 착수 확인

- 작업 위치: `C:/dev/Samhan-Public/.claude/worktrees/t1009` 확인.
- 지정 기획서 `docs/dev-reports/2026-08-01-1009-estimate-plan.md` 확인.
- 3라운드 갭 보고서 `docs/dev-reports/2026-08-01-1009-estimate-recon-r3.md` 확인.
- 확정 전제 기록: 계산 갭 0건, 유연호스 단가는 현행 8,000원 유지, Notion/base64는 계승하지 않음.
- 이번 저장 데이터는 재오픈 시 동일 금액을 재현할 수 있도록 브라우저 계산의 입력 스냅샷(견적 메타데이터, 거래처/가격·할인 설정 스냅샷, 품목별 모델·표시명·수량·단가·할인·세액 및 계산 결과)을 DB에 저장해야 한다는 방향으로 확정했다. 구현 전 현행 계약을 추가 확인한다.

## 정찰 결과

- 기존 `QuoteSnapshot`은 `snapshot_data`에 `takeSnapshot()` 전체를 base64 문자열로 저장하고, `userEmail` 조건으로 작성자 본인 목록만 반환한다. 이는 이번 사양 C/B/E에 맞지 않는다.
- 기존 `Estimate` 정규화 도메인은 별도 데스크톱 견적서 CRUD이며, 종합견적서의 브라우저 상태(분기·커스텀행·수동가격·할인 설정)를 모두 표현하지 못한다. 이번 메뉴의 저장 모델로 재사용하면 F를 보장할 수 없다.
- 기존 `EstimateService.update()`에는 작성자 소유권 검사가 없고 전역 `estimates.list` UPDATE 권한만 검사한다. 이번 A를 만족하려면 종합견적서 저장 메뉴의 수정 API에 별도 owner 집합 검사가 필요하다.
- 저장 대상 설계: DB JSON/JSONB에 base64가 아닌 원본 브라우저 입력 상태(`form`, `branch`, `core`, `timestamp`)를 저장하고, 목록용 거래처명·작성자 표시값·계산 합계(공급가/부가세/총액)를 별도 컬럼/필드로 저장한다. 미리보기 base64 이미지는 저장 대상에서 제외한다. 재오픈은 원본 상태를 복원한 뒤 기존 브라우저 계산을 다시 실행하며, 저장 당시 총액과 재계산 총액을 숫자로 비교한다.

## 설계 승인 대기

제안 구현은 기존 종합견적서의 `QuoteSnapshot` 경계를 정규화하여 (1) base64 대신 JSON/JSONB 상태 저장, (2) 전체 사용자 목록 조회, (3) 작성자 집합에 자동 포함된 소유권 검사로 본인만 수정, (4) 원본 상태 복원과 합계 숫자 회귀를 추가하는 방식이다. 기존 `Estimate`/계산 규칙/다른 서비스 모듈은 건드리지 않는다.

## 2026-08-01 구현 결과 — RED → GREEN

### RED 원문

실패 테스트를 먼저 추가하고 다음 명령을 실행했다.

```text
& '.\gradlew.bat' :services:slip-service:test --tests "com.samhanair.logis.slip.estimate.snapshot.it.QuoteSnapshotControllerIT" --no-daemon
```

```text
QuoteSnapshotControllerIT > RED-1009 타인 수정은 거부하고 본인 수정은 허용해야 한다 FAILED
    java.lang.AssertionError at QuoteSnapshotControllerIT.java:285

QuoteSnapshotControllerIT > RED-1009 목록은 작성자와 무관하게 타인 견적도 조회해야 한다 FAILED
    java.lang.AssertionError at QuoteSnapshotControllerIT.java:260

QuoteSnapshotControllerIT > RED-1009 저장은 JSON 상태·작성자·계산 합계를 DB 계약으로 보존해야 한다 FAILED
    java.lang.AssertionError at QuoteSnapshotControllerIT.java:240

QuoteSnapshotControllerIT > RED-1009 저장 후 재조회해도 저장된 총액 숫자가 동일하다 FAILED
    java.lang.AssertionError at QuoteSnapshotControllerIT.java:302

12 tests completed, 4 failed
BUILD FAILED
```

실패 이유 원문은 각각 기존 PUT 미등록(405/500 경로), 목록의 `userEmail` 필수(400), JSON 상태 저장 DTO 부재(400), 합계 필드 부재(400)였다. 기존 8개 테스트는 통과했다.

### 구현

- `QuoteSnapshot`을 `snapshot_state JSONB` + `author_email` + `supply_amount`/`vat_amount`/`total_amount`로 정규화했다. preview/base64 저장 컬럼은 제거했다.
- 신규 `V100__normalize_quote_snapshot_json_owner_totals.sql`에서 기존 V36을 수정하지 않고 유효한 기존 base64 JSON을 JSONB로 1회 변환한 뒤 구 컬럼을 제거한다. 서비스 모듈 migration 최대 V59 확인 후 여유를 둔 V100을 사용했다.
- `GET /internal/estimates/snapshots`와 `/by-customer`는 `userEmail` 생략 시 전체 활성 견적을 최신순 조회한다. 작성자 행도 같은 전체 집합에 포함된다.
- `PUT /internal/estimates/snapshots/{id}`는 요청 이메일과 저장된 `author_email` exact match일 때만 수정한다. 타인은 403, 본인은 200이다.
- 종합견적서 프론트는 저장 상태를 JSON 그대로 전송하고, 저장 목록에 작성자를 표시한다. 기존 JSON/base64 복원 입력은 경계에서 JSON으로 변환하되 DB에는 base64를 저장하지 않는다. 미리보기 image는 새 저장 payload에서 제외했다.
- 기존 계산 함수와 가격·할인·발행 경로는 변경하지 않았다. 저장 시점의 합계 숫자만 metadata로 기록한다.

### A·B 실행 확인 원문

`only_author_can_update` 테스트에서 같은 견적에 대해 다음을 실행했다.

```text
USER_B 수정 PUT → HTTP 403
USER_A 수정 PUT → HTTP 200
```

`history_includes_other_users_quotes` 테스트에서 USER_A와 USER_B를 각각 저장한 뒤 작성자 필터 없이 조회했다.

```text
GET 목록 → HTTP 200
목록 크기 → 2
USER_B 작성 견적 → 조회됨
```

### F 실행 확인 원문

```text
저장 supplyAmount = 100000
저장 vatAmount    = 10000
저장 totalAmount  = 110000
재조회 totalAmount = 110000
```

### GREEN 및 전체 검증 원문

좁은 권한·저장·목록·재오픈 테스트:

```text
12 tests completed
BUILD SUCCESSFUL
```

변경 모듈 전체 테스트:

```text
& '.\gradlew.bat' :services:slip-service:test --no-daemon --console=plain
BUILD SUCCESSFUL in 4m 54s
18 actionable tasks: 1 executed, 17 up-to-date
```

프론트 변경으로 typecheck도 실행했다.

```text
cd clients/web/estimate-app
npm run typecheck

typecheck OK: 14 JavaScript files
```

`clients/web/estimate-app/node_modules`는 없음(`False`)으로 확인했지만, typecheck 스크립트는 설치 의존 없이 실행되어 통과했다. 공유 Docker 재빌드·재기동과 실 DB 쓰기는 하지 않았다.

estimate-app 전체 Jest 테스트 실행 원문:

```text
npm test -- --runInBand
> @samhan/estimate-app@2.0.0 test
> jest --passWithNoTests --runInBand

'jest' is not recognized as an internal or external command,
operable program or batch file.
```

판정: 프론트 Jest는 `node_modules` 부재로 실행 불가하여 PM 확인 대상으로 남긴다. typecheck 및 변경 백엔드 전체 테스트는 별도로 통과했다.
