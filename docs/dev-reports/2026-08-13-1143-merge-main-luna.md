# #1143 `origin/main` 충돌 해소 및 재검증 보고서

## 충돌 해소 근거

`origin/main`의 #1090 분류 정본 전환과 현재 브랜치 #1143 감사 표시 계약을 동시에 보존했다.

- #1090 계약: `discountOption`을 `ProductSummaryResponse`의 응답 필드로 유지하고, `Product.from` 매핑에서 도메인의 `discountOption`을 전달했다. `fixedDiscountSource`와 물리 분류 코드도 함께 유지했다.
- #1143 계약: `id`와 `categoryId`에는 `OpaqueUuidSerializer`를 유지했고, `classificationAssigned`는 내부 판정값으로만 남겨 `@JsonIgnore`를 유지했다. 따라서 사용자 응답에 `classificationAssigned`가 나오지 않는다.
- 양쪽 DTO 직렬화 어노테이션(`JsonSerialize`, `JsonIgnore`)을 모두 import하고 충돌 표식만 제거했다. 임의로 한쪽 파일을 채택하지 않았다.

## 머지 후 검증 원문 및 수치

실행 명령과 결과:

```text
.\gradlew :services:product-service:test --no-daemon --console=plain
BUILD SUCCESSFUL in 3m 7s
report: tests=796, failures=0, ignored=0

npm run build                         (clients/web/design-system)
build succeeded

npm run typecheck                     (clients/desktop)
tsc node/web + typecheck:real-qa: PASS
real-QA scope tests: 51 pass, 0 fail

.\gradlew :services:product-service:test --tests '*ProductAndClassificationUuidFreeContractTest' --no-daemon --console=plain
ProductAndClassificationUuidFreeContractTest: 3 tests PASS
BUILD SUCCESSFUL in 15s
```

UUID 계약 테스트는 제품·분류 공개 DTO를 중첩 직렬화하고 원시 UUID 노출이 없는지 확인했다. `classificationAssigned`도 JSON 키가 없는 것을 함께 확인했다. #1090에서 추가된 `discountOption`은 문자열 enum 값이며 UUID를 포함하지 않는다.

## 불변식 재확인

1. 할인 정본과 감사 이름 표시 계약은 모두 소스와 DTO에 남아 있다. 이번 변경은 DTO 충돌 import 해소뿐이며 #1143의 실제 사용자·사용자 미상·시스템 작업 표식과 화면 작성자·수정자 표시 로직을 건드리지 않았다.
2. 제품·분류 UUID 0건: 전용 계약 테스트 3/3 PASS. `id`·`categoryId`는 opaque serializer, `classificationAssigned`는 비노출, `discountOption`도 UUID 없는 값이다.
3. product-service 전량: 796 tests, failures 0, ignored 0.
4. 라이브QA8의 15개 항목(감사 주체 3종, user-service 중단/123ms, 오낙하 0/30, 저장·AUTO·비중 400, FIXED 45,375, 모달/드롭박스/모델코드, 다섯 표면·활성 타깃 3건)은 이번 충돌 파일 외 코드를 변경하지 않아 보존된다. 라이브QA8 자체는 머지 후 다시 실행하지 않았으므로 새 실측이라고 주장하지 않는다.

## 라운드 종료 점검

- 충돌 파일의 `<<<<<<<`, `=======`, `>>>>>>>` 표식 0건.
- `tools/.s24-build-only/build/deep/tracked-writer.mjs`는 추적 잔여 드라이버로 확인 후 삭제했다.
- `docs/qa` 아래 1143 임시 드라이버 3개(`reconv-api-probe.ps1`, `reconv-expand-all.ps1`, `liveqa8-playwright.cjs`)도 삭제했다. QA 증적 이미지와 결과 텍스트는 보존했다.
- 이번 라운드에서 시작한 Gradle 테스트 전용 잔류 프로세스는 정리했다. 공유 Docker 스택은 중지하거나 변경하지 않았다.
- git add/commit/push는 지시대로 실행하지 않았다. 따라서 PM이 이 작업 트리의 충돌 해소 파일과 삭제 상태를 staging한 뒤 커밋해야 한다.

## 못 한 것

머지 후 라이브 서비스 재배포 및 라이브QA8 15항목 재실행은 하지 못했다. 공유 Docker 스택 중지 금지와 이번 요청의 코드·계약 검증 범위를 지켰으며, 기존 라이브QA8 증적을 근거로 보존 여부만 재확인했다.
