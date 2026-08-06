# #1016 S1 거짓 성공 표시 제거 보고서

작성일: 2026-08-06  
범위: 주소록 mock 경로의 외부 미전달 결과를 성공·신규 건수로 표시하지 않도록 계약과 화면을 수정

## 1. 거짓 성공을 만들던 원인

정찰 보고서의 변경 전 위치와 이번 변경 후 위치를 함께 기록한다.

| 원인 | 변경 전 증거 | 현재 경계 |
|---|---|---|
| mock 이 외부 호출 없이 입력 수를 신규 성공으로 반환 | `services/notification-service/src/main/java/com/samhanair/logis/notification/client/MockAligoAddressBookClient.java:51-62`의 `UploadResult.success(contacts.size())` | 같은 파일 `:54`, `:62`에서 `UploadResult.notDelivered()` 반환 |
| sync 서비스가 client 결과의 added/updated/skipped 를 전달 여부 확인 없이 합산 | `services/notification-service/src/main/java/com/samhanair/logis/notification/service/AligoAddressBookSyncService.java:88-90` | 현재 `:95-101`에서 `deliveryStatus`를 합치고 외부 전달 상태일 때만 건수 합산 |
| FE 가 added/updated 를 곧바로 신규/변경 chip 으로 표시 | 정찰 보고서 기준 `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.tsx:225-246` | 현재 `:258-279`에서 외부 전달이 없으면 신규·변경을 0으로 표시 |
| API 응답에 외부 전달 여부가 없음 | 변경 전 `AligoAddressBookSyncResponse` 4개 필드 | `services/notification-service/src/main/java/com/samhanair/logis/notification/dto/AligoAddressBookSyncResponse.java:22-30`의 `deliveryStatus` 추가 |

즉, 목록을 읽고 chunk 를 처리하는 경로는 있었지만, 외부 전달 여부가 계약에 없어서 mock 의 입력 수가 운영자가 보는 성공 수로 오염됐다.

## 2. 변경 내용과 불변식 대조

- `AligoAddressBookDeliveryStatus`를 추가했다. 상태는 `NOT_DELIVERED`, `PARTIALLY_DELIVERED`, `DELIVERED` 세 가지다.
- `UploadResult`에 `deliveryStatus`를 추가하고 `notDelivered()` factory 를 만들었다. mock 은 입력 연락처를 계속 처리하고 로그도 남기지만 `added/updated/skipped=0`, `NOT_DELIVERED`를 반환한다.
- `AligoAddressBookSyncService`는 `NOT_DELIVERED` 결과의 수치를 합산하지 않는다. chunk 성공과 실패가 섞이면 `PARTIALLY_DELIVERED`로 합산한다.
- FE API 타입과 화면에 `deliveryStatus`를 연결했다. 화면은 현재 상태를 문장으로 표시하고, 미전달이면 신규·변경 chip 양수를 표시하지 않는다.
- mock bean 자체는 삭제하지 않았다. 실 client가 다음 슬라이스에서 2xx 결과를 기존 5필드 생성자 또는 `success(...)`로 반환하면 `DELIVERED` 경계가 자동으로 응답과 화면에 반영된다. 이번 슬라이스에서는 실 client를 추가하거나 호출하지 않았다.
- 안내 문구는 사용자가 실행할 수 없는 후속 행동을 지시하지 않는다. 화면은 “현재 외부 전달 없음”과 “CSV 다운로드도 전달 완료 증거가 아님”만 표시한다. 기존 CSV 다운로드 기능과 동기화 API 실행 기능은 그대로 보존한다.

불변식 판정:

1. 외부 미전달 contact 는 서버에서 added/updated 로 계수되지 않고, FE에서도 신규·변경 양수로 표시되지 않는다.
2. `admin-aligo-delivery-status`와 화면 안내 문구로 실제 전달이 아님을 즉시 알 수 있다.
3. 사용자가 수행할 수 없는 수동 업로드를 안내하지 않는다. CSV 버튼은 실제 파일 다운로드 기능으로 남지만, 전달 완료로 과장하지 않는다.
4. `MockAligoAddressBookClient`와 sync endpoint는 남아 있으며 목록 fetch·chunk 호출을 계속 처리한다.
5. client 결과의 `deliveryStatus`가 경계다. 다음 실 client가 `DELIVERED` 결과를 반환하면 같은 집계·화면 코드가 실제 전달 상태로 전환된다.

## 3. RED-A / RED-B 위치와 실행 결과

### RED-A — 기능이 동작한다

단정 위치:

- `services/notification-service/src/test/java/com/samhanair/logis/notification/service/AligoAddressBookSyncServiceTest.java:64-89`
  - 연락처 120건을 50/50/20 세 chunk 로 나누고 `uploadChunk`를 세 번 호출한다.
