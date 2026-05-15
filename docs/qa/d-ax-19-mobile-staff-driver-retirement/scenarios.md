# D-AX-19 QA 시나리오 — mobile-staff driver mode retirement

## 범위

- 대상 앱: `clients/mobile-staff`
- 목표: `mobile-staff` 앱에서 배송기사 mode 를 은퇴시키고, 영업직원 견적 WebView 단일 진입만 보존한다.
- 후속 소유: 배송기사 런타임은 `clients/arologis-mobile` 이 전담한다.

## 시나리오

| # | 시나리오 | 기대 결과 | 증거 |
|---|---|---|---|
| 1 | 은퇴 결정 반영 | `mobile-staff` 의 기사 런타임 책임이 종료되고 견적 앱 역할만 남는다. | QA 캡처 `01-retirement-decision.png` |
| 2 | 앱 루트 단일 진입 | `AppRootNavigator` 가 `EstimateWebViewScreen` 만 렌더링한다. | `AppRootNavigator.test.tsx` |
| 3 | 기사 mode 토글 제거 | 앱 루트와 첫 화면에서 기사 전환 버튼, 탭, testID 가 노출되지 않는다. | focused Jest + QA 캡처 `03-no-driver-toggle.png` |
| 4 | 코드 경계 guard | root/import 경로에서 기사 navigator, 기사 화면, 기사 mode 분기가 남지 않는다. | `rg` import guard |
| 5 | 견적 WebView 회귀 | 기존 estimate WebView source, viewport shim, mobile-mode 강제 흐름을 유지한다. | mobile-staff typecheck |
| 6 | PR 증거 캡처 | PR 본문에 5장 PNG를 인라인 첨부할 수 있다. | Playwright mock screenshot generation |

## 검증 명령

```powershell
Push-Location clients\mobile-staff
npm run typecheck
npm test -- AppRootNavigator.test.tsx --runInBand
Pop-Location

rg -n 'DriverTabNavigator|DriverDashboardScreen|DriverSignatureScreen|SignaturePhotoScreen|LocationTrackingScreen|mode-driver|mode === "driver"|mode === ''driver''|setMode\("driver"|setMode\(''driver''' clients/mobile-staff/App.tsx clients/mobile-staff/src/screens/AppRootNavigator.tsx

.\scripts\generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1
```

`rg` import guard 는 match 가 없으면 PASS 이며, 이 경우 exit code 1 이 정상이다.

## 캡처 내 개인정보/내부값 guard

- 캡처에는 실제 내부 식별자, 접근 토큰, 비밀값, 원격 URL 을 넣지 않는다.
- 캡처 문구는 역할/경계/검증 결과만 표시한다.
- PR 본문용 PNG는 `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/` 아래에 생성한다.

## PR 캡처 목록

| 파일 | 목적 |
|---|---|
| `screenshots/01-retirement-decision.png` | D-AX-19 결정: mobile-staff 는 견적 전용, 배송기사 기능은 arologis-mobile 소유 |
| `screenshots/02-app-root-estimate-only.png` | 앱 루트가 estimate WebView 단일 화면으로 수렴 |
| `screenshots/03-no-driver-toggle.png` | 기사 mode 토글/탭/전환 버튼 부재 확인 |
| `screenshots/04-code-boundary-import-guard.png` | root/import 경계에서 기사 런타임 직접 연결 없음 |
| `screenshots/05-verification-matrix.png` | typecheck, focused Jest, import guard, screenshot generation 검증 매트릭스 |
