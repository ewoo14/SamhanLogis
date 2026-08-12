# #1090 S1 — 분류 정본 전환 구현 보고서 (CODEX LUNA)

> 작업일: 2026-08-13 KST  
> 범위: #1090 분류 정본 전환만  
> 제외: #1140 단가변동 명칭, `classification.fixed_discount_rate` 퍼센트 축

## RED → GREEN 원문

확정 정찰 원문은 `docs/dev-reports/2026-08-13-1090-count-reconciliation-sol.md:9-14,102-186`을 사용했다. 판별식은 `clients/desktop/src/renderer/utils/slipDiscount.ts:112-130`에 기록된 전체 순서와 AP230/AP290 override다.

RED는 `clients/desktop/src/renderer/utils/slipDiscount.classification-canon.test.ts`에 먼저 작성했다.

```text
분류가 미분류면 모델코드 레거시 판별을 사용하지 않는다
분류의 360 옵션만으로 정액을 적용한다
교집합 0을 보존하기 위해 저장된 구형 플래그와 모델코드를 무시한다
대표 품목의 정본 전환 전후 견적·주문 금액이 보존된다
```

기능 RED 원문:

```text
4 tests | 3 failed
expected 70000 to be 100000  (미분류인데 모델코드 AP/AC 판별 발화)
expected 100000 to be 70000  (분류 THREE_SIXTY 미적용)
expected 90000 to be 100000  (구형 플래그/모델코드가 금액 변경)
```

GREEN 구현:

- `Product.discountOption` nullable enum(THREE_SIXTY/FOUR_WAY/ONE_WAY/STAND/DELUXE/FIRST_GRADE) 추가.
- `V42__classification_discount_option_canon.sql`이 분류가 있는 활성 품목만 정찰 원문 순서로 백필한다. 분류가 없는 품목은 NULL이다.
- Desktop `slipDiscount`와 partner-order 계산은 `discountOption`만 정액 옵션의 입력으로 사용한다. `discount_flags`와 모델코드 분기는 정액 계산 경로에서 제거했다.
- 고정DC(`fixed_discount_rate`)와 전역DC율은 변경하지 않았다.

실행 결과:

```text
npx vitest run --run src/renderer/utils/slipDiscount.test.ts src/renderer/utils/slipDiscount.classification-canon.test.ts
Test Files 2 passed / Tests 29 passed

./gradlew :services/product-service:compileJava :services/product-service:compileTestJava --no-daemon
BUILD SUCCESSFUL

./gradlew :services/partner-order-service:compileJava :services/partner-order-service:compileTestJava --no-daemon
BUILD SUCCESSFUL

clients/desktop: npm run typecheck
PASS
```

## 이관 전후 건수

격리 `sol1176-pg/product_db`에서 READ-only로 재확인한 원문:

```text
이관 전 활성 품목                         2,982
이관 전 모델코드 정본 규칙 발화             331
  분류 있음                               218
  분류 없음                               113
discount_flags 비영                         8
legacy_discount_flag=true                  29
세 집합의 모든 쌍별/삼중 교집합              0
```

마이그레이션 적용 후 기대값:

```text
discount_option 비NULL                    218
discount_option NULL (미분류 대기)          113
교집합 유지                                  0
```

공유 DB에는 쓰지 않았다. 이 워크트리에서는 격리 DB에 대한 실제 V42 적용 write도 수행하지 않았으므로, 위 “이관 후”는 migration SQL의 대상 조건과 백필 기대값이다. 실제 적용 후 `count(discount_option)`은 218인지 별도 격리 실행으로 확인해야 한다.

## 분류 없음 113건 — 자동 입력하지 않음

아래는 정찰 원문 판별식으로 발화하지만 L/M/S가 모두 NULL인 전체 목록이다. 개발책임자 확정 전 `discount_option`을 채우지 않는다.

```text
AC023BN1DBC1 AC023BN1PBH1 AC023BX1DBC1 AC023BX1PBH1 AC032BN1DBC1 AC032BN1PBH1 AC032BX1DBC1 AC032BX1PBH1
AC040BN1PBH1 AC040BX1PBH1 AC052BN1DBC1 AC052BN1PBH1 AC052BX1DBC1 AC052BX1PBH1 AC060BN1DBC1 AC060BN1DBH1
AC060BN4DBC1 AC060BN4FBH1PP AC060BN4FBH2 AC060BN6PBH1 AC060BX1DBH1 AC060BXAFBH1PP AC060BXAFBH2 AC060CN4FBH1PP
AC072BN1DBC1 AC072BN1DBH1 AC072BN4DBC1 AC072BN4FBH1PP AC072BN4FBH2 AC072BN4PBH1 AC072BN6PBH1 AC072BX1DBC1
AC072BX1DBH1 AC072BXAFBH1PP AC072BXAFBH2 AC072CN4FBH1PP AC083BN4DBC1 AC090BN4DBH1 AC090BN4FBH1PP AC090BN6PBH1
AC090BXAFBH1PP AC090CN4FBH1PP AC100AX4FHH1PP AC100BN4DBC1 AC100BN4FBH1PP AC100BN4FBH2 AC100BN4PHH1 AC100BN6PBH1
AC100BXAFBH1PP AC100BXAFBH2 AC100BXAFHH1PP AC100BXAFHH2 AC100CN4FBH1PP AC100CN4FHH1 AC100CN4FHH1PP AC100CN6PHH1
AC110AN4FBH1PP AC110AX4FBH1PP AC110AX4FHH1PP AC110BN4DBC1 AC110BN4DBH1 AC110BN4FBH1PP AC110BN4FBH2 AC110BN4PBH1PP
AC110BN4PHH1 AC110BN6PBH1 AC110BXAFBH1PP AC110BXAFBH2 AC110BXAFHH1PP AC110BXAFHH2 AC110CN4FBH1PP AC110CN4FHH1
AC110CN4FHH1PP AC110CN4PHH1 AC110CN6PHH1 AC130AX4FBH1PP AC130BN4FBH1PP AC130BN4PHH1 AC130BN6PBH1 AC130BXAFBH1PP
AC130BXAFHH1PP AC130CN4FBH1PP AC130CN4FHH1 AC130CN4FHH1PP AC130CN6PHH1 AC145BN4DBC1 AC145BN4DBH1 AC145BN4FBH1PP
AC145BN4PBH1 AC145BN6PBH1 AC145BXAFHH1PP AC145CN4FHH1PP AC160BN4DBH1 AP083ANPFBH1PP AP083AXPFBH1PP AP083BNPDBC1
AP083CNPFBH6PP AP110BNPDBC1 AP130RNPPHH1 AP145BNPDHC1 AP145BXPDHC1 AP230CNPDHH1 AP230CNPDHH1PP AP230CXPDHH1
AP230CXPDHH1PP AP230RNPDHH1 AP230RXPDHH1 AP290CNPDHH1 AP290CNPDHH1PP AP290CXPDHH1 AP290CXPDHH1PP AP290RNPDHH1 AP290RXPDHH1
```

