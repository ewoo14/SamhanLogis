# D-AX-19: mobile-staff driver mode retirement UX

> 대상 앱: `clients/mobile-staff`
> 관련 기사 앱: `clients/arologis-mobile`
> 결정 범위: mobile-staff 내 배송기사 모드 제거와 estimate WebView 단일 진입 유지
> 원칙: mobile-staff는 더 이상 배송기사 앱이 아니다. 기사 기능은 arologis-mobile이 소유한다.

---

## 1. 결정 요약

- `clients/mobile-staff`는 D-AX-19 이후 배송기사용 앱으로 취급하지 않는다.
- 배송기사 업무 화면, 기사 인증 이후 배차/전표/서명/사진 기능은 `clients/arologis-mobile` 소유다.
- `AppRootNavigator`의 첫 화면은 estimate WebView 단일 진입으로 유지한다.
- mode switch UI에서 `배송기사` 버튼은 제거한다.
- mobile-staff 안에 기사 앱으로 이동하라는 별도 안내, 배너, 모달, toast, empty state를 추가하지 않는다.
- 기사 앱 전환 안내는 앱 내부 UX가 아니라 별도 배포, 딥링크, 운영 공지 범위에서 처리한다.

---

## 2. 앱 역할 정의

### 2.1 mobile-staff

`mobile-staff`는 estimate WebView 진입을 제공하는 스태프/견적 중심 모바일 앱으로 정리한다.

필수 유지 사항:

- 앱 실행 후 첫 진입은 estimate WebView다.
- estimate WebView 진입을 우회하는 배송기사 홈, 배송기사 로그인, 배송기사 배차 목록 화면을 제공하지 않는다.
- 앱 내부에서 `배송기사`, `기사 모드`, `driver mode`를 사용자 선택지로 노출하지 않는다.
- 기존 estimate 흐름의 버튼, WebView 로딩, 오류, 인증 동작은 D-AX-19의 UI 제거 범위에 포함하지 않는다.

### 2.2 arologis-mobile

`clients/arologis-mobile`은 기사 기능의 단일 소유 앱이다.

소유 기능:

- 기사 배차 Dashboard
- 정차/전표 상세
- 모바일 서명
- 사진 증빙
- 기사 권한과 기사 업무용 API 연동

D-AX-19 문서에서 `arologis-mobile`은 대체 안내 UI가 아니라 운영상 소유 경계를 명확히 하기 위한 참조다.

---

## 3. AppRootNavigator UX

`AppRootNavigator`는 앱 첫 화면을 estimate WebView 단일 진입으로 유지한다.

요구사항:

- 앱 cold start 후 사용자가 보는 첫 화면은 estimate WebView다.
- 첫 화면 전에 mode 선택 화면을 끼워 넣지 않는다.
- 배송기사 모드 route가 남아 있더라도 사용자가 앱 UI에서 진입할 수 없어야 한다.
- estimate WebView 로딩 중에도 배송기사 대체 안내를 보여주지 않는다.
- WebView 오류 상태에서도 기사 앱 설치/이동 안내를 추가하지 않는다.

비요구사항:

- estimate WebView의 URL, 인증 방식, WebView 내부 IA를 변경하지 않는다.
- arologis-mobile 딥링크를 mobile-staff 안에 새로 노출하지 않는다.
- 기사 앱 다운로드 CTA를 mobile-staff 안에 추가하지 않는다.

---

## 4. Mode Switch 변경

mode switch가 남아 있는 화면 또는 컴포넌트에서는 `배송기사` 버튼을 제거한다.

제거 대상:

- 사용자에게 보이는 `배송기사` 버튼 텍스트
- `배송기사` 접근성 라벨
- 배송기사 모드 선택용 testID
- 배송기사 모드 선택 후 이동하는 press handler
- 배송기사 모드 선택 상태를 나타내는 selected UI

유지 대상:

- estimate WebView 진입 버튼 또는 기본 진입 동작
- 스태프/견적 목적의 기존 선택지가 있다면 해당 선택지
- 기존 design-system token, Pretendard 폰트 사용 방식

금지 사항:

