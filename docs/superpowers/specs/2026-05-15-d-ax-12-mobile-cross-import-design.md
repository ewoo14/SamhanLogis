# D-AX-12 mobile-staff driver cross-import 분리 설계

> 작성일: 2026-05-15  
> 상태: 승인 후 구현 진행  
> 범위: `clients/mobile-staff` driver tab 이 Samhan Public slip 상세 화면을 직접 import 하는 구조를 끊고, `clients/arologis-mobile` 이식 전 경계를 만든다.

## 1. 배경

Phase 10.5 아로로지스 독립 분리에서 `clients/arologis-mobile` 은 별도 기사 앱으로 생성됐지만, 실제 driver 화면 일부는 아직 `clients/mobile-staff` 안에 남아 있다.

현재 결합은 `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx` 가 상위 `../SlipDetailScreen` 을 직접 import 하는 구조다. 이 화면은 slip-service 코멘트, audit overlay, edit-request, SSE client 등 Samhan Public slip 문맥을 함께 사용한다. 이 상태로 driver 화면을 아로로지스 모바일로 단순 이동하면 Samhan Public slip 의존성이 같이 따라간다.

D-AX-12 목적은 전체 모바일 기사 화면을 한 번에 이식하는 것이 아니라, 다음 이식 PR이 안전하게 들어갈 수 있도록 cross-import 경계를 먼저 끊는 것이다.

## 2. 목표

- `DriverTabNavigator` 에서 `../SlipDetailScreen` 직접 import 를 제거한다.
- driver tab 내부에는 `DriverSlipDetailEntry` 경계를 두고, 현재 backend 응답이 실제 slipId 를 제공하지 않는 동안은 안내 화면으로 처리한다.
- 기존 `SlipDetailScreen` 자체 기능은 유지한다. comment / audit / edit-request / SSE 로직은 이번 PR에서 건드리지 않는다.
- `clients/arologis-mobile` README 와 handoff 문서에 다음 이식 순서를 명확히 남긴다.
- 개발책임자 요청에 따라 PR 본문에는 여러 테스트를 진행한 뒤 가독성 높은 한국어 QA 캡처 8장을 인라인 첨부한다.

## 3. 비목표

- `clients/mobile-staff/src/screens/SlipDetailScreen.tsx` 를 삭제하거나 이동하지 않는다.
- 이번 PR에서 `clients/arologis-mobile` 로 driver dashboard / signature / location 전체를 이식하지 않는다.
- slip-service API contract 를 변경하지 않는다.
- 배차 목록 응답에 실제 slipId 를 추가하지 않는다. slipId 연결은 후속 BE/FE PR에서 처리한다.

## 4. 채택 접근

| 접근 | 장점 | 단점 | 판단 |
|---|---|---|---|
| A. driver 내부 entry 컴포넌트로 직접 import 제거 | 변경 범위 작음, SlipDetailScreen 회귀 위험 낮음, 다음 이식 경계 명확 | 실제 전표 상세 진입은 후속까지 안내 화면 | 채택 |
| B. SlipDetailScreen 을 공통 feature 로 추출 | 장기 재사용성 좋음 | audit/comment/edit-request 컨텍스트 정리가 이번 PR 대비 과함 | 보류 |
| C. SlipDetailScreen 을 arologis-mobile 로 복제 | 빠른 화면 확보 | 중복과 drift 발생, Samhan Public slip 문맥 유입 | 폐기 |

채택안은 A다. D-AX-12 는 경계 절단 PR 로 작게 끝내고, 실제 아로로지스 모바일 기사 화면 이식은 D-AX-12 완료 후 별도 PR에서 진행한다.

## 5. 구현 설계

### 5.1 신규 경계

`clients/mobile-staff/src/screens/driver/DriverSlipDetailEntry.tsx` 를 추가한다.

책임:
- `DriverTabNavigator` 가 slip 상세 진입 시 호출하는 driver-local 컴포넌트.
- `slipId` 가 placeholder (`vehicle-*`) 인 경우 한국어 안내 화면을 보여준다.
- 사용자 화면에는 UUID/내부 id 를 노출하지 않고 slipNo / partnerName 만 보여준다.

