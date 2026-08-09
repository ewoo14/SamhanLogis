# PR #1126 / Issue #896 — quantity-sync bootstrap 500 진단

일시: 2026-08-09 KST
진단자: CODEX SOL 5.6
진단 전용: 코드 수정·설정 변경·commit·push 없음

## 결론

1. 문제의 500은 규칙 데이터 오류가 아니다. estimate-app은
   `/products/internal/estimate-catalog/quantity-sync-rules`를 호출하지만, PR이 추가한
   controller 메서드는 `/products/internal/quantity-sync-rules`에 등록됐다. 요청 경로에
   handler가 없어 `NoResourceFoundException`이 발생하고, 기존 catch-all이 이를
   `INTERNAL_ERROR` 500으로 바꾼다.
2. 이 500은 R1의 리모컨 미동기화를 설명한다. 라이브 5317 HTML에는 HOME_MULTI 품목
   121건과 네 표본이 모두 있으나 서버 규칙은 0건으로 주입됐다. 따라서 서버 evaluator가
   아니라 legacy fallback이 실행된다. legacy는 360CST 판넬과 4WAY 유연호스는 자동 계산하지만,
   기본 리모컨 옵션에서는 무선 리모컨을 계산하고 `AWR-WE13N` 유선 리모컨은 계산하지 않는다.
3. URL 계약 불일치는 이 PR의 `08579f984`가 만들었다. 단, 없는 route를 404가 아닌 500으로
   포장하는 `GlobalExceptionHandler` catch-all은 선재 코드다.
4. R1의 0건과 R2의 121건은 같은 것을 다르게 잰 값이 아니다. R1은
   partner-order-service의 종합 bootstrap `payloads.homemulti`, R2는 product-service의
   estimate catalog를 쟀다. 현재도 전자는 0건, 후자는 121건이다. quantity-sync route 500은
   주문서 bootstrap 0건의 직접 원인이 아니다.

## 환경 확인

### Git / 워크트리

```text
worktree = C:\dev\Samhan-Public\.claude\worktrees\t1126
branch   = feat/896-qty-sync-chip-track
HEAD     = 71b89adca8ecae5abc13e01a32ee81f5afd07f59
```

`git diff --name-only origin/main...HEAD`에는 이 진단과 직접 관련된 다음 파일이 포함된다.

```text
clients/web/estimate-app/lib/code.js
clients/web/estimate-app/lib/db-catalog.js
clients/web/estimate-app/public/quantitySync.js
clients/web/estimate-app/src/quantitySync.ts
clients/web/estimate-app/test/quantity-sync-bootstrap.test.js
clients/web/estimate-app/test/quantity-sync.test.js
clients/web/estimate-app/views/index.ejs
services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java
```

전체 목록은 본문 말미의 PR 귀속 절에서 다시 판정한다.

### 포트와 실행 대상

```text
5316 LISTEN — desktop Vite
5317 LISTEN — estimate-app server.js
5318 LISTEN — order-app Vite
8080 LISTEN — samhan-api-gateway
8084 LISTEN — samhan-product-service
```

실제 호출 API는 다음과 같다.

```text
estimate-app 5317
  -> GET http://127.0.0.1:8084/products/internal/estimate-catalog/products?category=HOME_MULTI
  -> GET http://127.0.0.1:8084/products/internal/estimate-catalog/quantity-sync-rules?estimateCategory=HOME_MULTI

PR이 실제 등록한 규칙 API
  -> GET http://127.0.0.1:8084/products/internal/quantity-sync-rules

order-app
  -> GET http://127.0.0.1:8080/api/v1/partner-orders/bootstrap
  -> GET http://127.0.0.1:8080/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI&page=0&size=50
```

8080 gateway에는 `/products/internal/estimate-catalog/...` route가 없어 같은 internal URL을
gateway로 직접 호출하면 404다. estimate-app의 실제 PRODUCT_SERVICE_URL 경계는 8084다.

### 배포본이 `71b89adca`인가

**아니다. 정확한 71b 배포로 확인되지 않았다.**

