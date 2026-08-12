# #1090 S1 — 분류 정본 전환 작업 보고서 (CODEX LUNA)

> 작업일: 2026-08-12 KST
> 범위: #1090 분류 정본 전환만
> 제외: #1140 단가변동 명칭, `classification.fixed_discount_rate` 퍼센트 축

## 결론

이번 라운드에서는 운영 코드·마이그레이션·공유 DB를 변경하지 못했다. RED 테스트 3건만 작성했으며, 테스트 실행은 worktree 의존성 부재로 기능 RED까지 도달하지 못했다.

구현을 중단한 이유는 다음 두 가지다.

1. 정찰 보고서의 원문 수치(활성 2,982 / 레거시 331 / 미분류 113)와 현재 격리 복제본의 동일 판별식 결과(활성 2,982 / 레거시 251 / 미분류 64)가 불일치한다.
2. 현재 분류 트리의 하나의 L 분류에 `DELUXE`, `GRADE1`, `STAND`가 동시에 걸리는 품목이 있어, 단일 `Classification` 속성에 임의로 하나를 기록하면 금액 불변식이 깨질 수 있다.

따라서 218건 이관을 추측으로 수행하거나 113건 목록을 현재 복제본에서 64건으로 대체하지 않았다.

## RED 원문

작성 파일:

- `clients/desktop/src/renderer/utils/slipDiscount.classification-canon.test.ts`

작성한 실패 기대는 다음과 같다.

```text
분류가 미분류면 모델코드 레거시 판별을 사용하지 않는다
분류의 360 옵션만으로 정액을 적용한다
대표 품목의 정본 전환 전후 금액이 보존된다
```

첫 실행은 상위 저장소를 잘못 가리켜 대상 테스트를 찾지 못했다. 이는 기능 RED가 아니므로 RED 근거에서 제외한다.

올바른 worktree에서 `npm test -- --run ...`을 실행했을 때 실제 출력은 다음과 같다.

```text
MUTATION_RED ... @typescript-eslint/parser ... Cannot find module
pretest: 3 failed, 2 passed
vitest 대상 테스트까지 도달하지 못함
```

pretest를 우회해 `npx vitest`를 직접 실행한 결과도 다음과 같다.

```text
Could not resolve 'vitest/config'
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vitest'
```

요청된 Desktop 타입검증도 실행했으나 로컬 파생물/의존성 선행 조건에서 중단됐다.

```text
electron-updater가 설치된 node_modules에 없습니다. clients/desktop에서 npm ci 를 먼저 실행하십시오.
file: 의존 design-system dist이(가) 없습니다: ..\\web\\design-system\\dist\\index.d.ts
```

즉, 테스트 소스는 RED 의도로 작성했지만 의존성 부재 때문에 “기능이 없어서 실패한 RED”라는 원문까지는 확보하지 못했다. GREEN 구현도 하지 않았다.

## 이관 전후 건수

정찰 보고서 원문:

```text
활성 품목                 2,982
레거시 모델코드 판별        331
discount_flags 비영          8
교집합                        0
레거시 판별 + 분류 존재      218
레거시 판별 + 분류 없음      113
```

이번 작업의 실제 이관 결과:

```text
이관 전                    331 (보고서 기준)
이관 후                      0 (구현 중단)
분류 존재 218건 이관          0
미분류 113건 자동 입력        0
```

공유 개발 DB는 SELECT만 수행했다. UTF-8 확인용으로 요청된 `partners` 조회는 `product_db`에 해당 테이블이 없어 실행되지 않았다.

```text
ERROR: relation "partners" does not exist
```

현재 복제본에서 동일 판별식으로 다시 센 값은 다음과 같다.

```text
활성 품목                 2,982
레거시 모델코드 판별        251
분류 존재                  187
분류 없음                   64
discount_flags 교집합        0
```

이 값은 정찰 보고서의 331/218/113을 대체하지 않는다. 데이터 스냅샷 또는 판별식 버전이 다르므로 개발책임자 확인 대상이다.

## 현재 복제본에서 확인된 미분류 목록

정찰 보고서에는 113건의 개별 품목 목록이 포함되어 있지 않았다. 현재 복제본에서 확인된 64건은 다음과 같다. 이 목록을 정찰 보고서의 113건 목록으로 간주하지 않았다.

