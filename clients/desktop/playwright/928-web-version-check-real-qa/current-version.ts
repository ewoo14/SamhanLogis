/**
 * 928 real-QA 하네스 — order-app 빌드 버전과 스펙 단언의 단일 진실원(R3-1 fix).
 *
 * `playwright.config.ts`(order-app webServer 빌드 환경)와
 * `928-web-version-check-real-qa-real-qa.spec.ts`(API 단언에 쓰는 `currentVersion`)가
 * 이 상수 하나를 같이 import 한다 — 두 값이 서로 다른 리터럴로 따로 박혀 있으면
 * 한쪽만 바뀌어도 스펙 전제와 실제 빌드가 조용히 어긋날 수 있었다.
 *
 * 🚨 `playwright.config.ts`는 이 값을 그대로 order-app 빌드에 주입하며
 * `process.env['VITE_APP_VERSION']`을 읽지 않는다 — 호출한 셸에 그 변수가 설정돼 있어도
 * (예: 937 계열 real-QA 스펙을 실행한 세션에서 이어서 928을 돌리는 경우) 928의 빌드 버전은
 * 바뀌지 않는다. 앰비언트 값이 번들에 섞이면 이 스펙이 가정하는 "현재 버전"과 실제 빌드된
 * 번들의 버전이 어긋나 버전 안내 UI가 뜨지 않는 채로 실패한다 — 이때도 백엔드 API 판정
 * 자체는 정상이라(테스트가 직접 조회하는 값은 이 상수 기준으로 고정) 하네스 설정 문제가
 * 제품 결함처럼 읽힌다(dev-report 2026-07-27-851-gate-gaps.md §9 참고).
 */
export const CURRENT_VERSION = '2026/07/26-92700'