```text
samhan-product-service StartedAt = 2026-08-09T11:23:11Z (20:23:11 KST)
1ae4cb918 commit time             = 2026-08-09T20:10:32+09:00
71b89adca commit time             = 2026-08-09T21:12:44+09:00

container /app/app.jar SHA-256
  0e15a33ba651672236290b896aaa5d36f8129585cb2e099e232b268b999fd67e

71b HEAD에서 --rerun-tasks로 fresh bootJar한 SHA-256
  f09edf0f3028a0d33f7c8963503840e2cd28ab76d32a0ebd607933155b5f574f
```

컨테이너 해시는 R1 보고서가 `1ae4cb918` HEAD 배포 때 기록한 해시와 정확히 같다. 컨테이너
기동 시각도 71b commit보다 49분 빠르므로 현재 product-service는 R1의 1ae 배포본이다.
다만 `git diff --name-only 1ae4cb918..71b89adca -- services/product-service`는 0건이다.
즉 1ae와 71b 사이 product-service 소스 차이는 없고, 이번 500 좌표는 두 HEAD에서 동일하다.

## 1. 500 원인 확정

### 재현 HTTP 원문

2026-08-09 21:16:00 KST, 내부 토큰을 사용한 8084 직접 GET이다. 토큰 값은 보고서에서
노출하지 않는다.

```http
GET /products/internal/estimate-catalog/quantity-sync-rules?estimateCategory=HOME_MULTI HTTP/1.1
Host: 127.0.0.1:8084
X-Internal-Token: (redacted)

HTTP/1.1 500
Vary: Origin
Vary: Access-Control-Request-Method
Vary: Access-Control-Request-Headers
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
Cache-Control: no-cache, no-store, max-age=0, must-revalidate
Pragma: no-cache
Expires: 0
X-Frame-Options: DENY
Content-Type: application/json
Transfer-Encoding: chunked
Date: Sun, 09 Aug 2026 12:16:00 GMT
Connection: close

{"success":false,"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다.","data":null,"timestamp":"2026-08-09T12:16:00.304210637Z"}
```

### 서버 로그 핵심 흐름

