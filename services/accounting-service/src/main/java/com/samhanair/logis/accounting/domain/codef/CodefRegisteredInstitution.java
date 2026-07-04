package com.samhanair.logis.accounting.domain.codef;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * CODEF connectedId에 등록된 기관 메타.
 *
 * <p>ID/PW/인증서 비밀번호 같은 실 자격은 이 엔티티에 존재하지 않는다.
 */
@Entity
@Getter
@Table(name = "codef_registered_institution")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class CodefRegisteredInstitution extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "connection_id", nullable = false)
    private CodefConnection connection;

    @Enumerated(EnumType.STRING)
    @Column(name = "business_type", nullable = false, length = 20)
    private CodefBusinessType businessType;

    @Column(name = "organization_code", nullable = false, length = 50)
    private String organizationCode;

    @Column(name = "account_identifier", length = 128)
    private String accountIdentifier;

    @Column(name = "nickname", length = 100)
    private String nickname;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 30)
    private CodefInstitutionStatus status;

    @Column(name = "registered_at", nullable = false)
    private LocalDateTime registeredAt;

    @Column(name = "last_verified_at")
    private LocalDateTime lastVerifiedAt;

    /**
     * 등록 기관 메타를 생성한다.
     *
     * @param connection        CODEF 연결
     * @param businessType      업무 구분
     * @param organizationCode  기관 코드
     * @param accountIdentifier 마스킹된 계좌·카드 식별자
     * @param nickname          표시 별칭
     * @param status            등록 상태
     * @return 신규 등록 기관
     */
    public static CodefRegisteredInstitution create(
            CodefConnection connection,
            CodefBusinessType businessType,
            String organizationCode,
            String accountIdentifier,
            String nickname,
            CodefInstitutionStatus status) {
        CodefRegisteredInstitution institution = new CodefRegisteredInstitution();
        institution.connection = connection;
        institution.businessType = businessType;
        institution.organizationCode = requireText(organizationCode, "기관 코드는 필수입니다");
        institution.accountIdentifier = normalizeNullable(accountIdentifier);
        institution.nickname = normalizeNullable(nickname);
        institution.status = status == null ? CodefInstitutionStatus.ERROR : status;
        institution.registeredAt = LocalDateTime.now();
        if (institution.status == CodefInstitutionStatus.ACTIVE) {
            institution.lastVerifiedAt = institution.registeredAt;
        }
        return institution;
    }

    /**
     * 이미 등록된 기관을 동일 자연키로 재등록(멱등)한다.
     *
     * <p>같은 (connection, businessType, organizationCode) 재등록 시 활성 중복행을 만들지 않고
     * 기존 행의 상태·등록/검증 시각만 갱신한다. 자연키 기반 해제(unregister)의 대상 모호성을 원천 차단한다.
     *
     * @param status 등록 상태
     * @return {@code this}
     */
    public CodefRegisteredInstitution reregister(CodefInstitutionStatus status) {
        this.status = status == null ? CodefInstitutionStatus.ERROR : status;
        this.registeredAt = LocalDateTime.now();
        if (this.status == CodefInstitutionStatus.ACTIVE) {
            this.lastVerifiedAt = this.registeredAt;
        }
        return this;
    }

    /**
     * 등록 기관을 soft-delete 한다.
     *
     * @param actor 해제 수행자 식별자
     * @return {@code this}
     */
    public CodefRegisteredInstitution unregister(String actor) {
        markDeleted(actor == null || actor.isBlank() ? "SYSTEM" : actor.trim());
        return this;
    }

    private static String requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private static String normalizeNullable(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
