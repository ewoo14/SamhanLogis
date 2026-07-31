# PR #985 R4 실화면 QA 보고서

- 실행일: 2026-07-30 (KST)
- 대상 거래처: `1068689215` / 주식회사 중앙유통
- 주문서: `http://localhost:5204/` (viewport 1440×900)
- 결과: **BLOCKED — 승인요청 단계에서 HTTP 415**

## 1. 사전 확인 및 인증 상태

`partner_db.public.partners`는 읽기 전용 SELECT로 `1068689215`가 ACTIVE 마스터임을 확인했다. `partner_auth_db.public.partner_auth`는 승인요청 전후 모두 다음과 같았다.

```text
SELECT biz_no,status,failed_attempts,last_login_at,is_deleted
FROM partner_auth WHERE biz_no='1068689215';

NO_ROWS
```

주문서에서 실제 브라우저로 사업자번호 `1068689215`를 조회한 결과 화면은 `미승인 사업자번호`였고, `승인요청 보내기` 버튼이 표시됐다.

## 2. 승인요청 — 실제 실패 원문

주문서 화면에서 `승인요청 보내기`를 클릭했다. 요청은 다음과 같이 실제 전송됐다.

```text
POST http://localhost:8080/api/v1/auth/partner-register
Content-Type: application/x-www-form-urlencoded
body: 1068689215
```

서버 응답 원문:

```json
{"success":false,"code":"INVALID_INPUT","message":"지원하지 않는 Content-Type입니다","data":null,"timestamp":"2026-07-29T15:56:37.344475615Z"}
```

따라서 화면은 완료 모달로 전환되지 않고 `데이터를 불러오는 중입니다. 잠시만 기다려주세요.` 상태에 머물렀다. `r4-01-approval-requested.png`는 이 실제 실패 화면을 합성 없이 캡처한 것이다.

### 상태 전이

| 단계 | 관측 상태 | 결과 |
|---|---|---|
| 마스터 사전 확인 | `partners`에 ACTIVE 거래처 존재 | 확인 |
| 승인요청 전 | `partner_auth` = `NO_ROWS`, 주문서 = `미승인 사업자번호` | 확인 |
| 승인요청 클릭 후 | 서버 `INVALID_INPUT`, `Unsupported Media Type` | 실패 |
| 승인요청 후 DB | `partner_auth` = `NO_ROWS` | 상태 변경 없음 |
| 관리자 승인 | 미수행 | 승인요청 실패로 중단 |
| 비밀번호 설정 | 미수행 | 승인요청 실패로 중단 |
| 주문 전송 | 미수행 | 주문번호 없음 |

## 3. 관리자 승인 화면 확인

소스 검색으로 데스크톱 실사용 화면이 존재함을 확인했다.

- 라우트: `/sales/order-approvals`
- 목록 API: `GET /api/v1/partner-approvals`
- 상태 변경 API: `PATCH /api/v1/partner-approvals/{partnerCode}/status`
- 실행 환경: 포트 `5205`, `vite.renderer.dev.config.ts`, `VITE_MOCK_MODE=0`, `VITE_APP_VERSION=2026/07/30-1`
- 인증 브리지: 사용 준비만 했으며, `dev_master` / `dev_p05_pass!`를 이용한 승인 조작은 **수행하지 않음**

승인요청이 서버에서 생성되지 않은 상태에서 관리자 화면 상태를 임의로 바꾸는 것은 실 온보딩 경로 우회이므로 진행하지 않았다. 관리자 승인 방식은 따라서 **미수행(API 직접 호출도 하지 않음)**이다.

## 4. 화면 단가 vs DB 확정 단가

승인요청 단계에서 차단되어 미리보기·주문 전송·DB 확정이 발생하지 않았다.

| 품목 | 수량 | 화면 단가 | DB 확정 단가 | 판정 |
|---|---:|---:|---:|---|
| `AR-EH05` | 1 | 미수행 | 미수행 | 대조 불가 |
| `AWR-WE13N` | 2 | 미수행 | 미수행 | 대조 불가 |

- 주문번호: 없음
- draftId: 없음
- 거래처별 활성 주문 기준값: `0`
- 거래처별 활성 draft 기준값: `0`
- 재전송 전후 주문 건수: 미수행
- draft 재사용 여부: 미수행

## 5. 콘솔 오류 및 HTTP 오류

필수 Playwright 이벤트(`dialog`, `console`, `response`)를 등록해 관측했다.

- HTTP 415: `POST /api/v1/auth/partner-register` — `지원하지 않는 Content-Type입니다`
- HTTP 404: `/fonts/PretendardVariable.woff2` — 폰트 로드 실패
- 콘솔 warning: `[v4 shim] RPC 'requestAuthApproval' rejected (no failure handler) AxiosError: Request failed with status code 415`
- 기타: 폰트 디코드/`OTS parsing error` warning
- 주문 관련 4xx/5xx: 승인요청 415 외에는 주문 단계 미진입으로 관측 없음

## 6. 기록 및 금지사항 준수

- 설정한 PIN: 없음 (승인요청 실패로 설정 단계 미진입)
- `partner_auth` 상태 변경: 없음
- `partners` 마스터 쓰기: 없음
- 주문 생성/삭제: 없음
- DB 사용: 읽기 전용 SELECT만 수행
- Docker, git, gradle, 재배포, 소스 코드 수정: 수행하지 않음

## 7. 저장 파일

- `r4-01-approval-requested.png` — 실제 승인요청 실패/로딩 화면, 1440×926 (viewport 1440×900)
- `R4-REPORT.md` — 본 보고서

미수행 단계의 `r4-02`부터 `r4-07` 캡처는 합성하거나 placeholder로 만들지 않았다.