```text
2026-08-09T21:16:00.302+09:00 ERROR 1 --- [product-service] [nio-8084-exec-8] c.s.l.p.web.GlobalExceptionHandler       : Unhandled exception

org.springframework.web.servlet.resource.NoResourceFoundException: No static resource products/internal/estimate-catalog/quantity-sync-rules.
	at org.springframework.web.servlet.resource.ResourceHttpRequestHandler.handleRequest(ResourceHttpRequestHandler.java:585) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.mvc.HttpRequestHandlerAdapter.handle(HttpRequestHandlerAdapter.java:52) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:1089) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.DispatcherServlet.doService(DispatcherServlet.java:979) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.FrameworkServlet.processRequest(FrameworkServlet.java:1014) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.FrameworkServlet.doGet(FrameworkServlet.java:903) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at jakarta.servlet.http.HttpServlet.service(HttpServlet.java:527) ~[jakarta.servlet-api-6.0.0.jar!/:6.0.0]
	at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:885) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at jakarta.servlet.http.HttpServlet.service(HttpServlet.java:614) ~[jakarta.servlet-api-6.0.0.jar!/:6.0.0]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:195) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.websocket.server.WsFilter.doFilter(WsFilter.java:51) ~[tomcat-embed-websocket-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:110) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.CompositeFilter$VirtualFilterChain.doFilter(CompositeFilter.java:108) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.FilterChainProxy.lambda$doFilterInternal$3(FilterChainProxy.java:231) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.access.intercept.AuthorizationFilter.doFilter(AuthorizationFilter.java:100) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.access.ExceptionTranslationFilter.doFilter(ExceptionTranslationFilter.java:126) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.access.ExceptionTranslationFilter.doFilter(ExceptionTranslationFilter.java:120) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.session.SessionManagementFilter.doFilter(SessionManagementFilter.java:131) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.session.SessionManagementFilter.doFilter(SessionManagementFilter.java:85) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.authentication.AnonymousAuthenticationFilter.doFilter(AnonymousAuthenticationFilter.java:100) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.servletapi.SecurityContextHolderAwareRequestFilter.doFilter(SecurityContextHolderAwareRequestFilter.java:179) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.savedrequest.RequestCacheAwareFilter.doFilter(RequestCacheAwareFilter.java:63) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at com.samhanair.logis.product.config.HeaderAuthenticationFilter.doFilterInternal(HeaderAuthenticationFilter.java:50) ~[!/:0.1.0-SNAPSHOT]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at com.samhanair.logis.security.InternalTokenFilter.doFilterInternal(InternalTokenFilter.java:87) ~[security-0.1.0-SNAPSHOT.jar!/:na]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.authentication.logout.LogoutFilter.doFilter(LogoutFilter.java:107) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.authentication.logout.LogoutFilter.doFilter(LogoutFilter.java:93) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.header.HeaderWriterFilter.doHeadersAfter(HeaderWriterFilter.java:90) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.header.HeaderWriterFilter.doFilterInternal(HeaderWriterFilter.java:75) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.context.SecurityContextHolderFilter.doFilter(SecurityContextHolderFilter.java:82) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.context.SecurityContextHolderFilter.doFilter(SecurityContextHolderFilter.java:69) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.context.request.async.WebAsyncManagerIntegrationFilter.doFilterInternal(WebAsyncManagerIntegrationFilter.java:62) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.session.DisableEncodeUrlFilter.doFilterInternal(DisableEncodeUrlFilter.java:42) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.FilterChainProxy.doFilterInternal(FilterChainProxy.java:233) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.FilterChainProxy.doFilter(FilterChainProxy.java:191) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.CompositeFilter$VirtualFilterChain.doFilter(CompositeFilter.java:113) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.handler.HandlerMappingIntrospector.lambda$createCacheFilter$3(HandlerMappingIntrospector.java:195) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.CompositeFilter$VirtualFilterChain.doFilter(CompositeFilter.java:113) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.CompositeFilter.doFilter(CompositeFilter.java:74) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.config.annotation.web.configuration.WebMvcSecurityConfiguration$CompositeFilterChainProxy.doFilter(WebMvcSecurityConfiguration.java:230) ~[spring-security-config-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.DelegatingFilterProxy.invokeDelegate(DelegatingFilterProxy.java:362) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.DelegatingFilterProxy.doFilter(DelegatingFilterProxy.java:278) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.RequestContextFilter.doFilterInternal(RequestContextFilter.java:100) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.FormContentFilter.doFilterInternal(FormContentFilter.java:93) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.ServerHttpObservationFilter.doFilterInternal(ServerHttpObservationFilter.java:113) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.CharacterEncodingFilter.doFilterInternal(CharacterEncodingFilter.java:201) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at com.samhanair.logis.security.UserHeaderDecodingFilter.doFilterInternal(UserHeaderDecodingFilter.java:39) ~[security-0.1.0-SNAPSHOT.jar!/:na]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardWrapperValve.invoke(StandardWrapperValve.java:167) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardContextValve.invoke(StandardContextValve.java:90) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.authenticator.AuthenticatorBase.invoke(AuthenticatorBase.java:483) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardHostValve.invoke(StandardHostValve.java:115) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.valves.ErrorReportValve.invoke(ErrorReportValve.java:93) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardEngineValve.invoke(StandardEngineValve.java:74) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.connector.CoyoteAdapter.service(CoyoteAdapter.java:344) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.coyote.http11.Http11Processor.service(Http11Processor.java:384) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.coyote.AbstractProcessorLight.process(AbstractProcessorLight.java:63) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.coyote.AbstractProtocol$ConnectionHandler.process(AbstractProtocol.java:905) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.net.NioEndpoint$SocketProcessor.doRun(NioEndpoint.java:1741) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.net.SocketProcessorBase.run(SocketProcessorBase.java:52) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.threads.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1190) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.threads.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:659) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.threads.TaskThread$WrappingRunnable.run(TaskThread.java:63) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at java.base/java.lang.Thread.run(Unknown Source) ~[na:na]
```

### 서버 로그 스택트레이스 원문 전체

