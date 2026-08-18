# PR #1264 CI 실패 해소 및 라이브 QA 보고

## ① 실패 4건 원인 판정

| 검사 | 판정 | 근거 |
|---|---|---|
| Frontend Desktop | 이 브랜치의 간접 회귀 | 원격 원문은 `CodefImportScopeForm` 실패가 아니다. 해당 파일은 `42 tests`로 통과했다. 실제 실패는 `DailyClosingPage.test.tsx`의 `출고일로 조회하고 레거시 17열을 지정 순서로 표시한다` 1건이다. `expected spy to be called with arguments: [ '2026-08-14' ]`, 실제 호출은 `[ '2026-08-14', 'OUTBOUND' ]`였고, 동일 커밋 재실행에서도 재현됐다. |
| 빌드 + 테스트 (slip-units) | 이 브랜치의 회귀 | `DailyClosingQueryService`의 상품 벌크 조회 결과가 Mockito 기본값/null fixture일 때 null 모델명을 `Map.of().get(null)`로 조회해 NPE가 발생했다. null 응답은 빈 map으로, null 모델명 라인은 map 조회 없이 처리하도록 수정했다. |
| JUnit 테스트 결과 (slip-units) | ②의 파생 실패 | 같은 slip-units 테스트 결과를 집계하는 결과 단계이며 별도 원인은 확인되지 않았다. |
| GitGuardian | PR 추가 자격 리터럴 없음 | `origin/main...HEAD`와 작업 diff의 추가 라인을 확인했다. 이 PR은 시트 식별자·키·토큰·비밀번호 값을 추가하지 않았다. 기존 main의 시트 식별자 55파일 및 별도 마스킹 PR #1262와 구분된다. |

### Codef 원문 정정

CI 로그의 실제 원문은 다음과 같다.

```text
✓ src/renderer/routes/components/CodefImportScopeForm.test.tsx (42 tests)
...
FAIL src/renderer/routes/DailyClosingPage.test.tsx
AssertionError: expected "spy" to be called with arguments: [ '2026-08-14' ]
Received: [ '2026-08-14', 'OUTBOUND' ]
Test Files 1 failed | 300 passed (301)
Tests 1 failed | 2470 passed | 2 skipped
```

따라서 Codef 자체를 단정하다 실패한 것이 아니며, 사용자 요청의 “Codef 실패” 명칭은 CI 출력과 불일치한다.

## ② 고친 내용

프런트는 출고(기본값) 호출에서 기존 1개 인자 계약을 보존하고, 매입일 때만 `INBOUND`를 명시하도록 수정했다. 이는 테스트를 새 동작에 맞춘 것이 아니라, 기존 API mock 호출 계약의 회귀를 원복한 것이다.

백엔드는 이 PR이 추가한 `ProductSummary` 상품코드·세금유형 계약을 유지하면서 null fixture를 안전하게 처리했다. 공통 타입·공용 모듈·전역 mock은 변경하지 않았다. `ProductSummary`의 필드 추가는 product/slip 내부 응답 계약 확장이고 기존 생성자 호환을 유지하므로 다른 fixture를 새 동작에 맞춰 변경하지 않았다.

## ③ GREEN

- `npm run test -- --run --reporter=dot`: 종료 코드 0, 전체 데스크톱 테스트 통과. `CodefImportScopeForm` 42건 포함.
- `npx vitest run src/renderer/routes/DailyClosingPage.test.tsx`: 27/27 통과.
- `./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.service.SlipQueryServiceTest`: 8/8 통과.
- 원격 PR 전체 GREEN은 이 수정이 PM에 의해 커밋되어 새 CI가 실행된 뒤 확정할 사항이다. 이 워크트리에서는 commit/push를 하지 않았다.

## ④ 격리 스택 구성

`bootJar`로 slip/product JAR를 먼저 만들고 no-cache 이미지로 두 서비스만 기동했다. `infrastructure/.env.local`을 compose env-file로 사용했으며, 8088 충돌을 피하는 slip 포트 override와 별도 컨테이너명을 사용했다. 공유 auth-service(8080), 공유 컨테이너, 공유 DB는 내리거나 변경하지 않았다.

격리 서비스 health와 인증된 직접 조회는 성공했다. 단, 회계전표 생성 경로 `/admin/sales-slips`, `/admin/purchase-slips`는 `accounting-service` 소유이며, 지시된 격리 조합에는 accounting-service가 없다. 이를 공유 gateway로 실행하면 공유 DB 쓰기가 되므로 안전 규칙에 따라 생성·중복·반영 작업은 실행하지 않았다.

## ⑤ 라이브 캡처 목록과 행 수

라이브 조회 증거는 다음과 같다. 기준일은 요청대로 `2026-08-03`이다.

- 출고(매출) 원본행: 4건
- 입고(매입) 원본행: 12건
- 캡처 파일: 0건. 실제 화면의 매출/매입 선택 컨트롤은 `display:none` 영역에 있어 화면 조작이 불가능했고, 회계전표 생성은 공유 DB 경계를 넘으므로 캡처를 성공 증거로 만들지 않았다.
- 미완료 시나리오: 매출 생성, 매입 생성, 중복 생성 차단, 회계반영 뒤 금액 잠김.

## ⑥ GitGuardian diff 확인 결과

PR diff와 현재 작업 diff의 추가 라인에 자격값·시트 ID·키 값은 없다. QA 코드는 자격 저장소 조회 함수만 호출하며 실제 값은 보고서·로그·캡처에 쓰지 않았다.

## ⑦ 프로세스 회수

검증 후 d02 격리 컨테이너 2개, d02 전용 volume 3개, d02 이미지 2개, Vite 포트 5942 프로세스 1개를 회수했다. bootJar 산출물 JAR 2개와 임시 compose override도 삭제했다. 공유 `samhan-*` 컨테이너는 그대로 두었으며, 최종 d02 격리 컨테이너·프로세스·volume·이미지 잔여 수는 모두 0이다.