- 제거된 버튼 자리에 `기사 앱으로 이동`, `아로로지스 앱 사용`, `배송기사 기능은 별도 앱에서 사용` 같은 대체 문구를 넣지 않는다.
- 제거된 버튼 영역을 비활성 버튼으로 남기지 않는다.
- `배송기사` 텍스트를 숨김 처리만 하고 접근성 트리에 남기지 않는다.

---

## 5. 사용자 안내 정책

사용자에게 보이는 대체 안내는 mobile-staff 앱 안에 추가하지 않는다.

사유:

- mobile-staff의 앱 역할은 estimate WebView 단일 진입으로 단순화한다.
- 기사 앱 전환은 앱 UX가 아니라 배포, 딥링크, 운영 안내로 처리한다.
- 앱 내부 안내를 추가하면 사용자가 mobile-staff에서도 기사 기능을 기대할 수 있다.
- 기사 기능 소유권은 `clients/arologis-mobile`로 분리되어야 한다.

허용되는 범위:

- 운영팀이 별도 공지, 배포 안내, 딥링크 문서에서 기사 앱을 안내한다.
- QA/릴리즈 노트에서 mobile-staff의 배송기사 모드 제거 사실을 기록한다.

허용되지 않는 범위:

- mobile-staff 화면 안의 안내 배너
- 기사 앱 다운로드 버튼
- 기사 앱 딥링크 CTA
- 배송기사 기능 종료 modal
- WebView 오류 화면에 기사 앱 안내 추가

---

## 6. QA 캡처 체크포인트

PR QA에는 아래 중 4개 이상을 캡처한다. 파일 위치 예시는 `docs/qa/d-ax-19-mobile-staff-driver-retirement/screenshots/*.png`를 권장한다.

| No | 캡처명 제안 | 검증 포인트 |
|---:|---|---|
| 1 | `01-cold-start-estimate-webview.png` | 앱 cold start 후 첫 화면이 estimate WebView인지 확인 |
| 2 | `02-mode-switch-no-driver-button.png` | mode switch UI에 `배송기사` 버튼이 보이지 않는지 확인 |
| 3 | `03-no-driver-accessibility-entry.png` | 접근성/테스트 탐색 기준으로 `배송기사` 라벨 또는 testID가 남지 않았는지 확인 |
| 4 | `04-webview-loading-no-driver-guidance.png` | WebView 로딩 상태에서 기사 앱 대체 안내가 추가되지 않았는지 확인 |
| 5 | `05-webview-error-no-driver-guidance.png` | WebView 오류 또는 fallback 상태에서도 기사 앱 안내/딥링크 CTA가 없는지 확인 |

QA 판정 기준:

- 화면 문구, 버튼, 접근성 라벨, testID 어디에도 사용자 진입 선택지로 `배송기사`가 노출되지 않아야 한다.
- mobile-staff 내부에 기사 앱 이동 안내가 없어야 한다.
- estimate WebView 단일 진입은 유지되어야 한다.
- UUID, 내부 id, 기사 앱 내부 route 같은 기술 식별자는 캡처에 노출하지 않는다.

---

## 7. Frontend 전달 Spec

Frontend agent는 아래 범위만 구현한다.

- `clients/mobile-staff`에서 배송기사 mode switch 버튼 제거
- `AppRootNavigator` 첫 진입을 estimate WebView로 유지
- 제거된 기사 버튼의 접근성 라벨/testID/press handler 정리
- mobile-staff 내부 안내 UI 미추가

Frontend agent가 변경하지 않을 범위:

- `clients/arologis-mobile` 기사 기능
- estimate WebView 내부 웹 페이지
- 기사 앱 배포, 딥링크, 운영 공지
- design-system token
- Pretendard font asset

---

## 8. 디자인 결정

- 신규 디자인 토큰은 만들지 않는다.
- 기존 mode switch 레이아웃이 버튼 수 감소로 흔들리는 경우, 남은 선택지만 자연스럽게 정렬한다.
- 제거된 버튼의 빈 공간을 유지하지 않는다.
- 첫 화면 UX는 설명형 랜딩이 아니라 estimate WebView 업무 화면으로 바로 진입한다.
- 사용자가 기사 기능을 찾을 수 있도록 앱 내부 힌트를 추가하지 않는다.