```text
AC023BN1DBC1, AC023BN1PBH1, AC023BX1DBC1, AC023BX1PBH1,
AC032BN1DBC1, AC032BN1PBH1, AC032BX1DBC1, AC032BX1PBH1,
AC040BN1PBH1, AC040BX1PBH1, AC052BN1DBC1, AC052BN1PBH1,
AC052BX1DBC1, AC052BX1PBH1, AC060BN1DBC1, AC060BN1DBH1,
AC060BN4DBC1, AC060BN6PBH1, AC060BX1DBH1, AC072BN1DBC1,
AC072BN1DBH1, AC072BN4DBC1, AC072BN4PBH1, AC072BN6PBH1,
AC072BX1DBC1, AC072BX1DBH1, AC083BN4DBC1, AC090BN4DBH1,
AC090BN6PBH1, AC100BN4DBC1, AC100BN4PHH1, AC100BN6PBH1,
AC100CN6PHH1, AC110BN4DBC1, AC110BN4DBH1, AC110BN4PBH1PP,
AC110BN4PHH1, AC110BN6PBH1, AC110CN4PHH1, AC110CN6PHH1,
AC130BN4PHH1, AC130BN6PBH1, AC130CN6PHH1, AC145BN4DBC1,
AC145BN4DBH1, AC145BN4PBH1, AC145BN6PBH1, AC160BN4DBH1,
AP083ANPFBH1PP, AP083AXPFBH1PP, AP083CNPFBH6PP, AP130RNPPHH1,
AP230CNPDHH1, AP230CNPDHH1PP, AP230CXPDHH1, AP230CXPDHH1PP,
AP230RNPDHH1, AP230RXPDHH1, AP290CNPDHH1, AP290CNPDHH1PP,
AP290CXPDHH1, AP290CXPDHH1PP, AP290RNPDHH1, AP290RXPDHH1
```

## 분류 속성 매핑 충돌

현재 복제본의 레거시 판별 + L 분류 집계에서 다음 충돌이 확인됐다.

```text
SINGLE_SET / 냉난방 스탠드 / 59건 / DELUXE,GRADE1,STAND
```

따라서 `Classification`에 단일 enum 하나만 추가하고 L 분류에 하나를 선택하면 다른 품목의 정액액이 바뀔 수 있다. 이 선택은 자동 처리하지 않았다.

113건의 미분류 저장 방식은 다음 후보를 개발책임자 확정 대상으로 남긴다.

1. 기존 L/M/S 트리 안에 업무 분류 노드를 추가하고 품목이 그 노드를 참조한다.
2. L/M/S 조합별 6종 매핑 테이블을 별도로 두고, 미분류 품목은 매핑하지 않는다.
3. 품목별 분류 override를 별도 저장하되, 분류 정본의 보조 편집 경로로만 허용한다.

이번 보고서에서는 어느 후보도 선택하지 않았다.

## 금액 전후 대조

대표 품목의 전후 금액 대조는 구현이 중단되어 완료하지 못했다. 따라서 금액 불변식은 통과로 보고하지 않는다.

RED 테스트에는 대표 금액 보존 단정을 포함했지만, Desktop 테스트 런너 의존성(`vitest`, `@typescript-eslint/parser`) 부재로 해당 테스트 함수가 실행되지 않았다.

## 용어 충돌

`classification.fixed_discount_rate`는 퍼센트 고정DC 축이고, #1090의 거래처별 옵션 정액 6종은 전역DC 축이다. 두 축을 섞지 않았다.

현재 화면의 `정액DC율(%)`은 퍼센트와 정액을 동시에 암시하여 충돌한다. 새 명칭은 정하지 않는다. 기존 용어 규칙상 검토 후보는 다음뿐이다.

- `고정DC`
- `전역DC`
- `기본 할인율`

`약정DC`는 후보에서 제외한다. 이 프로젝트에 존재하지 않는 용어다.

## 마이그레이션 번호 점검

```text
현재 브랜치 최대 번호: V37
main 최대 번호:       V37
머지되지 않은 다른 브랜치(feat/1111-1143-bundle-component): V39 존재
```

이번에는 마이그레이션을 만들지 않았으므로 새 번호를 사용하지 않았다. 구현 재개 시 V39 충돌을 포함해 번호를 다시 확인해야 한다.

## 못 한 것

- classification 6종 속성의 물리 스키마 및 API 구현
- 보고서 기준 218건 이관
- `discount_flags` 및 모델코드 판별의 런타임 제거
- 113건 원문 전체 목록 확정
- 대표 품목 견적·주문 금액 전후 대조
- 변경 서비스 전량 테스트 및 `clients/desktop` `npm run typecheck`
- 의존성 문제 해결 및 기능 RED→GREEN 실행

## 라운드 종료 점검

```text
추적 파일 tools/.s24-build-only/build/deep/tracked-writer.mjs: 삭제되지 않음
git 변경 계열 명령: 사용하지 않음 (status/branch/log/show/ls-tree 조회만 수행)
공유 DB: SELECT만 수행, 쓰기 없음
격리 컨테이너/임시 디렉터리: 새로 생성하지 않음
작업 중 생성 프로세스: 남기지 않음
```
