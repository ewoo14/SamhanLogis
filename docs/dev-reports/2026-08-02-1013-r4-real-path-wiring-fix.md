# PR #1059 / 이슈 #1013 — R4 real-path wiring fix

## 1. 원인

R3에서 확인한 0건 도달의 직접 원인은 notification-service에 운영용 `SlipServiceClient` 구현이 없고 `NoopSlipServiceClient`만 등록되어 `/internal/slips/outbound`를 호출하지 못한 것이었다. `blocked`도 `NoopBlockedPartnerLookupClient`가 항상 `false`를 반환했다.

추가로 preview는 단톡방 매핑이 없으면 blocked lookup 전에 `unmapped`로 빠졌고, send는 lookup 예외를 `false`로 취급해 SMS 경로로 진행했다. 즉 실 데이터의 SMS fallback 집합과 blocked 가드가 같은 경로에 있지 않았다.

## 2. RED 원문

수정 전, 요구한 두 결함을 재현하는 테스트를 먼저 실행했다.

### RED-1 — 실 전표 client 부재

```text
RestClientSlipServiceClientTest > operationalSlipClient_isPresent() FAILED
    java.lang.ClassNotFoundException at RestClientSlipServiceClientTest.java:12
```

### RED-2 — blocked 경로 미연결

```text
DispatchBatchPreviewServiceTest > 단톡방 miss → mapping empty → unmapped 누적 FAILED
    org.mockito.exceptions.verification.WantedButNotInvoked at DispatchBatchPreviewServiceTest.java:103

DispatchBatchSendServiceTest > blocked 조회 실패 — 안전하게 차단하고 SMS adapter에 도달하지 않는다 FAILED
    org.opentest4j.AssertionFailedError at DispatchBatchSendServiceTest.java:136

13 tests completed, 3 failed
```

RED-2는 preview의 unmapped blocked 미조회와 send의 lookup 예외 fail-open을 한 번에 재현했다.

## 3. fix

- `RestClientSlipServiceClient`를 추가했다.
  - `GET /internal/slips/outbound?from=&to=` 호출
  - `X-Internal-Token` 전달
  - `ApiResponse.data[]`를 `OutboundSlipDto`로 변환
  - 연결/응답 오류는 빈 목록으로 숨기지 않고 예외로 노출
- `RestClientBlockedPartnerLookupClient`를 추가했다.
  - `GET /internal/partners/admin/blocks?page=0&size=5000` 호출
  - `ApiResponse.data.content[].partnerCode`를 실제 판정에 사용
  - 조회 실패는 `DispatchBatchSendService`에서 fail-closed(`blocked`) 처리
- 매핑이 없는 partnerCode도 preview에서 blocked lookup을 거치도록 연결했다.
- 테스트 프로파일의 Noop만 테스트 격리용으로 남기고, 기본 운영 경로는 실 client가 사용하도록 bean 조건을 정리했다.
- `SAMHAN_SLIP_SERVICE_URL` 설정을 추가했다(기본값 `http://localhost:8084`).

실제 SMS endpoint/어댑터 호출은 하지 않았다. `SENT`·`SUCCESS`도 실전달 성공으로 세지 않았다.

## 4. GREEN 원문

RED 대상과 HTTP 계약 테스트:

```text
BUILD SUCCESSFUL in 35.4s
```

notification-service 전체 테스트:

```text
BUILD SUCCESSFUL in 1m 9s
233 tests completed, 0 failures, 0 errors, 0 skipped
```

실 client 계약 테스트는 slip 응답 전표/라인/전화번호 변환, blocked 응답의 `P-BLOCKED=true`, 내부 토큰 헤더를 MockRestServiceServer로 검증했다.

## 5. 불변식 실측

공유 PostgreSQL은 SELECT만 실행했다. DB write/DDL, Docker 이미지 재빌드, send endpoint 호출은 하지 않았다.

| 불변식 | R4 결과 |
|---|---:|
| 1. 활성 OUTBOUND / 전화번호 보유 / preview 후보 | 2,303 / 1,911 / **1,911건** |
| 1. R3 당시 실 preview 도달 | 0건 — Noop 원인 확인, 운영 client wiring으로 경로 보완. 수정 image 재기동 후 live preview 재호출은 하지 않아 runtime post-fix 수치는 미검증 |
| 2. 테스트 blocked 행 판정 | `P-BLOCKED` 조회 응답 → **true**, send 결과 `BLOCKED=1`, SMS service 호출 0회 |
| 3. 번호 없는 활성 전표 | **392건**; `recipientPhone` 없는 행은 SMS entry에 들어가지 않음 |
| 3. 동일 전표 중복 | duplicate group **0**, duplicate extra row **0** |
| 4. 정상 발송 대상 감소 | 활성 blocked DB 행 **0**, 정상 fixture는 2건 그대로 처리되어 감소 **0건** |
| 5. 동일 번호 잠재 초과 요청 | 날짜별 phone group 기준 **1,909건**(1,908건 + 3건에서 각 첫 요청 제외) |

