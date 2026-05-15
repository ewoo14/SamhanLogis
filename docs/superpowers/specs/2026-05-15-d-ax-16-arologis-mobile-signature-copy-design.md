# D-AX-16 arologis-mobile signature / sign-and-send-copy 설계

## 배경

D-AX-15 에서 `arologis-mobile` 은 로그인 후 dashboard + GPS 두 탭까지 독립 런타임으로 들어왔다.
다음 선택지 중 사용자가 1번을 선택했으므로, 이번 범위는 signature / sign-and-send-copy 이식이다.

## 선택지

| 안 | 내용 | 장점 | 리스크 |
|---|---|---|---|
| 1 추천 | backend `today` 응답에 UUID 없는 실제 정차 target 을 포함하고 앱에서 정차 선택 후 서명 | 운영 호출 가능, mock UUID 제거 | BE/FE 동시 변경 |
| 2 | 화면만 이식하고 비활성 또는 mock target 유지 | 빠름 | 실제 endpoint 호출 불가 |
| 3 | 테스트용 수동 target 입력 | 디버그 가능 | 기사 UX 아님 |

채택: 1안. 사용자가 이전에 “추천 방식” 진행을 승인했고, mock target 은 실제 sign-and-send-copy endpoint 에 위험하다.

## 구현 원칙

- 화면과 driver-facing API 에 UUID 노출 금지. `dispatchId` 는 서버 내부 해석값으로만 사용한다.
- today target 은 `dispatchType + vehicleSequence + stopSequence + parsedKakaoSeq` 로 좁힌다.
- `mobile-staff` 의 all-zero mock stop 은 복제하지 않는다.
- 배송사진 / 검수사진은 이번 PR에 포함하지 않는다.
- 실제 서명 입력은 `react-native-signature-canvas` 로 받는다.
- image/png 성공 응답은 `expo-file-system` cache 파일로 저장 후 `expo-sharing` Share Sheet 로 전달한다.
- 실패 분기는 모바일에서 사용자 행동이 달라야 하므로 toast/retry 정책을 분리한다.

## 테스트/캡처

- Backend unit RED/GREEN: `ArologisDriverAppControllerTest`
- Frontend type RED/GREEN: `signatureContract.test-d.ts`
- Frontend runtime branch: `DriverSignatureScreen.test.tsx`
- `clients/arologis-mobile npm run typecheck`
- `clients/arologis-mobile npx expo install --check`
- `docs/qa/d-ax-16-arologis-mobile-signature-copy/screenshots/` 에 큰 PNG 10장 생성
