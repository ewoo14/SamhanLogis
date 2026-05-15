# Pretendard self-host (Phase 10 W10-3)

> Designer-2 채택 (사용자 결정 2026-05-07) — jsdelivr CDN 회피 + 정식 도입.

본 디렉토리는 Pretendard OTF 운영 배치 위치다.

> **W10-3 종합 TM 후속 (2026-05-07)**: Designer-2 / FE-2 / B-DEVOPS-1 통합 채택 — 본 PR 시점 4 weight OTF
> 실배치 완료 (`Regular / Medium / SemiBold / Bold`, 약 6.2MB). 9 weight 정식 배치 + `usePretendardFontGuarded`
> `useState(false)` 정정은 EAS Build 진입 시점 (W10-5 또는 운영 진입) 으로 위임 (D-P10-10).

## 본 PR (W10-3) 시점 배치 = 4 weight 의무

```
clients/mobile-staff/assets/fonts/
├── Pretendard-Regular.otf    (400) — 1.5MB
├── Pretendard-Medium.otf     (500) — 1.5MB
├── Pretendard-SemiBold.otf   (600) — 1.5MB
└── Pretendard-Bold.otf       (700) — 1.5MB
```

`usePretendardFontGuarded()` 가 4 weight 모두 `loadAsync` 처리 — `expo-font` plugin 등록 후 RN family 이름 `Pretendard` / `Pretendard-Medium` / `Pretendard-SemiBold` / `Pretendard-Bold` 로 사용.

## 운영 진입 시점 정식 배치 (D-P10-10)

EAS Build 진입 시점 (W10-5 또는 운영 진입) 의무:

```
clients/mobile-staff/assets/fonts/
├── Pretendard-Thin.otf       (100)
├── Pretendard-ExtraLight.otf (200)
├── Pretendard-Light.otf      (300)
├── Pretendard-Regular.otf    (400)  ✓ W10-3 배치
├── Pretendard-Medium.otf     (500)  ✓ W10-3 배치
├── Pretendard-SemiBold.otf   (600)  ✓ W10-3 배치
├── Pretendard-Bold.otf       (700)  ✓ W10-3 배치
├── Pretendard-ExtraBold.otf  (800)
└── Pretendard-Black.otf      (900)
```

추가 의무:
- `app.config.js` `plugins.expo-font` 의 9 weight asset 등록
- `usePretendardFontGuarded` 정정 — `useState(false)` + `useFonts` complete 후 `setReady(true)` + splash screen guard

## 출처

- 공식 GitHub release: https://github.com/orioncactus/pretendard/releases
- 라이센스: SIL Open Font License 1.1 (자유 사용)

## graceful guard 패턴 (본 PR 보존)

`usePretendardFontGuarded()` 의 `useState(true)` graceful default + `try/catch` fallback 은 본 PR (W10-3) 시점 보존:
- OTF 일부 weight 누락 / `expo-font` 미설치 / asset bundle 결손 시 RN UI 미차단
- D-P10-10 의 `useState(false)` 정정은 9 weight 정식 배치 시점 동시 처리 (영구 splash 차단 회귀 방지)
