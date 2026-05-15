# D-AX-12 mobile-staff driver cross-import 분리 설계

> 작성일: 2026-05-15  
> 상태: 승인 후 구현 진행  
> 범위: `clients/mobile-staff` 의 driver tab 이 Samhan Public slip 상세 화면을 직접 import 하는 구조를 제거하고, `clients/arologis-mobile` 이식 준비 경계를 만든다.

## 1. 배경

Phase 10.5 아로로지스 독립 분리에서 `clients/arologis-mobile` 은 별도 기사 앱으로 생성됐지만, 실제 driver 화면 일부는 아직 `clients/mobile-staff` 안에 남아 있다.

현재 핵심 결합은 `clients/mobile-staff/src/screens/driver/DriverTabNavigator.tsx` 가 `../SlipDetailScreen` 을 직접 import 하는 구조다. `SlipDetailScreen` 은 slip-service 의 코멘트, audit overlay, edit-request, SSE client, 여러 API 모듈을 함께 사용한다. 이 상태에서 driver 화면을 아로로지스 모바일로 단순 이동하면 Samhan Public slip 도메인 의존이 같이 따라간다.

D-AX-12 의 목적은 전체 모바일 기사 화면 이식을 한 번에 끝내는 것이 아니라, 다음 이식 PR 이 안전하게 들어갈 수 있도록 cross-import 경계를 먼저 끊는 것이다.

## 2. 목표

- `DriverTabNavigator` 에서 상위 `../SlipDetailScreen` 직접 import 를 제거한다.
- driver tab 내부에는 `DriverSlipDetailEntry` 경계를 두고, 현재 backend 응답이 실 slipId 를 제공하지 않는 동안에는 안내 화면으로 처리한다.
- 기존 `SlipDetailScreen` 자체 기능은 유지한다. comment / audit / edit-request / SSE 회귀를 이번 PR에서 건드리지 않는다.
- `clients/arologis-mobile` README 와 handoff 문서에 다음 이식 순서를 명확히 남긴다.
- QA 캡처는 PR 본문에서 잘 보이도록 큰 한국어 Playwright mock 캡처를 인라인 첨부한다.

## 3. 비목표

- 이번 PR에서 `clients/mobile-staff/src/screens/SlipDetailScreen.tsx` 를 삭제하거나 이동하지 않는다.
- 이번 PR에서 `clients/arologis-mobile` 로 driver dashboard / signature / location 전체를 이식하지 않는다.
- 이번 PR에서 slip-service API contract 를 변경하지 않는다.
- 이번 PR에서 배차 목록 응답에 slipId 를 추가하지 않는다. 실 slipId 연결은 후속 BE/FE PR 에서 처리한다.

## 4. 접근안 비교

| 접근 | 장점 | 단점 | 판단 |
|---|---|---|---|
| A. driver 내부 entry 컴포넌트로 직접 import 제거 | 변경 범위 작음, SlipDetailScreen 회귀 위험 낮음, 다음 이식 경계 명확 | 실제 전표 상세 진입은 후속까지 안내 화면 | 채택 |
| B. SlipDetailScreen 을 공통 feature 로 추출 | 장기 재사용성 좋음 | slip audit/comment/edit-request 의존이 커서 현 PR 대비 과함 | 보류 |
| C. SlipDetailScreen 을 arologis-mobile 로 복제 | 빨리 화면을 옮길 수 있음 | 중복과 drift 발생, Samhan Public slip 도메인 오염 | 폐기 |

채택안은 A다. D-AX-12 는 경계 절단 PR 로 두고, 실제 아로로지스 모바일 기사 화면 이식은 D-AX-12 완료 후 별도 PR 에서 진행한다.

## 5. 구현 설계

### 5.1 신규 경계

`clients/mobile-staff/src/screens/driver/DriverSlipDetailEntry.tsx` 를 추가한다.

책임:
- `DriverTabNavigator` 가 slip 상세를 열 때 유일하게 호출하는 driver-local 컴포넌트다.
- `slipId` 가 placeholder (`vehicle-1` 등) 인 경우 한국어 안내 화면을 보여준다.
- 실 slipId 가 있고 `enableSamhanSlipDetail` flag 가 true 인 경우에만 기존 `SlipDetailScreen` 을 lazy import 하거나 bridge 한다.

초기 D-AX-12 에서는 flag 기본값을 false 로 둔다. 이로써 driver tab 은 Samhan Public slip 상세를 직접 import 하지 않는다.

### 5.2 DriverTabNavigator 변경

- `import SlipDetailScreen from '../SlipDetailScreen'` 제거.
- `DriverSlipDetailEntry` import 로 교체.
- 기존 `SlipDetailRoute` 상태는 유지하되, 사용자 노출은 slipNo / partnerName 만 사용한다.
- 뒤로가기 동작은 기존과 동일하게 `setSlipDetailRoute(null)` 로 처리한다.

### 5.3 테스트 변경

`SignaturePhotoScreenChain.test.tsx` 의 `SlipDetailScreen` mock 은 제거하고 `DriverSlipDetailEntry` mock 으로 바꾼다.

추가 테스트:
- dashboard 에서 “전표 보기 / 코멘트” 클릭 시 `DriverSlipDetailEntry` 가 열린다.
- placeholder slipId 일 때 “전표 상세 연결 준비 중” 안내가 보인다.
- signature-photo → signature chain 기존 테스트는 그대로 통과한다.

## 6. QA / PR 캡처 요구

개발책임자 요청에 따라 PR 캡처는 반드시 잘 보여야 한다.

캡처 원칙:
- Playwright mock render 또는 실제 app render 를 우선한다.
- 한국어 UI 로 캡처한다.
- 모바일 GitHub 에서도 읽히도록 390px 모바일 뷰포트만 쓰지 않고, PR 본문에는 900px 이상 가로 폭으로 합성한 큰 PNG 를 인라인 첨부한다.
- 핵심 문구와 버튼이 잘리지 않아야 한다.

필수 캡처:
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/01-driver-slip-guard.png`  
  driver tab 에서 전표 상세 진입 시 Samhan Public slip 직접 연결 대신 준비 안내가 보이는 화면.
- `docs/qa/d-ax-12-mobile-cross-import/screenshots/02-signature-chain-regression.png`  
  배송사진 탭에서 업로드 완료 후 서명 탭으로 이어지는 기존 Phase F 흐름 회귀 가드.

PR 본문에는 두 이미지를 모두 인라인으로 첨부하고, 캡처가 mock 인지 실제 app render 인지 명시한다.

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
- `cd clients/mobile-staff && npm test -- SignaturePhotoScreenChain`
- QA 캡처 생성 스크립트 실행

CI / PR:
- mobile-staff typecheck green.
- 관련 Jest green.
- PR 본문에 5-team review, TM 통합, PM/CI 승인, QA 캡처 2장 인라인 포함.

## 9. 후속

- D-AX-12 다음 PR: `clients/arologis-mobile` 로 driver dashboard / GPS / signature / photo 화면 이식.
- 실 slipId 가 배차 응답에 포함되는 시점에 `DriverSlipDetailEntry` 를 실제 slip detail bridge 로 전환한다.
- Samhan Public mobile-staff 의 driver mode 제거는 아로로지스 모바일 실제 이식 후 별도 PR 로 처리한다.

## 10. Self Review

- Placeholder / TBD 없음.
- 기존 slip comment/audit/edit-request 기능은 보존하고, cross-import 한 곳만 줄이는 범위로 제한했다.
- 캡처 가독성 요구를 QA / PR 게이트로 명시했다.
- D-AX-12 후속 이식 순서를 분리해 scope creep 을 막았다.