아래는 `docker logs --since 2026-08-09T12:15:59Z --until 2026-08-09T12:16:01Z samhan-product-service`
출력을 가공하지 않고 그대로 옮긴 것이다.

```text
2026-08-09T21:16:00.302+09:00 ERROR 1 --- [product-service] [nio-8084-exec-8] c.s.l.p.web.GlobalExceptionHandler       : Unhandled exception

org.springframework.web.servlet.resource.NoResourceFoundException: No static resource products/internal/estimate-catalog/quantity-sync-rules.
	at org.springframework.web.servlet.resource.ResourceHttpRequestHandler.handleRequest(ResourceHttpRequestHandler.java:585) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.mvc.HttpRequestHandlerAdapter.handle(HttpRequestHandlerAdapter.java:52) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:1089) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.DispatcherServlet.doService(DispatcherServlet.java:979) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.FrameworkServlet.processRequest(FrameworkServlet.java:1014) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.FrameworkServlet.doGet(FrameworkServlet.java:903) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at jakarta.servlet.http.HttpServlet.service(HttpServlet.java:527) ~[jakarta.servlet-api-6.0.0.jar!/:6.0.0]
	at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:885) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at jakarta.servlet.http.HttpServlet.service(HttpServlet.java:614) ~[jakarta.servlet-api-6.0.0.jar!/:6.0.0]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:195) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.websocket.server.WsFilter.doFilter(WsFilter.java:51) ~[tomcat-embed-websocket-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:110) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.CompositeFilter$VirtualFilterChain.doFilter(CompositeFilter.java:108) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.FilterChainProxy.lambda$doFilterInternal$3(FilterChainProxy.java:231) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$FilterObservation$SimpleFilterObservation.lambda$wrap$1(ObservationFilterChainDecorator.java:479) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$AroundFilterObservation$SimpleAroundFilterObservation.lambda$wrap$1(ObservationFilterChainDecorator.java:340) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator.lambda$wrapSecured$0(ObservationFilterChainDecorator.java:82) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:128) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.access.intercept.AuthorizationFilter.doFilter(AuthorizationFilter.java:100) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.access.ExceptionTranslationFilter.doFilter(ExceptionTranslationFilter.java:126) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.access.ExceptionTranslationFilter.doFilter(ExceptionTranslationFilter.java:120) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.session.SessionManagementFilter.doFilter(SessionManagementFilter.java:131) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.session.SessionManagementFilter.doFilter(SessionManagementFilter.java:85) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.authentication.AnonymousAuthenticationFilter.doFilter(AnonymousAuthenticationFilter.java:100) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.servletapi.SecurityContextHolderAwareRequestFilter.doFilter(SecurityContextHolderAwareRequestFilter.java:179) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.savedrequest.RequestCacheAwareFilter.doFilter(RequestCacheAwareFilter.java:63) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at com.samhanair.logis.product.config.HeaderAuthenticationFilter.doFilterInternal(HeaderAuthenticationFilter.java:50) ~[!/:0.1.0-SNAPSHOT]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at com.samhanair.logis.security.InternalTokenFilter.doFilterInternal(InternalTokenFilter.java:87) ~[security-0.1.0-SNAPSHOT.jar!/:na]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.authentication.logout.LogoutFilter.doFilter(LogoutFilter.java:107) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.authentication.logout.LogoutFilter.doFilter(LogoutFilter.java:93) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.header.HeaderWriterFilter.doHeadersAfter(HeaderWriterFilter.java:90) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.header.HeaderWriterFilter.doFilterInternal(HeaderWriterFilter.java:75) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.context.SecurityContextHolderFilter.doFilter(SecurityContextHolderFilter.java:82) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.context.SecurityContextHolderFilter.doFilter(SecurityContextHolderFilter.java:69) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.context.request.async.WebAsyncManagerIntegrationFilter.doFilterInternal(WebAsyncManagerIntegrationFilter.java:62) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:227) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.session.DisableEncodeUrlFilter.doFilterInternal(DisableEncodeUrlFilter.java:42) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.wrapFilter(ObservationFilterChainDecorator.java:240) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$AroundFilterObservation$SimpleAroundFilterObservation.lambda$wrap$0(ObservationFilterChainDecorator.java:323) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$ObservationFilter.doFilter(ObservationFilterChainDecorator.java:224) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.ObservationFilterChainDecorator$VirtualFilterChain.doFilter(ObservationFilterChainDecorator.java:137) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.FilterChainProxy.doFilterInternal(FilterChainProxy.java:233) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.security.web.FilterChainProxy.doFilter(FilterChainProxy.java:191) ~[spring-security-web-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.CompositeFilter$VirtualFilterChain.doFilter(CompositeFilter.java:113) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.servlet.handler.HandlerMappingIntrospector.lambda$createCacheFilter$3(HandlerMappingIntrospector.java:195) ~[spring-webmvc-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.CompositeFilter$VirtualFilterChain.doFilter(CompositeFilter.java:113) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.CompositeFilter.doFilter(CompositeFilter.java:74) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.security.config.annotation.web.configuration.WebMvcSecurityConfiguration$CompositeFilterChainProxy.doFilter(WebMvcSecurityConfiguration.java:230) ~[spring-security-config-6.3.4.jar!/:6.3.4]
	at org.springframework.web.filter.DelegatingFilterProxy.invokeDelegate(DelegatingFilterProxy.java:362) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.DelegatingFilterProxy.doFilter(DelegatingFilterProxy.java:278) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.RequestContextFilter.doFilterInternal(RequestContextFilter.java:100) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.FormContentFilter.doFilterInternal(FormContentFilter.java:93) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.ServerHttpObservationFilter.doFilterInternal(ServerHttpObservationFilter.java:113) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.springframework.web.filter.CharacterEncodingFilter.doFilterInternal(CharacterEncodingFilter.java:201) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at com.samhanair.logis.security.UserHeaderDecodingFilter.doFilterInternal(UserHeaderDecodingFilter.java:39) ~[security-0.1.0-SNAPSHOT.jar!/:na]
	at org.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:116) ~[spring-web-6.1.14.jar!/:6.1.14]
	at org.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:164) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:140) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardWrapperValve.invoke(StandardWrapperValve.java:167) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardContextValve.invoke(StandardContextValve.java:90) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.authenticator.AuthenticatorBase.invoke(AuthenticatorBase.java:483) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardHostValve.invoke(StandardHostValve.java:115) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.valves.ErrorReportValve.invoke(ErrorReportValve.java:93) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.core.StandardEngineValve.invoke(StandardEngineValve.java:74) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.catalina.connector.CoyoteAdapter.service(CoyoteAdapter.java:344) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.coyote.http11.Http11Processor.service(Http11Processor.java:384) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.coyote.AbstractProcessorLight.process(AbstractProcessorLight.java:63) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.coyote.AbstractProtocol$ConnectionHandler.process(AbstractProtocol.java:905) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.net.NioEndpoint$SocketProcessor.doRun(NioEndpoint.java:1741) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.net.SocketProcessorBase.run(SocketProcessorBase.java:52) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.threads.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1190) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.threads.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:659) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at org.apache.tomcat.util.threads.TaskThread$WrappingRunnable.run(TaskThread.java:63) ~[tomcat-embed-core-10.1.31.jar!/:na]
	at java.base/java.lang.Thread.run(Unknown Source) ~[na:na]


```

