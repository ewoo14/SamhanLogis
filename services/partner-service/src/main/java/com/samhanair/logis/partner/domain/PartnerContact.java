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
 * 거래처 담당자 (4탭 탭4, 다중).
 *
 * <p>{@link Partner} 와 1:N 관계 ({@code partner_id} N건 허용). 주 담당자 ({@link #isPrimary})는
 * 거래처당 1건만 TRUE — service 레이어({@link com.samhanair.logis.partner.tab.service.Partner4TabService})
 * 에서 신규 주 담당자 지정 시 기존 주 담당자를 FALSE 로 전환.
 *
 * <p>담당자 정보 수정 / 주 담당자 전환은 반드시 도메인 메서드({@link #update}, {@link #markAsPrimary},
 * {@link #unsetPrimary})를 사용한다. setter/reflection 직접 호출 금지.
 *
 * <p>UUID 비공개 가드 — id 는 path variable 전용, 사용자 화면에는 contactName/position 등 노출.
 */
@Entity
@Getter
@Table(name = "partner_contacts")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerContact extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 소속 거래처 UUID ({@link Partner#getId()}). */
    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    /** 담당자명 (필수). */
    @Column(name = "contact_name", nullable = false, length = 50)
    private String contactName;

    /** 직책/직위 (예: "이사", "팀장", "대리"). nullable. */
    @Column(name = "position", length = 50)
    private String position;

    /** 직통 전화. nullable. */
    @Column(name = "phone", length = 30)
    private String phone;

    /** 이메일. nullable. */
    @Column(name = "email", length = 120)
    private String email;

    /**
     * 주 담당자 여부. 거래처당 1건만 TRUE.
     * service 레이어에서 신규/변경 시 이전 주 담당자 FALSE 처리 보장.
     */
    @Column(name = "is_primary", nullable = false)
    private Boolean isPrimary;

    /** 비고. */
    @Column(name = "memo", length = 500)
    private String memo;

    private PartnerContact(UUID partnerId, String contactName, String position,
                            String phone, String email, boolean isPrimary, String memo) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 필수");
        }
        if (contactName == null || contactName.isBlank()) {
            throw new IllegalArgumentException("contactName 필수");
        }
        this.partnerId = partnerId;
        this.contactName = contactName;
        this.position = position;
        this.phone = phone;
        this.email = email;
        this.isPrimary = isPrimary;
        this.memo = memo;
    }

    /**
     * 담당자 신규 등록 정적 factory.
     *
     * @param partnerId   소속 거래처 UUID
     * @param contactName 담당자명 (필수)
     * @param position    직책/직위 (nullable)
     * @param phone       직통 전화 (nullable)
     * @param email       이메일 (nullable)
     * @param isPrimary   주 담당자 여부
     * @param memo        비고 (nullable)
     * @return 영속화 전 신규 PartnerContact
     */
    public static PartnerContact create(UUID partnerId, String contactName, String position,
                                         String phone, String email, boolean isPrimary, String memo) {
        return new PartnerContact(partnerId, contactName, position, phone, email, isPrimary, memo);
    }

    /**
     * 담당자 정보 갱신 도메인 메서드.
     *
     * @param contactName 새 담당자명 (필수)
     * @param position    새 직책/직위 (nullable)
     * @param phone       새 직통 전화 (nullable)
     * @param email       새 이메일 (nullable)
     * @param memo        새 비고 (nullable)
     */
    public void update(String contactName, String position, String phone, String email, String memo) {
        if (contactName == null || contactName.isBlank()) {
            throw new IllegalArgumentException("contactName 필수");
        }
        this.contactName = contactName;
        this.position = position;
        this.phone = phone;
        this.email = email;
        this.memo = memo;
    }

    /**
     * 주 담당자로 지정. service 레이어가 동일 트랜잭션에서 기존 주 담당자를 unsetPrimary 처리 후 호출.
     */
    public void markAsPrimary() {
        this.isPrimary = Boolean.TRUE;
    }

    /**
     * 주 담당자 해제 (다른 담당자가 주 담당자로 지정될 때 service 레이어가 호출).
     */
    public void unsetPrimary() {
        this.isPrimary = Boolean.FALSE;
    }

    /**
     * 담당자 soft-delete. {@link BaseEntity#markDeleted(String)} 위임.
     *
     * @param deleterUserId 삭제 수행자 (audit deletedBy)
     */
    public void softDelete(String deleterUserId) {
        markDeleted(deleterUserId);
    }
}
