# 거래처 승인요청이 500 — 기획 (조기 PR)

> 발견 경위: PR #985 라이브QA 시도 중 게이트를 못 넘어 원인을 파고들다 나왔다.

## 실 사용자 경로

1. 주문서 접속 → 사업자번호 입력 → 조회
2. **"미승인 사업자번호 — 승인요청하시겠습니까?"**
3. **`승인요청 보내기` 클릭 → `POST /auth/partner-register` → HTTP 500**

**신규 거래처가 주문서를 처음 쓰려면 반드시 이 버튼을 눌러야 한다. 지금은 그 첫 단계에서 막힌다.** 화면에 우회 경로가 없다.

## 근본 원인

서버 로그 원문:

```text
2026-07-29T17:12:16.178+09:00 ERROR ... PartnerAuthExceptionHandler : Unhandled exception
org.springframework.web.HttpMediaTypeNotSupportedException:
  Content-Type 'application/x-www-form-urlencoded;charset=UTF-8' is not supported
```

클라이언트 계약이 어긋나 있다.

```js
// clients/web/order-app/index.html:8276  — 레거시 호출부: 인자 2개
.requestAuthApproval(AUTH_BIZ, isMobileNow());

// clients/web/order-app/src/samhanApi.ts:110 — RPC 핸들러: args[0] 을 통째로 body 로
requestAuthApproval: ([payload]) => http.post('/auth/partner-register', payload)
```

`payload` 에 **문자열**(`AUTH_BIZ`)이 들어간다. axios 는 문자열 body 에 `application/x-www-form-urlencoded` 를 붙이고, 서버는 `@RequestBody` JSON 을 기대한다.

같은 계열 선례: [[feedback_fe_option_type_matches_be_dto]] — FE 옵션 타입이 BE DTO 와 어긋나 조용히 무동작한 건. 이번엔 조용하지 않고 500 이다.

## 대조군 — 서버는 정상이다

```text
$ curl -X POST http://localhost:8080/api/v1/auth/partner-register \
       -H "Content-Type: application/json" -d '{"bizNo":"1068689215"}'
{"success":true,"code":"OK","data":{"bizNo":"1068689215","status":"PENDING","message":"가입 신청이 접수되었습니다"}}
HTTP=201
```

## 📌 개발책임자 결정 (2026-07-29)

**전용 트랙 즉시 착수.** 새 이슈는 등록하지 않는다.

## 불변식

1. **신규 거래처가 화면에서 승인요청을 보내면 접수돼야 한다.**
2. **잘못된 Content-Type 은 500 이 아니라 그에 맞는 상태코드로 응답해야 한다.** 지금은 어떤 형태의 잘못된 요청이든 전부 500 으로 나가 원인을 알 수 없다.
3. 레거시 호출부가 넘기는 **두 번째 인자(모바일 여부)** 가 유실되지 않아야 한다 — 지금은 `args[0]` 만 쓰고 버려진다.

## 검증

- **RED-first**: 500 을 재현하는 실패 테스트를 먼저 쓰고 RED 원문 저장 후 고친다
- 실서버 실제 실행으로 확정 — 화면에서 버튼을 눌러 접수까지
- 같은 RPC 맵에 **같은 형태의 계약 어긋남이 더 있는지 전수 확인** (`samhanApi.ts` 의 RPC 핸들러 전부, 레거시 호출부 인자 개수와 대조)

## 격리 조건

- 건드리는 서비스는 **`partner-auth-service` 하나**다. #984 #985 가 쓰는 `product-service`·`dc-config-service`·`partner-order-service` 이미지는 **재빌드 금지** — 건드리면 그쪽 검증이 무효가 된다(2026-07-29 실측)
- `clients/web/order-app` 은 #987 도 쓰고 있다. 이 트랙은 **`src/samhanApi.ts`** 만 건드리고 `index.html` 은 건드리지 않는다