### 파일:줄 확정

- 호출 URL 조립: `clients/web/estimate-app/lib/db-catalog.js:34,38-45,52-53`
  - base가 `/products/internal/estimate-catalog`
  - suffix가 `/quantity-sync-rules?...`
  - 합성 결과가 500 재현 URL이다.
- 실제 server base: `services/product-service/src/main/java/com/samhanair/logis/product/web/ProductInternalController.java:53-55`
- 실제 규칙 method: 같은 파일 `:373-377`
  - 합성 route는 `/products/internal/quantity-sync-rules`다.
- estimate-catalog controller base: `services/product-service/src/main/java/com/samhanair/logis/product/web/EstimateCatalogInternalController.java:62-65`
  - 이 controller에는 `quantity-sync-rules` method가 없다.
- 404 성격의 `NoResourceFoundException`을 500으로 변환:
  `services/product-service/src/main/java/com/samhanair/logis/product/web/GlobalExceptionHandler.java:164-168`.

정상 등록 route 직접 조회 원문 요약:

```text
GET /products/internal/quantity-sync-rules?estimateCategory=HOME_MULTI
HTTP 200
RULE_COUNT=1
RULE_KEY=UI_HOME_MULTI_AM052BN6PBH1
SOURCES=AM052BN6PBH1
TARGETS=PC6NUDK1NW,AWR-WE13N,FH-LFHLN
```

