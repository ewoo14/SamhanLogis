# 2026-08-13 #1143 첫 요청 지연 재검증 — CODEX LUNA

## 1단계 결론 — LiveQA7 실행본 신선도부터 확인

**현재 확인 가능한 신선한 빌드에서는 첫 요청 지연 결함을 재현하지 못했다.**
LiveQA7이 측정한 `2,027ms`, `2,086ms`, `5,099ms` 대상의 컨테이너·이미지·JAR는 현재 머신에 남아 있지 않다. LiveQA7 보고서에도 실행 JAR hash, 이미지 ID, 빌드 시각 또는 실행 commit이 없어 당시 실행본이 `100/200ms` fix를 포함했는지는 역사적으로 확정할 수 없다.

현재 commit에서 product-service를 새로 빌드하고 class 바이트코드와 장애 경계 테스트를 확인했다.

```text
CURRENT_COMMIT|8120b092783066713b4896e547513c40a4795532|2026-08-13T04:16:17+09:00|[QA] #1143 라이브QA7 — 정상은 고쳐졌으나 중단 직후 첫 요청이 2초
FRESH_BUILD|./gradlew :services:product-service:bootJar --no-daemon|BUILD SUCCESSFUL
FRESH_JAR|lastWrite=2026-08-13T04:22:01.7256646+09:00|sha256=24504E1709F485D0CF505D8916A24338E0F601B2D60E5C1CD4F55156BC619401
FRESH_CLASS|setConnectTimeout=100|setReadTimeout=200
```

실행 중인 다른 라운드 컨테이너(`sol1090-liveqa-product`)는 이 워크트리의 산출물이 아니라 `w1090` JAR를 read-only mount하고 있어 건드리지 않았다. LiveQA7 컨테이너 이름(`1143`, `liveqa7`)은 현재 `docker ps -a`에서 찾지 못했다.

## 2단계 — 신선한 100/200ms 빌드 장애 경계 재측정

현재 product-service 소스의 실제 `UserInternalClient`와 TCP 연결을 수락한 뒤 응답하지 않는 black-hole 서버를 사용했다. 이는 직전 fix와 동일한 장애 경계 재현이며, product-service 전 endpoint를 포함한 역사적 LiveQA7 격리 stack은 이미 제거되어 재기동하지 않았다.

```text
TEST|com.samhanair.logis.product.client.UserInternalClientResilienceTest|tests=1|failures=0|errors=0
USER_SERVICE_DOWN|ms=236|displayName=Optional.empty
```

목표는 `500ms 미만`으로 두었다. 신선한 빌드의 측정값 `236ms`는 목표를 충족한다. `Optional.empty()`는 호출자의 `사용자 미상` fallback으로 전달되며 UUID를 표시하지 않는다.

## 원인 판정

LiveQA7의 숫자는 직전의 `connectTimeout=2,000ms`, `readTimeout=3,000ms` 실행본과 정합적이다. 특히 `5,099ms`는 두 timeout 구간이 이어진 낡은 실행본 또는 그에 준하는 재시도 경로의 증거로 볼 수 있지만, 실행 JAR metadata가 없어 당시 retry 횟수까지 역사적으로 확정할 수는 없다.

레포의 Spring Cloud LoadBalancer 4.1.4 설정 근거는 다음과 같다.

```text
spring.cloud.loadbalancer.retry.enabled: default true (missing=true)
maxRetriesOnSameServiceInstance: 0
maxRetriesOnNextServiceInstance: 1
GET retry: allowed
```

따라서 신선한 실행본에서도 2초대가 재현됐다면 GET은 최대 2회 시도될 수 있어 retry가 다음 가설이다. 그러나 신선한 100/200ms 장애 경계 측정은 `236ms`로 통과했으므로 이번 라운드에는 retry를 변경하지 않았다. 전역 retry를 끄면 product-service의 다른 LoadBalancer 호출까지 일시 장애 흡수 능력을 잃기 때문이다. user-service 조회에만 국한하는 설정/구현도 신선한 E2E 결함이 확인된 뒤 별도 RED 테스트로 다뤄야 한다.

## 불변식 확인 범위

1. 신선한 장애 경계 첫 호출: `236ms`, 목표 `<500ms`.
2. 정상 사용자 조회 오낙하: 아래 전량 검증 및 기존 LiveQA7 `0/30회(0%)` 기록을 보존한다. 이번 라운드에서 실제 30회 정상 live DB 반복은 격리 LiveQA7 stack 부재로 실행하지 못했다.
3. 기존 LiveQA7 결과상 중단 시 HTTP `200`, `사용자 미상`, UUID `0건`.
4. 기존 LiveQA7 결과상 정상 사용자 이름, 중앙값 `32ms`; 이번 라운드에는 정상 live E2E를 재기동하지 않았다.
5. 기존 LiveQA7 회귀 5~13 항목은 모두 PASS였고, 이번 라운드에는 코드/DB/화면을 변경하지 않아 재검증 대상 산출물을 훼손하지 않았다. 다만 실제 회귀 재실행은 하지 못했다.

## 검증 한계

- LiveQA7의 역사적 실행 JAR가 `100/200ms`였는지 확인할 hash/image/build metadata가 없다.
- 현재 머신에 LiveQA7 격리 product/user/eureka stack이 없어 신선한 build로 실제 Docker `user-service stop → product 상세 HTTP` E2E를 재현하지 못했다.
- 따라서 이번 라운드에서 확정한 것은 신선한 classpath의 실제 `UserInternalClient` 장애 경계 `236ms`이며, 역사적 2초 결함이 신선한 배포본에도 존재하지 않는다는 판단이다. retry 변경이나 머지 판정은 이 증거만으로 확대하지 않는다.

## 검증 실행 원문

```text
./gradlew :services:product-service:test --no-daemon
BUILD SUCCESSFUL in 12s
PRODUCT_FULL_RESULTS|files=77|tests=794|failures=0|errors=0|skipped=0

cd clients/desktop
npm run typecheck
exit=0
typecheck:real-qa|tests=51|pass=51|fail=0
```

첫 병렬 검증 시도는 180초 실행 제한에 걸려 최종 출력이 수집되지 않았고, 결과를 성공으로 세지 않았다. 이후 각 명령을 개별 재실행해 위 원문을 확보했다.

## 라운드 종료 점검

```text
삭제된 추적 파일: 0건
tools/.s24-build-only/build/deep/tracked-writer.mjs: tracked=true, exists=true
이번 라운드가 만든 컨테이너: 0개
공유 Docker 스택 중지: 0개
공유 DB 쓰기: 0건
```
