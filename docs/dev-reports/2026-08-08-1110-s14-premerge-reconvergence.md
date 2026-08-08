# PR #1115 / 이슈 #1110 S14 머지 전 재수렴

- 검증 일시: 2026-08-08 (Asia/Seoul)
- 검증 HEAD: `0a80591aec729f1a9c70c84466d79fe725787128`
- 역할: 적대적 검증자
- 제한: 코드 수정·commit·push 없음, 운영 Docker stack 중지 없음, DB 직접 쓰기 없음

## 결론

**이번 라운드에서 발견한 도달 결함은 0건이다.** S13이 바꾼 상태 코드 분기에서 권한 안내의 역할 집합, 404 의미, 409 업무 문구 보존, 내부 원문 차단, 비응답 Axios 오류의 fallback, 호출부 영향은 확인 범위에서 일치했다.

단, 이 문서는 **S14 라이브 GUI 전체 PASS가 아니다.** 이 세션의 Browser runtime이 반환한 browser 목록이 빈 배열(`[]`)이어서 요구된 Playwright headless GUI를 실행하거나 `docs/qa-shots/1110-s14-live-qa/` 캡처를 만들 수 없었다. 따라서 실제 화면 표시는 아래 표의 해당 항목을 `판정 불가`로 유지한다. 422·5xx도 이 endpoint에서 안전한 실발화 조건이 없어 `판정 불가`다.

## S13 변경·호출 그래프

- 변경 함수: `clients/desktop/src/renderer/components/audit/PartnerOrderVersionHistoryPanel.tsx:96`
- 실제 사용: 같은 파일의 restore mutation `onError` 한 곳(`:225`)
- 함수의 다른 제품 호출부: 없음. `rg partnerOrderRestoreErrorMessage clients/desktop/src` 결과는 정의, 위 호출부, 전용 테스트뿐이었다.
- 패널 마운트: `PartnerOrderCollaborationPanel.tsx` 한 곳. 다른 화면의 오류 문구를 공유 함수로 바꾸지 않았다.

## 상태 코드별 도달 결과

| 상태/오류 | 실제 발화 | 함수 계약 | 판정 |
|---|---|---|---|
| 400 | MASTER JWT로 revision path를 `not-a-number`로 호출해 실제 400 `INVALID_INPUT` 응답 생성 | 서버 `message`를 읽지 않고 일반 문구 반환 | API+함수 PASS, GUI 판정 불가 |
| 401 | 잘못된 JWT로 실제 401 `INVALID_TOKEN` 응답 생성 | 재로그인 안내 분기. 단 `apiClient` interceptor가 먼저 auth state를 지우고 `/login`으로 이동 | 응답 PASS, 최종 화면 문구 판정 불가 |
| 403 | DISPATCH JWT로 실제 복원 호출해 403 생성. 서버 원문에는 내부 page/action/reason이 포함됨 | 원문을 버리고 MASTER/MANAGER/SALES 요청 안내 반환 | API+함수 PASS, GUI 판정 불가 |
| 404 revision | MASTER JWT + 존재하지 않는 revision `999999`로 실제 404 생성 | 원문 대신 주문/버전 부재 및 최신 정보 확인 안내 | API+함수 PASS, GUI 판정 불가 |
| 404 order | 존재하지 않는 주문에 MASTER/MANAGER/SALES는 404, DISPATCH는 403 | 권한 은닉 404와 자원 부재 404가 섞이지 않음 | PASS |
| 409 row lock | `SELECT ... FOR UPDATE`만 사용해 실제 경합을 만들고 409 생성 | 실제 업무 문구를 그대로 선택하는 분기 보존 | API+함수 PASS, GUI 판정 불가 |
| 422 | endpoint는 request body가 없고 `int revisionNo` 파싱 오류는 400, 도메인 가드는 404/409 | 구성한 AxiosError에서는 일반 문구 | **실응답·GUI 판정 불가** |
| 5xx | 서비스 중지·설정 훼손·DB 오염 없이 만들 수 있는 정상 발화 조건 없음 | 구성한 AxiosError에서는 일반 문구 | **실응답·GUI 판정 불가** |
| 연결 거부 | `127.0.0.1:1` 호출로 `ECONNREFUSED`, `isAxiosError=true`, `response.status=null` 확인 | `switch(undefined)` default로 일반 문구 | 함수 PASS, GUI 판정 불가 |
| timeout | 응답하지 않는 임시 로컬 HTTP 서버에 120ms timeout, `ECONNABORTED`, `isAxiosError=true`, `response.status=null` 확인 | `switch(undefined)` default로 일반 문구 | 함수 PASS, GUI 판정 불가 |
| 일반 Error | `axios.isAxiosError(new Error(...)) === false` 확인 | 즉시 일반 문구 | PASS |

참고로 네트워크 끊김과 timeout은 Axios 호출에서는 `isAxiosError=false`가 아니라 **`isAxiosError=true`이면서 `response`가 없는 오류**였다. 현재 구현은 두 형태 모두 default fallback으로 수렴한다.

## 내부 사정 노출

실제 403 서버 응답에는 다음 종류의 내부 정보가 있었다.

