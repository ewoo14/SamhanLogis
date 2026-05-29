package com.samhanair.logis.partner.revision.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.samhanair.logis.partner.domain.PartnerStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 거래처 full-snapshot 직렬화 DTO (권한 재편 Phase 2.3).
 *
 * <p>{@link com.samhanair.logis.partner.domain.Partner} 헤더 전 필드 + 4탭 자식
 * (단가/할인 {@link PriceDiscount} 1:1, 배송지 {@link ShippingAddress} 1:N,
 * 담당자 {@link Contact} 1:N)을 한 시점의 불변 스냅샷으로 담는다.
 * {@code partner_revisions.snapshot} (JSONB) 컬럼에 Jackson 으로 직렬화/역직렬화된다.
 *
 * <p>estimate 와의 구조 차이: 거래처 자식은 entity 의 {@code @OneToMany} 가 아니라 service-layer 가
 * 각 자식 repository 로 partnerId join 수집하여 본 스냅샷에 모은다. 복원 시 이 스냅샷을 역직렬화해
 * 헤더를 덮어쓰고 각 자식 테이블을 전량 교체한다.
 *
 * <p>JPA 프록시/lazy 연관 직렬화를 회피하기 위해 entity 가 아닌 전용 record 로 분리한다.
 *
 * <p>UUID 비공개 가드: 화면 표시는 {@link #partnerCode}/{@link #name} 등 비즈니스 식별자를 사용하고,
 * UUID 필드는 복원 시 entity 재구성용으로만 보존한다.
 *
 * <p>{@code com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot} 미러
 * (@JsonInclude NON_NULL).
 *
 * @param partnerCode 사용자 노출 식별자 스냅샷 (예: P-2026-0001)
 * @param bizNo 사업자등록번호
 * @param name 거래처 상호
 * @param address 거래처 주소 (legacy)
 * @param phone 거래처 대표 연락처
 * @param creditLimit 신용한도 (원)
 * @param outstandingBalance 현재 미수금 잔액 (원)
 * @param status 거래처 상태 (ACTIVE/SUSPENDED/TERMINATED)
 * @param subBizNo 종사업장번호
 * @param representative 대표자명
 * @param businessType 업태
 * @param industry 종목
 * @param fax FAX 번호
 * @param email email 1 (대표)
 * @param email2 email 2 (보조)
 * @param mobile 휴대전화
 * @param zipCode1 우편번호 1 (본사)
 * @param address1 주소 1 (본사)
 * @param zipCode2 우편번호 2 (배송지)
 * @param address2 주소 2 (배송지)
 * @param searchKeyword 검색용 키워드
 * @param partnerGroup1 거래처분류1
 * @param partnerGroup2 거래처분류2
 * @param website 홈페이지
 * @param currency 통화
 * @param shipmentTarget 출하 대상 여부
 * @param salesType 판매유형
 * @param purchaseType 구매유형
 * @param receivableNoMgmt 매출계정 관리
 * @param payableNoMgmt 매입계정 관리
 * @param outboundAdjustmentRate 출고조정률
 * @param inboundAdjustmentRate 입고조정률
 * @param salesPriceGroup 판매단가그룹
 * @param purchasePriceGroup 구매단가그룹
 * @param creditPeriodDays 여신기간 (일)
 * @param paymentDueDays 결제기한 (일)
 * @param registrationDate 등록일자 (회계상 거래시작일)
 * @param transferInfo 이체정보
 * @param note 특이사항
 * @param managerName 담당자명
 * @param priceDiscount 단가/할인 정책 스냅샷 (탭2, nullable — 미설정 시 null)
 * @param shippingAddresses 배송지 스냅샷 배열 (탭3, 없으면 빈 리스트)
 * @param contacts 담당자 스냅샷 배열 (탭4, 없으면 빈 리스트)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PartnerSnapshot(
        String partnerCode,
        String bizNo,
        String name,
        String address,
        String phone,
        BigDecimal creditLimit,
        BigDecimal outstandingBalance,
        PartnerStatus status,
        String subBizNo,
        String representative,
        String businessType,
        String industry,
        String fax,
        String email,
        String email2,
        String mobile,
        String zipCode1,
        String address1,
        String zipCode2,
        String address2,
        String searchKeyword,
        String partnerGroup1,
        String partnerGroup2,
        String website,
        String currency,
        Boolean shipmentTarget,
        String salesType,
        String purchaseType,
        String receivableNoMgmt,
        String payableNoMgmt,
        BigDecimal outboundAdjustmentRate,
        BigDecimal inboundAdjustmentRate,
        String salesPriceGroup,
        String purchasePriceGroup,
        Integer creditPeriodDays,
        Integer paymentDueDays,
        LocalDate registrationDate,
        String transferInfo,
        String note,
        String managerName,
        PriceDiscount priceDiscount,
        List<ShippingAddress> shippingAddresses,
        List<Contact> contacts) {

    /**
     * 거래처 단가/할인 정책 스냅샷 (4탭 탭2, 1:1).
     *
     * @param basicDiscountRate 기본 할인율 (%)
     * @param paymentTermDays 결제 조건 일수 (nullable)
     * @param discountMemo 할인 정책 비고 (nullable)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PriceDiscount(
            BigDecimal basicDiscountRate,
            Integer paymentTermDays,
            String discountMemo) {
    }

    /**
     * 거래처 배송지 스냅샷 (4탭 탭3, 1:N).
     *
     * @param alias 배송지 별칭 (nullable)
     * @param zipCode 우편번호 (nullable)
     * @param address 전체 주소 (필수)
     * @param phone 배송지 연락처 (nullable)
     * @param receiverName 수신 담당자명 (nullable)
     * @param isDefault 기본 배송지 여부
     * @param memo 비고 (nullable)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ShippingAddress(
            String alias,
            String zipCode,
            String address,
            String phone,
            String receiverName,
            Boolean isDefault,
            String memo) {
    }

    /**
     * 거래처 담당자 스냅샷 (4탭 탭4, 1:N).
     *
     * @param contactName 담당자명 (필수)
     * @param position 직책/직위 (nullable)
     * @param phone 직통 전화 (nullable)
     * @param email 이메일 (nullable)
     * @param isPrimary 주 담당자 여부
     * @param memo 비고 (nullable)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Contact(
            String contactName,
            String position,
            String phone,
            String email,
            Boolean isPrimary,
            String memo) {
    }
}
