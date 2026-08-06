# PR #1045 적요 저장 fix 라운드

- 범위: 라이브QA 결함 `적요 입력값이 저장되지 않는다` 단일 수정
- 브랜치/HEAD: `feat/1039-provisional-dispatch` / `806c8953f`
- 시작 시각: 2026-08-03 (Asia/Seoul)
- 원칙: RED 재현 후 원인 조사, 최소 수정, GREEN 검증
- 금지: Docker 재빌드·재배포·라이브QA·커밋·푸시·전체 Gradle 스위트·범위 밖 변경

## 진행 로그

### 1. 보고서 생성

- 완료. 이후 단계마다 본 파일에 즉시 append 한다.

### 2. RED 재현

- 직접 생성 경로의 1차 회귀 테스트 후보에 `SlipServiceTest.create_outbound_returnsDraft_andCallsProductLookup`의 응답 `memo` 검증을 추가하여 실행했다.
- 실행 명령: `./gradlew :services:slip-service:test --tests com.samhanair.logis.slip.service.SlipServiceTest.create_outbound_returnsDraft_andCallsProductLookup --no-daemon`
- 결과는 아래와 같이 `BUILD SUCCESSFUL`이었다. 따라서 이 후보는 결함을 재현하는 RED가 아니며 RED 원문으로 보고하지 않는다.

```text
BUILD SUCCESSFUL in 47s
18 actionable tasks: 4 executed, 14 up-to-date
```

- 위 비재현용 assertion은 즉시 제거했다. 운영 코드 수정은 아직 없다.

### 3. 원인 조사

- 라이브QA 기록(`docs/dev-reports/2026-08-03-1039-live-qa.md`)은 일반 전표 생성 후 상세 재조회에서 적요가 빈 값이었다고 기록한다.
- 현재 일반 생성 경로의 코드 인용:

```java
slip = Slip.createOutbound(..., req.deliveryTag(), req.memo(), requesterId);
```

```typescript
memo: memo.trim() || undefined,
```

- 직접 생성 요청 DTO, `Slip.createOutbound`/`createInbound`, entity의 `memo` 컬럼, 상세 응답 변환까지 모두 동일한 `memo` 필드를 연결하고 있어 현재 작업 트리에서 라이브QA 증상을 일으키는 단일 원인은 아직 확인되지 않았다.
- `applyEcountSchema`는 memo를 인자로 받지 않으며 기존 memo를 덮어쓰지 않는다.
- 따라서 RED 테스트 없이 임의의 운영 코드 수정을 진행하지 않았다.

### 4. 수정 및 GREEN 검증

- 대기. RED 미확보 상태이므로 수정하지 않음.

### 5. 생성 경로 전수 점검

- 점검 결과(가배차 저장내역 기준):
  1. `PreClassifyPage` 자동 저장 `AUTO_LATEST`: 사용자 적요 입력 없음, 기본 topic은 서버에서 `자동저장`으로 생성.
  2. `PreClassifyPage` 수동 저장 `MANUAL_NAMED`: `SaveDialog` → `topic` → `saveDispatchHistory` → 서버 entity `topic` 연결됨.
  3. `PreClassifyPage`의 지방가배차 탭 수동 저장: 동일 수동 경로로 연결됨.
  4. `UnassignedPage` 자동 저장: 사용자 적요 입력 없음, `AUTO_LATEST` 기본값 경로.
  5. `UnassignedPage` 수동 저장: `topic` 연결됨.
  6. `DispatchReconcilePage` 자동 저장: 사용자 적요 입력 없음, `AUTO_LATEST` 기본값 경로.
  7. `DispatchReconcilePage` 수동 저장: `topic` 연결됨.
  8. 8개 실행 모드: `PreClassifyPage`의 `executionMode`가 자동/수동 저장의 `requestParams`에 포함됨. 적요(topic)는 모드별 별도 분기 없이 공통 수동 저장 경로를 사용함.
- 결론: 현재 소스상 4개 화면의 수동 생성 경로는 모두 처리되어 있으며, 자동 경로는 사용자 입력 적요를 받지 않는 기존 동작이다.

### 6. 이번 라운드 결론

- RED 원문과 재현 가능한 원인이 확보되지 않아 수정/Green 회귀 검증을 수행하지 못했다.
- 새로 만든 파일: 본 보고서 1개. 테스트/운영 코드 신규 파일 없음.
