---
name: company-config-menu
description: 공급자 정보·은행계좌 회계 설정 메뉴 (거래명세서+세금계산서 공용) — 2026-06-10 개발책임자 지시
metadata:
  type: project
---

# 공급자·은행계좌 설정 메뉴 (회계) — 2026-06-10 개발책임자 지시

> "공급자와 은행계좌번호의 경우 회계에서 직접 설정할 수 있는 메뉴 추가 요망.
> 이는 세금계산서 발행에도 동일하게 적용되는 메뉴임."

## 요구
- 회계 영역에 **공급자 정보(상호/사업자등록번호/성명/주소/TEL) + 입금계좌(예금주/은행/계좌번호)** 설정 메뉴.
- 소비처: **거래명세서**(SalesTransactionStatementPrintPage 공급자 표 + 계좌 푸터) + **세금계산서 발행**(SalesInvoicePrintPage/TaxInvoiceView 공급자 박스) 동일 적용.
- PR #458 의 임시 env 주입(`VITE_COMPANY_BANK_NOTICE`/`VITE_COMPANY_STAMP_URL`) 및 하드코딩 `COMPANY` 상수를 **이 설정 API 로 대체**.

## 설계 방향
- BE: accounting-service 에 company-profile 설정 엔티티/API (단일 row, MASTER/ACCOUNTANT 권한, audit). 인감 스탬프 이미지 업로드(bytea 또는 MinIO) 포함 — public repo 에 인감/계좌 비커밋 원칙 유지.
- FE: 회계 메뉴 하위 "회사(공급자) 정보 설정" 화면 + react-query 로 인쇄 페이지들이 조회.
- 양식 소비처 3곳 배선 교체: 거래명세서 공급자표/계좌푸터/인감, 세금계산서 공급자 박스.

## 2026-06-10 추가 지시 (PR #459 진행 중 정밀화 — 원문)
> "우리 회사 정보가 모두 설정 가능해야함. 공급자 등록번호, 공급자 상호, 공급자 성명, 공급자 사업장주소, 공급자 업태, 공급자 종목, 공급자 이메일, 공급자 계좌번호(복수 등록 가능, **각 명세서 노출 토글 설정 가능**), **공급자 로고(이미지)**, 공급자 인감(이미지) 이렇게 설정가능해야 하며, **메뉴명은 '공급자 설정'**으로 진행"

- 구현 기반 = 기존 `SupplierProfile`(사업자 양식) 확장 (PR #459 정찰 결정).
- 확장 3건: ① 계좌별 명세서 **노출 토글**(`exposed`) — 인쇄 bankNotice 는 노출 계좌만 조합 ② **로고 이미지 업로드** (인감과 동일 BYTEA 패턴, 정적 `/print-logo.svg` 대체) ③ 좌측 메뉴 라벨 **"공급자 설정"** (라우트 `/accounting/supplier-profiles` 유지).

관련: [[slip-shipout-print-form]] (양식), [[item-exposure-and-menu-5cat]] (메뉴 재편과 동시 진행 가능)
