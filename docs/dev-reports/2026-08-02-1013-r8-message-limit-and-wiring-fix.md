# PR #1059 / 이슈 #1013 — R8 메시지 길이·blocked 판정·compose 배선 수정

작성일: 2026-08-02  
대상 브랜치: `feat/1013-dispatch-inherit`  
작업 시작 HEAD: `6eda2778f`

## 0. 결론

R8에서 코드로 수정한 범위는 다음과 같다.

- 동일 수신번호 병합 문구를 원문 블록 경계에서 분할하여 BE `@Size(max=2000)` 안에 넣었다. 1,911건 축소 fixture는 12 entry, 최대 2,000자, 누락 0건이다.
- blocked 조회 예외를 실제 `BLOCKED` 판정으로 승격하지 않도록 했다. 정상 대상은 조회 장애 시 발송 흐름에 남고, 조회 성공 후 실제 `true`인 대상은 계속 `BLOCKED`다.
- `notification-service` compose(local-all/prod)에 `SAMHAN_SLIP_SERVICE_URL=http://slip-service:8086`을 주입했다. Docker 이미지 재빌드·재기동은 하지 않았다.
- `partnerCode`가 비어 있는 후보는 BE `SendEntry.partnerCode @NotBlank` 계약을 통과할 수 없으므로 FE 외부 발송 후보에서 제외한다. 코드를 합성하거나 거래처명으로 대체하지 않았다.

실제 SMS 발송, send POST, DB write/DDL, Docker 이미지 재빌드는 실행하지 않았다.

## 1. 레거시 긴 그룹 처리 원문

`tools/legacy-gas/배차안내문자/Index.html`의 원문은 그룹 문구를 먼저 하차일별 section으로 만들고 각 행에 같은 `mergedText`를 대입한다.

```javascript
        let sections = dayOrder.map(dk => {
          let sub = dk + '일 하차 건 배송기사님 연락처를 안내드립니다.';
          let ls = dayLines[dk];
          return sub + (ls.length ? '\n' + ls.join('\n') : '');
        });

        let mergedText = 'AI 삼성무풍 시스템에어컨 배차실입니다.\n\n' + sections.join('\n\n');
        if (!roomKey) mergedText += '\n\n※출하창고 상황에 따라 지연될 수 있음을 양해 부탁드립니다.';

        group.forEach(g => { g['발송멘트'] = mergedText; });
```

같은 원문의 그룹 병합 정책은 유지하되, R8에서는 BE 제한을 넘는 경우 `message` 블록을 잘라 버리지 않고 다음 entry로 넘긴다. 따라서 “문구를 하나로 붙이면 누락 0”만 확인하는 것은 부족하며, 길이와 누락을 함께 측정한다.

## 2. RED-first 재현 원문

### 2.1 ① 길이 상한 초과

기존 `buildSendEntries`에 1,911건 fixture를 넣고 `message.length <= 2000`을 먼저 assertion 했다.

```text
× R4 실데이터 후보 규모 1911건은 초과 1909건 없이 모든 문구를 보존한다
→ AssertionError: expected false to be true
```

기존 구현은 같은 번호를 1 entry로 만들었고, R7 시드 실측에서는 2026-06-08 그룹이 **128,275자**였다.

### 2.2 ③ blocked 조회 실패 전역 차단

`blockedPartnerLookupClient.isBlocked("P-LOOKUP-FAIL")`에 `partner-service unavailable` 예외를 주입하고 정상 발송을 기대하도록 테스트를 먼저 바꿨다.

```text
<failure message="org.opentest4j.AssertionFailedError:
expected: 1
but was: 0">
  ...send_blockedLookupFailure_defersDecisionAndSends...
</failure>
```

실패 원인은 기존 catch가 `isBlocked = true`로 설정해 `BLOCKED=1`, `sent=0`으로 만들었기 때문이다.

## 3. Fix

### 3.1 메시지 길이와 정보 보존 동시 보장

`clients/desktop/src/renderer/routes/DispatchSmsPage.tsx`의 `buildSendEntries`에서 같은 번호의 다음 원문 블록을 현재 entry에 붙였을 때 2,000자를 넘으면 새 entry를 만든다. `partnerCode`가 blank인 row는 `@NotBlank` send 계약에 진입시키지 않는다. `countSendableEntries`도 실제 builder 결과를 사용해 화면 건수와 요청 건수를 분리하지 않게 했다.

현재 1,911건 fixture 측정:

```json
{"sourceRows":1911,"entries":12,"maxMessageLength":2000,"missingMessages":0}
```

### 3.2 blocked 조회 실패 보류

