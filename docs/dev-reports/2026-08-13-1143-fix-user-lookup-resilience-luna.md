# 2026-08-13 #1143 user-service 조회 resilience fix — CODEX LUNA

## 결론

제품 상세의 감사 사용자 이름 조회 timeout을 `2,000/3,000ms`에서 `100/200ms`로 줄였다. 기존 `UserInternalClient`의 실패 처리(`Optional.empty()`)와 `ProductService`의 감사 fallback은 유지했으므로, user-service가 응답하지 않아도 감사 자리는 `사용자 미상`으로 채워지고 UUID는 응답하지 않는다.

## RED → GREEN 밀리초 실측

실제 TCP 연결을 수락한 뒤 응답하지 않는 격리 black-hole 서버로 user-service 중단 조건을 재현했다. 제품 client의 실제 `RestClient` 호출을 사용했으며, 감사 조회 결과가 비어도 호출자가 fallback을 적용할 수 있도록 `Optional.empty()`인지 함께 확인했다.

### RED

변경 전 `readTimeout=3,000ms` 기준:

```text
RED_USER_SERVICE_DOWN|ms=2755|displayName=Optional.empty
ProductServiceTest equivalent assertion: expected <500ms, actual 2755ms
```

테스트는 실패했고, 실패 원인은 timeout 지연이었다.

### GREEN

변경 후 같은 조건·같은 테스트:

```text
USER_SERVICE_DOWN|ms=243|displayName=Optional.empty
BUILD SUCCESSFUL
```

focused 재실행에서는 251ms도 관측됐다. 모두 500ms 기준 아래이며 UUID/이름을 fallback에 넘길 수 있는 빈 결과를 보존했다.

## 선택한 방식과 근거

레포에는 이미 `shared:user-client-abstraction`의 `DefaultUserVerifier`가 `SimpleClientHttpRequestFactory`에 `connectTimeout=100ms`, `readTimeout=200ms`를 적용하는 방식이 있다. 새 resilience 프레임워크를 발명하지 않고 이 timeout 패턴만 `UserInternalClient`에 옮겼다.

공통 verifier 자체를 직접 재사용하지 않은 이유는 이 client가 `GET /internal/users/{userId}`의 `fullName` JSON 계약을 사용하고, 조회 실패 시 `Optional.empty()`를 제품 감사 표시 정책으로 넘겨야 하기 때문이다. 호출 계약과 표시 정책을 섞지 않는 최소 변경으로 유지했다.

## 장애 시 표시 문구 후보

현재 적용값은 개발책임자 확정 전 후보인 `사용자 미상`이다.

| 상황 | 현재 후보 | 대안 |
|---|---|---|
| user-service 중단·미조회 UUID | `사용자 미상` | `알 수 없는 사용자`, `감사 주체 미상` |
| 시스템/마이그레이션 표식 | `시스템 작업 (원문 표식)` | `시스템 처리 (원문 표식)`, `자동 처리 (원문 표식)` |

어떤 경우에도 UUID 원문을 노출하지 않는다.

## 검증

```text
focused: UserInternalClientResilienceTest 1, ProductServiceTest 77,
         ProductAndClassificationUuidFreeContractTest 3 — failures=0, errors=0
product-service 전량: 794 tests, failures=0, errors=0, skipped=0
npm run typecheck: exit code 0
desktop real-QA scope 내부 테스트: 51 pass, 0 fail
```

기존 제품 상세 감사 표시, UUID 0건 계약, 시스템 표식 fallback 및 Live QA6 회귀 항목은 수정하지 않았다. 따라서 다음 항목을 보존 대상으로 재확인했다: 무변경·연속 저장 200, AUTO 4+6, 값 변경 저장, 비중 합 9의 400 한국어 문구, FIXED 45,375, 모달 부자재·칩 저장 완주, 특징·형상 드롭박스와 종류별 후보, 모델코드 불변, 다섯 표면 노출, 활성 타깃 3건 유지.

## 실제 서비스 중단 측정의 범위

현재 실행 중인 `samhan-*` product/user 서비스는 공유 스택이어서 중지하지 않았다. 별도 `recon1175` 격리 스택의 로그인은 성공했지만 해당 product route/model fixture가 현재 요청과 맞지 않아 제품 상세 HTTP 200 전후를 유효하게 측정할 수 없었다(게이트웨이 `404`, 직접 호출 `403`). 따라서 **실제 Docker user-service stop → 제품 상세 HTTP 응답의 E2E 밀리초는 이번 라운드에 못 했다**고 명시한다. 대신 장애 경계의 실제 RestClient 호출을 black-hole TCP 서버로 재현한 RED/GREEN 밀리초를 위에 남겼다.

## 불변식 재확인

1. user-service 장애 시 상세 응답을 막는 동기 대기는 200ms read timeout으로 제한했다. black-hole 실측 GREEN은 243ms, HTTP product E2E는 위 사유로 미실행이다.
2. 감사 자리는 비지 않는다. 실패 시 `Optional.empty()`가 `사용자 미상`으로 변환된다. 문구는 개발책임자 확정 대상이다.
3. UUID 0건 정책은 기존 `ProductAndClassificationUuidFreeContractTest` 3건 PASS로 확인했다.
4. 정상 fullName·미조회 UUID·마이그레이션 표식 분기와 화면 표시 코드는 건드리지 않았고, 기존 focused `ProductServiceTest` 77건이 PASS했다.
5. Live QA6의 나열된 회귀 항목에 관여하는 코드·DB·화면을 변경하지 않았다.

## 라운드 종료 점검

```text
삭제된 추적 파일: 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs: tracked=true, exists=true
공유 DB 쓰기: 0건
이번 라운드가 만든 격리 컨테이너/임시 디렉터리: 없음
이번 라운드가 만든 상주 QA 프로세스: 없음
기존 Docker 컨테이너: 건드리지 않음
```

워크트리에 이미 있던 미추적 `docs/qa/2026-08-12-1143-reconv/*.ps1` 2개는 보존했다.
