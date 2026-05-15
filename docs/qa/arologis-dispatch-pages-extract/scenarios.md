# D-AX-11 아로로지스 배차 페이지 이전 QA

> 범위: `clients/arologis-desktop` 의 `/dispatches/*` 실제 화면 전환 검증.

## 시나리오 1: 수동 배차

- 경로: `#/dispatches/manual`
- 기대: 카톡 텍스트 입력, 미리보기, 차량/정차 폼, 저장 버튼 표시
- API: `POST /admin/arologis/dispatches/manual/preview`, `POST /admin/arologis/dispatches/manual`
- UUID 노출: 없음. 화면 식별자는 차량 순번, 거래처명, 톤수, 주소, 전표번호만 사용
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/01-manual-dispatch.png`

## 시나리오 2: 가배차 분류

- 경로: `#/dispatches/pre-classify`
- 기대: 권역/시도 분류 탭과 결과 표 표시
- API: `GET /admin/arologis/dispatches/pre-classify`, `GET /admin/arologis/dispatches/regional`
- UUID 노출: 없음. 화면 식별자는 전표번호, 거래처코드, 거래처명, 주소, 권역/시도만 사용
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/02-pre-classify.png`

## 시나리오 3: 미배차

- 경로: `#/dispatches/unassigned`
- 기대: 미배차 목록과 `수동 배차로 이동` 링크 표시
- API: `GET /admin/arologis/dispatches/unassigned`
- 라우팅: 행 액션 클릭 시 `#/dispatches/manual?date&slipNo&partnerCode&partnerName&address` 로 이동하고 첫 정차 자동 채움
- UUID 노출: 없음. 화면 식별자는 전표번호, 거래처코드, 거래처명, 주소만 사용
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/03-unassigned.png`

## 시나리오 4: 실배차 비교

- 경로: `#/dispatches/reconcile`
- 기대: 다중 `.xlsx` 업로드 영역, 기간 필터, 비교 실행, mismatch 결과 표 표시
- API: `POST /admin/arologis/dispatch/reconcile`
- UUID 노출: 없음. 화면 식별자는 전표번호, 배차일, 운송사명, 거래처명만 사용
- 캡처: `docs/qa/arologis-dispatch-pages-extract/screenshots/04-reconcile.png`

## 로컬 검증 결과

- `cd clients/arologis-desktop && npm run typecheck` — PASS
- `cd clients/arologis-desktop && npm run build` — PASS

## 후속 검증

실 Electron 캡처는 backend seed + 로그인 토큰 환경이 준비된 뒤 진행한다. 캡처가 어려운 환경에서는 기존 repo 관례대로 mock PNG fallback 을 허용하되, PR 본문에 fallback 사용 사실과 위 build/typecheck 결과를 같이 명시한다.
