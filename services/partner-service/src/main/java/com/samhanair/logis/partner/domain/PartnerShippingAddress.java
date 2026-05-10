package com.samhanair.logis.partner.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 거래처 배송지 (4탭 탭3, 다중).
 *
 * <p>{@link Partner} 와 1:N 관계 ({@code partner_id} N건 허용). 기본 배송지 ({@link #isDefault})는
 * 거래처당 1건만 TRUE — service 레이어({@link com.samhanair.logis.partner.tab.service.Partner4TabService})
 * 에서 신규 기본 배송지 지정 시 기존 기본 배송지를 FALSE 로 전환.
 *
 * <p>주소 변경 / 기본 배송지 전환은 반드시 도메인 메서드({@link #update}, {@link #markAsDefault},
 * {@link #unsetDefault})를 사용한다. setter/reflection 직접 호출 금지.
 *
 * <p>UUID 비공개 가드 — id 는 path variable 전용, 사용자 화면에는 alias/address 등 비즈니스 식별자 노출.
 */
@Entity
@Getter
@Table(name = "partner_shipping_addresses")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerShippingAddress extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 소속 거래처 UUID ({@link Partner#getId()}). */
    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    /** 배송지 별칭 (예: "본사창고", "강남물류센터"). nullable. */
    @Column(name = "alias", length = 100)
    private String alias;

    /** 우편번호. nullable. */
    @Column(name = "zip_code", length = 10)
    private String zipCode;

    /** 배송지 전체 주소. nullable false. */
    @Column(name = "address", nullable = false, length = 500)
    private String address;

    /** 배송지 연락처. nullable. */
    @Column(name = "phone", length = 30)
    private String phone;

    /** 수신 담당자명. nullable. */
    @Column(name = "receiver_name", length = 50)
    private String receiverName;

    /**
     * 기본 배송지 여부. 거래처당 1건만 TRUE.
     * service 레이어에서 신규/변경 시 이전 기본 배송지 FALSE 처리 보장.
     */
    @Column(name = "is_default", nullable = false)
    private Boolean isDefault;

    /** 비고. */
    @Column(name = "memo", length = 500)
    private String memo;

    private PartnerShippingAddress(UUID partnerId, String alias, String zipCode, String address,
                                    String phone, String receiverName, boolean isDefault, String memo) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 필수");
        }
        if (address == null || address.isBlank()) {
            throw new IllegalArgumentException("address 필수");
        }
        this.partnerId = partnerId;
        this.alias = alias;
        this.zipCode = zipCode;
        this.address = address;
        this.phone = phone;
        this.receiverName = receiverName;
        this.isDefault = isDefault;
        this.memo = memo;
    }

    /**
     * 배송지 신규 등록 정적 factory.
     *
     * @param partnerId    소속 거래처 UUID
     * @param alias        배송지 별칭 (nullable)
     * @param zipCode      우편번호 (nullable)
     * @param address      전체 주소 (필수)
     * @param phone        연락처 (nullable)
     * @param receiverName 수신 담당자명 (nullable)
     * @param isDefault    기본 배송지 여부
     * @param memo         비고 (nullable)
     * @return 영속화 전 신규 PartnerShippingAddress
     */
    public static PartnerShippingAddress create(UUID partnerId, String alias, String zipCode,
                                                 String address, String phone, String receiverName,
                                                 boolean isDefault, String memo) {
        return new PartnerShippingAddress(partnerId, alias, zipCode, address,
                phone, receiverName, isDefault, memo);
    }

    /**
     * 배송지 정보 갱신 도메인 메서드.
     *
     * @param alias        새 별칭 (nullable)
     * @param zipCode      새 우편번호 (nullable)
     * @param address      새 주소 (필수)
     * @param phone        새 연락처 (nullable)
     * @param receiverName 새 수신 담당자명 (nullable)
     * @param memo         새 비고 (nullable)
     */
    public void update(String alias, String zipCode, String address, String phone,
                       String receiverName, String memo) {
        if (address == null || address.isBlank()) {
            throw new IllegalArgumentException("address 필수");
        }
        this.alias = alias;
        this.zipCode = zipCode;
        this.address = address;
        this.phone = phone;
        this.receiverName = receiverName;
        this.memo = memo;
    }

    /**
     * 기본 배송지로 지정. service 레이어가 동일 트랜잭션에서 기존 기본 배송지를 unsetDefault 처리 후 호출.
     */
    public void markAsDefault() {
        this.isDefault = Boolean.TRUE;
    }

    /**
     * 기본 배송지 해제 (다른 배송지가 기본으로 지정될 때 service 레이어가 호출).
     */
    public void unsetDefault() {
        this.isDefault = Boolean.FALSE;
    }

    /**
     * 배송지 soft-delete. {@link BaseEntity#markDeleted(String)} 위임.
     *
     * @param deleterUserId 삭제 수행자 (audit deletedBy)
     */
    public void softDelete(String deleterUserId) {
        markDeleted(deleterUserId);
    }
}
