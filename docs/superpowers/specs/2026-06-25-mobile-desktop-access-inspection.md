# 모바일 점검 + "데스크탑을 모바일로" 설계 제안 (brainstorming 초안)

> 작성: 2026-06-25 야간자율 PM(Opus) 정찰 · 상태: **✅ 개발책임자 결정 완료(2026-06-25) → spec 확정 → 슬1 foundation 착수**
> 개발책임자 지시: "모바일=창고직원 전용 아닌 **전 직원용**, 기본적으로 **데스크탑을 모바일로 사용**하게 하는 게 목표. 실제 그렇게 설계/구현됐는지 확인하고 안 되어있으면 다음 슬라이스로 적용."

## ✅ 0. 개발책임자 결정 (2026-06-25, AskUserQuestion 확정)
- **🆕 최종 배포 형태(2026-06-25 추가)**: 데스크탑 = **.exe(Electron)** 유지. 모바일 = **iOS + Android 네이티브 앱 2종**(앱스토어/플레이스토어). 방식 = **하이브리드 WebView 쉘** — 반응형 웹(슬1 토대)을 Expo/RN 네이티브 쉘로 감싸 앱 빌드(기존 mobile-staff Expo+WebView 패턴 확장, 데스크탑 UI 재사용·단일 코드베이스). iOS/Android 패키징(Expo 쉘 + 스토어 배포)은 **후속 슬라이스**(슬1 웹 토대 위). 순수 WebView App Store 심사 리스크는 사내 ERP 기업배포 + 네이티브 기능(푸시/카메라 OCR/서명)으로 회피.
- **🆕 모바일 최적화 요구(2026-06-25)**: 모바일은 반응형뿐 아니라 **성능/UX 최적화**도 필요 — 슬2(반응형 셸) + WebView 성능(번들 분할·lazy·터치/스크롤·이미지·오프라인 캐시) 별도 고려. 로드맵 반영.
- **Q1 접근법 = Option A** (데스크탑 렌더러 반응형 + 웹/PWA 배포). "데스크탑을 모바일로" 직역. **→ 하이브리드 WebView 쉘로 iOS/Android 앱 출시(상기 확정).**
- **Q2 인증 = httpOnly 쿠키** (보안 우수·XSS 토큰탈취 방지). CSRF 가드(SameSite + 토큰) 동반·게이트웨이 쿠키 인증 경로 추가.
- **Q3 범위/우선순위 = 단계적, 현장 고빈도 우선**. 슬1 foundation → 판매/재고·출고전표 등 현장 빈도 높은 업무부터 반응형, 회계/인사 후속.
- **Q4 기존 앱 = 유지**. mobile-staff(견적 WebView)/mobile(거래처 주문 WebView) 네이티브 셸 유지. 데스크탑 웹은 **직원용으로 추가 신설**.
- ⇒ Option A 확정. 본 spec 하단 슬라이스 큐대로 슬1(인증 추상화 + 웹 배포 골격)부터 canonical 8단계.

## 1. 점검 결과 — 목표와 큰 갭 (정찰 file:line 근거)
| 앱 | 대상 | 제공 | 커버 |
|---|---|---|---|
| `clients/mobile-staff` | 영업직원 | estimate-app WebView 단일(`AppRootNavigator.tsx:13` EstimateWebViewScreen) | **견적만**. SalesTabNavigator 5탭(`screens/sales/`)·SlipDetailScreen 구현됐으나 **미사용 보존** |
| `clients/mobile` | 거래처(직원 아님) | order-app WebView 단일(`MobileOrderWebViewScreen`) | **주문만** |
| `clients/arologis-mobile` | 배송기사 | 네이티브 5탭(배차/GPS/서명/사진/검수) | **배차/서명만** |
| `clients/desktop` | 전직원 전 롤 | Electron 50+ 라우트(판매/구매/재고/회계/인사/배차/그룹웨어) | **모바일 불가** |

