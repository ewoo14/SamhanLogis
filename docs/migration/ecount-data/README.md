# 이카운트 실 데이터 마이그레이션 가이드

> 작성일: 2026-05-13
> 목적: 이카운트 ERP 에 누적된 운영 데이터를 SamhanLogis 14 서비스로 일괄 이식 (dev 시드 → 향후 운영 cutover)
> 배경: 기능 이식은 이미 100% 완료 (e-Count 의존 0%, [legacy-gas-cross-check-2026-05-11.md](../../dev-reports/legacy-gas-cross-check-2026-05-11.md) §6 참조). 남은 작업은 **실 데이터** 이동.

---

## 1. 범위

이카운트 백업 메뉴 (`Self-Customizing > 정보관리 > 데이터관리 > 백업 및 삭제`) 의 **두 탭** 으로 모든 데이터를 확보합니다 (이카운트 AI 공식 답변, 2026-05-13).

### 1-A. 기초코드 탭 — 마스터 6종 (1회 일괄 export)

| 이카운트 항목 | 대상 서비스 | 우선순위 | 매핑 가이드 |
|---|---|---|---|
| 거래처등록 | `partner-service` | **P0 PoC** | [01-partner-mapping.md](01-partner-mapping.md) |
| 품목등록 | `product-service` | P0 | (MIG-2 진행 시 작성) |
| 계정등록 (계정과목) | `accounting-service` | P0 (선행) | (MIG-2 진행 시 작성, 한국 일반기업회계기준 seed 검증) |
| 부서등록 | `hr-service` / `accounting-service` | P0 | (MIG-2 진행 시 작성, 회계 전표 department_id 매핑 근거) |
| 창고등록 | `warehouse-service` | P0 | (MIG-2 진행 시 작성, 재고 전표 warehouse_id 매핑 근거) |
| 카드등록 | `accounting-service` (card_master) | P1 | (MIG-2 진행 시 작성) |

> **장점**: 1회 export 로 6종 모두 확보. 부서/창고 매핑 테이블이 **자동 확보** (별도 lookup 시드 작업 불필요).

### 1-B. 거래내역 탭 — 전표 9종 (3개월 단위 split, 반복 N회)

| 이카운트 항목 | 대상 서비스 | 우선순위 | 슬라이스 묶음 |
|---|---|---|---|
| 일반전표 (분개) | `accounting-service` | P2 | MIG-3 회계 |
| 매입전표 | `accounting-service` | P2 | MIG-3 회계 |
| 매출전표 | `accounting-service` | P2 | MIG-3 회계 |
| 세금계산서용 판매전표 | `accounting-service` | P2 | MIG-4 영업·세무 |
| 판매전표 | `accounting-service` | P2 | MIG-4 영업·세무 |
| 매출매입내역 | `accounting-service` | P2 | MIG-4 영업·세무 검증 |
| 주문서 | `accounting-service` | P3 | MIG-4 staging / 후속 Order 도메인 |
| 지출결의서 | `accounting-service` | P2 | MIG-5 입출금 |
| 입금보고서 | `accounting-service` | P2 | MIG-5 입출금 |

> **참고**: 입출고/재고이동 전표는 거래내역 탭 포함 여부 PoC 시 확인 (별도 메뉴일 수 있음). 확인 후 MIG-6 슬라이스로 분리.

### 1-C. 이카운트 백업 절차 (사용자 가이드)

1. **기초코드 탭** (마스터, 1회):
   - 메뉴: `Self-Customizing > 정보관리 > 데이터관리 > 백업 및 삭제 > 기초코드 탭`
   - "자료올리기형태로생성" 클릭 → 백업 완료 시 **이카운트 메신저로 알림**
   - 메신저에서 Excel 다운로드 (1개 파일에 6종 시트)
2. **거래내역 탭** (트랜잭션, 분기 반복):
   - 동일 메뉴 → 거래내역 탭
   - 3개월 기간 지정 → "자료올리기형태로생성" → 메신저 알림 → 다운로드
   - 전체 기간이 N분기면 N개 파일 (멱등 적재 키로 중복 방지)
