# 2026-07-05 — #8(#725) accounting IllegalArgument 사용자 노출 메시지 한국어화 (PR #742)

> #724(상태 라벨 SSOT 한국어화·auth 위주) 후속. accounting-service의 사용자 노출 IllegalArgument/enum 영문 메시지 한국어화.

## 근본원인
accounting-service의 여러 `IllegalArgumentException`/`BusinessException` 커스텀 메시지가 GlobalExceptionHandler→ApiResponse.fail로 사용자에 그대로 도달하면서 raw enum(SALES/PURCHASE_SLIP·TAX_INVOICE·OUTBOUND 등)·영문 라벨(slip=·line_total)을 노출.

## 구현 (선별)
- **선별 기준**: GlobalExceptionHandler→ApiResponse.fail 도달(사용자 노출) 경로만. seed·SQL·Swagger·내부 invariant는 제외.
- 마감 kind/source(DailyClosing getDisplayName)·세금계산서 type(TaxInvoiceType)·SAS 원천전표(slip=→전표=)·라인배분·ErrorCode 기본메시지 raw enum/영문→한국어(상태 SSOT 재사용).
- 리뷰 fix: sp-sas 계약 assertion 현행화·SAS custom slip=→전표= 4곳·MIG3 "전이"→"전환"·DailyClosing 반대분기 대칭 테스트·세금계산서 오류 raw 입력값(BAD_ENUM) echo 제거.

## 리뷰 (실행=게시 1:1·모든 라운드 표+라이브 스샷·fix=라운드 진행모델)
- Opus 5-agent R1(BE·QA 라이브·DevOps 0·FE[Major] sp-sas·Design[MED] slip=)+**Opus fix**(Opus backend-engineer·라운드모델 준수) → Opus 재수렴 5/5 0.
- Codex 5-agent 라운드(BE·FE·DevOps 0·Design[P1]MigOps·[P2]MIG3·QA 라이브[보통]세금계산서 echo)+**Codex fix**(echo 제거·[P1]out-scope disposition·[P2]false-positive) → Codex 재수렴 5/5 0(QA 라이브 재빌드 "허용되지 않는 종류입니다"·BAD_ENUM echo 없음).

## 검증
- accounting :test 1135·shared:common 0 fail(--rerun-tasks genuine)·sp-sas playwright 15·typecheck0·vitest609.
- **라이브 QA**: Docker accounting 재빌드·:8080 실 API로 마감 불일치·세금계산서 오류 한국어 메시지 실증(echo 제거 후 재확인). 스샷(SHA-pinned+SendUserFile).

## disposition/후속(별 슬라이스)
- **[P1] MigOps 대시보드 raw enum(TRANSFORMED·MIG3_*)**: FE 관리자 대시보드 i18n(MIG-21)·#8 BE 메시지 스코프 밖 → 후속 슬라이스.
- **[P2] MIG3 "변환"vs"전환"**: 마이그 conversion(변환) vs 확정 상태전이(전환) 다른 개념·false-positive.
- slip/partner-order 잔여 raw enum(DispatchTask·SlipPublishOutbox)=#725 타 서비스 범위·별건.