**데스크탑 모바일 불가 원인(치명)**:
- 반응형 CSS 0: `global.css` `.app-shell{grid-template-columns:240px 1fr}` 고정, `@media`는 print 2건뿐. 모바일서 가로스크롤·테이블 컬럼 잘림.
- Electron IPC 의존: `api/client.ts`·`stores/session.ts`가 `window.samhanAuth.getToken()`(preload 브리지) — 브라우저서 undefined → 전 API 실패.
- 웹 배포 부재: PWA(manifest/SW) 없음, prod 웹 빌드 config 없음(QA용 `vite.renderer.dev.config.ts` :5175만).

⇒ 창고/구매/회계/인사 직원 모바일 진입점 **0**. 목표 미달.

## 2. 설계 방향 옵션 (개발책임자 결정 필요)
- **Option A — 데스크탑 렌더러 반응형 + 웹/PWA 배포(목표 직역, 추천)**: desktop 렌더러를 반응형 개조(사이드바→drawer/하단탭·테이블 카드화·@media) + **Electron 인증 추상화**(`window.samhanAuth` → 웹은 localStorage/쿠키 JWT fallback) + 웹/PWA 배포 빌드(`vite.web.config`·manifest·history 라우팅·게이트웨이 CORS). 전직원이 **모바일 브라우저로 데스크탑 전체** 사용. 대형(다중 슬라이스). "데스크탑을 모바일로" 가장 직접.
- **Option B — mobile-staff WebView를 데스크탑 풀로 확대**: mobile-staff가 estimate-app 대신 **데스크탑 웹(Option A의 웹배포)**를 WebView 로드. RN 셸 유지·인증 RN→WebView 주입. (Option A의 웹배포가 선행 필요 → 사실상 A 포함.)
- **Option C — 롤별 모바일 네이티브 확장**: mobile-staff SalesTabNavigator(기구현) 활성화 + 구매/회계/창고 탭 신규 RN. 네이티브 UX 좋으나 **데스크탑과 이중 구현**(유지보수 2배)·"데스크탑을 모바일로"와 거리.

## 3. 권장 + 첫 슬라이스 제안 (Option A)
1. **슬1 (foundation): Electron 인증 추상화 + 웹 배포 골격** — `window.samhanAuth` 를 플랫폼 추상화(Electron=IPC / 웹=localStorage/쿠키 JWT). `vite.web.config` prod 웹 빌드 + hash→history 라우팅. 게이트웨이 CORS 허용. 데스크탑(Electron) 동작 무회귀 + 모바일 브라우저서 로그인+1개 화면 동작.
2. **슬2: 반응형 셸** — AppLayout 사이드바 ≤768px drawer/하단탭, viewport, 터치 타겟. design-system 반응형 토큰.
3. **슬3~: 화면별 반응형** — 테이블 카드화·폼 1열·전표/회계/구매 등 우선순위순. PWA(설치/오프라인) 후속.

## 4. 개발책임자 확인 필요 (brainstorming 질문)
- **Q1 접근법**: A(데스크탑 반응형 웹/PWA — 추천) / B(mobile-staff WebView 데스크탑 풀) / C(롤별 네이티브)?
- **Q2 인증**: 웹 JWT 저장 = httpOnly 쿠키(보안 우수·CSRF 가드 필요) vs localStorage(간단·XSS 노출)?
- **Q3 배포/도메인**: 모바일 웹 도메인(app.samhan-air.com 등)·인증서·게이트웨이 CORS 정책?
- **Q4 범위/우선순위**: 1차 모바일 대상 업무(판매/재고 우선? 전체?)·롤?
- **Q5 기존 mobile-staff/mobile WebView 앱**: 유지(견적/주문 전용) vs 데스크탑 웹으로 통합?

⇒ Option A 권장. 개발책임자 Q1~Q5 결정 시 spec 확정 → writing-plans → canonical 슬라이스(슬1 foundation부터).