3. **이미지/첨부파일**: 백업에 자동 포함 안 됨 ([§2-B 첨부 전략](#2-b-첨부파일-사업자등록증명함계약서-마이그레이션-전략))

### 1-D. 이카운트 "추가사업장" 매핑

이카운트는 다중 사업장 시 **재고 전표 → 추가사업장용 '창고'** / **회계 전표 → 추가사업장용 '부서'** 를 필수 입력합니다. 기초코드 탭에서 부서/창고 데이터 자체를 받기 때문에 **lookup map 자동 생성**:

| 이카운트 | SamhanLogis | 처리 |
|---|---|---|
| 창고코드 → 창고명 | `warehouse-service`의 warehouse UUID | 기초코드 탭 import 시 `staging.ecount_warehouse_map(code, name, warehouse_uuid)` 자동 채움 |
| 부서코드 → 부서명 | `hr-service`의 department UUID | 동일 패턴 (`staging.ecount_department_map`) |

→ MIG-2 (마스터 5종 일괄) 완료 시점에 트랜잭션 전 단계 lookup 자동 준비.

---

## 2. 마이그레이션 전략

### 3-Tier (staging → transform → target)

```
이카운트 Excel (xlsx)              ┐
docs/migration/ecount-data/raw/    │  Step 1: 사용자 수동 다운로드
                                   ┘
            ↓ Apache POI 파서
staging.ecount_partner_raw         ┐
staging.ecount_item_raw            │  Step 2: BE Agent — 멱등 raw 적재
                                   ┘
            ↓ Transform service
samhan-partner.partners            ┐
samhan-product.products            │  Step 3: 도메인 INSERT (UUID 발급)
samhan-warehouse.movements         │
                                   ┘
            ↓ QA validation SQL
검증 리포트 (행 수 / 합계 / FK)    Step 4: QA Agent — cross-DB join 확인
```

### 멱등 적재 원칙

- `staging.*` 테이블에 `source_file_hash` + `source_row_no` 복합 PK
- 동일 파일 재실행 시 UPSERT
- 도메인 적재는 `biz_no` (거래처) / `product_code` (품목) 등 비즈니스 키로 멱등
- **3개월 split 파일 다중 import**: 트랜잭션은 분기별 N개 파일이 각각 다른 `source_file_hash` 를 가지므로 자연 멱등. 단, 동일 거래가 2개 파일에 걸쳐 들어오는 경계 케이스 (3개월 경계 ±1일) 는 **이카운트 전표번호 (slip_no)** 를 추가 dedup 키로 사용

### PII 마스킹 (사용자 결정 2026-05-13)

| 필드 | 정책 | 변환 |
|---|---|---|
| 대표자 주민번호 | **마스킹** | `YYMMDD-1XXXXXX` → `YYMMDD-1******` |
| 사업자등록번호 | 원본 | (B2B 공개 정보) |
| 휴대폰 / 이메일 / 주소 | 원본 | (B2B 공개 정보) |
| 신용한도 / 미수금 | 원본 | (운영 의사결정 필수) |

---

## 2-B. 첨부파일 (사업자등록증/명함/계약서) 마이그레이션 전략

이카운트 Excel 다운로드는 **메타데이터만** 포함되며, 첨부파일 (이미지/PDF) 일괄 export 는 공식 제공되지 않습니다. SamhanLogis 측 그릇 ([PartnerAttachment.java](../../../services/partner-service/src/main/java/com/samhanair/logis/partner/domain/PartnerAttachment.java)) 은 완비 (MinIO + presigned URL).

**전략 결정 (2026-05-13, 개발책임자) — Phase 분리**:

| 단계 | 시점 | 처리 |
|---|---|---|
| Phase 1 (PoC/dev) | 지금 | **첨부 생략** — dev 시드는 메타데이터 + 신용한도로 충분. 화면 테스트 필요 시 dummy 이미지 1~2장만 시드 |
| Phase 2 (운영 cutover D-7~D-1) | 향후 | 매출 상위 30~50개 거래처만 **사용자 수동 업로드** (거래처 1건당 ~2분, 약 2시간 1회 작업) |
| Phase 3 (운영 중) | 상시 | 나머지 거래처는 **lazy migration** — 세금계산서 발행/감사 시점에 필요한 거래처만 점진 보강 |

**자동화 옵션 (별도 슬라이스 MIG-1B)**: 거래처 100건+ 다량 + 운영 cutover 즉시 필수가 되는 시점에 Playwright 크롤러 (`tools/ecount-attachment-scraper/`) 신설 검토. 현재는 미진행.

---

## 3. 사용자가 직접 할 일

### Step 1: 이카운트 ERP 콘솔 로그인 → Excel 다운로드

**PoC — 기초코드 탭 1회 export (마스터 6종 일괄)**:

1. 이카운트 ERP → `Self-Customizing > 정보관리 > 데이터관리 > 백업 및 삭제`
2. **`기초코드 탭`** 선택
3. **`자료올리기형태로생성`** 클릭
4. 이카운트 메신저 알림 도착 → Excel 다운로드 (6종 시트: 거래처/품목/계정/부서/창고/카드)
5. 다운로드 파일을 아래 경로에 저장:

```
c:\dev\SamhanLogis\docs\migration\ecount-data\raw\master-export-20260513.xlsx
```

6. PM (Claude) 에게 알리면 → MIG-1 거래처 PoC 즉시 시작 (같은 파일의 거래처 시트만 처리)

> 권한 안내: Master ID 또는 "ERP 자료 엑셀 내려받기" 권한 부여 필요 ([이카운트 권한 안내](https://www.ecount.com/us/service/system-upgrade-view/erp_excel-download-authorization-change))

### Step 2: PM 호출

파일 저장 후 PM (Claude) 에게 알려주시면 즉시 BE Agent 디스패치하여 PoC import 진행.

---

## 4. raw 디렉토리 정책

- `raw/` 하위 모든 `.xlsx` / `.csv` 는 `.gitignore` 처리 (실 데이터, 미수금 포함)
- `raw/.gitkeep` 만 commit
- 마이그레이션 완료 후 보관 정책: 로컬 PC `c:\dev\SamhanLogis-data-backup\` 로 이전 (사용자 결정)

---

## 5. 후속 슬라이스 (PoC 통과 후)

### Tier 1 — 마스터 (기초코드 탭 1개 파일로 처리)

| 슬라이스 | 입력 | Agent 구성 | 산출물 |
|---|---|---|---|
| **MIG-1** 거래처 PoC | 기초코드 Excel (거래처 시트만) | BE + QA + TM | `staging.ecount_partner_raw` + `EcountPartnerImporter` + 27 필드 검증 SQL + 주민번호 마스킹 |
| **MIG-2** 마스터 5종 일괄 | 동일 파일 (품목/계정/부서/창고/카드 시트) | BE + QA + TM | 5개 importer + 5개 검증 SQL + 자동 lookup map (`ecount_warehouse_map` / `ecount_department_map`) |

### Tier 2 — 트랜잭션 (거래내역 탭 3개월 split N파일)

| 슬라이스 | 대상 전표 | 대상 서비스 | 의존 |
|---|---|---|---|
| **MIG-3** 회계 전표 묶음 | 일반전표 + 매입전표 + 매출전표 | `accounting-service` | MIG-2 (계정과목 + 부서) |
| **MIG-4** 영업·세무 묶음 | 세금계산서용 판매전표 + 판매전표 + 매출매입내역 + 주문서 | `accounting-service` | MIG-1 partner + MIG-2 lookup |
| **MIG-5** 입출금 묶음 | 지출결의서 + 입금보고서 | `accounting-service` | MIG-2 (계정 + 카드) |
| **MIG-6** 재고 입출고 | (메뉴 확인 후 분리) | `warehouse` / `inventory` | MIG-2 (창고 + 품목) |

각 Tier 2 슬라이스는 분기별 N개 파일 반복 import — `source_file_hash + slip_no` 멱등 키로 중복 방지.

---

## 6. 관련 문서

- [legacy-gas-cross-check-2026-05-11.md](../../dev-reports/legacy-gas-cross-check-2026-05-11.md) — 기능 이식 27 카테고리 전수 매핑 (기능은 완료)
- [Partner.java](../../../services/partner-service/src/main/java/com/samhanair/logis/partner/domain/Partner.java) — 27 필드 호환 도메인
- [ecount-reference/](../ecount-reference/) — 이카운트 UI 캡처 16장 (필드 매핑 근거)
