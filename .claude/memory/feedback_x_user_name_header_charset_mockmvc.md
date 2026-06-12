---
name: X-User-Name 헤더 charset + FilterRegistrationBean MockMvc 함정
description: 게이트웨이 URL-encoded X-User-Name → Tomcat ISO-8859-1 헤더 디코딩으로 0xED(터) 모지바케 → 공용 charset-repair 필터. 단 FilterRegistrationBean 필터는 @AutoConfigureMockMvc 미적용 → 컨트롤러 IT 는 이미-디코딩된 값 전달
metadata:
  type: feedback
---
2026-06-12 PR #464 회고. 배차 협업 코멘트 작성자 실명(X-User-Name 전파) 라이브 캡처가 한글 "터"(U+D130 = UTF-8 ED 84 B0) 만 모지바케로 깨진 사건 + 그 회귀 IT 의 false-green.

## 근본 원인 — Tomcat 헤더 ISO-8859-1 디코딩
- 게이트웨이(`JwtAuthenticationGatewayFilterFactory`)가 JWT `name` claim → `X-User-Name` 을 `URLEncoder.encode(v, UTF-8)` 로 주입(정상 경로는 `%ED%84%B0`).
- 그러나 일부 경로/빌드에서 raw UTF-8 바이트가 그대로 헤더에 실리면 **servlet 컨테이너(Tomcat)가 HTTP 헤더를 ISO-8859-1 로 디코딩** → `ED 84 B0` 가 3개 ISO-8859-1 문자(U+00ED U+0084 U+00B0, 0x84 는 C1 control)로 깨짐. "개발마스" 는 멀쩡하고 "터"(0xED 선두) 만 깨지는 특이 증상의 정체.
- DB 값·로그인 응답 바이트는 정상(`ed84b0`)이었고 JVM `file.encoding`/`sun.jnu.encoding` 모두 UTF-8 → **charset 설정 문제 아님**, 헤더 전송 레이어 문제.

## fix — 공용 inbound 필터 중앙 디코딩 + charset-repair
`shared/security/UserHeaderDecodingFilter`(OncePerRequestFilter + HttpServletRequestWrapper, FilterRegistrationBean 자동등록):
1. `X-User-Name` 에 `%`/`+` 있으면 `URLDecoder.decode(v, UTF-8)`.
2. 그 후에도 C1 control(U+0080~U+009F) 잔존 시 `repairUtf8BytesReadAsIso88591` — ISO-8859-1 로 읽힌 바이트열을 UTF-8 로 재해석. 정상 한글(C1 없음)은 무변경, 실패 시 원값 보존. `X-User-Name` 단일 헤더만(X-User-Department 이중디코딩 회피).

## 🚨 false-green 함정 — FilterRegistrationBean 은 @AutoConfigureMockMvc 미적용
- `@AutoConfigureMockMvc` 는 컨텍스트의 **`Filter` 타입 빈만** MockMvc 체인에 추가. **`FilterRegistrationBean` 으로만 감싼 필터는 MockMvc 에 적용 안 됨**(운영/실 서블릿 컨테이너에서는 정상 등록).
- 따라서 "컨트롤러가 URL-encoded 헤더를 디코딩한다"는 IT 를 MockMvc 로 쓰면 필터가 안 끼어 컨트롤러가 raw 인코딩 값을 그대로 영속 → assertion 실패. (컨트롤러는 디코딩 책임 없음 — `resolveAuthorName` 은 trim + UUID 마스킹만.)
- **규칙**: 컨트롤러 IT 는 **필터가 이미 디코딩한 평문**(한글 그대로)을 헤더로 전달하고 authorName 왕복(한글 영속) 만 단언. 필터 디코딩/charset-repair 는 **필터 단위테스트**(shared/security)로, 진짜 end-to-end 는 **라이브 Docker 캡처(실 게이트웨이)**로 커버. 3층 분담. (선례 b653b1b8 `usesAlreadyDecodedCallerNameAsAuthor` 와 동일.)

## How to apply
헤더 전파 한글 값은 게이트웨이 URLEncode + 공용 필터 디코딩(+charset-repair) 1쌍으로. 컨트롤러/소비처는 디코딩 가정 금지(평문 수신). FilterRegistrationBean 필터의 효과는 MockMvc IT 로 검증 불가 — 단위테스트+라이브 캡처로 분담. 관련: [[real-server-check-screenshot]] [[ci-test-filter-false-green]] [[enforcement-real-http-test]] [[no-fake-data-ever]].
