package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.accounting.util.DepositorNameNormalizer;
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
 * 입금자명과 거래처 내부 식별자를 기억하는 매핑 현재 상태.
 *
 * <p>정규화 키는 활성 행에서만 유일하며, 변경 이력은 accounting audit log에 별도로 append-only
 * 로 기록한다. partnerId는 accounting-service 내부 join 키이고 API로 노출하지 않는다.
 */
@Entity
@Getter
@Table(name = "bank_depositor_partner_mapping")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class BankDepositorPartnerMapping extends BaseEntity {

    /** 매핑 내부 UUID. */
    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** 사용자가 마지막으로 지정한 원본 입금자명. */
    @Column(name = "raw_name", nullable = false, length = 120)
    private String rawName;

    /** 검색·유일성 판단에 사용하는 보수적 정규화 키. */
    @Column(name = "normalized_name", nullable = false, length = 120)
    private String normalizedName;

    /** 거래처 내부 UUID. 사용자 응답에는 partnerCode/name만 사용한다. */
    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    /** 외부 조회 장애·삭제 감사에서도 보존해야 하는 거래처 코드 snapshot. */
    @Column(name = "partner_code", length = 100)
    private String partnerCodeSnapshot;

    private BankDepositorPartnerMapping(String rawName, UUID partnerId, String partnerCode) {
        updateMapping(rawName, partnerId, partnerCode);
    }

    /** 새 매핑을 생성한다. */
    public static BankDepositorPartnerMapping create(String rawName, UUID partnerId) {
        return create(rawName, partnerId, null);
    }

    /** 거래처 코드 snapshot과 함께 새 매핑을 생성한다. */
    public static BankDepositorPartnerMapping create(String rawName, UUID partnerId, String partnerCode) {
        return new BankDepositorPartnerMapping(rawName, partnerId, partnerCode);
    }

    /** 원본명 변경 또는 거래처 재지정을 도메인 메서드로 수행한다. */
    public BankDepositorPartnerMapping updateMapping(String rawName, UUID partnerId) {
        return updateMapping(rawName, partnerId, null);
    }

    /** 원본명·거래처·감사 보존용 거래처 코드 snapshot을 갱신한다. */
    public BankDepositorPartnerMapping updateMapping(String rawName, UUID partnerId, String partnerCode) {
        if (rawName == null || rawName.isBlank()) {
            throw new IllegalArgumentException("rawName 은 필수입니다");
        }
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
        String normalized = DepositorNameNormalizer.normalize(rawName);
        if (normalized == null || normalized.isBlank()) {
            throw new IllegalArgumentException("rawName 은 공백만 사용할 수 없습니다");
        }
        if (rawName.trim().length() > 120 || normalized.length() > 120) {
            throw new IllegalArgumentException("입금자명은 120자 이하여야 합니다");
        }
        this.rawName = rawName.trim();
        this.normalizedName = normalized;
        this.partnerId = partnerId;
        this.partnerCodeSnapshot = partnerCode == null || partnerCode.isBlank() ? null : partnerCode.trim();
        return this;
    }

    /** 관리자가 매핑을 soft delete한다. */
    public BankDepositorPartnerMapping delete(String actor) {
        markDeleted(actor);
        return this;
    }
}