따라서 규칙 1건과 target 3건은 정상 존재한다. 실패 지점은 규칙 조회 service/DB가 아니라
Spring MVC handler 선택 이전의 URL 계약이다.

## 2. 500이 리모컨 미동기화의 원인인가

**판정: 원인이다. R1의 판넬 2 / 리모컨 0 / 유연호스 2 패턴을 그대로 설명한다.**

### 실제 네트워크와 HTML 주입값

현재 실행 중인 5317에 `GET /?email=dev_master%40samhan-air.com`을 보내면 HTTP 200이다.
같은 시각 product-service 로그에서 다음이 1회 관측됐다.

```text
NO_RESOURCE_RULE_COUNT=1
org.springframework.web.servlet.resource.NoResourceFoundException:
No static resource products/internal/estimate-catalog/quantity-sync-rules.
```

반환 HTML을 파싱한 실측값:

```text
HM_COUNT=121
HM_HAS_SOURCE(AM052BN6PBH1)=true
HM_HAS_PANEL(PC6NUDK1NW)=true
HM_HAS_REMOTE(AWR-WE13N)=true
HM_HAS_HOSE(FH-LFHLN)=true
HOME_QUANTITY_SYNC_RULES count=0
HOME_QUANTITY_SYNC_RULES=[]
HOME_DEFAULTS[리모컨]=선택 안함
```

즉 “리모컨 품목이 카탈로그에 없어서”가 아니다. 품목 네 건은 모두 HTML에 있고 규칙만 비었다.

### 실제 소비 경로

1. `clients/web/estimate-app/lib/code.js:1876-1889`
   - DB catalog를 읽는다.
   - 규칙 GET 실패를 catch하고 `t.quantitySyncRules='[]'`로 둔다(`:1889`).
2. `clients/web/estimate-app/views/index.ejs:2266`
   - 빈 배열을 `HOME_QUANTITY_SYNC_RULES`에 주입한다.
3. 같은 파일 `:8335-8338`
   - 배열이 비면 `applyServerHomeQuantitySync_()`가 즉시 `false`를 반환한다.
4. 같은 파일 `:8360-8371`
   - false이면 서버 evaluator 경로를 종료하지 않고 legacy fallback으로 진입한다.

따라서 500 상태에서 종합견적서는 서버 규칙을 쓰지 않고 legacy fallback을 실제로 쓴다.

### 왜 판넬·호스만 2이고 AWR-WE13N은 0인가

라이브 DB 라벨:

```text
AM052BN6PBH1 | 실내기 360CST WIFI내장 13평형
PC6NUDK1NW  | 판넬 360CST 사각 WIFI
FH-LFHLN    | 유연호스 L형 4WAY
AWR-WE13N   | 유선리모컨(통합)
```

- 판넬: `index.ejs:8113-8224`의 `recomputeHomePanels()`가 실내기 타입을 집계하고,
  `:4534-4536`의 고정 panel model map을 사용한다. 그래서 360CST 실내기 2가 판넬 2로 수렴한다.
- 유연호스: `:8373-8387`에서 360 수량을 4WAY 수량에 더하고, `:8389-8412`에서
  4WAY 호스에 설정한다. 그래서 `FH-LFHLN`이 2로 수렴한다.
