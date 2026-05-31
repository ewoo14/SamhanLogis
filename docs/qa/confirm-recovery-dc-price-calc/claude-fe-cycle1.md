# FE 리뷰 — confirm 경로 복구 (PR #330)
브랜치: `fix/confirm-recovery-dc-price-calc`
리뷰어: Claude FE
사이클: 1

---

## 결론

**APPROVE** — P0 없음, P1 1건(orderNo 미노출 — 기능상 무해하나 설계 명확화 필요), P2 1건.

---

## 점검 1: 핸들러 정합

`index.html` 6094~6117 라인의 confirm 성공 핸들러:

```js
.withSuccessHandler(res => {
  if(res && res.ok) {          // ← ok 키 읽음
    ...
  } else {
    txt.textContent = '전송 실패\n' + (res ? (res.error || '') : '');  // ← error 키 읽음
  }
})
```

정규화 결과:

```ts
{
  ok:      r.data?.success === true,
  orderNo: r.data?.data?.orderNo ?? null,
  error:   r.data?.message ?? null,
}
```

- `res.ok` — 정규화 키 `ok` 와 핸들러 키 `res.ok` 완전 일치. 합격.
- `res.error` — 정규화 키 `error` 와 핸들러 키 `res.error` 완전 일치. 합격.

**orderNo 사용처 검색 결과**: `index.html` 전체에서 `orderNo` 문자열 0건. 정규화가 `orderNo` 를 포함하지만 현재 핸들러가 이를 읽지 않음. 기능상 무해이나 노출 경로가 없음을 확인했고 설계 명확화가 필요하다(P1 참고).

**합격**.

---

## 점검 2: 에러 경로

`legacyShim.ts` 77~84 라인의 Proxy catch 블록:

```ts
samhanApi
  .call(k, args)
  .then((result) => { if (onSuccess) onSuccess(result) })
  .catch((err: unknown) => {
    if (onFailure) onFailure(err)
    else console.warn(...)
  })
```

- axios 4xx/5xx reject 는 `.catch` 가 잡아 `withFailureHandler` 로 라우팅됨.
- `sendOrderFromUi` 의 `.then((r) => {...})` 정규화 블록은 **HTTP 200 응답일 때만** 실행. 비-200(axios reject) 시 `.then` 자체가 실행되지 않고 Proxy의 catch 로 전파됨.
- `withFailureHandler` 쪽 (6112~6115): `err` 를 string으로 출력하며 `res` 미참조 — undefined 안전성 문제 없음.
- `res ? ... : ''` 가드: 성공 핸들러 내부 6108 라인에서 `res` 가 falsy 일 때 빈 문자열 fallback 처리 적용. 안전함.

BE GlobalExceptionHandler 확인: `BusinessException` / `ResponseStatusException` 모두 **비-200 HTTP 상태코드**를 반환(4xx/5xx). `ApiResponse.ok` 는 항상 HTTP 200 으로 반환됨. 즉 **HTTP 200 + success:false** 조합은 현재 confirm endpoint 설계상 발생하지 않는다.

**합격**.

---

## 점검 3: 성공 판정

`ApiResponse.java`:

```java
public static <T> ApiResponse<T> ok(T data) {
    return new ApiResponse<>(true, "OK", "성공", data, Instant.now());
}
```

`ConfirmController`:

```java
return ApiResponse.ok(confirmService.confirm(...));
```

- `success` 필드는 `boolean` (primitive), `ApiResponse.ok` 항상 `true` 고정.
- 정규화의 `r.data?.success === true` 는 이 boolean 과 정합.
- `success=false` + HTTP 200 조합은 현재 confirm 경로에서 **불가능** — GlobalExceptionHandler 가 모든 오류를 4xx/5xx 로 내보냄. 따라서 `ok: false` 케이스는 실제 서비스 흐름에서 발생하지 않지만, 방어 코드로 잔존시켜도 무방.
- `r.data?.data?.orderNo` — `ConfirmResponse.orderNo()` (String) 은 `data` 네스팅 2단계(`ApiResponse.data.orderNo`)로 정확히 매핑됨. 합격.

