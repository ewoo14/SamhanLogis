# [FIX] 게이트웨이 ↔ arologis CORS 중복 헤더 dedup (dev-report)

- **작성일**: 2026-06-01
- **브랜치**: `fix/gateway-arologis-cors-dedup`
- **QA 증빙**: `docs/qa/gateway-arologis-cors-dedup/real-qa-evidence.md`
- **선행**: 전 기능 게이트웨이 경유 결함 일괄 수정 RC1~RC8 (#322 `d4bda209`)
- **유래**: #322 와 같은 2026-05-30 게이트웨이 경유 실 QA 세션에서 발견되었으나 #322 머지에 누락된 후속 1행 수정(게이트웨이 실행 이미지에는 이미 반영되어 있었으나 git 미커밋 상태였음). 본 PR 로 소스 정합.

---

## 1. 목표 / 배경

arologis-service 는 게이트웨이 우회 직접접근(arologis-desktop/mobile, :8097)을 지원하려 자체
Spring Security CORS(`SecurityConfig.corsConfigurationSource()`)를 보유한다. 그런데 이 `.cors()`
필터는 게이트웨이 **경유** 요청에도 발동하여, 게이트웨이 전역 `CorsWebFilter`(`CorsConfig.java`)가
부착하는 `Access-Control-Allow-Origin`(ACAO)·`Access-Control-Allow-Credentials`(ACAC)와 **중복**된다.

브라우저/Electron 은 ACAO 가 2개면 `multiple values` 로 응답을 차단하므로, arologis 기능(배차 화면 등)이
게이트웨이 경유로 동작하지 못한다. 401(미인증)은 게이트웨이에서 차단되어 헤더 1개라 중복이 가려지고,
**인증 성공 2xx 응답에서만** 중복이 드러나 발견이 늦었다.

## 2. 결정 (DECISIONS D-GW-CORS-01)

게이트웨이 `spring.cloud.gateway.default-filters` 에 표준 dedup 필터 1행 추가:

```yaml
default-filters:
  - DedupeResponseHeader=Access-Control-Allow-Origin Access-Control-Allow-Credentials, RETAIN_UNIQUE
```

- **전 라우트 응답**에서 ACAO/ACAC 중복을 제거(유일값 유지).
- `RETAIN_UNIQUE`: 동일 값이 2개면 1개로 축약. ACAO/ACAC 는 게이트웨이·arologis 양쪽 모두
  **요청 Origin 을 그대로 반영**하므로 값이 동일 → 안전하게 단일화.
- 서비스 **직접접근**(:8097)용 자체 CORS 는 게이트웨이를 거치지 않으므로 **보존**(본 필터는 게이트웨이 응답 헤더에만 작용).
- 자체 CORS 미설정 서비스(대다수)는 게이트웨이 ACAO 1개뿐 → dedup 무영향(회귀 0).

### 대안 검토
- `RemoveRequestHeader`/서비스측 CORS 제거: arologis 직접접근 시나리오를 깨므로 기각.
- `RETAIN_FIRST`(게이트웨이 값만): 결정적이나, 값이 동일한 본 케이스에서 `RETAIN_UNIQUE` 와 결과 동일하고,
  장차 값이 달라질 경우(원치 않는 origin 차이) 둘 다 남기는 `RETAIN_UNIQUE` 가 오히려 문제를 가시화하므로 채택. (검토 메모 — 리뷰 논점)

## 3. 변경 파일

| 파일 | 변경 |
|---|---|
| `services/api-gateway/src/main/resources/application.yml` | `default-filters` 1행(+주석 3행) 추가 |
| `docs/qa/gateway-arologis-cors-dedup/real-qa-evidence.md` | 신규 — before/after Docker 실 QA 증빙 |
| `docs/dev-reports/fix-gateway-arologis-cors-dedup.md` | 신규 — 본 문서 |
| `migration/decisions/DECISIONS.md` | D-GW-CORS-01 추가 |

## 4. QA 결과 (요약 — 상세 증빙 별도)

| 항목 | BEFORE(dedup 없음) | AFTER(dedup 적용) |
|---|---|---|
| arologis 경유 ACAO/ACAC | **2 / 2 (중복, 차단)** | **1 / 1 (정상)** |
| 비-arologis(권한/회계) ACAO | 1 | 1 (회귀 0) |
| preflight OPTIONS | 정상 | 정상 |

- before/after 양쪽 게이트웨이 jar **소스 재빌드** + 실 게이트웨이 경유 실 MASTER 인증(stub 없음).

## 5. 배포

- **게이트웨이 단독 재배포**(config-only). Flyway/DB 변경 없음. 무중단 롤링 가능.
- 롤백 = 1행 제거 후 재배포(중복 상태로 복귀, 기능 영향은 arologis 게이트웨이 경유 한정).

## 6. 후속(비차단)

- 장기적으로 arologis 자체 CORS 를 "직접접근 전용 프로파일/조건"으로 한정하면 게이트웨이 경유 시 중복 자체가 발생하지 않음(근본 정리). 현 dedup 으로 충분히 안전하므로 비차단.
