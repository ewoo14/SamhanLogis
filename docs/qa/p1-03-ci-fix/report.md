# PR #1261 CI 실패 4건 해소 보고서

작성일: 2026-08-17  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wp103`  
브랜치: `fix/vat-supply-amount-contract`  
기준 CI head: `6a55a5d95453f6e3aefb949bb340dbe4020ef1ac`

## ① 실패별 원인 판정

| 실패 | 판정 | 근거 |
|---|---|---|
| 빌드 + 테스트 (accounting+partner) | 이 브랜치 변경이 만든 테스트 계약 불일치 | CI 원문이 `PartnerOrderConfirmServiceIT.java:617`에서 `confirm_applies_dc_final_price_from_price_calc()`만 실패. `800000 / 1.1 = 727272.727…`인데 테스트는 기존 DOWN 값 `727272`를 단정했다. |
| JUnit 테스트 결과 (accounting+partner) | 위와 동일한 원인의 중복 보고 | 같은 run에서 동일 테스트 1건 실패를 JUnit hard gate가 재보고했다. |
| Frontend Desktop | 이 브랜치 변경이 만든 테스트 계약 불일치 | CI에서 `mock.test.ts`의 `31620`, `EstimateFormPage.coedit.test.tsx`의 `909090`, `SlipDetailPage.lineIdContract.test.tsx`의 `109090` 절사 기대값이 각각 HALF_UP 실제값 `31621`, `909091`, `109091`과 불일치했다. |
| Frontend Mobile-Staff | 인프라/시간성 flaky | VAT 변경 파일과 무관한 `SalesTabNavigator.test.tsx`가 5초 timeout으로 실패했다. 동일 코드에서 첫 실행은 실패했으나 이후 기본 명령 재실행은 통과했고, `--testTimeout=15000`도 통과했다. 테스트 본문·앱 코드는 수정하지 않았다. |

따라서 main 병합으로 새로 들어온 실패로 볼 근거는 없고, 백엔드/desktop 3건은 이 PR의 의도된 DOWN→HALF_UP 계약 변경에 따른 기존 기대값 잔존이다. Mobile-Staff는 flaky로 분류하되 테스트 timeout을 늘려 숨기지 않았다.

## ② 테스트 갱신 vs 구현 수정 판정

구현 수정이 아니라 테스트 갱신이 맞다. 이 PR의 명시 계약은 `VatAmountCalculator`를 정본으로 VAT 포함 합계 분리를 `HALF_UP`으로 통일하는 것이며, 레거시 정본도 다음처럼 `Math.round(total / 1.1)` 후 VAT를 차액으로 계산한다.

```text
tools/legacy-gas/종합견적서/Code.js:1849-1850
const sup = Math.round(Math.abs(total) / 1.1);
const vat = Math.abs(total) - sup;

tools/legacy-gas/종합견적서/index.html:13960-13961
const lineSupply = Math.round(lineTotal / 1.1);
const lineVat = lineTotal - lineSupply;
```

즉 테스트가 “절사여야 한다”를 단정하던 부분은 계약 변경 갱신 대상이다. 금액을 단정하는 테스트도 레거시 계산과 대조해 HALF_UP 값으로 갱신했다. 저장 데이터 재계산·migration·backfill 구현은 추가하지 않았다.

## ③ RED 원문

CI 원문:

```text
PartnerOrderConfirmServiceIT > confirm_applies_dc_final_price_from_price_calc() FAILED
org.opentest4j.AssertionFailedError at PartnerOrderConfirmServiceIT.java:617
```

```text
Frontend Desktop
Expected: "909090"
Received: "909091"

Expected: "109090"
Received: "109091"

expected { supply: '31621', … } to deeply equal { supply: '31620', … }
```

```text
Frontend Mobile-Staff
SalesTabNavigator 화면 도달성
thrown: "Exceeded timeout of 5000 ms for a test."
```

## ④ 고친 내용

- `PartnerOrderConfirmServiceIT`: DC 최종 단가 `800000`의 공급가/VAT 기대값을 `727273/72727`로 갱신하고 차액 항등식 단언을 유지했다.
- Desktop mock·견적 coedit·전표 lineId 계약 테스트의 절사 기대값을 레거시 HALF_UP 결과로 갱신했다.
- production 계산기, migration, backfill, 기존 저장 데이터 변경 로직은 수정하지 않았다.
- Mobile-Staff는 코드·테스트를 수정하지 않았다.

## ⑤ GREEN

```text
Desktop focused Vitest
3 files passed, 315 tests passed, 2 skipped

Gradle focused
:shared:common:test + PartnerOrderLineSupplyVatTest: BUILD SUCCESSFUL
PartnerOrderConfirmServiceIT.confirm_applies_dc_final_price_from_price_calc:
BUILD SUCCESSFUL (SAMHAN_GATEWAY_ATTESTATION=test-attestation)

Desktop
npm run typecheck: 성공 (design-system 사전 build 후)
npm run lint: 성공 (기존 warning 196건, error 0)
npm run build: 성공

Mobile-Staff
npm test -- --runInBand: 재실행 성공
npm test -- --runInBand --testTimeout=15000: 성공
```

## ⑥ 기존 저장 값 불변 재확인

- 변경 파일에 migration/backfill 또는 기존 주문·전표를 다시 쓰는 코드가 없다.
- `git diff --name-only`로 확인한 변경은 desktop 테스트 3개, partner-order IT 1개뿐이다.
- `price_vat=800000` DC 최종 단가 저장 단언은 유지했고, 공급가+VAT=소계 항등식도 유지했다.
- 기존 저장 데이터 불변 계약을 만족하므로 공유 DB를 조회하거나 변경하지 않았다.

## ⑦ 라이브 캡처와 행 수

라이브 캡처 0장, 행 수 확인 0건이다. 요청된 격리 스택을 기동하면 저장소 기본 런처가 공유 명명·포트를 사용하고, 현재 공유 스택 컨테이너 24개가 개발책임자 환경에서 실행 중이었다. 공유 auth-service를 유지하면서 별도 slip 포트 오버라이드까지 포함한 격리 구성이 이 워크트리에 준비되어 있지 않아, 공유 스택을 건드리지 않기 위해 라이브 기동·캡처를 중단했다. 따라서 전표·견적 공급가/VAT 라이브 증거는 미완료이며 이 보고서가 이를 성공으로 주장하지 않는다.

## ⑧ 프로세스·컨테이너 회수

- 이 작업에서 새로 띄운 격리 컨테이너는 0개, 새 장기 실행 서버 프로세스는 0개다.
- 공유 Docker 스택은 중지·변경하지 않았다.
- 테스트용 Gradle/Node 프로세스는 명령 완료 후 종료됐다.
- bootJar로 생성된 JAR는 검증 후 제거했고, 잔여 격리 컨테이너는 0개다.

커밋·push는 수행하지 않았다. PM이 이 워크트리의 변경을 검토 후 대행한다.
