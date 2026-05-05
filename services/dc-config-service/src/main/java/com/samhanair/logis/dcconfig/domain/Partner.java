package com.samhanair.logis.dcconfig.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 거래처 마스터 — Phase 6 M3 owner (옵션 A).
 *
 * <p>M2 partner-service 는 인증/세션/패스워드 만 보유하며 본 entity 를
 * internal RPC ({@code GET /internal/partners/{partnerCode}}) 로 조회한다.
 *
 * <p>UUID 비공개 — 사용자 노출 식별자는 {@code partnerCode} (사업자번호 변형 또는 별도 코드).
 * Soft-delete via {@link SQLRestriction}.
 */
@Entity
@Getter
@Table(name = "partners")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Partner extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 사용자 노출 식별자 (UUID 비공개 원칙) — 사업자번호 또는 별도 거래처코드. */
    @Column(name = "partner_code", nullable = false, length = 64)
    private String partnerCode;

    /** 사업자등록번호 (10자리 숫자, '-' 제거 정규화). */
    @Column(name = "biz_no", length = 20)
    private String bizNo;

    /** 상호 (사업자등록증 기재명). */
    @Column(name = "name", nullable = false, length = 150)
    private String name;

    /** 도로명/지번 주소 (legacy 시트 그대로). */
    @Column(name = "address", length = 500)
    private String address;

    /** 대표 연락처. */
    @Column(name = "phone", length = 30)
    private String phone;

    /** 담당자 이름 (legacy 시트 "담당자"). */
    @Column(name = "manager", length = 50)
    private String manager;

    /** 거래처 그룹 14 enum. */
    @Enumerated(EnumType.STRING)
    @Column(name = "partner_group", nullable = false, length = 30)
    private PartnerGroup partnerGroup = PartnerGroup.UNCLASSIFIED;

    /** 채권 한도 (정수 원). 0 = 한도 없음. */
    @Column(name = "credit_limit", precision = 15, scale = 2)
    private BigDecimal creditLimit;

    /** 비고. */
    @Column(name = "remark", columnDefinition = "TEXT")
    private String remark;

    private Partner(String partnerCode, String bizNo, String name, String address,
                    String phone, String manager, PartnerGroup partnerGroup,
                    BigDecimal creditLimit, String remark) {
        this.partnerCode = partnerCode;
        this.bizNo = bizNo;
        this.name = name;
        this.address = address;
        this.phone = phone;
        this.manager = manager;
        this.partnerGroup = partnerGroup == null ? PartnerGroup.UNCLASSIFIED : partnerGroup;
        this.creditLimit = creditLimit;
        this.remark = remark;
    }

    public static Partner create(String partnerCode, String bizNo, String name, String address,
                                 String phone, String manager, PartnerGroup partnerGroup,
                                 BigDecimal creditLimit, String remark) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 는 필수입니다");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("거래처명은 필수입니다");
        }
        if (creditLimit != null && creditLimit.signum() < 0) {
            throw new IllegalArgumentException("채권 한도는 0 이상이어야 합니다");
        }
        return new Partner(partnerCode.trim(), normaliseBizNo(bizNo), name.trim(),
                address, phone, manager, partnerGroup, creditLimit, remark);
    }

    public void rename(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("거래처명은 필수입니다");
        }
        this.name = name.trim();
    }

    public void changeContact(String address, String phone, String manager) {
        this.address = address;
        this.phone = phone;
        this.manager = manager;
    }

    public void changeGroup(PartnerGroup partnerGroup) {
        this.partnerGroup = partnerGroup == null ? PartnerGroup.UNCLASSIFIED : partnerGroup;
    }

    public void changeCreditLimit(BigDecimal creditLimit) {
        if (creditLimit != null && creditLimit.signum() < 0) {
            throw new IllegalArgumentException("채권 한도는 0 이상이어야 합니다");
        }
        this.creditLimit = creditLimit;
    }

    public void changeRemark(String remark) {
        this.remark = remark;
    }

    private static String normaliseBizNo(String bizNo) {
        if (bizNo == null) {
            return null;
        }
        String digits = bizNo.replaceAll("[^0-9]", "");
        return digits.isEmpty() ? null : digits;
    }
}
