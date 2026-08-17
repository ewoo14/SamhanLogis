# PR #1241 CI 실패 해소 r2 보고서

실행 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wgas1`  
브랜치: `feat/gas-parity-order-web`  
커밋/푸시/add: 수행하지 않음

## ① 실패별 원인 판정

### Desktop Playwright — `permission-groups-c5-followup`

- 판정: **main/#1256 병합으로 유입된 계약 충돌**.
- 동일 커밋에서 재현: 10건 중 9건 통과, `mock runtime: products.sync grant controls /admin/sheet-sync allow and redirect`만 2회 연속 실패했다.
- 원인: 현재 `SheetSyncPage`는 시트 연계 폐기 안내(`admin-sheetsync-retired`)를 렌더링하므로 실행 버튼(`admin-sheetsync-trigger-btn`)이 없다. 기존 C5 스펙은 폐기 전 실행 화면을 요구한다.
- 조치: 테스트를 새 동작에 맞춰 바꾸거나 격리해 false-green을 만들지 않았다. 따라서 이 항목은 **코드 수정 없이 병합 유입 회귀로 보류**한다. flaky로 판정하지 않는다.

### JUnit — `slip-units`, `slip-it-public`, `slip-it-core`

- 판정: **이 브랜치 변경 회귀**.
- 최초 원인: `SlipService`가 생성자 주입한 `SlipDiscountCalculator`가 Spring bean으로 등록되지 않아 context가 실패했다.
- 후속 원인: bean 등록 후 외부 DC 계산 불가 시 새 검증 예외가 저장 경계까지 전파되어 기존 fallback 계약을 깨뜨렸고, VAT 포함 입력에서 카탈로그 정가가 화면 제출 총액을 덮어썼다.
- main 병합/Gradle flaky 근거는 아님. 병렬 Gradle 실행의 공용 JAR 경합은 인프라 경합으로 분리했고, 순차 재실행에서 원인과 수정 결과를 확인했다.

### GitGuardian Security Checks

- 판정: **PM 판정 대상**.
- 이번 diff에 신규 자격 리터럴·토큰·키·비밀번호·시트 ID 원문을 추가하지 않았다.
- 기존 QA 보고서의 평문 시트 ID 마스킹은 PM 커밋에서 이미 처리되었으며, 다시 수정하지 않았다.

## ② 고친 내용

- `SlipDiscountCalculator`를 Spring component로 등록했다.
- 저장 경계에서 외부 DC 계산 불가(`IllegalStateException`)만 기존 입력 단가 fallback으로 되돌렸다. 서버 계산이 가능하지만 단가가 다른 경우의 `IllegalArgumentException`은 계속 전파한다.
- VAT 포함 입력은 카탈로그 정가로 치환하지 않고 화면 제출 총액으로 공급가/부가세를 계산하도록 보존했다.
- Desktop 시트 폐기 계약과 기존 테스트는 변경하지 않았다.

## ③ GREEN 근거

- `slip-units`: `BUILD SUCCESSFUL`, 1057건 실행.
- `slip-it-public`: `BUILD SUCCESSFUL`.
- `slip-it-core`: `BUILD SUCCESSFUL`.
- 핵심 회귀(`SlipControllerIT` + `SlipInternalControllerIT`): 47건, `BUILD SUCCESSFUL`.
- Desktop `npm run typecheck`: 성공.
- Desktop `npm run lint`: exit 0, 기존 경고 196건·오류 0건.
- Desktop `npm run build`: 성공.
- `git diff --check`: exit 0.
- Desktop 전체 mock 게이트는 위의 C5 1건이 현재 계약 충돌로 실패하므로 전체 GREEN이라고 주장하지 않는다.

## ④ flaky 판정 재실행 원문

flaky로 판정한 항목은 없다. Desktop C5 실패는 동일 커밋에서 첫 실행과 retry 모두 같은 locator 부재로 실패했다. JUnit은 최초 병렬 실행을 flaky 근거로 사용하지 않았고, 순차 실행으로 재검증했다.

## ⑤ GitGuardian diff 확인 결과

- 신규 자격 리터럴: 없음.
- 신규 시트 ID 원문: 없음.
- 신규 비밀번호/토큰/private key/Bearer 값: 없음.
- QA 보고서 인용은 마스킹·환경변수명 수준으로만 확인했다.

## ⑥ 프로세스 회수

- 기동한 Playwright Vite test-server는 종료했다.
- Gradle daemon은 각 실행에 `--no-daemon`을 사용했고 `gradlew --stop` 후 잔여 Gradle daemon 0개를 확인했다.
- 로컬 포트 5173 잔여 listener 0개를 확인했다.
- 다른 워크트리의 프로세스·컨테이너는 건드리지 않았다.
- 본 세션이 남긴 장기 실행 프로세스/컨테이너: 0개.

## 변경 파일

- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipDiscountCalculator.java`
- `services/slip-service/src/main/java/com/samhanair/logis/slip/service/SlipService.java`

