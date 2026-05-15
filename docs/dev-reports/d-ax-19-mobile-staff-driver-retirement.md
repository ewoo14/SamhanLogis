# D-AX-19 mobile-staff driver mode retirement — DevOps / dependency review

> 작성일: 2026-05-16
> 소유 파일: `docs/dev-reports/d-ax-19-mobile-staff-driver-retirement.md`
> 범위: `clients/mobile-staff` 에서 driver mode 런타임을 제거한 뒤 패키지 의존성, CI, 운영 검증 영향만 검토한다.

---

## 1. 결론

D-AX-19 는 backend 기능 변경이 아니라 **mobile-staff 프론트 런타임 축소 slice** 이다. `mobile-staff` 는 영업직원 견적 WebView 단일 진입으로 되돌리고, 배송기사 기능은 `clients/arologis-mobile` 이 전담한다.

따라서 DevOps 기준 핵심 작업은 다음 4가지다.

| 항목 | 결론 |
|---|---|
| package cleanup | driver mode 전용 의존성은 `clients/mobile-staff` 에서 제거 가능 |
| 유지 의존성 | 영업 방문사진, 전표 상세/실시간, 견적 WebView 경로가 쓰는 패키지는 유지 |
| Docker backend | 불필요. DB / Redis / RabbitMQ / Elasticsearch / MinIO / backend service 기동 없이 검증 가능 |
| PR 후 확인 | PR 본문 QA 이미지 raw URL 은 `HEAD 200` 으로 별도 확인 |

---

## 2. Dependency cleanup 후보

`clients/mobile-staff` 에서 driver mode 화면, GPS tracking, driver signature share flow, driver API client 가 제거되면 아래 의존성은 cleanup 대상이다.

| package | 기존 사용처 | D-AX-19 판단 | 확인 포인트 |
|---|---|---|---|
| `base-64` | driver `sign-and-send-copy` 의 `ArrayBuffer -> base64` 변환 | 제거 가능 | `clients/mobile-staff/src/api/arologis.ts` 제거 후 import 없음 |
| `@types/base-64` | `base-64` TS 타입 | 제거 가능 | `base-64` 제거와 lockfile 동시 정리 |
| `expo-location` | driver GPS foreground/background 권한, 1회 위치 조회 | 제거 가능 | `useGpsPermission` 및 app config plugin 잔존 여부 확인 |
| `expo-sharing` | driver signature PNG Share Sheet | 제거 가능 | `DriverSignatureScreen` 제거 후 mock/test import 없음 |
| `expo-file-system` | driver signature PNG cache file 저장 | 제거 가능 | `expo-sharing` 제거와 함께 lockfile transitive 정리 확인 |

주의: `expo-location` 은 `package.json` 뿐 아니라 Expo config plugin 배열에 남을 수 있다. D-AX-19 는 정적 `app.json` 을 삭제하고 `app.config.js` 를 단일 source of truth 로 유지해 Expo Doctor 중복 config 경고까지 차단한다.

---

## 3. 유지해야 할 dependency 후보

아래 의존성은 driver mode 제거만으로 삭제하면 안 된다.

| package | 유지 사유 | 대표 사용처 |
|---|---|---|
| `expo-image-picker` | `PhotoAttachmentCapture` 가 카메라/갤러리 선택에 사용. 영업 방문사진 경로 보존 필요 | `clients/mobile-staff/src/components/PhotoAttachmentCapture.tsx`, `screens/sales/VisitPhotoScreen.tsx` |
| `expo-image-manipulator` | `PhotoAttachmentCapture` 이미지 압축에 사용. 영업 방문사진 업로드 품질/용량 가드 | `clients/mobile-staff/src/components/PhotoAttachmentCapture.tsx` |
| `react-native-sse` | `SlipRealtimeClient` 의 SSE polyfill. 전표 상세/코멘트/수정요청 실시간 경로에서 사용 | `clients/mobile-staff/src/realtime/SlipRealtimeClient.ts` |
| `react-native-webview` | mobile-staff 의 주 진입점인 estimate WebView 렌더링에 필수 | `clients/mobile-staff/src/screens/EstimateWebViewScreen.tsx` |

`clients/arologis-mobile` 의 driver app 의존성은 D-AX-19 cleanup 대상이 아니다. `arologis-mobile` 은 서명, GPS, 사진, SSE driver runtime 을 계속 담당하므로 해당 앱의 `base-64`, `expo-location`, `expo-sharing`, `expo-file-system` 등은 별도 판단 없이 유지한다.

---

## 4. CI 영향 및 권장 검증

### 4.1 mobile-staff typecheck

