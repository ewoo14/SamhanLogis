# S20 라이브QA — PR #1045 · 이슈 #1039 가배차

실행일: 2026-08-05 (KST)

## 범위와 가드레일

- 내장 브라우저 미사용. `@playwright/test`의 `chromium` headless 드라이버 사용.
- mock OFF, renderer `http://localhost:5179`, API `http://localhost:8080`.
- 재빌드·재배포·중지·DB 직접 쓰기·기존 창고/문서/그룹 삭제 없음.
- 새 전표는 실 화면에서 `RETURN_RENTAL`로 생성.

## 전표 표본

| 전표 | 출고 창고 | 거래처 | 권역 | 캡처 |
|---|---|---|---|---|
| `2026/08/05-5` | 상일 코드 2 | P0-6-C003 대한화물서비스(주) | 지방 | [`01-outbound-local-sangil.png`](screenshots/01-outbound-local-sangil.png) |
| `2026/08/05-6` | 초월 코드 00003 | P0-6-C001 (주)한국냉동물류 | 수도권 | [`02-outbound-metropolitan-chowol.png`](screenshots/02-outbound-metropolitan-chowol.png) |

두 전표 모두 실 화면 저장은 성공했다. 사용자가 제공한 거래처 주소와 달리 가배차 화면의 `주소` 열은 두 건 모두 공란으로 표시됐다.

## 8모드 대조

| 모드 | 예상 결과 | 실제 결과 | 판정 | 캡처 |
|---|---|---|---|---|
| 상일+초월 · 지방 제외 | 수도권 전표만 | 총 4건; S20 지방 `2026/08/05-5`가 미분류로 포함 | **FAIL** | [`mode-01-SANGIL_AND_CHOWOL_REGION_EXCLUDED.png`](screenshots/mode-01-SANGIL_AND_CHOWOL_REGION_EXCLUDED.png) |
| 초월 · 지방 제외 | 초월의 수도권 전표만 | 총 2건; S20 수도권 `2026/08/05-6` 포함, 상일 전표 제외 | **FAIL** | [`mode-02-CHOWOL_REGION_EXCLUDED.png`](screenshots/mode-02-CHOWOL_REGION_EXCLUDED.png) |
| 상일 · 지방 제외 | 상일 지방 전표 제외 | 총 2건; S20 지방 `2026/08/05-5`가 미분류로 포함 | **FAIL** | [`mode-03-SANGIL_REGION_EXCLUDED.png`](screenshots/mode-03-SANGIL_REGION_EXCLUDED.png) |
| 야적 only | 야적 조건 전표만 | 총 0건; RETURN_RENTAL 표본만 생성하여 조건 미충족 | **미실시** | [`mode-04-STACK_ONLY.png`](screenshots/mode-04-STACK_ONLY.png) |
| 지방 only | 지방 조건 전표만 | 총 0건; RETURN_RENTAL 표본만 생성하여 조건 미충족 | **미실시** | [`mode-05-REGION_ONLY.png`](screenshots/mode-05-REGION_ONLY.png) |
| 상일+초월 · 지방 포함 | 두 전표 모두 | 총 4건; S20 두 건 모두 미분류로 포함 | **FAIL** | [`mode-06-SANGIL_AND_CHOWOL_REGION_INCLUDED.png`](screenshots/mode-06-SANGIL_AND_CHOWOL_REGION_INCLUDED.png) |
| 초월 · 지방 포함 | 초월 지방/수도권 전표 | 총 2건; S20 수도권 포함, 상일 제외 | **FAIL** | [`mode-07-CHOWOL_REGION_INCLUDED.png`](screenshots/mode-07-CHOWOL_REGION_INCLUDED.png) |
| 상일 · 지방 포함 | 상일 지방 전표 | 총 2건; S20 지방 포함, 초월 제외 | **FAIL** | [`mode-08-SANGIL_REGION_INCLUDED.png`](screenshots/mode-08-SANGIL_REGION_INCLUDED.png) |

## 오차단 집계

정상 전표 통째 소실: **0건**. 두 신규 전표는 창고 필터가 맞는 모드에서 모두 화면에 남았다.

다만 지방 전표 `2026/08/05-5`는 지방 제외 모드 1·3에서 미분류 버킷으로 남아 **1건 오분류 포함**됐다. 수도권 전표 `2026/08/05-6`는 초월 필터에서만 남아 창고 축 자체는 분리됐다.

## 결함 판정 및 재현 절차

사용자가 제공한 실 거래처 마스터 측정값(주소 보유)을 전제로 했으나, 실제 전표 생성 후 가배차 응답/화면에는 다음과 같이 주소가 공란이었다.

```text
2026/08/05-5  P0-6-C003  대한화물서비스(주)  주소 공란  미분류 거래처
2026/08/05-6  P0-6-C001  (주)한국냉동물류    주소 공란  미분류 거래처
```

재현: `dev_manager` 로그인 → 새 판매전표 → 출고 창고 `2`/`00003` 선택 → 거래처 코드 `P0-6-C003`/`P0-6-C001` 선택 → `RETURN_RENTAL` 선택 → 저장 → `dev_dispatch` 로그인 → `/arologis/pre-classify` → 8모드 조회. 결과 두 건 모두 `미분류 거래처`, 주소 열 공란. 지방 전표가 지방 제외 모드에서 제거되지 않고 미분류 버킷에 남는다.

따라서 S20의 8모드 분류는 **제품 결함으로 FAIL**이다. 주소가 있는 표본을 사용했는데도 주소 전달 또는 REGION 매칭이 되지 않았으므로, 지시대로 제품을 수정하지 않고 중단 보고한다.

## 실행 로그

드라이버 stdout 원문: `clients/desktop/s20-provisional-dispatch-real-qa.log`.

## 새 파일

- `clients/desktop/s20-provisional-dispatch-real-qa.mjs`
- `clients/desktop/s20-provisional-dispatch-real-qa.log`
- `docs/qa/1039-provisional-dispatch-s20-real-qa/qa-report.md`
- `docs/qa/1039-provisional-dispatch-s20-real-qa/screenshots/` (실행 생성)