**합격**.

---

## 점검 4: 회귀 — 다른 RPC 변경 없음

`git diff main...HEAD -- clients/web/order-app/` 결과: `samhanApi.ts` 의 `sendOrderFromUi` 핸들러 `.then((r) => r.data)` → 정규화 객체 반환 4라인 변경 **단 1건**. 다른 RPC 핸들러(checkAuthStatus, tryLogin, saveOrderSnapshot 등) 변경 없음.

typecheck: `EXIT:0`
lint: `EXIT:0`
build: `EXIT:0` (vite build 성공, 7 precache entries)

**합격**.

---

## 점검 5: UUID 비공개

`ConfirmResponse.java`:

```java
public record ConfirmResponse(
    String orderNo,   // ← 비즈니스 식별자 (노출 가능)
    String slipNo,    // ← 슬립번호 (노출 가능)
    ...
```

주석: `UUID 비공개 — orderNo / slipPublishStatus 만 사용자 노출 (FE 가드)`.

정규화 객체에서 추출되는 값:
- `ok` — boolean, UUID 아님
- `orderNo` — `ConfirmResponse.orderNo()` (비즈니스 식별자, UUID 아님)
- `error` — `ApiResponse.message` (한국어 문자열, UUID 아님)

UUID(`PartnerOrder` 의 PK)는 응답 DTO에 포함되지 않음. 핸들러가 읽는 필드 중 UUID 해당 없음.

**합격**.

---

## Finding 목록

### P1 — orderNo 정규화 필드가 현재 핸들러에서 미사용 (설계 불명확)

- 위치: `samhanApi.ts` L172, `index.html` 6094~6118
- 내용: `orderNo: r.data?.data?.orderNo ?? null` 을 정규화에 포함했으나 `index.html` 의 withSuccessHandler 는 `res.orderNo` 를 읽지 않는다. 성공 시 단순 "전송이 완료되었습니다" 문구만 표시하고 주문번호를 노출하지 않는 현재 UX 흐름과 맞지 않는 설계 의도가 존재한다.
- 영향: 현재 기능상 무해(미사용 필드). 단, 추후 핸들러가 `res.orderNo` 를 읽도록 확장 시 해당 필드가 이미 준비되어 있음을 명시하지 않으면 혼선이 생길 수 있다.
- 권고: Javadoc/주석에 "orderNo 는 향후 성공 알림 개선 시 사용 예정(현재 핸들러 미소비)" 를 추가하거나, 당장 핸들러에서 표시할 계획이 없다면 정규화에서 제거하여 인터페이스를 단순화할 것.

### P2 — saveTutorialState 핸들러가 구 `res.success` 키 직접 참조

- 위치: `index.html` 9438
- 내용: `if (res && !res.success) alert(...)` — `sendOrderFromUi` 와 달리 `saveTutorialState` 는 정규화 없이 `r.data` 를 그대로 반환(legacy 패턴). 동일 `ApiResponse` envelope 에서 `success` boolean 을 직접 읽는다.
- 영향: 이번 PR 변경 범위 밖이며 `saveTutorialState` 는 정상 동작 중. 단, `sendOrderFromUi` 만 정규화 도입하고 다른 RPC 는 raw `r.data` 를 반환하는 불일치가 존재한다. 향후 혼선 예방을 위해 정규화 패턴 적용 범위를 명확히 할 것.

---

## 최종 요약

| 항목 | 결과 |
|---|---|
| 핸들러 정합 (res.ok / res.error) | 합격 |
| 에러 경로 (4xx/5xx → withFailureHandler) | 합격 |
| 성공 판정 (success===true / ApiResponse 정합) | 합격 |
| 회귀 없음 + typecheck/lint/build 0 err | 합격 |
| UUID 비공개 | 합격 |

**결론: APPROVE**
P0: 0건, P1: 1건, P2: 1건
