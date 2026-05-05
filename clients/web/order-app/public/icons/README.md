# PWA 아이콘 placeholder

## 의도
- `icon-192.png` (192×192) / `icon-512.png` (512×512) — vite-plugin-pwa manifest 가 참조.
- 본 디렉토리는 placeholder. M2 partner-service 통합 단계에서 DESIGN team 이 samhan logo PNG export.

## 임시 대체
빌드/typecheck 단계에서는 누락되어도 빌드 PASS — vite-plugin-pwa 가 manifest 만 생성. 런타임에서 아이콘 404 발생 시 PWA install prompt 만 영향 (앱 동작 영향 없음).

## 후속 (DESIGN team)
1. samhan-air.com 로고 SVG 확보
2. ImageMagick 등으로 PNG 192/512 export
3. 본 디렉토리에 `icon-192.png` / `icon-512.png` 배치