- permission page code
- action 이름
- 내부 deny reason

S13 함수는 403에서 `response.data.message`를 읽지 않으므로 이 원문은 사용자 문구로 전달되지 않는다. 400도 동일하게 default fallback을 사용한다. 집중 Vitest에서 400·422·500에 내부 메시지를 넣어도 일반 문구만 반환했고, 403 내부 판정 상세도 노출하지 않았다.

422와 5xx는 실서버 응답 자체를 만들지 못했으므로 “실 GUI에서 누출 없음”으로 확대 판정하지 않는다.

## 403 안내 문구의 사실성

백엔드 복원 endpoint는 다음 단일 가드를 사용한다.

```text
@RequirePermission(page = "sales.partner-order.revisions", action = RESTORE)
```

`V40__seed_phase2_4_partner_order_revisions_page.sql`은 이 page의 `can_restore=true`를 MASTER, MANAGER, SALES에만 seed한다. 이후 migration/source에서 이 page를 수정하는 다른 항목은 검색되지 않았다.

라이브 서버에서도 존재하지 않는 주문을 이용해 mutation 없이 인가 경계만 확인했다.

| 계정 역할 | 결과 | 의미 |
|---|---:|---|
| MASTER | 404 | 인가 통과 후 주문 조회 |
| MANAGER | 404 | 인가 통과 후 주문 조회 |
| SALES | 404 | 인가 통과 후 주문 조회 |
| DISPATCH | 403 | 인가 단계 거부 |

따라서 “MASTER, MANAGER 또는 SALES 권한이 있는 담당자” 안내는 실제 기본 권한 계약과 일치하며 역할 누락·과장이 없다.

## 404 의미와 권한 은닉 여부

`PermissionAspect`는 controller 본문보다 먼저 실행된다. 실제로 동일한 존재하지 않는 주문에 DISPATCH는 403, MASTER는 404였다. 인가를 통과한 뒤에만 `resolveOrderId` 또는 revision 조회에서 404가 발생한다. 이 endpoint에서 권한 때문에 404로 감추는 경로는 확인되지 않았다.

## 409 업무 문구 보존

공유 DB에는 쓰기 없이 `SELECT ... FOR UPDATE`와 transaction rollback만 사용했다. 실제 복원 요청은 409를 반환했고 서버 업무 메시지는 다음과 같았다.

> 동시에 복원된 주문입니다. 다른 사용자의 복원이 먼저 완료되어 다시 조회해 주세요.

S13의 409 case는 non-empty string을 trim한 뒤 그대로 반환한다. 집중 테스트의 409 원문 반환 단정도 통과했다. 다만 이번 S14에서는 GUI 캡처가 없어 실제 toast 표시 자체는 판정 불가다.

## 실행 증거

- 집중 Vitest: 2 files, 9 tests, 9 passed
  - `partnerOrderRestoreErrorMessage.test.ts`: 7/7
  - `PartnerOrderCollaborationPanel.history-bridge.test.tsx`: 2/2
- 실서버: gateway `127.0.0.1:8080`, partner-order-service Docker container healthy
- 실제 HTTP: 400, 401, 403, 404(order/revision), 409 생성
- DB 사용: schema/permission/order 조회와 row-lock용 SELECT만 사용. INSERT/UPDATE/DELETE 없음
- 인증 비밀번호: QA credential resolver로만 읽었으며 본 보고서에는 `<redacted>`

## 라이브 GUI 및 캡처

Browser skill 절차로 `http://127.0.0.1:5176/` 대상 browser를 선택하려 했으나 `No browser is available`이 반환됐다. troubleshooting 절차 후 browser 목록도 `[]`였다. 지침에 따라 별도 브라우저 제어 수단으로 대체하지 않았다.

- `docs/qa-shots/1110-s14-live-qa/`: 생성하지 않음
- 신규 스크린샷: 0장
- 라이브 GUI 판정: **판정 불가**

## 프로세스 회수

- row-lock용 PowerShell job: `finally`에서 stop/remove 완료
- timeout 검증용 임시 HTTP server: `server.close()` 완료
- 신규 Vite/Playwright/서비스 프로세스: 시작하지 않음
- 기존 t1096 Docker stack: 중지·재시작하지 않음

## 신규 파일

- `docs/dev-reports/2026-08-08-1110-s14-premerge-reconvergence.md` (본 보고서)

기존 untracked `clients/desktop/playwright/1110-s12-live-qa/`, `1110-s5-live-qa/`, `1110-s6-live-qa/`는 라운드 시작 전부터 존재했으며 수정하지 않았다.

## 이 라운드가 보지 않은 것

- browser runtime 부재로 실제 S14 headless GUI toast와 화면 전환을 보지 못했다.
- 안전한 발화 조건이 없는 422·5xx 실서버 응답과 그 GUI 렌더를 보지 못했다.
- S12에서 이미 깨끗하다고 인계된 락·멱등·기존 행 호환 전체를 다시 확장 검증하지 않았다. S13이 보존해야 하는 실제 row-lock 409 경로만 재확인했다.
- 배포·모바일·Electron native shell과 PR 전체 CI를 보지 않았다.
