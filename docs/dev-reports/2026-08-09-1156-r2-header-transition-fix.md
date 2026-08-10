# PR #1156 / Issue #1155 — R2 헤더·확정 전이 partnerCode 보강

## 0. 대상 및 제한

- 표기된 브랜치: `fix/1155-inbound-partner-code`
- 실제 확인 브랜치: `fix/1155-inbound-partner-code`
- HEAD: `0adcb384346aa1c5e110a346619e090f3108ca47` (`0adcb3843`과 일치)
- 작업 트리: `C:\dev\Samhan-Public\.claude\worktrees\t1155`
- 커밋·push 없음.
- `partner_code=1068689215` 데이터/코드는 접촉하지 않음. 해당 값은 R1 보고서의 기존 증거에만 존재.
- 공유 실 DB write 및 DB 직접 INSERT/UPDATE 없음. 이번 라운드는 코드·테스트만 변경.

## 1. fix 전 RED 원문

회귀 테스트를 먼저 추가하고 프로덕션 코드는 변경하지 않은 상태에서 실행했다.

```text
Command:
  .\gradlew.bat :services:slip-service:test
  --tests com.samhanair.logis.slip.service.SlipServiceTest --no-daemon

SlipServiceTest > send_inbound_fillsMissingPartnerCode_beforeTransition() FAILED
    org.opentest4j.AssertionFailedError at SlipServiceTest.java:833

SlipServiceTest > editHeader_partnerChanged_resolvesNewPartnerCode() FAILED
    org.opentest4j.AssertionFailedError at SlipServiceTest.java:1006

58 tests completed, 2 failed
BUILD FAILED
```

lookup 실패 케이스는 기존 코드도 전이를 성공시키므로, 호출 여부 검증을 추가해 “전이는 성공하지만 lookup 보강을 시도하지 않음”도 RED로 고정했다. `EstimateToSlipConverter`의 snapshot 테스트도 fix 제거 상태에서 4건 중 1건 실패했다.

## 2. 변경 내용

### 2.1 헤더 PATCH 두 경로의 규칙 단일화

`SlipService.syncPartnerCodeAfterHeaderMutation`을 유일한 헤더 snapshot 권위로 만들고 `editHeader`와 `updateSlip`이 함께 호출하게 했다.

| 입력 조합 | 결과 |
|---|---|
| partnerId A → B, resolve 성공 | B code 저장 |
| partnerId A → B, resolve 실패 | stale A code를 null로 clear |
| 같은 partnerId 재전송, 기존 code 있음 | 기존 snapshot 유지, 재resolve 안 함 |
| partnerId 유지/생략, code 공백 | resolve 성공 시만 채움 |

`updateSlip`의 기존 진짜 변경/동일 거래처 의미론은 helper로 이동했을 뿐 바꾸지 않았다.

### 2.2 send·confirm 마지막 보강 지점

`ensurePartnerCodeBeforeCommitTransition`을 `send`와 `confirm`의 mutation 안에 추가했다.

- `partnerId == null`: lookup 안 함.
- code가 non-blank: 재resolve 안 함.
- code가 비고 partnerId가 있음: resolve 성공 시 snapshot 저장.
- resolve 실패/empty: 전이를 계속하여 fail-open 유지.

### 2.3 sweep에서 발견한 추가 지점

| 지점 | partnerId 설정/전달 | partnerCode 처리 | 판정/조치 |
|---|---|---|---|
| `SlipService.create` | `Slip.createInbound/Outbound` | 생성 시 resolve | 기존 통과 |
| `SlipService.editHeader` | `Slip.editHeader` | 공통 helper | 이번 수정 |
| `SlipService.updateSlip` | `Slip.editHeader` | 공통 helper | 기존 규칙 보존·중복 제거 |
| `SlipService.send` | 도메인 전이 | 공통 확정 helper | 이번 수정 |
| `SlipService.confirm` | 도메인 전이 | 공통 확정 helper | 이번 수정 |
| `EstimateToSlipConverter.convert` | `Slip.createOutbound` | 기존 미처리 | resolve 성공 시 set 추가 |
| `SlipSeeder.buildAndTransition` | `Slip.createInbound/Outbound` | 지역 `partnerCode` 이미 보유 | `slip.setPartnerCode(partnerCode)` 추가 |
| `SlipDuplicateService` | copy partnerId | resolve 후 set | 기존 통과 |
| `SlipPublishService` 3개 발행 경로 | code로 partnerId resolve/merge | 요청 code 검증 후 set | 기존 통과 |
| `MobilePartnerOrderService` | partnerCode로 partnerId resolve | 요청 code set | 기존 통과 |
| revision restore | snapshot의 id/code 함께 복원 | id/code 동시 복원 | 기존 통과 |

가격 기억, `Carrier`, `Estimate` 자체 revision 등 partner snapshot column이 없는 별도 모델은 전표 저장 지점 모집단에서 제외했다.

## 3. 새로 가능해진 상태·화면 조합과 결과

