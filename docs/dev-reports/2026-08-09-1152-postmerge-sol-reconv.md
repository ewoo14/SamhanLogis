# PR #1152 병합 후 SOL 5.6 적대검증 재수렴

## 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\tnongoods`
- 브랜치: `feat/896-non-goods-estimate`
- 검증 요청 HEAD / 실측 HEAD: `f8d21df9c` / `f8d21df9c992e966fb6598108b67a4437b76e96d` (일치)
- Desktop 후보 포트: `127.0.0.1:5175`는 `FREE`. 배포본 불일치를 먼저 발견해 Vite를 기동하지 않았으므로 `strictPort` 프로세스는 없다.
- 네트워크로 확인한 호출 API:
  - `GET http://127.0.0.1:8080/actuator/health -> 200`
  - `GET http://127.0.0.1:8084/actuator/health -> 200`
  - `GET http://127.0.0.1:8085/actuator/health -> 200`
- `8080`, `8084`, `8085`는 모두 LISTEN이었다.
- HEAD에서 fresh `bootJar`를 만들었다. 명령은 `.\gradlew.bat :services:inventory-service:bootJar :services:product-service:bootJar --no-daemon`, 결과는 `BUILD SUCCESSFUL`(21 actionable tasks, 2 executed)이다.

### 배포본 HEAD 확인 — 실패

```text
HEAD f8d21df9c fresh inventory JAR = 9210778f6dcaab098d95e1597f71a1561786f1fa967d8f4af699835d29fa3530
deployed samhan-inventory-service = 15c870f8c6112857cf7a296bb8b7cdb3954e4f6c08e48531c13ede0cdb8b68a1

HEAD f8d21df9c fresh product JAR = 209de60bed8bf1fb8e2bf13ceb43cda3aebd6b718327478c8cd28024adde6ab4
deployed samhan-product-service = e34c0836b31c533fb331f03a113acd3c789462e92c584785d5b50a3770f98d6a
```

두 서비스 모두 불일치한다. Docker metadata도 inventory 컨테이너의 compose working directory를 다음처럼 가리켰다.

```text
samhan-inventory-service compose working_dir
= C:\dev\Samhan-Public\.claude\worktrees\t1113\infrastructure

samhan-product-service compose working_dir
= C:\dev\Samhan-Public\.claude\worktrees\tnongoods\infrastructure
```

product 컨테이너가 같은 워크트리에서 만들어졌다는 metadata만으로 현재 HEAD 배포를 뜻하지 않으며, 실제 JAR SHA가 fresh HEAD JAR과 다르다. 따라서 현재 라이브 스택은 `f8d21df9c` 배포본이 아니다.

개발책임자의 “전제가 틀렸다면 고치지 말고 중단·보고” 지시에 따라 컨테이너 재빌드·교체·재배포를 하지 않았고, Playwright Chromium도 기동하지 않았다.

## 판정

```text
발화 조건 — TARGET_HEAD(f8d21df9c) 배포 표본: 0
실 사용자 경로 결함 여부: 판정 불가
머지 판단: 보류
```

셋째 가능성이 실제로 성립한다. 현재 스택은 건강하지만 검증 대상 HEAD가 아니므로, 여기서 GUI가 통과해도 구배포본 통과이고 실패해도 대상 HEAD 결함이라고 귀속할 수 없다.

## 각도 1 — 본래 기능

### 발화 조건 카운트

```text
TARGET_HEAD Desktop 배포본 = 0
TARGET_HEAD 실 GUI 실행 = 0
```

따라서 “견적품목 메뉴에서 비상품 지정 → 견적에서 납품가 입력 → 수량 자동 1”은 이번 라운드에서 판정하지 않았다. 잘못된 배포본을 밟아 증거를 만들지 않기 위해 HashRouter 화면 이동, 인증, 품목 선택, 저장 시도 모두 하지 않았다.

스크린샷: 없음.

## 각도 2 — 충돌 해소와 `shipBatch` 4인자

### 발화 조건 카운트

production Java 전수 검색 원문:

```text
StockInstanceService.java:210  4인자 메서드 선언
StockInstanceService.java:212  return shipBatch(..., outboundAt, null)
StockInstanceService.java:216  5인자 메서드 선언
StockInstanceController.java:155  controller는 5인자 호출
StockInstanceServiceOutboundTest.java:194  4인자 호출 1곳
```

즉 실 HTTP 사용자 경로의 4인자 호출점은 **0곳**이고, 현재 저장소에서 4인자를 직접 호출하는 곳은 기존 단위 테스트 1곳뿐이다. 해당 테스트는 `SourceOperationJournalWriter` mock을 사용하므로 실제 writer의 null 계약을 실행하지 않는다.

충돌 해소 코드와 실제 writer 계약은 정적으로 모순된다.

```java
public List<StockInstance> shipBatch(..., LocalDateTime outboundAt) {
    return shipBatch(..., outboundAt, null);
}
```

```java
if (context == null || context.slipId() == null || context.slipRevision() == null) {
    throw new BusinessException(ErrorCode.INVALID_INPUT,
            "sourceContext 의 slipId/slipRevision 은 재고 mutation journal에 필수입니다");
}
```

따라서 실제 writer를 연결한 4인자 호출은 “출고는 정상 처리되지만 journal이 조용히 안 남는” 형태가 아니다. `recordSource`에서 `INVALID_INPUT`이 발생하고 `@Transactional` 범위가 롤백될 코드다. 다만 검증 대상 배포본이 없어 실제 DB 전이·롤백을 실행하지 않았으므로 이 정적 모순을 이번 라운드의 **실 사용자 도달 결함**으로 세지는 않는다.

스크린샷: 없음.

## 각도 3 — Flyway V23 → V24 → V25

### 발화 조건 카운트

```text
TARGET_HEAD inventory 배포본 = 0
TARGET_HEAD Flyway 기동 = 0
```

배포본 전제 실패 뒤 중단했으므로 `flyway_schema_history`를 조회하거나 일회용 DB를 기동하지 않았다. 현재 공유 DB의 history를 읽더라도 어느 JAR이 적용한 결과인지 대상 HEAD에 귀속할 수 없어 이번 라운드의 순서 증거가 되지 않는다.

SQL 원문: 실행 없음.

## 각도 4 — product-service 겹침

### 발화 조건 카운트

```text
TARGET_HEAD product-service 배포본 = 0
TARGET_HEAD 품목 GUI 실행 = 0
```

`#1127`이 병합된 현재 HEAD에서 fresh product JAR SHA는 배포 JAR과 다르다. 따라서 `totalUnchangedRows` 개명과 `SheetSyncPage` 비고가 포함된 병합본을 실 화면으로 밟지 않았다. 코드 겹침 여부를 실 GUI 결과로 판정하지 않는다.

스크린샷: 없음.

## SQL 원문

없음. 배포본 전제 불일치 확인 직후 중단했으며 공유 DB write/INSERT는 수행하지 않았다.

## 스크린샷 경로

없음. `docs/qa/2026-08-09-1152-postmerge/`도 생성하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-09-1152-postmerge-sol-reconv.md`

git commit / push, 다른 워크트리 조작, main checkout, 컨테이너 교체, DB write는 수행하지 않았다.