- 리모컨: live default는 `선택 안함`이고 `:7804-7806`에서 이를 `기본`으로 정규화한다.
  `recomputeHomeRemotes()`는 `:8227-8264`의 기본 분기에서 360CST를 무선 기본
  `AR-EC05` 계열로 보낸다. `AWR-WE13N`은 `:8257`에서 찾지만, 실제 설정은
  `:8265-8268`의 `유선` 옵션 분기에서만 한다.
- R1 Playwright는 `clients/desktop/playwright/896-chip-sol-real-qa/896-chip-sol-real-qa.spec.ts:174-200`
  에서 리모컨 옵션을 바꾸지 않고 source 수량만 2로 입력했다. 따라서 위 기본 분기가 그대로 적용됐다.

서버 규칙 1건은 `AWR-WE13N`을 target으로 명시하지만 500 때문에 evaluator에 도달하지 않았다.
그러므로 리모컨 특수 분기를 먼저 고칠 좌표는 없다. 이 라운드 증상에 한정하면 리모컨 분기는
원인이 아니라 legacy fallback이 선택된 뒤 나타난 정상 legacy 동작이다.

## 3. 500은 이 PR이 만들었는가

**판정: URL 계약 불일치와 그 결과의 500 호출은 이 PR이 만들었다. 500 포장기는 선재다.**

`git blame` 원문:

```text
08579f9845 ... ProductInternalController.java 373-377
08579f9845 ... db-catalog.js 48-54
^75f9a6192 ... GlobalExceptionHandler.java 164-167
9329634126 ... GlobalExceptionHandler.java 168
```

- `origin/main`의 `ProductInternalController`에는 규칙 service/method가 없다.
- `origin/main`의 `db-catalog.js`에는 `quantitySyncRules()` 호출이 없다.
- PR `08579f984`가 기존 estimate-catalog base를 재사용해 새 client suffix를 추가하면서,
  새 server method는 다른 controller base에 추가했다.
- `git diff --name-only origin/main...HEAD`에도 두 파일이 모두 포함된다.
- `NoResourceFoundException`까지 전부 `INTERNAL_ERROR`로 포장하는 catch-all은 5월부터 있던 선재 코드다.

따라서 “endpoint 자체는 이 PR의 직전 라운드 변경과 관련될 수 있다”는 전제는 맞다. 더 정확히는
endpoint와 caller를 같은 commit에서 서로 다른 base path에 둔 것이 직접 원인이다.

테스트 공백도 확인했다. `clients/web/estimate-app/test/quantity-sync-bootstrap.test.js:4-12`는 axios를
무조건 200으로 mock하고 반환 배열만 단정하며, 실제 호출 URL을 단정하지 않는다. product-service 쪽에도
새 internal route의 MockMvc 계약 테스트가 없어 양쪽 path 불일치를 잡지 못했다.

## 4. R1 0건과 R2 121건 표본 상충

**판정: 다른 것을 쟀다. 수치 상충이 아니다.**

| 측정 | 실제 경로 | 의미 | 현재 재측정 |
|---|---|---|---:|
| SOL R1 `homemulti: []` | `/api/v1/partner-orders/bootstrap`의 `data.payloads.homemulti` | partner-order-service가 조립·캐시·fallback한 주문서 bootstrap | 0 |
| R2 `HOME_MULTI 121건` | `/products/internal/estimate-catalog/products?category=HOME_MULTI` | product-service estimate catalog 직접 응답 | 121 |
| SQL 동일 모집단 | `product_estimate_exposure` + `products`, HOME_MULTI, ESTIMATE/BOTH | product-service repository 모집단 | 121 |

현재 직접 조회 원문 요약:

```text
GET 18088 /api/v1/partner-orders/bootstrap -> HTTP 200, HOME=0, SINGLE=0, COMM=0
GET 8080  /api/v1/partner-orders/bootstrap -> HTTP 200, HOME=0, SINGLE=0, COMM=0

GET 8084 /products/internal/estimate-catalog/products?category=HOME_MULTI&scope=PARTNER_ORDER
-> HTTP 200, count=121
```

따라서 order bootstrap 0은 product DB에 HOME_MULTI가 0이라는 뜻이 아니다.

### order bootstrap이 0으로 수렴하는 별도 경로

