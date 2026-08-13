# 1143 구성품 특징·형상 표면 — LUNA 구현 보고

## 범위

- `bundle_component.component_shape` 신설.
- `component_variant`와 형상 분리 API/도메인 반영.
- 형상 후보는 `(없음)·원형·사각`, 항상 활성이다.
- 형상 값 자체가 360 판넬 여부의 정의다. 빈 값이면 360 판넬이 아니다. 별도 판정 플래그·정규식은 만들지 않았다.
- 화면에 특징, 형상, 수량 동기화, 비중, 고정금액, 반올림 단위를 추가했다.
- 특징 변경 시 `componentProductCode`를 변경하지 않는 replace payload를 유지했다.

## RED 원문

### 백엔드 불변식 1·4

```text
BundleComponentShapeContractTest > componentShape_is_a_persisted_row_attribute_without_changing_componentProductCode() FAILED
java.lang.NoSuchFieldException: componentShape

BundleComponentShapeContractTest > migration_declares_shape_and_preserves_every_source_variant_row() FAILED
java.nio.file.NoSuchFileException: src/main/resources/db/migration/V40__bundle_component_shape.sql
```

### 데스크톱 표면 — 최종 GREEN

초기 RED 테스트는 레거시 테스트 파일 내부에 잘못 삽입되어 0 tests/transform error가 발생했다. 위치를 정리한 뒤 실행 가능한 12개 테스트 중 기존 10개는 통과했고 새 표면 테스트 2개는 다음으로 실패했다.

```text
renders kind-specific feature choices ... FAILED
Unable to find a label with the text of: 특징

renders qty sync, allocation weight, fixed amount, and rounding fields ... FAILED
Unable to find a label with the text of: 수량 동기화
```

원인은 한글 파일 인코딩이 아니었다. 테스트용 design-system mock이 `label`을 input에 연결하지 않고 span으로 렌더해 `getByLabelText`가 실패했고, 구성품 query가 완료되기 전 label을 조회했다. 실제 row의 `textContent`와 select 구조를 덤프해 확인한 뒤 테스트를 수정했다.

```text
npx vitest run --run src/renderer/routes/ProductFormPage.test.tsx --reporter=dot
✓ ProductFormPage.test.tsx (12 tests)
12 passed, 0 failed
```

## GREEN/검증 원문

```text
./gradlew :services:product-service:compileJava :services:product-service:compileTestJava --no-daemon
BUILD SUCCESSFUL

npm run typecheck
exit code 0
```

기존 데스크톱 테스트 10개는 신규 UI 테스트를 활성화하기 전 PASS했다. 신규 UI 테스트 포함 실행은 위 RED 상태다.

## 마이그레이션 카운트

공유 DB는 쓰지 않았다. `samhan-postgres`에서 custom-format dump를 파일로 복사하고 별도 `samhan-1143-isolated` PostgreSQL 16 컨테이너에 restore했다. 복제 직후 한글 검증 원문:

```text
SELECT name FROM partners WHERE name ~ '[가-힣]' LIMIT 3;
(주)한국냉동물류
(주)서울택배
대한화물서비스(주)
```

격리 DB 마이그레이션 전 원문:

```text
PANEL 기본 58 · 블랙 37 · 승강 37 · 공청 48
      사각 10
      원형 블랙 10 · 원형 승강 10 · 원형 공청 10
      사각 블랙 10 · 사각 승강 10 · 사각 공청 10
REMOTE 기본 188 · 유선리모컨 62 · 컬러유선리모컨 65
PANEL 합계 250 / REMOTE 합계 315
```

격리 DB V40 적용 NOTICE 원문:

```text
[V40] component_variant non-null before=1448 after=1448; source rows=1174
```

격리 DB 적용 후 원문:

```text
PANEL 특징: 공청 68 / 기본 68 / 블랙 57 / 승강 57 = 250
REMOTE 특징: 기본 188 / 유선 62 / 컬러 65 = 315
PANEL 형상: (NULL) 180 / 원형 30 / 사각 40 = 250
REMOTE 형상: (NULL) 315 = 315
```

기준 합계와 적용 후 합계가 모두 일치한다. `source rows=1174`는 PANEL/REMOTE만이 아니라 전체 active 구성품의 audit 합계이며, PANEL/REMOTE 보존 검증은 위 kind별 SELECT로 별도로 확인했다.

## 불변식 재확인

1. `componentProductCode`: 서비스의 자연키를 수정하지 않고 `componentShape`/`componentVariant`만 저장하도록 반영했다. 신규 surface 테스트 GREEN.
2. PANEL 후보 `기본·블랙·승강·공청`, REMOTE 후보 `기본·유선·컬러`를 UI 상수로 반영했다. 신규 surface 테스트 GREEN.
3. 개발책임자 철회 반영: 형상은 항상 활성이고 빈 값은 360 판넬 아님이다. 게이트는 넣지 않았다.
4. V40 백필 규칙과 audit를 추가했다. 격리 DB 전후 PANEL 250/250, REMOTE 315/315로 검증했다.
5. 기존 backend 축(`qtyMode`, allocation mode/weight/fixed amount)을 API와 화면 payload에 보존했다. 무변경 200/AUTO 4+6, 비중 합 9의 400 한국어 문구, FIXED 신규 45,375의 격리 왕복 검증은 이번 라운드에서 수행하지 못했다.

## 개발책임자 확인 요청 대상 — 변경하지 않음

- 단독 `사각` 10건이 실제 품목명과 맞는지 확인하지 못했다. V40은 지시대로 `기본/사각`으로 해석하는 SQL만 기록했다.
- `OUTDOOR`의 `S6-1111-MANUAL` 1건은 변경하지 않았다.
- 형상 보유 70건/미보유 180건 분류축 조사는 개발책임자 지시에 따라 취소했고 수행하지 않았다.

## 라운드 종료 점검

```text
git diff --name-status origin/main...HEAD -- tools/.s24-build-only/build/deep/tracked-writer.mjs
(출력 없음)
```

추적 파일 삭제는 확인되지 않았다. 이번 라운드가 만든 Gradle Java 프로세스는 종료했다. Codex 런타임 node 프로세스와 Docker Desktop은 건드리지 않았다. 공유 컨테이너·임시 DB는 생성하지 않았다.
## 2026-08-12 추가 검증 정정

앞선 본문에 남아 있던 “신규 UI 테스트 RED”, “격리 DB 미검증” 문장은 이 추가 라운드에서 해소되었다. 최종 원문:

```text
Desktop ProductFormPage.test.tsx: 12 passed, 0 failed
Product BundleComponentShapeContractTest: BUILD SUCCESSFUL
Desktop typecheck: exit code 0
Isolation before: PANEL 250, REMOTE 315
Isolation after feature: PANEL 68/68/57/57 = 250; REMOTE 188/62/65 = 315
Isolation after shape: PANEL NULL 180 / 원형 30 / 사각 40 = 250; REMOTE NULL 315
NOTICE: before=1448 after=1448; source rows=1174
Korean partner names restored and verified: 3 rows
Isolation container and dump directory removed.
```
