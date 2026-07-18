# #825 슬4 — 칩 복수선택 표준 컴포넌트 foundation (기획 spec · CODEX 기획검수 7-BLOCKING 반영)

- 에픽: #825 전역 입력 UX (슬4/7) · 브랜치 `feat/825-s4-chip-multiselect`
- 기준일: 2026-07-18 · 진실원: 슬4 정찰 + CODEX SOL 기획검수 · 슬1~3 동형
- [[feedback_chip_ui_multi_input]] · [[feedback_reconvergence_before_merge]]

## 0. 개발책임자 결정
| # | 결정 |
|---|---|
| D-S4-01 | foundation = **인라인 기본**(에픽 "모달"은 특수케이스 후속) |
| D-S4-02 | **리팩터+신규 표준 컴포넌트** — ⚠️**[[feedback_chip_ui_multi_input]] "TagChip+AsyncAutocomplete 재사용·신규금지"(2026-06-14) supersede**: 신규 표준 컴포넌트는 **두 primitive를 조합·패키지**(재발명 아님·각자 hand-roll 제거). 메모리·DECISIONS 갱신 |
| D-S4-03 | free-text 칩 = **별도 `FreeTextChipInput`**(엔티티 검색 없음·MultiSelect에 합치지 않음) |
| D-S4-04 | 세금계산서 묶음발행(원천전표 List) = (c) 후속·표 checkbox 유지 |
| D-S4-05 | CodefImportScope(빈 범주→전체 materialize 상태머신) = **슬5 이관**(① null-semantics) |

## 1. 스코프

### ① design-system — `MultiSelectAutocomplete<TOption, TSelected>` (신규·조합 표준)
AsyncAutocomplete(슬3·검색·opaque DOM id·하이라이트) + TagChip 리스트 조합. **CODEX BLOCKING 반영**:
- **[B2] Async props passthrough**: `search`·`getInputLabel`·`renderOption`·`listboxLabel`(필수) + `ariaLabel`·`inputTestId`·`placeholder`·`required`·`minChars`·`disabled` 전달. 칩=**`getChipProps(item,index)`/`renderChip`**(TagChip `label:value` 계약·결재작성 `순번:실명`·설정 `그룹|사원:이름` 보존).
- **[B3] 멀티 ARIA**: 선택 완료 key를 **검색결과에서 필터**(base 무변경·aria-selected 오류 회피). getKey dedup.
- **[B4] delta API 분리**: `TOption`(검색후보)/`TSelected`(저장값) 분리 + **`onAdd(option)`·`onRemove(selected)`** delta 계약(단순 onChange(array) 아님). 소비처 adapter가 mutation 호출.
- **[권고] max/disabled 분리**(max 도달=검색만 정지·기존 칩 제거 유지)·**remove 후 입력 focus 복귀**(TagChip ref는 span·remove 버튼 별도).
- UUID DOM 비노출(슬3 opaque id 상속·칩 label=실명/번호·getKey React key/dedup 전용).
- 산출: Storybook·vitest·contrast·**Playwright mock 스위트**(§5 행동 매트릭스).

### ② design-system — `FreeTextChipInput` (D-S4-03·B6)
임의 문자열→칩(엔티티 검색 없음). **계약**: `value:string[]`·`onChange(string[])`·trim·**dedup(대소문자·순서보존·첫우선)**·쉼표 paste 분해·**IME `isComposing` 가드**·Enter/쉼표 구분·빈값 차단·max길이. TagInput(Record kv) **미재사용**(순서형 string[] 부적합).