| 조합 | 결과 |
|---|---|
| DRAFT/SAVED 헤더에서 거래처 A→B | B의 partnerCode로 갱신 |
| DRAFT/SAVED 헤더에서 A→B, B lookup 실패 | 이전 A code 제거, 헤더 수정은 계속 성공 |
| DRAFT/SAVED 헤더를 같은 거래처로 FE 전체 필드 재전송 | 기존 code 보존 |
| SAVED → SENT, partnerId 있음/code 공백/lookup 성공 | code를 채운 뒤 SENT |
| SAVED → SENT, 이미 code 있음 | 값 유지, 재resolve 없음 |
| SAVED → SENT, lookup 실패 | code 없이도 SENT 성공 |
| COMPLETED → CONFIRMED, lookup 실패 | code 없이도 CONFIRMED 성공 |
| 견적 → OUTBOUND DRAFT, partnerId 있음/lookup 성공 | partnerCode snapshot 저장 |
| dev seed 전표 전 상태 | 생성 때 지역 partnerCode를 snapshot 저장 |

테스트로 확인한 핵심 반대급부는 `SlipFormV20PersistIT`의 기존 TC-8~TC-10을 포함해 통과했다. 즉 `updateSlip`의 신규 거래처 재해소·실패 시 stale clear·동일 거래처 재전송 보존을 유지했다.

## 4. 식별자 grep 전수

### 제거·이동·개명

- 제거된 inline `updateSlip` partnerCode 블록: `SlipService.java:503~516`.
- `partnerActuallyChanged`는 삭제·개명하지 않고 공통 helper 내부로 이동했다: `SlipService.java:1847`.
- 새 식별자 `syncPartnerCodeAfterHeaderMutation`: 호출부 `:412`, `:505`, 정의 `:1844`.
- 새 식별자 `ensurePartnerCodeBeforeCommitTransition`: 호출부 `:901`, `:1401`, 정의 `:1863`.
- old identifier/호출 잔재 및 whitespace 오류: `git diff --check` 통과.

### partnerId 축 재검색 결과

`services/slip-service/src/main/java/com/samhanair/logis/slip` 전체에서 `setPartnerId`, `partnerId(`, `setPartnerCode`, `resolvePartnerCode`를 재검색했다. 전표 snapshot 저장 지점 중 partnerCode 누락은 위 sweep 표의 `editHeader`, `send`, `confirm`, `EstimateToSlipConverter`, `SlipSeeder`에서 모두 닫혔다. 나머지는 이미 code 입력·검증, copy resolve, restore 동시 복원 또는 snapshot column이 없는 모델이었다.

## 5. CI red 3건 보정

프로덕션의 전역 `countByStatusInAndEitherPartnerColumnMissing` 및 endpoint 후보 조회는 변경하지 않았다.

`SlipPartnerBackfillIT`는 각 테스트 시작 시 후보 수와 잔여 수를 읽고, 테스트가 만든 `BF` 전표의 delta만 단정한다. 다른 테스트가 남긴 committed partnerless/partner-code-missing 전표는 baseline으로 포함되므로 동일 Testcontainers DB의 전체 스위트에서도 전역 0 단정에 의존하지 않는다. dry-run도 테스트 전표의 slipNo가 unresolved 목록에 포함되는지 확인한다.

## 6. 검증 결과

통과:

```text
:services:slip-service:test
  --tests SlipServiceTest
  --tests EstimateToSlipConverterAuthoritativeAmountsTest
  BUILD SUCCESSFUL

:services:slip-service:test --tests SlipPartnerBackfillIT
  BUILD SUCCESSFUL

:services:slip-service:test --tests SlipFormV20PersistIT
  BUILD SUCCESSFUL

:services:slip-service:testClasses
  BUILD SUCCESSFUL

git diff --check
  exit 0
```

전체 `:services:slip-service:test`도 시도했으나 600초 timeout까지 종료되지 않아 성공으로 주장하지 않는다. timeout이 남긴 `t1155` 전용 Gradle worker가 test result 파일을 잠근 것을 확인하고 해당 두 PID만 종료했다. 이후 개별 `SlipFormV20PersistIT`를 재실행해 GREEN을 확인했다.

## 7. 신규 파일 및 변경 파일

신규 파일:

- `docs/dev-reports/2026-08-09-1156-r2-header-transition-fix.md` (본 보고서)

변경 파일:

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverter.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/seed/SlipSeeder.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/service/SlipServiceTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/estimate/service/EstimateToSlipConverterAuthoritativeAmountsTest.java`
- `services/slip-service/src/test/java/com/samhanair/logis/slip/it/SlipPartnerBackfillIT.java`

못 한 것:

- 전체 `slip-service` 테스트 스위트의 최종 완료 결과 확보: 600초 timeout으로 미완료.
- 이번 R2 라운드의 실 API/GUI 재현: 공유 실 DB write 금지와 시간 제약으로 수행하지 않음. R1 실 API 증거는 변경 전 상태의 근거로만 참조.