driver folder 삭제 후 stale import 를 가장 빨리 잡는 검증이다.

```powershell
cd clients/mobile-staff
npm run typecheck
```

### 4.2 Expo dependency 정합

SDK 53 package map 기준으로 제거/유지 의존성의 version drift 와 plugin 잔존을 확인한다. 로컬에서는 `expo install --check` 를 우선 사용하고, CI 기존 job 과 맞추려면 `expo-doctor` 를 같이 확인한다.

```powershell
cd clients/mobile-staff
npx expo install --check
npx expo-doctor
```

현재 `.github/workflows/ci.yml` 의 `frontend-mobile-staff` job 은 `npm ci -> npm run typecheck -> app.config.js 검증 -> npx expo-doctor -> expo prebuild dry-run` 순서다. D-AX-19 는 package/lockfile 변경이 있으므로 `npm ci` 가 lockfile mismatch 를 먼저 잡는다.

### 4.3 Jest focused

driver mode retirement 의 핵심 회귀는 root navigator 가 driver switch 를 더 이상 노출하지 않는지다.

```powershell
cd clients/mobile-staff
npm test -- AppRootNavigator.test.tsx --runInBand
```

삭제된 driver screen 테스트는 CI 대상에서 제외되어야 한다. 남아 있는 testPathPattern 이 `driver/(DriverSignatureScreen|SignaturePhotoScreenChain)` 를 직접 지정하면 실패하므로 workflow / PR 설명의 검증 명령을 D-AX-19 기준으로 교체한다.

### 4.4 no driver folder import guard

driver directory 파일이 삭제되어도 다른 모듈이 경로를 import 하면 typecheck 전 단계에서 리뷰가 놓치기 쉽다. PR 검증에 아래 guard 를 추가하는 것을 권장한다.

```bash
! rg -n "from ['\"].*(screens/driver|/driver/|api/arologis|hooks/useGpsPermission)|require\(['\"].*(screens/driver|/driver/|api/arologis|hooks/useGpsPermission)" clients/mobile-staff/src -S
```

이 guard 는 사용자 화면에 표시되는 `driverCode`, `driverName` 같은 업무 필드까지 차단하는 목적이 아니다. 삭제 대상인 driver runtime module import 만 차단한다.

---

## 5. Docker backend 불필요 판단

D-AX-19 는 `mobile-staff` 내부 driver runtime 제거와 dependency cleanup 이다. backend endpoint, DB schema, Flyway, queue, storage, Elasticsearch, MinIO 계약을 바꾸지 않는다.

따라서 다음 검증은 이번 slice 의 필수 조건이 아니다.

| 검증 | 제외 사유 |
|---|---|
| `infrastructure/docker-compose.yml` 기동 | 프론트 런타임 제거만 검증하므로 DB/Redis/RabbitMQ 등 불필요 |
| backend Gradle 통합 테스트 | API 계약 변경 없음 |
| Testcontainers | backend persistence / external client 경계 변경 없음 |
| MinIO / slip attachment actual upload | `mobile-staff` driver upload 경로 제거가 목적이며, driver upload 는 `arologis-mobile` 담당 |

단, PR 범위가 `clients/arologis-mobile`, backend controller/client, attachment API 계약까지 확장되면 이 판단은 무효다. 그 경우 D-AX-17/D-AX-18 수준의 backend + Docker 검증으로 격상한다.

---

## 6. PR 후 raw screenshot URL 확인

QA 스크린샷을 PR 본문에 인라인으로 넣은 뒤, GitHub raw URL 이 외부/모바일에서 열리는지 `HEAD 200` 을 확인한다. 이 확인은 PR 번호와 commit push 이후에만 가능하다.

```powershell
$url = "https://raw.githubusercontent.com/ewoo14/SamhanLogis/<branch-or-sha>/docs/qa/<slug>/screenshots/<file>.png"
(Invoke-WebRequest -Method Head -Uri $url).StatusCode
```

기대값은 `200` 이다. `302` 또는 `404` 가 나오면 PR 본문 이미지 URL 을 raw.githubusercontent.com 형식으로 교체하거나 branch/sha/path 를 재확인한다.

---

## 7. DevOps 승인 조건

| 조건 | 승인 기준 |
|---|---|
| package cleanup | `package.json` 과 `package-lock.json` 이 동일 후보를 제거하고 `npm ci` 통과 |
| 유지 의존성 | `expo-image-picker`, `expo-image-manipulator`, `react-native-sse`, `react-native-webview` 유지 |
| stale import | no driver folder import guard 통과 |
| CI | `mobile-staff typecheck`, Expo 정합 검사, focused Jest 통과 |
| Docker | backend 미기동 사유가 PR 본문 또는 dev-report 에 명시 |
| QA asset | PR 후 screenshot raw URL `HEAD 200` 확인 |

