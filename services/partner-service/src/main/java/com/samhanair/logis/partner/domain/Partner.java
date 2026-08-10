package com.samhanair.logis.partner.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 거래처 마스터.
 *
 * <p>{@link #partnerCode} = 사용자 노출 식별자 (UUID 비공개 가드, memory feedback_uuid_no_user_visibility).
 * {@link #id} 는 form hidden field 또는 path variable 로만 사용. M5 slip-service 의
 * partnerCode → partnerId lookup 의존성 해소가 본 entity 도입의 1차 목적.
 *
 * <p>신용 거래 정보 ({@link #creditLimit} / {@link #outstandingBalance}) 는 {@link PartnerCreditHistory}
 * 의 누적과 본 row 의 캐시값이 일관 보존되어야 한다 (서비스 레이어에서 동일 transaction 으로 갱신).
 *
 * <p><b>Stage 1 local-test seed 보강</b> — 이카운트 27 필드 호환 (V2 migration).
 * 출처: docs/migration/ecount-reference/091522~091604 (거래처 4 탭 캡처).
 * 신규 필드는 모두 NULLable 또는 기본값 — legacy register() factory 비파괴.
 */
@Entity
@Getter
@Table(name = "partners")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Partner extends BaseEntity {

    /** 이카운트 적재 중 원천 입력값이 도메인 검증을 통과하지 못했음을 나타낸다. */
    public static class InvalidImportedCreditLimitException extends IllegalArgumentException {
        public InvalidImportedCreditLimitException(String message) {
            super(message);
        }
    }

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 사용자 노출 식별자 (예: P-2026-0001). UUID 비공개 가드. partial unique index 가 활성 행 중복 방지.
     *  V11: 이카운트 운영 데이터 실측 max=86 반영 length 100 확장. */
    @Column(name = "partner_code", nullable = false, length = 100)
    private String partnerCode;

    /** 사업자등록번호 (한국 표준 10자리, '-' 포함 입력 가능). 활성 행 unique.
     *  V11: 이카운트 운영 데이터에서 partner_code 와 동일 식별자 사용 (실측 max=86) length 100 확장. */
    @Column(name = "biz_no", nullable = false, length = 100)
    private String bizNo;

    /** 거래처 상호. */
    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** 거래처 주소 (선택). */
    @Column(name = "address", length = 500)
    private String address;

    /** 거래처 대표 연락처 (선택). V11: 이카운트 실측 max=43 (다중 전화번호 콤마 구분) length 50 확장. */
    @Column(name = "phone", length = 50)
    private String phone;

    /** 신용한도 (원). null 이면 미설정(한도 제한 없음), 0 은 명시적 한도 0원이다. */
    @Column(name = "credit_limit", precision = 15, scale = 2)
    private BigDecimal creditLimit;

    /** 현재 미수금 잔액 (원). {@link PartnerCreditHistory} 누적 값과 일관. */
    @Column(name = "outstanding_balance", precision = 15, scale = 2, nullable = false)
    private BigDecimal outstandingBalance;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PartnerStatus status;

    // ============================================================
    // Stage 1 local-test seed — 이카운트 27 필드 보강 (V2 migration)
    // ============================================================

    /** 종사업장번호 (4자리). 본사외 사업장 보유 시만. */
    @Column(name = "sub_biz_no", length = 20)
    private String subBizNo;

    /** 대표자명. */
    @Column(name = "representative", length = 50)
    private String representative;

    /** 업태 (제조업/도소매/건설업 등). */
    @Column(name = "business_type", length = 50)
    private String businessType;

    /** 종목 (공조설비/냉난방기기 등). */
    @Column(name = "industry", length = 50)
    private String industry;

    /** FAX 번호. V11: 안전 마진 length 50 확장. */
    @Column(name = "fax", length = 50)
    private String fax;

    /** email 1 (대표). */
    @Column(name = "email", length = 120)
    private String email;

    /** email 2 (보조 — 정산/세무 담당). */
    @Column(name = "email2", length = 120)
    private String email2;

    /** 휴대전화. V11: 안전 마진 length 50 확장. */
    @Column(name = "mobile", length = 50)
    private String mobile;

    /** 우편번호 1 (본사). */
    @Column(name = "zip_code1", length = 10)
    private String zipCode1;

    /** 주소 1 (본사). 기존 {@link #address} 와 별도 — V2 migration 호환 보존. */
    @Column(name = "address1", length = 500)
    private String address1;

    /** 우편번호 2 (배송지). */
    @Column(name = "zip_code2", length = 10)
    private String zipCode2;

    /** 주소 2 (배송지). */
    @Column(name = "address2", length = 500)
    private String address2;

    /** 검색용 키워드 ("{name} {bizNo} {phone}"). */
    @Column(name = "search_keyword", length = 500)
    private String searchKeyword;

    /** 거래처분류1 (VIP거래처/일반거래처/신규거래처). */
    @Column(name = "partner_group1", length = 50)
    private String partnerGroup1;

    /** 거래처분류2 (수도권/영남권/호남권/충청권). */
    @Column(name = "partner_group2", length = 50)
    private String partnerGroup2;

    /** 홈페이지. */
    @Column(name = "website", length = 255)
    private String website;

    /** 통화. 이카운트 거래처 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "currency", length = 8)
    private String currency;

    /** 출하 대상 여부 (재고 차감 대상). 이카운트 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "shipment_target")
    private Boolean shipmentTarget;

    /** 판매유형. 이카운트 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "sales_type", length = 20)
    private String salesType;

    /** 구매유형. 이카운트 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "purchase_type", length = 20)
    private String purchaseType;

    /** 매출계정 관리. 이카운트 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "receivable_no_mgmt", length = 20)
    private String receivableNoMgmt;

    /** 매입계정 관리. 이카운트 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "payable_no_mgmt", length = 20)
    private String payableNoMgmt;

    /** 출고조정률 (0 ~ 0.05 = 0~5%). 이카운트 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "outbound_adjustment_rate", precision = 5, scale = 4)
    private BigDecimal outboundAdjustmentRate;

    /** 입고조정률 (0 ~ 0.05 = 0~5%). 이카운트 export 무존재 → NULL 허용 (V10 align). */
    @Column(name = "inbound_adjustment_rate", precision = 5, scale = 4)
    private BigDecimal inboundAdjustmentRate;

    /** 판매단가그룹 (VIP단가/일반단가/신규단가). */
    @Column(name = "sales_price_group", length = 50)
    private String salesPriceGroup;

    /** 구매단가그룹 (기본구매단가). */
    @Column(name = "purchase_price_group", length = 50)
    private String purchasePriceGroup;

    /** 여신기간 (일) — 30/60/90 분포. */
    @Column(name = "credit_period_days")
    private Integer creditPeriodDays;

    /** 결제기한 (일) — 30/45/60 분포. */
    @Column(name = "payment_due_days")
    private Integer paymentDueDays;

    /** 등록일자 (회계상 거래시작일 — audit created_at 와 별도). */
    @Column(name = "registration_date")
    private LocalDate registrationDate;

    // ============================================================
    // MIG-1 PoC — 이카운트 17 컬럼 export 보강 (V9 migration)
    // ============================================================

    /** 이체정보 — 이카운트 "등록" / NULL. 자동이체 등록 여부. */
    @Column(name = "transfer_info", length = 20)
    private String transferInfo;

    /** 특이사항 — 거래처 자유 메모 (예: "엘케이토탈 개인고객"). */
    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    /** 담당자명 — 이카운트 운영 데이터 (이성미/장영구/김미선 등). */
    @Column(name = "manager_name", length = 50)
    private String managerName;

    /** soft-delete 표시용 삭제자명. UUID 비공개 가드 후 저장하며, 복원 시 null 로 비운다. */
    @Column(name = "deleted_by_name", length = 100)
    private String deletedByName;

    private Partner(String partnerCode, String bizNo, String name, String address, String phone,
                    BigDecimal creditLimit) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 필수");
        }
        if (bizNo == null || bizNo.isBlank()) {
            throw new IllegalArgumentException("bizNo 필수");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 필수");
        }
        this.partnerCode = partnerCode;
        this.bizNo = bizNo;
        this.name = name;
        this.address = address;
        this.phone = phone;
        this.creditLimit = creditLimit;
        this.outstandingBalance = BigDecimal.ZERO;
        this.status = PartnerStatus.ACTIVE;
    }

    /**
     * 신규 거래처 등록 (status=ACTIVE, outstandingBalance=0).
     *
     * @param partnerCode 사용자 노출 식별자
     * @param bizNo 사업자등록번호
     * @param name 거래처 상호
     * @param address 주소 (nullable)
     * @param phone 연락처 (nullable)
     * @param creditLimit 신용한도 (null → 미설정)
     * @return 영속화 전 신규 Partner
     */
    public static Partner register(String partnerCode, String bizNo, String name, String address,
                                   String phone, BigDecimal creditLimit) {
        return new Partner(partnerCode, bizNo, name, address, phone, creditLimit);
    }

    /**
     * 거래처 마스터 정보 갱신 (admin CRUD update). partnerCode / bizNo 는 식별자이므로
     * 변경 불가, name / address / phone 만 갱신.
     */
    public void updateProfile(String name, String address, String phone) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name 필수");
        }
        this.name = name;
        this.address = address;
        this.phone = phone;
    }

    /**
     * 신용한도 변경 — {@link PartnerCreditService} 가 동일 transaction 에서
     * {@link PartnerCreditHistory} 와 함께 호출.
     *
     * @param newLimit 새 한도 (null/음수 거부)
     * @return 변경 delta (newLimit - 기존)
     */
    public BigDecimal changeCreditLimit(BigDecimal newLimit) {
        if (newLimit == null || newLimit.signum() < 0) {
            throw new IllegalArgumentException("creditLimit 은 0 이상 필수");
        }
        BigDecimal delta = newLimit.subtract(this.creditLimit);
        this.creditLimit = newLimit;
        return delta;
    }

    /**
     * 이카운트 마스터 적재 전용 한도 반영. 빈 여신한도는 null(미설정)로 보존하며,
     * 거래 결과 필드인 outstandingBalance에는 손대지 않는다.
     */
    public void replaceCreditLimitFromImport(BigDecimal newLimit) {
        if (newLimit != null && newLimit.signum() < 0) {
            throw new InvalidImportedCreditLimitException("creditLimit 은 음수 불가");
        }
        this.creditLimit = newLimit;
    }

    /**
     * 슬립 발행으로 미수금 증가. {@link PartnerCreditService} 가 동일 transaction 에서
     * {@link PartnerCreditHistory} 와 함께 호출.
     */
    public void increaseBalance(BigDecimal amount) {
        requirePositiveAmount(amount);
        this.outstandingBalance = this.outstandingBalance.add(amount);
    }

    /**
     * 결제 입금으로 미수금 차감. 차감 후 잔액이 음수가 되는 경우 거부 (선결제 = 별도 도메인).
     */
    public void decreaseBalance(BigDecimal amount) {
        requirePositiveAmount(amount);
        BigDecimal next = this.outstandingBalance.subtract(amount);
        if (next.signum() < 0) {
            throw new IllegalStateException(
                    "결제 금액이 미수금 잔액을 초과합니다: balance=" + this.outstandingBalance + ", amount=" + amount);
        }
        this.outstandingBalance = next;
    }

    /** 거래 일시 중지 (한도 초과 등). 신규 슬립 발행 차단, 결제는 허용. */
    public void suspend() {
        this.status = PartnerStatus.SUSPENDED;
    }

    /** 거래 재개. */
    public void activate() {
        this.status = PartnerStatus.ACTIVE;
    }

    /** 거래 종료 (계약 해지). 조회만 허용 — soft-delete 와 구분, 정산 / 회계 목적 보관. */
    public void terminate() {
        this.status = PartnerStatus.TERMINATED;
    }

    /**
     * 거래처가 편집/복원 가능한 상태인지 판정한다 (권한 재편 Phase 2.3 Task 3).
     *
     * <p>거래종료(TERMINATED) 거래처는 정산/회계 목적 보관 상태이므로 헤더/자식 변경 및
     * point-in-time 복원이 금지된다. ACTIVE/SUSPENDED 는 편집 가능 (SUSPENDED 는 신규 슬립
     * 발행만 차단되고 거래처 정보 편집 자체는 허용).
     *
     * @return TERMINATED 가 아니면 {@code true}
     */
    public boolean isEditable() {
        return this.status != PartnerStatus.TERMINATED;
    }

    /**
     * 편집/복원 가능 상태를 강제한다 — TERMINATED 면 거부 (권한 재편 Phase 2.3 Task 3).
     *
     * <p>{@code EstimateService} 의 {@code requireEditable} 도메인 가드 미러. 복원 진입점
     * ({@code PartnerRevisionService#restore})이 스냅샷 역적용 전에 호출해 거래종료 거래처의
     * 복원을 사전 차단한다.
     *
     * @throws BusinessException(CONFLICT) 거래종료(TERMINATED) 거래처인 경우
     */
    public void requireEditable() {
        if (!isEditable()) {
            throw new BusinessException(ErrorCode.CONFLICT, "거래종료 거래처는 복원 불가");
        }
    }

    /**
     * 신규 슬립 발행 시 신용한도 가드. 미수금 + 추가 발행 금액 > creditLimit 이면 거부.
     *
     * @param additional 신규 슬립 금액
     * @return 한도 내면 {@code true}
     */
    public boolean canIssueSlip(BigDecimal additional) {
        if (this.status != PartnerStatus.ACTIVE) {
            return false;
        }
        if (additional == null || additional.signum() < 0) {
            return false;
        }
        // null = 여신한도 미설정: 향후 제한 기능이 붙기 전까지 출고를 막지 않는다.
        return this.creditLimit == null
                || this.outstandingBalance.add(additional).compareTo(this.creditLimit) <= 0;
    }

    private static void requirePositiveAmount(BigDecimal amount) {
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException("amount 는 양수 필수");
        }
    }

    // ============================================================
    // Stage 1 — 이카운트 27 필드 보강 메서드 (seed + admin 운영 변경)
    // ============================================================

    /**
     * 사업자 정보 보강 (대표자/업태/종목/종사업장).
     * 회계 신고 / 세금계산서 발행에 필요.
     */
    public void updateBusinessProfile(String representative, String businessType,
                                      String industry, String subBizNo) {
        this.representative = representative;
        this.businessType = businessType;
        this.industry = industry;
        this.subBizNo = subBizNo;
    }

    /**
     * 연락처 채널 갱신 (FAX/email/mobile/email2).
     */
    public void updateContactChannels(String fax, String email, String email2, String mobile) {
        this.fax = fax;
        this.email = email;
        this.email2 = email2;
        this.mobile = mobile;
    }

    /**
     * 본사 + 배송지 주소 갱신. 기존 {@link #address} (legacy) 는 호환을 위해 보존.
     */
    public void updateAddresses(String zipCode1, String address1,
                                String zipCode2, String address2) {
        this.zipCode1 = zipCode1;
        this.address1 = address1;
        this.zipCode2 = zipCode2;
        this.address2 = address2;
    }

    /** 검색 키워드 직접 설정 ("{name} {bizNo} {phone}" 형식 권장). */
    public void updateSearchKeyword(String searchKeyword) {
        this.searchKeyword = searchKeyword;
    }

    /** 분류 / website 갱신. */
    public void updateClassification(String partnerGroup1, String partnerGroup2, String website) {
        this.partnerGroup1 = partnerGroup1;
        this.partnerGroup2 = partnerGroup2;
        this.website = website;
    }

    /**
     * 여신/단가 정책 갱신 (sales/purchase 그룹 + 여신기간 + 결제기한 + 조정률).
     */
    public void updateCreditPolicy(String salesType, String purchaseType,
                                   String receivableNoMgmt, String payableNoMgmt,
                                   String salesPriceGroup, String purchasePriceGroup,
                                   BigDecimal outboundAdjustmentRate, BigDecimal inboundAdjustmentRate,
                                   Integer creditPeriodDays, Integer paymentDueDays) {
        if (salesType != null) this.salesType = salesType;
        if (purchaseType != null) this.purchaseType = purchaseType;
        if (receivableNoMgmt != null) this.receivableNoMgmt = receivableNoMgmt;
        if (payableNoMgmt != null) this.payableNoMgmt = payableNoMgmt;
        this.salesPriceGroup = salesPriceGroup;
        this.purchasePriceGroup = purchasePriceGroup;
        if (outboundAdjustmentRate != null) this.outboundAdjustmentRate = outboundAdjustmentRate;
        if (inboundAdjustmentRate != null) this.inboundAdjustmentRate = inboundAdjustmentRate;
        this.creditPeriodDays = creditPeriodDays;
        this.paymentDueDays = paymentDueDays;
    }

    /** 통화 변경 (KRW 기본). */
    public void changeCurrency(String currency) {
        this.currency = (currency == null || currency.isBlank()) ? "KRW" : currency;
    }

    /** 출하 대상 토글. */
    public void changeShipmentTarget(boolean shipmentTarget) {
        this.shipmentTarget = shipmentTarget;
    }

    /** 회계상 거래시작일 (등록일자) 설정. */
    public void changeRegistrationDate(LocalDate registrationDate) {
        this.registrationDate = registrationDate;
    }

    // ============================================================
    // MIG-1 — 이카운트 보강 컬럼 setter
    // ============================================================

    /** 이체정보 ("등록" / null). */
    public void updateTransferInfo(String transferInfo) {
        this.transferInfo = transferInfo;
    }

    /** 특이사항 자유 메모. */
    public void updateNote(String note) {
        this.note = note;
    }

    /** 담당자명. */
    public void updateManagerName(String managerName) {
        this.managerName = managerName;
    }

    /** {@link PartnerStatus} 직접 설정 — MIG-1 import 시 이카운트 "사용구분" YES/빈 → ACTIVE/SUSPENDED 매핑. */
    public void changeStatus(PartnerStatus status) {
        if (status == null) {
            throw new IllegalArgumentException("status 는 null 불가");
        }
        this.status = status;
    }

    /** 삭제자 표시명을 함께 저장하는 soft-delete helper. */
    public void markDeletedWithName(String userId, String actorName) {
        markDeleted(userId);
        this.deletedByName = actorName;
    }

    /** soft-delete 복원과 함께 삭제자 표시명도 비운다. */
    public void markRestoredWithNameCleared() {
        markRestored();
        this.deletedByName = null;
    }
}