### ③ 전환 (D-S4-02·B5)
- **리팩터**: `GroupwareApprovalCreatePage`(결재선/추가결재자·`:506-548`) — **[B5] default-prefill 경합**(edit version 캡처·add/delete version 증가·배열 순서=`approverIds` payload)·중복차단·remove 재번호를 adapter가 보존. 검색소스=사원만. `minChars=2`·required·testid. / `ApprovalLineConfigPage`(역할별 결재자·`:784-815`) — **[B4] delta**(getKey=`${type}:${refId}`·add POST·remove=저장 `id` DELETE·pending 비-UUID DELETE 차단·낙관 추가/치환/rollback)·검색소스=GROUP+USER. `minChars=1`·compact ariaLabel.
- **신규**: `GroupwareApprovalTemplateAdminPage`(SELECT 옵션·`:96-114,264`) → FreeTextChipInput. **저장 계약=`optionsJson`(JSON 배열 문자열·CSV 아님·1000자 `ApprovalTemplateRequest:30`)** 보존.

### ④ 감사 dev-report
§3 감사표(정정판) 박제. 슬6 쪽지 수신자 칩도 분류.

## 2. 정찰 확증·정정
- `TagChip`(label:value·ref=span)·`AsyncAutocomplete`(단일·opaque id)·`TagInput`(Record kv·미적합). **엔티티 복수선택 컴포넌트 부재**.
- **동형 hand-roll=2화면**(결재작성·결재선설정). CODEF=checkbox+TagChip(→슬5)·결재양식=CSV Input(→신규).
- inventory **정정**: `Batch*InstanceRequest`(스칼라·칩 제외) 맞으나 `BatchBalanceRequest`=`List<UUID>`(API 일괄조회·사용자입력 아님·칩 제외 유지). "6종 전부 스칼라"는 부정확.

## 3. 감사표(요약)
- **이미칩(리팩터)**: 결재작성 결재선/추가결재자·결재선설정 역할별. **이미칩(참조·무변경)**: 첨부(문서참조+파일). **슬5 이관**: CODEF 범위. **(a)신규**: 결재양식 옵션(CSV→FreeTextChip). **(c)후속**: 세금계산서 묶음발행(표 checkbox). **(b)유지**: 권한그룹(M:N)·발송금지(슬2)·세트/사양(표). **후속**: 슬6 쪽지 수신자.

## 4. 기존 결정 교차검증
UUID 비공개(opaque id 상속)·**칩 memory supersede 명시(D-S4-02)**·design-system 변경=Playwright mock·공유 base(AsyncAutocomplete/TagChip) 무회귀·무결성(슬5 경계).

## 5. 검증 — 행동 무회귀 매트릭스 (B7)
- **foundation**: 2연속추가·getKey dedup(중복 no-op)·max 도달(검색 정지·제거 유지)·remove→입력 focus·Tab+Enter/Space 제거·disabled·**UUID(option id·aria-activedescendant·chip 속성 모두 미노출)**.
- **결재작성 리팩터**: 2명 연속추가·중복차단·**순서=payload approverIds**·remove 재번호·**prefill 경합(기본결재자 로드가 사용자수정 미덮음)**·minChars=2·required.
- **결재선설정 리팩터**: GROUP/USER 복합키·**add POST 1회**·pending→실 id 치환·rollback·**실 id DELETE**·pending 제거 차단.
- **free-text**: 기존 양식 edit round-trip·순서·IME·delimiter·dedup·빈 SELECT 차단·optionsJson.
- mock spec은 hard gate ignore 대상 아닌 경로(`playwright.config.ts` testIgnore 회피).
- FE: DS vitest/build/typecheck·desktop typecheck/vitest. 라이브 QA(결재 생성 결재선 복수선택 칩+DOM UUID 미노출). 적대검증×2+재수렴(2-model).

## 6. 리스크
리팩터 무회귀(결재작성 prefill 경합·순서·결재선설정 delta/pending·co-edit)가 최대 위험. 공유 base blast radius(AsyncAutocomplete/TagChip 전 소비처).

## 7. 팀 배치 (구현=CODEX LUNA)
- design-system: MultiSelectAutocomplete(delta·filter-selected·chip props) + FreeTextChipInput + Storybook/vitest/contrast.
- FE: 결재작성·결재선설정 리팩터(adapter로 prefill/delta 보존) + 결재양식 신규. 감사 dev-report.

---
연관 Issue: #825
