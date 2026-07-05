# 2026-07-05 — #29+#713 분개 작성 폼 완성 (PR #739)

> #737 BE sweep가 적발한 [심각] 저장 계약 불일치(#29·실 BE 400·최초부터 미완) + 분개 라인 BE enrich(#713). 개발책임자 결정=거래처 피커 완전 fix.

## 근본원인 (#29)
JournalFormPage 저장 payload가 BE `CreateJournalLineRequest`와 불일치→실 BE 400: FE `debit/credit/partnerName(자유텍스트)/note` vs BE `debitAmount/creditAmount(@NotNull)/partnerId(UUID)/memo`. 거래처 입력이 자유텍스트(피커 없음)라 partnerId(UUID) 확보 불가. mock.ts echo로 은폐(mock-pass/real-fail·[[feedback_fe_option_type_matches_be_dto]]).

## 구현
- **#29 FE 저장**: payload 필드명 정합·거래처 **AsyncAutocomplete 피커**(name→partnerId)·AccountingPartnerSearchController 검색 API·mock BE DTO 정합(echo 제거).
- **#713 BE enrich**: JournalService 배치 enrich(partnerName=PartnerLookupClient.findByPartnerIdsBatch·accountName=ChartOfAccountRepository.findAllById·N+1 회피)·JournalLineResponse partnerName/accountName 추가·partnerId 제거(UUID 비공개).

## 리뷰 (실행=게시 1:1·모든 라운드 표+라이브 스샷 2곳·Codex 라이브 QA)
Opus 5-agent R1(DevOps0·QA **저장200 실증 YES**·BE[높음]NPE·FE[중]편집+[경미]·Design[HIGH]드롭다운+[MED]피커)+fix(NPE filter·AsyncAutocomplete body **portal**·편집 partnerName 복원/저장차단·mock 매퍼 분리) ↔ Codex 순차 라운드(**Docker 분개 생성 201**·드롭다운 portal·편집 prefill) → 0수렴.

## 검증
- BE: accounting :test --rerun-tasks(JournalControllerIT 9·JournalServiceTest 8·NPE 회귀)·1132 test.
- FE: typecheck0·vitest605·design-system build·AsyncAutocomplete portal·드롭다운 playwright.
- **라이브 QA**: 400→**201** 실증(curl before/after + 실 GUI mock OFF·dev_master·거래처 피커→선택→201·enrich·UUID 비노출). Codex 라운드 Docker 재실증(201·드롭다운 portal 1440/1024). 스샷(SHA-pinned+SendUserFile).

## 후속/교훈
- **mock echo=false-green**([[feedback_inprocess_mock_principles]])·**BE DTO 정확 정합**·**overflow 컨테이너 내 절대배치 드롭다운=portal 필수**(vitest 실레이아웃 없어 미검출→라이브 QA).
- 편집=신규생성 반활성 경로(edit-PATCH 미도입)·향후 edit-PATCH 시 partnerId 복원 설계.