DevOps 관점에서 D-AX-19 는 위 조건을 만족하면 merge blocker 없음. 운영 리스크는 `mobile-staff` 앱에서 driver mode 가 사라지는 사용자 경로 변경이며, 배송기사 기능 자체는 `arologis-mobile` 에 이미 이관된다는 전제가 필요하다.

---

## 8. 2026-05-16 PM 로컬 검증 결과

| 검증 | 결과 |
|---|---|
| `clients/mobile-staff npm run typecheck` | PASS |
| `clients/mobile-staff npm test -- --runInBand` | PASS (1 suite / 1 test) |
| `clients/mobile-staff npm ci` | PASS (lockfile 정합 확인, 기존 audit warning 9건) |
| `clients/mobile-staff app.config.js node 직접 검증` | PASS |
| `clients/mobile-staff npx expo install --check` | PASS |
| `clients/mobile-staff npx expo-doctor` | PASS (17/17) |
| `clients/mobile-staff npx expo export --platform web --output-dir dist-dax19-review` | PASS (FE review 후 생성물 정리) |
| no driver runtime import guard | PASS (match 없음, exit 1 정상) |
| `git diff --check` | PASS (CRLF warning 만 출력) |
| `scripts/generate-d-ax-19-mobile-staff-driver-retirement-screenshots.ps1` | PASS (5 PNG 재생성) |

Docker backend 는 본 slice 에서 API/DB 계약 변경이 없어 기동하지 않았다. PR 범위가 backend 또는 `clients/arologis-mobile` runtime 으로 확장되면 D-AX-17/D-AX-18 수준의 Docker/Testcontainers 검증으로 격상한다.

## 9. 5-team 최종 리뷰 기록

| Team | 결과 |
|---|---|
| Designer | `mobile-staff` 내부에 기사 앱 안내/CTA 를 추가하지 않고 estimate WebView 단일 진입을 유지하는 UX 기준 문서화 |
| FE | blocker 없음. `screens/driver`, `api/arologis`, `useGpsPermission` runtime import 잔존 없음 확인. 주석/문서 정리 패치만 적용 |
| BE | blocker 없음. backend endpoint / DB / Flyway 변경 없음, Docker/Testcontainers 필수 아님 확인 |
| QA | focused Jest + import guard + 5장 PNG 캡처 generation 기준 문서화 |
| DevOps | package cleanup/유지 의존성, Expo config 단일화, PR raw screenshot `HEAD 200` 확인 조건 문서화 |

---

## 9. 2026-05-16 FE 최종 구현 리뷰

리뷰 범위는 `clients/mobile-staff` 코드 / Expo 설정 / focused Jest / QA 문서 경계로 제한했다. root 는 `EstimateWebViewScreen` 단일 렌더로 수렴했고, 삭제 대상인 `src/screens/driver/**`, `src/api/arologis.ts`, `src/hooks/useGpsPermission.ts` 로 향하는 runtime import 는 남아 있지 않다.

소규모 패치:
- `App.tsx`, `src/theme/usePretendardFontGuarded.ts`, `assets/fonts/README.md`: D-AX-19 현재 운영 상태에 맞게 Pretendard 설명을 4 weight 기준으로 정정.
- `src/api/salesUtils.ts`, `src/api/attachmentApi.ts`, `src/api/slipComment.ts`: 삭제된 기사 전용 `api/arologis.ts` 를 참조하던 주석을 mobile-staff API client 기준으로 정정.

추가 검증:

| 검증 | 결과 |
|---|---|
| `clients/mobile-staff npm run typecheck` | PASS |
| `clients/mobile-staff npm test -- AppRootNavigator.test.tsx --runInBand` | PASS |
| `clients/mobile-staff npm test -- --runInBand` | PASS (1 suite / 1 test) |
| `clients/mobile-staff npx expo install --check` | PASS |
| `clients/mobile-staff npx expo-doctor` | PASS (17/17) |
| no deleted driver runtime path guard | PASS (match 없음, exit 1 정상) |
| `git diff --check -- clients/mobile-staff` | PASS (CRLF warning 만 출력) |
| `clients/mobile-staff npx expo export --platform web --output-dir dist-dax19-review` | PASS, 생성물 정리 완료 |

FE reviewer 기준 blocking finding 없음. `clients/mobile-staff` 에는 별도 `lint` script 가 없어 lint 는 실행하지 않았다.
