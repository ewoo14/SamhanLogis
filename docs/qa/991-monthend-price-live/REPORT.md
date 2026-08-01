# PR #991 라이브 QA 보고서 — 일마감 상세 표시 단가

## 결론

실제 Chrome + Playwright로 일마감 화면에 진입해 `2026-04-05`를 조회했습니다. 세금계산서 상세는 1행 보였지만 모델별 품목 재검증 행은 0행이었습니다. 따라서 표시 단가와 `판정불가`·`정가결측` 배지는 실제 데이터로 확인되지 않았습니다.

정상 판정 행이 없다는 사실을 성공으로 해석하지 않습니다. 현재 데이터와 마감 snapshot 부족으로 여기까지 확인됨입니다.

## ① 진입 방법

- 렌더러: `vite.renderer.dev.config.ts`, mock OFF, `VITE_APP_VERSION=2026/07/29-1`, `127.0.0.1:5203`
- 정상 로그인: 저장소 QA 선례에 문서화된 `dev_master` / `dev_p05_pass!`로 UI에서 1회 시도했으나 로그인 화면에 남아 실패했습니다. 같은 계정에 추가 실패를 만들지 않기 위해 재시도하지 않았습니다.
- 실제 진입 방식: **`bridge-injection`** — `POST /auth/login` 200으로 발급된 동일 실계정 토큰을 `page.addInitScript` 인증 브리지로 주입했습니다.
- 주입 내용: `window.samhanAuth.getToken()`이 토큰과 `role=MASTER`, `displayName=[DEV-SEED] 개발마스터`를 반환하도록 했고, `setToken/clearToken`은 no-op으로 두었습니다.
- 위 브리지는 QA 하네스이며 제품의 로그인 동작 검증 결과가 아닙니다.
- 최종 URL: `http://127.0.0.1:5203/#/accounting/daily-closing`
- viewport: `1440x900`

## ② 조회한 날짜

- 조회 날짜: **2026-04-05**
- 날짜 근거: accounting DB read-only SELECT에서 `tax_invoices`의 `supply_date=2026-04-05`, `status=ISSUED`, `direction=OUTBOUND` 1건 확인
- 화면의 대상일 input에도 `2026-04-05`가 표시됨
- 2026-04-01~06-30 `GET /accounting/daily-closings` 결과: `content=[]`, `totalElements=0` (마감 이력 snapshot 없음)

## ③ 보인 행 수와 상태별 분포

- 일마감 상세의 세금계산서 행: **1행**
- 세금계산서 행: `2026/04/05-1`, 거래처 `(주)삼한물류`, 공급가 `5,000,000`, 합계 `5,500,000`
- 모델별 품목/재검증 실제 행: **0행**
- 품목별 단가 열: `출고가`, `납품가` 헤더는 보였으나 값이 있는 품목 행은 없음
- `판정불가`: 0행
- `정가결측`: 0행
- 그 밖의 상태 문자열: 없음
- 빈 표 안내 문자열: `모델별 재검증 결과가 없습니다.`

추출한 모델별 표 헤더 `textContent`:

```text
품명 | 모델 | 수량 | 공급가 | 출고가 | 납품가 | 기대율 | 할인율 | 확인 | 사유
```

추출한 실제 품목 행: `[]`

따라서 이번 화면에서는 표시 단가·상태 문자열을 품목 행에서 추출할 대상 자체가 없었습니다.

## ④ 콘솔 에러 및 HTTP 4xx/5xx

페이지 오류(`pageerror`): 없음

최종 실행 중 기록된 HTTP 오류:

- `401 GET /auth/me` — 브리지 전 초기 unauthenticated 문서 부트스트랩 2회
- `404 GET /app/version?clientType=DESKTOP&currentVersion=2026%2F07%2F29-1` — 업데이트 배너 표시
- `503 POST /logs/front` — 메뉴 접근 activity log 전송 실패

추가 콘솔 오류:

- `404 http://127.0.0.1:5203/favicon.ico`
- Pretendard 폰트 decode/OTS parsing 경고
- React Router future flag 경고
- app-version 404 fallback 경고
- activity-log 503 fallback 경고

일마감 목록 범위 GET은 `200 OK` 빈 결과였고, 날짜 상세 GET은 오류 없이 화면에 세금계산서 1행을 표시했습니다. 요청 실패(`requestfailed`)는 없었습니다.

## ⑤ 저장한 파일

- [01-daily-closing-detail.png](01-daily-closing-detail.png) — 실제 상세 화면, 세금계산서 1행 및 품목 단가/상태 헤더
- [02-status-badges.png](02-status-badges.png) — 실제 모델별 재검증 표 확대 화면, 실제 행 없음
- [03-date-range.png](03-date-range.png) — 대상일 `2026-04-05`가 보이는 실제 화면
- [login-blocked.png](login-blocked.png) — 최초 인증 차단 시도의 실제 보조 캡처
- [REPORT.md](REPORT.md)

## ⑥ 데이터 부족으로 확인하지 못한 것

- `daily_closings` 마감 snapshot이 0건이라 마감 이력 행의 상세 버튼은 보이지 않았습니다.
- 품목별 재검증 실제 행이 0건이라 `출고가`·`납품가` 표시값을 확인하지 못했습니다.
- `판정불가`(`verified=null`) 및 `정가결측`(`MISSING_REFERENT`) 배지는 이번 데이터에서 보이지 않았습니다.
- 정상 판정 행과 PR #991의 인상 전/후 단가 대조는 확인하지 못했습니다.

소스 코드 수정, DB INSERT/UPDATE/DELETE, 마감 실행/확정, Docker compose/재기동, 5203 외 포트 접근은 수행하지 않았습니다. DB는 전표 날짜 확인을 위한 SELECT만 수행했습니다.