라이브 product-service의 PARTNER_ORDER scope 직접 조회:

```text
HOME_MULTI       -> HTTP 200, 121건
COMMERCIAL_MULTI -> HTTP 500, INTERNAL_ERROR
SINGLE_SET       -> HTTP 500, INTERNAL_ERROR
LEGACY           -> HTTP 200, 40건
```

COMMERCIAL_MULTI/SINGLE_SET 500의 로그 원문 핵심:

```text
org.springframework.dao.InvalidDataAccessApiUsageException:
No enum constant com.samhanair.logis.product.domain.ProductStatus.OUT_OF_STOCK
  at com.samhanair.logis.product.web.EstimateCatalogInternalController.products(EstimateCatalogInternalController.java:248)
Caused by: java.lang.IllegalArgumentException:
No enum constant com.samhanair.logis.product.domain.ProductStatus.OUT_OF_STOCK
```

- DB에는 `OUT_OF_STOCK` 3건과 `NOT_FOR_SALE` 14건이 존재한다.
- 현재 enum은 `ProductStatus.java:12-14`의 `ACTIVE`, `DISCONTINUED`만 안다.
- `BootstrapService.java:289-317`은 HOME → COMMERCIAL → SINGLE 등 7종을 한 try 안에서 순차 조회한다.
- 하나가 실패하면 `:289-296`에서 이미 성공한 HOME 121건까지 `Map.of()`로 버린다.

이것은 quantity-sync route 500과 별개의 선재 데이터/enum 및 aggregate fallback 문제다. 다만 R1의
주문서 bootstrap 0건을 설명할 수 있는 현재 라이브 근거다. R1 시각의 partner-order-service 시작 로그를
별도로 보존하지 않아 그 시점의 0건이 정확히 이 예외로 생성됐다고까지는 확정하지 않는다.

## 부가 판정 — 다른 가능성

5317 한 번의 실제 bootstrap에서 규칙 route 500과 별개로 여러 catalog 500도 함께 발생했다. 이 중
HOME_MULTI 직접 endpoint는 현재 200/121이므로 리모컨 증상의 원인은 아니다. 그러나 SINGLE_SET 및
COMMERCIAL_MULTI 화면/주문 bootstrap에는 영향을 줄 수 있다. 이번 지시 범위에서는 진단만 했고 수정하지 않았다.

## 설정 변경·원복

- 진단용 로그 레벨 또는 설정을 변경하지 않았다.
- 따라서 원복 대상이 없다.
- 기존 컨테이너·Vite·Node 프로세스를 재기동하거나 중지하지 않았다.
- 공유 DB에는 SELECT만 수행했고 write는 하지 않았다.
- `tools/legacy-gas/**`는 읽거나 변경하지 않았다.

## 검증 명령 요약

```text
git rev-parse HEAD
git branch --show-current
git diff --name-only origin/main...HEAD
git blame -L ...
curl GET 8084 internal endpoints (read-only)
curl GET 5317 / (read-only)
curl GET 18088/8080 partner bootstrap (read-only)
docker logs --since ... samhan-product-service
docker exec samhan-postgres psql ... SELECT only
gradlew :services:product-service:bootJar --rerun-tasks
git diff --check
git status --short
```

## 신규 생성 파일

- `docs/dev-reports/2026-08-09-896-bootstrap-500-diagnosis.md`

스크린샷은 원인 확정에 필요하지 않아 생성하지 않았다.

## 못 한 것

- 인앱 브라우저 연결 대상이 0개여서 DevTools UI 네트워크 캡처는 하지 못했다. 대신 현재 실행 중인
  5317 서버의 실제 GET, 같은 시각의 product-service 로그, 반환 HTML 주입값을 대조했다.
- R1 시각 partner-order-service의 최초 catalog refresh 전체 로그 원문은 현재 보존 위치에서 찾지 못했다.
  따라서 R1 주문 bootstrap 0건의 역사적 생성 원인을 enum 500으로 단정하지 않았다.
- 코드 수정, 테스트 추가, 배포, commit, push는 지시대로 하지 않았다.