### 5.2 DriverTabNavigator 변경

- `import SlipDetailScreen from '../SlipDetailScreen'` 제거.
- `DriverSlipDetailEntry` import 로 교체.
- 기존 `SlipDetailRoute` 상태는 유지한다.
- 뒤로가기 동작은 기존과 동일하게 `setSlipDetailRoute(null)` 로 처리한다.
- Samhan Public `SlipDetailScreen` 에 전달하던 role prop 은 driver tab route 에서 제거한다.

### 5.3 테스트

- 신규 Jest: dashboard 에서 전표 상세 진입 시 `DriverSlipDetailEntry` 가 열리는지 검증.
- 기존 Jest: `SignaturePhotoScreenChain` 이 그대로 통과하는지 검증.
- typecheck: `clients/mobile-staff` 전체 `tsc --noEmit`.

## 6. QA 캡처

필수 PR 캡처:
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/01-driver-slip-guard.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/02-signature-chain-regression.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/03-driver-route-test-flow.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/04-driver-back-navigation.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/05-typecheck-contract.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/06-jest-driver-route-pass.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/07-jest-signature-chain-pass.png`
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/08-direct-import-search-guard.png`

캡처 기준:
- 1000px 폭 PNG 로 생성해 GitHub PR 본문에서 문구와 버튼이 잘 보이게 한다.
- 한국어 화면 문구를 사용한다.
- `DriverSlipDetailEntry` 안내 경계, 기존 signature chain 회귀 가드, route/back 흐름, typecheck, focused Jest, import search guard 를 각각 별도 이미지로 보여준다.
- PR 본문에 mock render 임을 명시한다.

## 7. 문서 갱신

- `clients/mobile-staff/README.md`: driver tab 의 slip 상세 직접 import 제거와 후속 연결 조건 추가.
- `clients/arologis-mobile/README.md`: 다음 이식 순서 업데이트.
- `docs/dev-reports/d-ax-12-mobile-cross-import.md`: 변경 내용, 검증, 후속 작업 기록.
- `docs/qa/d-ax-12-mobile-cross-import/scenarios.md`: QA 시나리오와 캡처 기준 기록.
- `docs/handoff/CURRENT-WORK.md`: D-AX-12 진행/완료 상태 업데이트.
- `migration/decisions/DECISIONS.md`: D-AX-12 결정 추가.

## 8. 검증

로컬:
- `cd clients/mobile-staff && npm run typecheck`
- `cd clients/mobile-staff && npm test -- DriverSlipDetailRoute.test.tsx --runInBand`
- `cd clients/mobile-staff && npm test -- SignaturePhotoScreenChain.test.tsx --runInBand`
- `.\scripts\generate-d-ax-12-mobile-cross-import-screenshots.ps1`
- `rg -n "from '../SlipDetailScreen'|SlipDetailScreen from" clients/mobile-staff/src/screens/driver` 가 결과 없음

CI / PR:
- mobile-staff typecheck green.
- 관련 Jest green.
- PR 본문에 5-team review, TM 통합, PM/CI 승인, QA 캡처 8장 인라인 포함.

## 9. 후속

- `clients/arologis-mobile` 로 driver dashboard / GPS / signature / photo 화면 이식.
- 배차 응답에 실제 slip 연결값이 들어오는 시점에 `DriverSlipDetailEntry` 를 아로로지스 전용 상세 bridge 로 전환.
- Samhan Public `mobile-staff` 의 driver mode 제거는 아로로지스 모바일 실제 이식 후 별도 PR로 처리.

## 10. Self Review

- Placeholder / TBD 없음.
- 기존 slip comment/audit/edit-request 기능은 보존하고, cross-import 한 곳만 줄이는 범위로 제한했다.
- 캡처 가독성 요구와 다중 테스트 증거 첨부 요구를 QA / PR 게이트로 명시했다.
- D-AX-12 후속 이식 순서를 분리해 scope creep 을 막았다.
