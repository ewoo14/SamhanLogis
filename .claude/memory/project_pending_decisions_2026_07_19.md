---
name: project_pending_decisions_2026_07_19
description: 2026-07-19 개발책임자가 남은 전 잔여/이슈에 대해 일괄 확정한 결정 배치 + "이후 전부 PM 자율 진행" 위임. 9개 결정 대기 항목 확정·실행 순서·자율 실행 12건. 각 슬라이스는 캐논 워크플로우 엄수. #827/#773만 Google 자격(clasp) 블로커.
metadata:
  type: project
---

**맥락(2026-07-19)**: DS-2 머지 후 개발책임자가 "남은 모든 잔여/이슈 중 결정 필요한 것을 지금 한 번에 결정, 이후 전부 PM 자율 진행"을 지시. 20개 열린 이슈 + 2개 에픽 전수 조사(실 DB probe 4건) 후 9개 결정을 일괄 확정. **이후 착수는 PM 자율**(단 각 항목 캐논 워크플로우 엄수 [[feedback_canonical_workflow]]·chore도 예외 아님 [[feedback_infra_chore_not_canon_exempt]]·무결성 항목도 본 배치로 선확인 완료됐으므로 재확인 불요).

## 확정 결정 (9건)
1. **#845 DS-3 재인쇄 레이아웃 = 승인 당시 pin**(⒜). 결재 완료 문서에 templateId+schema_version(또는 스냅샷) 각인 → 재인쇄 시 그 버전 렌더. 감사/법정 무결성(승인 문서 외형 불변·[[project_accounting_ledger_edit_policy]] 정신). **편집기 MVP 스코프 = 밴드 캔버스 + FIELD/TEXT/APPROVAL_GRID 요소 + 저장·라이브 미리보기**. 반복 detail 밴드·이미지/로고·인쇄 fidelity 반복 = DS-4 분리.
2. **#823 매출전표 배분 거래처 불일치 = 차단 reject**. 거래처 A 출고를 B 매출에 배분 시 4xx 한국어 거부. slip `/internal` 스냅샷에 partnerId 추가 + `verifySourceAndAllocation` 일치 검증. repo 3곳(PartnerOrderMergeConvertService 409·BankDepositReceiptService·CashReceiptService) 동일 "귀속키 단수 수렴 reject" 패턴 일관. 기존 오배분 운영 DB 조사 별도.
3. **전표 거래처 필수화 = 전이 가드**(2026-07-19 재확정·AskUserQuestion). 배치 초안 "단계적(→BE NOT NULL)"은 정찰 반증(활성 null 1942 대부분 DRAFT·정상) → **컬럼 NOT NULL 비채택**. 대신 ⒜ FE 필수화 + ⒝ **BE 생명주기 전이 가드**(DRAFT→SENT/CONFIRMED 전이 시 partner 필수·DRAFT 는 partner 없이 유지 허용). SENT 상태 null 13건(OUTBOUND) = 별도 조사·보정. #823 위 회계체인 다음 슬라이스.
4. **#825 슬5 null-semantics = 신규 입력만 적용**. 기존 null 행 유지(dev daily_closings 0행·안전재고 null 0행). prod cutover 시점 별도 backfill 마이그. ①'전체' 명시 칩 도입+칩0개=미선택(저장차단)은 기확정.
5. **#848 documentType 오버플로 = 3개 저장소 모두 40→70 확장**(2026-07-19 재확정·AskUserQuestion). 배치 초안 "단일 groupware V11"은 SOL 기획검수 반증 + 라이브 DB 실측(grep false-negative) → **`GROUPWARE_${code}` 저장 컬럼 전 3곳**: ①groupware `approval_lines.document_type`(V11) ②groupware `document_templates.doc_type`(V11·app validate 40→70) ③auth `approval_line_config.document_type`(V89·라이브 `GROUPWARE_EXPENSE_REPORT` 실측). 협업 `document_type`(고정 enum CHECK·최장 18)=스코프 밖. 70=GROUPWARE_(10)+code 60. ⚠️ddl-validate 는 length 미검사 → `information_schema.character_maximum_length=70` 단언 + 실 flush IT. V10 이 스킵한 legacy NULL 64행(41–70) = V11 backfill. code≤30 상한·접두사 제거 비채택. 규모 M.
6. **#838 세금계산서 동일명 거래처 교체 audit = 추가 승인**. oldPartnerCode/partnerId snapshot + audit diff(UUID 미노출·partnerCode/name 조합 인간가독).
7. **#830 감사 revision 채번 다중화 = 현행 유지 → Phase 11 AWS 다중 인스턴스 시 DB sequence(또는 advisory lock)**. 현 단일 인스턴스 위험 0(psql 중복 0건).
8. **#832 항목4 BOM(U+FEFF) 정규화 = BE 보존 유지 + mock을 BE에 일치**. 나머지 #832 항목1~3 PM 자율.
9. **#827 레거시 GAS 통합·#773 일마감 재계산 = Google 자격(clasp login 1회 또는 서비스계정+scriptId) 블로커**. 개발책임자 자격 제공 전 착수 불가·후순위 고정.

## 실행 순서 (PM 자율·의존성 반영)
1. **회계체인**: #823(reject) → 전표 거래처 필수화(단계적) → #825 슬5(신규만)
2. **#825 잔여**: 슬6 쪽지 수신자 칩(⑤) · 슬7 주문 병합 UX(③)
3. **문서 디자이너**: #845 DS-3 편집기 MVP(pin) → DS-4
4. **독립 FEAT**: #824 품목행 공급가액·부가세(4결정 확정) · #848 documentType 컬럼확장(S)
5. **chore 배치**: #831 lookup sweep · #832 mock parity · #838 audit · #839 partner_code 100 · #828 a11y
6. **AC 후속 흡수**: #834 · #836 · #837 · #840 · #842 · #843
7. **Google 자격 후**: #827 · #773
8. **Phase 11 시**: #830 · **cutover-defer**: #826

## PM 자율 즉시 실행 (결정 불요·12건)
#824·#825 슬6·슬7·#845 DS-4·#828·#831·#836·#837·#839·#834·#840·#842·#843·#832(항목1~3)·#826(cutover-defer 완료).

→ [[feedback_pm_permission_autonomy]]·[[feedback_pm_auto_merge_authority]]·[[feedback_integrity_domain_policy_preconfirm]](본 배치로 선확인 완료).
