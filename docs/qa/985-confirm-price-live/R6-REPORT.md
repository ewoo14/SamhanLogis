# PR #985 R6 라이브 QA 보고서

- 실행일: 2026-07-30 (KST)
- 대상 거래처: `1068689215` / 주식회사 중앙유통
- 주문서: `http://localhost:5204/`
- 브라우저: 시스템 Chrome via Playwright, viewport `1440×900`
- 범위: 조회 전용. 신규 주문 생성·주문 삭제·DB 쓰기 없음.

## 1. 이력 화면

이력 화면은 `TypeError: data.sort is not a function` 없이 정상적으로 렌더링되었습니다. 다만 이 거래처의 서버 응답이 두 조회 범위 모두 빈 목록이어서 실제 데이터 행은 보이지 않았습니다.

| 항목 | 관측값 |
|---|---|
| 화면 상태 | 정상 렌더링, 표 유지 |
| 데이터 행 수 | `0` |
| `#historyBody` textContent | `내역이 없습니다.` |
| 초기 요청 | `GET /partner-orders/history?...&page=0&size=20`, HTTP 200 |
| 초기 응답 메타 | `contentLength=0`, `totalElements=0`, `totalPages=0`, `number=0`, `size=20` |
| 재조회 요청 | `from=2026-07-30T00:00:00`, `to=2026-07-30T23:59:59`, `page=0`, `size=20`, HTTP 200 |
| 재조회 응답 메타 | `contentLength=0`, `totalElements=0`, `totalPages=0`, `number=0`, `size=20` |

초기 화면의 날짜 범위가 `2026-07-22~2026-07-29`로 설정되어 있어 화면의 실제 조회 조작으로 `2026-07-30~2026-07-30`도 확인했습니다. 두 범위 모두 서버가 빈 목록을 반환했습니다. 따라서 이번 실화면에서 확인된 것은 “빈 정상 응답을 빈 상태로 렌더링하며 과거의 `data.sort` 예외는 없음”까지이고, 1건 주문 행의 표시 자체는 서버 응답 부재로 확인되지 않았습니다. 예상과 다른 관측은 숨기지 않고 캡처했습니다.

캡처: [r6-01-history-renders.png](r6-01-history-renders.png)

## 2. 주문 저장 내역(임시저장) 화면

화면은 정상 렌더링되었고 데이터 행 1건이 표시되었습니다.

| 항목 | 관측값 |
|---|---|
| 데이터 행 수 | `1` |
| 행 `textContent` (trim) | `없음` / `복원` |
| 요청 | `GET /partner-orders/drafts?from=2026-07-23&to=2026-07-30&page=0&size=20`, HTTP 200 |
| 응답 메타 | `contentLength=1`, `totalElements=1`, `totalPages=1`, `number=0`, `size=20` |

캡처: [r6-02-drafts-render.png](r6-02-drafts-render.png)

## 3. malformed 2xx 응답

실제 이력 조회 화면에서 Playwright 요청 가로채기를 사용해 다음 응답을 주입했습니다.

```text
GET /api/v1/partner-orders/history?bizCode=1068689215&from=2026-07-22T00:00:00&to=2026-07-29T23:59:59&page=0&size=20
HTTP 200
body: {}
```

가로채기를 쓴 이유는 21건의 실데이터를 만들지 않고 malformed 2xx 계약을 재현하기 위해서입니다. 결과는 빈 목록으로 위장되지 않고 실제 브라우저 alert로 오류가 표시되었습니다.

```text
조회 실패: Error: 목록 응답 형식이 올바르지 않습니다
```

캡처: [r6-03-malformed-shows-error.png](r6-03-malformed-shows-error.png)

## 4. 페이지 잘림 관찰

실데이터 21건은 만들지 않았습니다. 이력과 임시저장 모두 실제 요청에 `page=0&size=20`을 보냈고, 응답의 페이지 메타를 읽었습니다. 이번 데이터의 `totalPages`는 이력 `0`, 임시저장 `1`이므로 후속 페이지 요청은 발생하지 않았습니다. 다중 페이지 합산 동작은 단위 테스트 범위로 남겼습니다.

## 5. 콘솔 에러 및 4xx/5xx

- 애플리케이션 예외 콘솔: 없음.
- 공통 관측 404: `GET http://localhost:8080/app/version?clientType=SAMHAN_ORDER_WEB&currentVersion=2026%2F07%2F30-1` → HTTP 404. 브라우저 콘솔에도 `Failed to load resource: the server responded with a status of 404 (Not Found)`가 기록되었습니다.
- 폰트 경고: `/fonts/PretendardVariable.woff2` 디코드 실패 및 `OTS parsing error`.
- API 5xx: 없음.
- 조회 버튼이 발생시키는 `POST /api/v1/partner-orders/log`는 조회 전용 및 DB 쓰기 금지를 위해 브라우저에서만 HTTP 204로 차단했습니다. 서버에는 전송하지 않았습니다.
- 로그인 후 튜토리얼은 브라우저 DOM 상태만 해제했으며 튜토리얼 저장 API는 호출하지 않았습니다.

## 6. 저장 파일

- [r6-01-history-renders.png](r6-01-history-renders.png) — 1440×900
- [r6-02-drafts-render.png](r6-02-drafts-render.png) — 1440×900
- [r6-03-malformed-shows-error.png](r6-03-malformed-shows-error.png) — 1440×900
- [R6-REPORT.md](R6-REPORT.md)

소스 코드 수정, 서버 재기동, 이미지 재배포, 주문 생성은 수행하지 않았습니다.