- `services/notification-service/src/test/java/com/samhanair/logis/notification/service/AligoAddressBookSyncServiceTest.java:91-108`
  - 429 두 번 뒤 성공 응답을 재시도하고 최종 `DELIVERED`를 유지한다.
- `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.test.tsx:57-74`
  - 실제 전달 계약 응답을 받으면 화면이 신규·변경 양수를 표시한다.

### RED-B — 결함이 재발하지 않는다

단정 위치:

- `services/notification-service/src/test/java/com/samhanair/logis/notification/client/MockAligoAddressBookClientTest.java:14-29`
  - 실제 mock bean 호출 결과가 `NOT_DELIVERED`이고 모든 성공성 건수가 0인지 고정한다.
- `services/notification-service/src/test/java/com/samhanair/logis/notification/service/AligoAddressBookSyncServiceTest.java:169-185`
  - client가 미전달 상태에서 양수 added를 가진 결과를 반환해도 sync 응답 added는 0이다.
- `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.test.tsx:36-55`
  - 화면의 mock 응답이 양수여도 상태 문구가 “실제 알리고 전달 0건”이고 신규·변경 chip은 0이다.

실행 원문:

```text
PS> ./gradlew :services:notification-service:test --tests "*Aligo*" --tests "*AddressBook*" --console=plain
> Task :services:notification-service:test
BUILD SUCCESSFUL in 42s
18 actionable tasks: 3 executed, 15 up-to-date
```

```text
PS> npx vitest run --config vitest.config.ts src/renderer/routes/admin/AligoAddressBookPage.test.tsx
✓ src/renderer/routes/admin/AligoAddressBookPage.test.tsx (3 tests)
Test Files  1 passed (1)
Tests       3 passed (3)
```

프런트 필수 타입 검증:

```text
PS> npm run typecheck
ℹ tests 50
ℹ pass 50
ℹ fail 0
Exit code: 0
```

## 4. 상태·화면 조합과 실제 검증 결과

| 상태 | 입력/응답 조합 | 밟은 결과 |
|---|---|---|
| `NOT_DELIVERED` — mock 비어 있지 않음 | 7건 입력, client가 양수 added를 가진 미전달 결과 반환 | 서버 added/updated/skipped=0, 화면 `실제 알리고 전달 0건`, 신규 0·변경 0. `AligoAddressBookSyncServiceTest`와 FE 1번 테스트 통과 |
| `NOT_DELIVERED` — 원천 목록 없음 | CSV source 빈 목록 | client 호출 0회, 0/0/0 응답, `NOT_DELIVERED`. 기존 empty-source RED-A 경로 통과 |
| `DELIVERED` — 실 client 계약 fixture | 120건 chunk 처리 또는 FE 응답 added 3/updated 1 | 서버는 성공 fixture의 수치를 유지하고 `DELIVERED`, 화면은 신규 3·변경 1 표시. 외부 vendor 호출은 하지 않았으며 계약 경계만 검증 |
| `PARTIALLY_DELIVERED` — chunk 혼합 | 첫 chunk 전달 성공, 둘째 chunk HTTP 500 | 서버 added 50, failed 1, `PARTIALLY_DELIVERED`; 화면은 일부 전달 문구·신규 2·실패 1을 표시. 다음 실 client/실패 응답 조합을 위한 셋째 상태도 고정 |

## 5. 제거·개명 식별자 grep 전수 결과

※ 아래 결과는 이 보고서가 과거 문자열을 증거로 인용하므로 보고서 파일 자체를 제외하고
소스·테스트·프런트 렌더러 범위에서 실행했다.

변경 전 거짓 성공 표현 및 개명 대상:

```text
[UploadResult.success(contacts.size())] 0 matches
[sync_mockClient_dryRunResponse_isPassedThrough] 0 matches
[TODO(PR-F2)] 0 matches
[mock dryRun 모드입니다 (실 알리고 호출 없음)] 0 matches
```

개명한 식별자:

- `sync_mockClient_dryRunResponse_isPassedThrough` → `sync_mockClient_notDeliveredResponse_hasNoPositiveCounts`
- `MockAligoAddressBookClient`는 제거·개명하지 않았다. mock 경로 보존 불변식 때문에 bean과 endpoint를 유지했다.
- 신규 전달 상태 식별자는 `AligoAddressBookDeliveryStatus`와 `deliveryStatus`다. 관련 production/test 참조를 `rg`로 전수 확인했다.

## 신규 파일

- `docs/dev-reports/2026-08-06-1016-s1-honest-reporting.md`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/dto/AligoAddressBookDeliveryStatus.java`
- `services/notification-service/src/test/java/com/samhanair/logis/notification/client/MockAligoAddressBookClientTest.java`
- `clients/desktop/src/renderer/routes/admin/AligoAddressBookPage.test.tsx`

커밋·푸시·브랜치 조작·Docker 재빌드·재배포·외부 Aligo 호출은 수행하지 않았다.
