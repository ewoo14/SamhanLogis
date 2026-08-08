# #1123 S6 — 날짜 마감·배송태그 컷오프 상호작용 fix

일자: 2026-08-08  
브랜치 HEAD: `b246e386b` 기준 작업 트리  
범위: PR #1124 / 이슈 #1123 S6

## 결론

`OutboundCutoffGuard`가 컷오프 초과 시 익일을 무조건 안내하던 결함을 수정했다.

- 신규 생성 경로는 기존 순서인 `closedDateGuard → cutoffGuard`를 유지한다.
- 컷오프가 발화하면 `SlipClosedDateGuard.isCreatable`로 익일부터 최대 31일 범위의 대체일을 탐색한다.
- 익일이 열려 있으면 #1074의 기존 문구 `익일 출고로 생성하세요`를 그대로 유지한다.
- 익일이 닫혔지만 이후 날짜가 열려 있으면 그 날짜를 안내한다.
- 탐색 범위에 두 게이트를 모두 통과하는 날짜가 없으면 익일을 안내하지 않고 409를 반환한다.
- 날짜 마감 예외 권한자는 닫힌 날짜도 날짜 게이트를 통과하므로, 컷오프 대체일 판단에도 동일한 권한 정책이 적용된다.

## RED 원문

생산 코드를 추가하기 전 현재 브랜치에서 신규 회귀 테스트를 실행했다.

```text
error: cannot find symbol
  when(closedDateGuard.isCreatable(...))
  symbol: method isCreatable(SlipType,LocalDate,String)

error: constructor OutboundCutoffGuard ... cannot be applied
  required: Clock,SlipOutboundCutoffRepository
  found: Clock,SlipOutboundCutoffRepository,SlipClosedDateGuard

error: method assertWithinCutoff ... cannot be applied
  required: DeliveryTag,LocalDate
  found: DeliveryTag,LocalDate,SlipType,String
```

이는 테스트 오타가 아니라 대체일·날짜 가드 결합 API가 아직 없어서 난 RED였다.

## 불변식 및 조합 검증

| 조합 | 결과 |
|---|---|
| 예외 권한자 + 현재 날짜 마감 + 익일 open | 날짜 게이트 통과 후 컷오프 409, 기존 익일 안내 유지 |
| 비권한자 + 현재 날짜 마감 | 첫 날짜 게이트에서 409 `마감된 날짜에는 신규 전표를 만들 수 없습니다.`; 컷오프는 발화하지 않음 |
| 익일만 날짜 마감 | 익일을 안내하지 않고 다음 유효일을 안내 |
| 익일부터 연속 날짜 마감 | 탐색 범위 내 첫 유효일을 안내; 없으면 익일 안내 없이 409 |
| 날짜 마감 기준선 없음 | 익일이 날짜 게이트를 통과하고 #1074 문구 유지 |
| REGION / STACK / DAY / RETURN_RENTAL | 태그별 한국어 라벨과 컷오프 시각을 유지한 409 안내 |
| 두 게이트 조합 409 | `GlobalExceptionHandler`가 HTTP 409와 메시지를 보존하고 desktop `apiError`가 같은 메시지를 표시 |

테스트 고정:

- `OutboundCutoffGuardTest`: 18건, 0 실패/0 skip
- `SlipClosedDateGuardTest`: 5건, 0 실패/0 skip
- `GlobalExceptionHandlerTest`: 8건, 0 실패/0 skip
- 생성/호출 경로 회귀 5개 클래스(`SlipServiceTest`, `SlipServiceAuditDiffTest`, `MobilePartnerOrderServiceTest`, `EstimateToSlipConverterAuthoritativeAmountsTest`, `SlipPublishFingerprintTest`): 74건, 0 실패/0 skip
- 합계: 8개 백엔드 테스트 클래스 105건, 0 실패/0 skip
- desktop `apiError.test.ts`: 10건, 0 실패
- desktop `npm run typecheck`: exit 0

## 호출 순서 전수 확인

다음 신규 생성 경로는 모두 `closedDateGuard.assertCreatable` 호출이 `cutoffGuard.assertWithinCutoff`보다 앞선다.

- `SlipPublishService`: 3곳 (`140→157`, `227→243`, `331→344`)
- `EstimateToSlipConverter`: `67→91`
- `MobilePartnerOrderService`: `119→138`
- `SlipDuplicateService`: `90→103`
- 추가 확인: `SlipService.create`: `270→283`

`SlipService.editHeader`와 `updateSlip`의 `402`, `482`는 기존 전표의 배송태그 수정 경로라 신규 전표 날짜 생성 게이트가 없고, 컷오프 2-인자 API를 유지했다. 이 둘을 날짜 마감 생성 게이트의 누락으로 간주하지 않았다.

## HTTP / desktop 표시

`BusinessException(CONFLICT)`의 원문 메시지를 `GlobalExceptionHandler`가 `ApiResponse.message`에 보존하는 회귀 테스트를 추가했다. desktop의 기존 `getApiErrorInfo`/`extractApiErrorResponseMessage` 계약도 같은 409 메시지를 그대로 추출하는 테스트로 고정했다. 화면 코드는 변경하지 않았다.

## 검증 제한

공유 Docker 스택은 재기동하지 않았다. `:services:slip-service:test` 전체 실행은 184초 동안 출력 없이 종료되지 않아 timeout 처리했다. 이는 테스트 실패 원문이 아니며, 이후 Docker/통합 테스트를 제외한 참조 단위 테스트 묶음은 별도로 실행해 105건 GREEN을 확인했다. timeout 후 `gradlew --stop`으로 Gradle 데몬을 회수했다.

## 변경 통계

실행 명령: `git diff --stat`  
결과: 10 files changed, 201 insertions(+), 19 deletions(-)  
요청한 삭제 줄 수: **19**

신규 파일은 본 보고서 1개다. 작업 시작 전부터 미추적이던 `docs/dev-reports/2026-08-08-1123-s5-sol-adversarial-review.md`는 변경하지 않고 보존했다.

커밋·push·공유 Docker 재기동·DB 직접 쓰기는 수행하지 않았다.
