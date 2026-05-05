# QA — clients/mobile (Phase 6 Sub-team D)

## 캡처 5장

| # | 파일 | 화면 | 시점 |
|---|---|---|---|
| 1 | `01-mobile-bizgate-login.png` | BizGate 사업자번호 로그인 (어두운 #020617 게이트) | 사업자번호 1234567890 입력 후 |
| 2 | `02-mobile-home.png` | 홈 (Bottom Tab 4 탭 + 환영 카드 + 빠른 액션 + 안내) | BizGate 통과 후 |
| 3 | `03-mobile-order-form.png` | 주문 작성 (배송 정보 + 주문 라인 1건 + 합계) | 품목 1건 추가 후 |
| 4 | `04-mobile-bottom-tab.png` | Bottom Tab Navigator 4 탭 표시 (홈 활성) | 홈 화면 동일 |
| 5 | `05-mobile-product-picker.png` | 품목 선택 모달 (4 카테고리 탭 + 품목 4종) | 주문 작성 → "+ 품목 추가" |

- 해상도: **390×844** (iPhone 14 Pro)
- 캡처 도구: Playwright + msedge channel + Expo web export
- API 응답: backend mock (Playwright route interception)

## 캡처 재현 방법

```sh
cd clients/mobile

# 1. 의존성 설치 (legacy-peer-deps 필수 — RN 0.79 + react-navigation peerDeps 충돌 우회)
npm install --legacy-peer-deps

# 2. web preview 빌드
npm run export:web

# 3. type=module 패치 (Expo SDK 53 web export 의 ESM 호환)
node -e "const fs=require('fs');const p='dist/index.html';let h=fs.readFileSync(p,'utf8');h=h.replace('<script src=','<script type=\\"module\\" src=');fs.writeFileSync(p,h);"

# 4. 정적 서버
npx http-server dist -p 4173 -s &

# 5. Playwright 일시 설치 (디스크 잔류 X)
npm install --no-save --legacy-peer-deps playwright

# 6. 캡처 실행 (Edge channel — 별도 chromium 다운로드 X)
node scripts/capture.cjs

# 7. 정리
npm uninstall playwright
```

## 시뮬레이터 / Expo Go 캡처 (대안)

위 web preview 캡처는 RN web bridge 를 통한 **layout 검증 용도**.
실제 native 동작 검증은 다음 중 하나:

### Expo Go (iOS / Android)

```sh
cd clients/mobile
npm run start          # QR 코드 표시
# 모바일에서 Expo Go 앱으로 QR 스캔 → 실시간 미리보기
```

### iOS 시뮬레이터 (macOS only)

```sh
npm run ios
# Cmd+S 로 캡처 → ~/Desktop
```

### Android 에뮬레이터

```sh
npm run android
# Android Studio AVD 의 카메라 아이콘으로 캡처
```

## QA 체크리스트

- [x] BizGate 어두운 배경 (`#020617`) + biz-box 카드 (`#0b1120`) — legacy 보존
- [x] BizGate 사업자번호 10자리 입력 검증 (확인 버튼 활성)
- [x] BottomTab 4 탭 (홈 / 주문 / 알림 / 프로필) — 활성 탭 brand500 강조
- [x] 주문 작성 — 배송 정보 + 라인 + 합계 카드 3분할
- [x] 품목 모달 — 4 카테고리 탭 (HW/ACC/ETC/CTRL) + 품목 검색
- [x] UUID 미노출 — 모든 화면에서 orderNumber/partnerCode/modelCode 만 노출
- [x] 한국어 라벨 (Pretendard fallback OK)
- [x] 390×844 viewport 대응