- `DispatchBatchSendService`: lookup 예외 시 `isBlocked=false`로 두고 발송 흐름을 계속한다.
- `DispatchBatchPreviewService`: preview lookup 예외도 `blocked=false`로 보류해 정상 후보를 전역 차단하지 않는다.
- lookup 성공 후 `true`인 대상은 기존처럼 `BLOCKED`로 skip한다.

### 3.3 컨테이너 배선

다음 두 `notification-service.environment`에 같은 서비스 DNS 주소를 추가했다.

```yaml
SAMHAN_SLIP_SERVICE_URL: http://slip-service:8086
```

포트 숫자는 R6/R7 결론대로 8086을 유지했다. 이미지 재빌드 없이 compose 설정만 변경했다.

## 4. GREEN 및 검증

- FE 대상 테스트: `DispatchSmsPage.test.ts` 3/3 PASS.
- BE focused: `DispatchBatchSendServiceTest` 6/6, `DispatchBatchPreviewServiceTest` 6/6 PASS.
- `./gradlew :services:notification-service:test --no-daemon`: **BUILD SUCCESSFUL**, XML 합계 **233 tests**, suites 38.
- `npm run typecheck`: PASS. real-QA 로컬 미추적 파일 경고가 있었으나 typecheck 자체와 50개 보조 테스트는 PASS.
- compose 환경 주입 정적 확인: local-all/prod 모두 `notification-service` 블록에 `http://slip-service:8086` 존재.
- `docker compose ... config`은 기존 compose의 `grafana` 이미지/빌드 컨텍스트 누락으로 전체 파싱을 완료하지 못했다. 따라서 compose 실행 검증은 **미검증**이며, 이미지 재빌드·기동도 금지 조건상 하지 않았다.

## 5. 불변식 1~5 실측

데이터 기준은 반드시 구분한다. R7에 기록된 2,303/1,911/392/1,909와 128,275자는 로컬 DB의 `[DEV-SEED] 개발마스터` 시드 기준이다. 실 원본 `docs/migration/ecount-data/raw/`는 이 워크트리에 `.gitkeep`만 있어 원본 부재로 실 데이터 판정은 하지 않았다.

| 불변식 | 측정 결과 | 판정 |
|---|---|---|
| 1. 길이 + 누락 동시 만족 | R8 1,911건 fixture: 최대 문구 **2,000자**, 누락 **0건**, entry **12건**. R7 시드 문제값은 128,275자에서 수정 대상임을 재현 | 코드/fixture PASS, 시드 실 preview 재실측은 미검증 |
| 2. blocked 장애와 진짜 차단 분리 | 조회 실패 정상 대상: `sent=1, blocked=0`; 조회 성공 `true` 대상: `blocked=1`, adapter 호출 0 | PASS (실패 주입 단위 테스트) |
| 3. 컨테이너 slip 도달 | 설정값 `slip-service:8086` 주입 확인. compose 전체 parse가 기존 grafana 오류로 중단 | 설정 PASS, 실행 미검증 |
| 4. partnerCode 부재 재계수 | R7 시드: 번호 보유 **1,911건 중 1,911건 부재**. 실 원본 부재로 실 데이터는 **미판정**. R8은 누락 코드를 합성하지 않고 send 후보에서 제외 | 실 데이터 미검증 |
| 5. R4~R6 성과 | R7 시드 기록: preview 도달 0건 아님, 중복 0, 번호 없는 외부 혼입 0, 표본 보존, 포트 8086. R8 코드 변경 후 실제 DB preview/컨테이너는 실행하지 않음 | 기존 기록 보존, R8 재실측 미검증 |

특히 시드 기준 `partnerCode` 1,911건 부재는 데이터/상류 계약 결함이다. R8은 잘못된 요청을 보내지 않도록 막았지만, 실 원본이 없으므로 해당 결함이 시드에만 있는지 실 데이터에서 확정하지 않았다.

## 6. 변경 파일별 +N/−M

최종 diff 기준:

```text
clients/desktop/src/renderer/routes/DispatchSmsPage.test.ts                         +5/-4
clients/desktop/src/renderer/routes/DispatchSmsPage.tsx                              +18/-6
infrastructure/docker-compose.local-all.yml                                           +1/-0
infrastructure/docker-compose.prod.yml                                                +1/-0
services/notification-service/src/main/java/.../DispatchBatchPreviewService.java    +13/-2
services/notification-service/src/main/java/.../DispatchBatchSendService.java       +3/-1
services/notification-service/src/test/java/.../DispatchBatchSendServiceTest.java   +8/-6
docs/dev-reports/2026-08-02-1013-r8-message-limit-and-wiring-fix.md                  신규
```

## 7. 새 파일 경로 목록

- `docs/dev-reports/2026-08-02-1013-r8-message-limit-and-wiring-fix.md`

기존 `docs/dev-reports/2026-08-02-1013-*.md`는 수정·덮어쓰기·축약하지 않았다.