### 레거시 GAS 원문과 대조

`tools/legacy-gas/배차안내문자/Index.html:1154-1168`의 원문은 다음 정책이다.

```javascript
let key = roomKey ? 'R_' + roomKey : (phoneKey ? 'P_' + phoneKey : 'N_' + ai);
...
let k2 = rr ? 'R_' + rr : (rp ? 'P_' + rp : 'N_' + aj);
if (k2 !== key) break;
...
let group = list.slice(ai, aj);
group.forEach(g => { g['발송멘트'] = mergedText; });
```

즉 같은 날짜·같은 전화번호는 `P_<전화번호>` 그룹 하나의 병합 문구로 처리한다. 현행 FE는 현재 전표별 `buildSendEntries`라 이 부분은 아직 레거시와 다르다. **완전계승 기준에서는 레거시 그룹화가 맞다.** 이유는 동일 수신자에게 전표별 1건씩 보내는 현행 방식이 1,909건의 잠재 초과 요청을 만들고, GAS의 수신자 그룹·병합 문구 의미를 보존하지 못하기 때문이다. 이 R4에서는 실 경로/blocked wiring 범위를 넘는 FE 그룹화는 추가하지 않았으며, 따라서 불변식 5의 “현행=레거시”는 **미수렴**으로 명시한다.

번호 없음과 blocked의 레거시 원문도 확인했다. `Code.js:269-293`은 blocked를 먼저 행별 오류(`발송금지 업체입니다.`)로 남기고, `Code.js:299-305`는 번호 추출 실패를 빈 문자열로 유지하며, `Index.html:1154-1168`은 번호/방이 모두 없을 때도 `N_<index>` 행 그룹을 보존한다. 따라서 번호 없는 392건은 외부 전송에서 제외하되 결과 표본을 조용히 버리지 않는 것이 레거시와 맞는 후속 과제다.

## 6. 모듈 전체 테스트

실행 명령:

```text
.\gradlew.bat :services:notification-service:test
```

결과:

```text
233 tests completed, 0 failures, 0 errors, 0 skipped
BUILD SUCCESSFUL
```

프론트 코드는 변경하지 않았으므로 `clients/desktop` typecheck는 이번 라운드 대상이 아니다.

## 7. 파일별 변경량

`git diff --numstat` 기준 기존 파일은 추가·삭제를 분리해 기록했다. 새 파일은 전체 라인 수를 `+N/-0`으로 기록했다.

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/NoopBlockedPartnerLookupClient.java` | +3 | -2 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/NoopSlipServiceClient.java` | +3 | -1 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/RestClientBlockedPartnerLookupClient.java` | +77 | -0 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/client/RestClientSlipServiceClient.java` | +108 | -0 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchPreviewService.java` | +1 | -0 |
| `services/notification-service/src/main/java/com/samhanair/logis/notification/service/DispatchBatchSendService.java` | +1 | -1 |
| `services/notification-service/src/main/resources/application.yml` | +2 | -0 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/client/RestClientBlockedPartnerLookupClientTest.java` | +34 | -0 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/client/RestClientSlipServiceClientTest.java` | +66 | -0 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/service/DispatchBatchPreviewServiceTest.java` | +2 | -0 |
| `services/notification-service/src/test/java/com/samhanair/logis/notification/service/DispatchBatchSendServiceTest.java` | +20 | -0 |
| `docs/dev-reports/2026-08-02-1013-r4-real-path-wiring-fix.md` | +142 | -0 |

## 새로 만든 파일

- `services/notification-service/src/main/java/com/samhanair/logis/notification/client/RestClientBlockedPartnerLookupClient.java`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/client/RestClientSlipServiceClient.java`
- `services/notification-service/src/test/java/com/samhanair/logis/notification/client/RestClientBlockedPartnerLookupClientTest.java`
- `services/notification-service/src/test/java/com/samhanair/logis/notification/client/RestClientSlipServiceClientTest.java`
- `docs/dev-reports/2026-08-02-1013-r4-real-path-wiring-fix.md`
