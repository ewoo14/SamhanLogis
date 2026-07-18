# #845 DS-1 문서 양식 렌더러 Foundation — 개발 보고서

기준일: 2026-07-18 · PR #846 · 브랜치 `feat/845-ds1-form-renderer-foundation`
에픽: #845 문서 양식 디자이너(이카운트식 WYSIWYG 폼 엔진) · 파일럿=결재 문서

## 1. 목표
결재 문서 인쇄/미리보기 렌더를 **코드 정의 → 데이터(템플릿) 정의**로 전환하는 엔진의 뼈대. **출력 100% 무변경**(strangler)이 최우선 수용 기준. 편집기/자유 geometry/DB 저장은 후속(DS-2~4).

## 2. 산출 (FE 전용·BE/DB/마이그 없음)
| 영역 | 파일 | 내용 |
|---|---|---|
| 스키마/parser | `print/templateSchema.ts` | `TemplateEnvelope`·`DocElement` discriminated union·`parseDocumentTemplate`(허용밴드·singleton·중복key·미지원 거부·`GROUPWARE_DEFAULT` fallback)·`paperToPrintLayout` exhaustive |
| 기본 템플릿 | `print/approvalDefaultTemplate.ts` | 현 레이아웃 1:1 디스크립터 + `resolveApprovalDocumentTemplate`(docType `GROUPWARE_${code}`) |
| 렌더 모델 | `print/approvalRenderModel.ts` | `buildApprovalRenderModel`(UUID-stripped·projection slot 동형·기존 `approvalDoc.ts` 헬퍼 재사용·신규 포맷로직 0) + `FrozenApprovalDocInput` |
| compiler/renderer | `print/DocumentRenderer.tsx` | `compileApprovalDocument`(PrintLayoutProps 동형·paper) + `DocumentRenderer`(backTo prop·wrapper 0) |
| 독립 오라클 | `print/__frozen__/FrozenApprovalDocLegacy.tsx` | 리팩터 전 렌더 verbatim 복사(불변·신규 경로 미공유) |
| 본문 추출 | `print/LegacyApprovalDocBody.tsx` | 현 본문 3섹션(인라인 style)·외곽 div 1회 |
| 전환 | `print/ApprovalDocView.tsx` | 3-fetch/오류의미 보존 + DocumentRenderer 경유 |
| 회귀 가드 | fixture F1~F14 + `__goldens__/` 17 HTML + `approvalRenderGolden.test.tsx`(frozen===golden AND new===golden) + fetch-state/compiler/schema 테스트 + Playwright screen/print sanity |

## 3. 설계 핵심 (CODEX SOL 기획검수 4라운드 GO)
- **strangler**: `global.css`·`PrintLayout`·`@page`·CSS 일절 무변경 → 회귀 표면 = DOM 뿐 → DOM 동일 = 픽셀·pagination 동일(논거).
- **2단계 compiler**: 요소→고정 slot(PrintLayoutProps 동형)→단일 legacy projection. 밴드 wrapper 0.
- **독립 frozen 오라클**: verbatim 복사가 신규 model/compiler 미공유 → `new===frozen===golden` 순환 아님. 골든은 frozen에서 생성(생성 시 `new===frozen` 단언·`DS1_GOLDEN_UPDATE` env 게이트·`vitest -u` 무력).
- **sanitized model + parser 불변식**: binding allowlist·discriminated union·UUID-stripped → UUID 스키마 수준 차단.
- 기획검수 R1(BLOCKING4·HIGH5·MED2)→R2(잔여3)→R3(BLOCKING1·HIGH2)→R4 GO. 2-model이 spec을 대폭 정밀화.

## 4. 적대검증 (OPUS R1 5차원)
- BE·Design/a11y·FE: **신규 HIGH/MED 0**(frozen verbatim·게이트 우회불가·strangler airtight·DTO 정합 확증).
- **DevOps: HIGH 1(CI 실증)** — ac-845 Playwright 스펙이 지어낸 id 사용→mock 404→하드게이트 RED(page.route no-op 트랩). → **fix**(mock 시드 id `77777777-aaaa-...` 사용·스샷 실캡처·UUID 단언 실효화).
- **QA: MED 2** — UUID 가드 사각(비-UUID fixture)·fixture 개수 가드 부재. → **fix**.
- 골든 게이트·fetch-state·무회귀·CI vitest 실행 genuine 확증.

## 5. 검증
- desktop typecheck·vitest **123 files / 890 tests**(golden 17·schema 11·compiler 5·전환 6·생성가드 1 포함)·strangler 불변식(global.css/PrintLayout 무변경) 확인.
- 라이브QA: 실서버 결재문서 인쇄 미리보기 전후 동일(R1 fix 후 스샷).

## 6. DS-2 이관 대비 (개발책임자 처분 대기 LOW·DS-1 무해)
- docType `GROUPWARE_DEFAULT` sentinel이 code="DEFAULT"와 충돌 가능 → DS-2서 sentinel 예약.
- `resolveApprovalDocumentTemplate` shallow-spread가 `document` 참조 공유 → DS-2 deep-clone/freeze.
- 비기본 템플릿(band 재정렬/생략) compiler 분기 test-debt → DS-2 fixture.
- `build:print-renderer` CI 미검증(사전존재)·frozen hash 가드 부재(주석뿐).

---
연관 Issue: #845
