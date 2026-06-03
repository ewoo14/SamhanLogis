# in-process mock(VITE_MOCK_MODE) 작성 3원칙 + page.route no-op

> 2026-06-04 박제 (sp-09-2/4/supplier/tax-invoice-batch 재게이트 중 잠복 버그 3건 반복 발견).
> 대상: `clients/desktop/src/renderer/api/mock.ts` (브라우저측 axios `config.adapter` — `client.ts:50`).

## 핵심 사실

**VITE_MOCK_MODE 의 mock 은 브라우저측 axios 어댑터**(서버 미들웨어 아님). 실제 HTTP 미발생.
- ⇒ Playwright **`page.route` 는 no-op** (네트워크 미발생이라 가로채지 못함). 테스트 단언은 반드시 **in-process mock 응답에 정합**.
- ⇒ module-level 가변 배열(stateful mock)은 **브라우저 페이지 JS heap** 에 존재 → Playwright 테스트별 fresh context = fresh page = 모듈 재평가 = 재seed. **CI workers=2 도 프로세스 격리** (서버 싱글턴 오염 아님 — 리뷰어가 자주 오판하는 지점).

## mock 핸들러 작성 3원칙 (위반 시 잠복 버그)

1. **body 파싱은 `parseMockBody(config)`**. `config.data` 는 이미 객체(`[object Object]`)라 `JSON.parse(config.data)` 는 throw. (POST/PUT 전부.)
2. **성공 응답도 non-null `envelope(...)`**. `getMockResponse` 가 null 이면 어댑터(`client.ts:48 if (mock !== null)`)가 **"미매칭"으로 보고 실 HTTP fallthrough → 네트워크 에러 → 페이지 블랭크**. 204 라도 null 금지 → `envelope({ deleted: true })`.
3. **`responseType:'blob'` 소비자엔 실제 `Blob` 반환**. `res.data as Blob` 사용처에 string 반환 시 `triggerDownload`/`URL.createObjectURL` 실패(다운로드 이벤트 미발생). → `new Blob([csv], { type: 'text/csv;charset=utf-8' })`.

## 재게이트 패턴 (동반)

- RoleGuard 역할 cross-check → goto 뒤 `page.reload()` (hash 네비는 mockRole 세션 재설정 안 함).
- design-system `DataTable`/`Modal` 은 `data-testid` 를 DOM 으로 **forward 안 함** → `role="dialog"`/셀 testid(`*-date-*`)/plain span 으로 검증. `Input` 은 `...rest` 로 forward(O).
- false-green 금지: 미forward testid 의존 `!x`(공허), `body.includes('250')`(행 데이터 충돌→`'250건'`), `bodyText.includes('권한')`(느슨)·`!btnExists`/`length>50`(silent-pass) 전부 strict 신호로.

연관: [[feedback_ci_test_filter_false_green]] · [[feedback_enforcement_real_http_test]] · [[feedback_no_fake_data_ever]]