## 대표 품목 금액 전후 대조

자동화된 금액 불변 RED/GREEN 표본:

```text
표본 listPrice 100,000 / 기존 STAND 규칙 금액 90,000 / 이관 후 STAND 분류 속성 금액 90,000
분류 없음 + 모델코드 STAND처럼 보이는 입력 / 기존 정액 10,000 / 이관 후 0 / 금액은 100,000 유지
구형 flags만 존재하는 입력 / 기존 정액 10,000 / 이관 후 0 / 금액은 100,000 유지
```

실격리 DB의 대표 품목 판매가는 `AC060BN4DBC1=544,500`, `AC060BN6PBH1=720,500`, `AP230CNPDHH1=1,944,800`으로 확인했다. 거래처별 실제 전역DC 설정과 저장된 견적·주문 라인의 전후 금액까지 대조하는 DB write/재계산은 하지 못했다. 따라서 실거래 금액 불변은 아직 최종 PASS로 보고하지 않는다.

## L단계 혼재 노드 관찰

`SINGLE_SET / 냉난방 스탠드` L 노드 1개에 `DELUXE,GRADE1,STAND`가 나타난다. 개별 품목 복수 플래그는 0이다. 이는 L이 M(`프레스티지`, `프리미엄/디럭스`, `1등급`)을 묶는 계층 설계로 보이며 오염 증거가 아니다. 따라서 L 노드 하나에 옵션 enum 하나를 기록하지 않고 품목 속성으로 이관했다.

## 113건 저장 방식 선택지 — 미결정

1. 기존 L/M/S 트리 안에 업무 분류 노드를 추가하고 품목이 참조한다.
2. L/M/S 조합별 6종 매핑 테이블을 별도로 두고, 미분류 품목은 매핑하지 않는다.
3. 품목별 분류 override를 별도 저장하되 분류 정본의 보조 편집 경로로만 허용한다.

이번 구현은 113건을 어느 선택지에도 자동 배정하지 않았다.

## 용어 충돌

`classification.fixed_discount_rate`는 품목/분류의 퍼센트 고정DC 축이고 #1090 옵션 6종은 거래처 전역DC의 정액 축이다. 현재 `정액DC율(%)`은 정액과 퍼센트를 동시에 말해 충돌한다. 후보는 `고정DC`, `전역DC`, `기본 할인율`이며, `약정DC`는 이 프로젝트 용어가 아니므로 제외한다.

## 마이그레이션 번호

```text
현재 브랜치 기준 기존 최대: V37
main 기준 기존 최대:       V37
머지되지 않은 feat/1111-1143-bundle-component 최대: V41
신규 파일:                  V42__classification_discount_option_canon.sql
```

## 못 한 것

- 격리 DB에 V42를 실제 적용하는 write 및 적용 후 218/113 SQL 재검증.
- 실제 저장된 견적·주문 라인의 대표 금액을 전환 전후 byte 단위로 대조.
- 113건의 저장 방식 선택 및 개발책임자 확정.
- 웹 레거시 GAS와 회계 재검증기의 별도 모델코드 호환 경로 제거. 이번 변경은 Desktop 전표/partner-order 정액 계산 경로로 한정했다.
- `discount_flags` 컬럼 자체의 삭제. 기존 시트 sync/호환 DTO가 참조하므로 별도 deprecation·삭제 결정이 필요하다.

## 라운드 종료 점검

```text
git ls-files --deleted: 빈 출력
tools/.s24-build-only/build/deep/tracked-writer.mjs: PRESENT (삭제되지 않음)
격리 컨테이너: 기존 qa-clone/sol1176 컨테이너만 사용, 새 컨테이너 생성 없음
임시 디렉터리: 작업용 신규 임시 디렉터리 없음
작업 프로세스: 이번 라운드의 npm/Gradle 프로세스 종료 확인 필요
```
