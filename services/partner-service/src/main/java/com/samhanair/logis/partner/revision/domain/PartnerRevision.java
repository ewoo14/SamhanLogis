package com.samhanair.logis.partner.revision.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 거래처 full-snapshot 버전이력 1건 (권한 재편 Phase 2.3).
 *
 * <p>거래처 헤더 + 4탭 자식(단가/배송지/담당자) 전체를 한 시점의 {@link PartnerSnapshot} (JSONB) 으로
 * 보관한다. {@code partner_revisions} 테이블 (V12) 매핑이며, 특정 {@code revisionNo} 의 스냅샷을 로드해
 * 거래처를 통째로 point-in-time 복원하는 단일 source-of-truth 다.
 *
 * <p>BaseEntity 7 audit + {@code @SQLRestriction("is_deleted = false")} soft-delete 패턴을
 * 따른다. {@code partnerId} 는 FK 미강제 — partner soft-delete 후에도 버전이력을 보존한다
 * (회계 감사 일관).
 *
 * <p>JSONB 직렬화는 Hibernate 6 {@code @JdbcTypeCode(SqlTypes.JSON)} 패턴을 사용한다
 * (partner-service JSONB 첫 도입 — slip-service estimate 패턴 미러).
 *
 * <p>{@code com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision} 미러
 * (estimateId→partnerId, estimateNo→partnerCode, estimateDate 컬럼 없음).
 */
@Entity
@Getter
@Table(name = "partner_revisions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerRevision extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "revision_no", nullable = false)
    private Integer revisionNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "revision_type", nullable = false, length = 16)
    private PartnerRevisionType revisionType;

    @Column(name = "source_revision_no")
    private Integer sourceRevisionNo;

    @Column(name = "partner_code", length = 40)
    private String partnerCode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot", nullable = false, columnDefinition = "jsonb")
    private PartnerSnapshot snapshot;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "actor_name", length = 50)
    private String actorName;

    @Column(name = "actor_color", length = 20)
    private String actorColor;

    private PartnerRevision(UUID partnerId, Integer revisionNo, PartnerRevisionType revisionType,
                            Integer sourceRevisionNo, String partnerCode, PartnerSnapshot snapshot,
                            UUID actorId, String actorName, String actorColor) {
        this.partnerId = partnerId;
        this.revisionNo = revisionNo;
        this.revisionType = revisionType;
        this.sourceRevisionNo = sourceRevisionNo;
        this.partnerCode = partnerCode;
        this.snapshot = snapshot;
        this.actorId = actorId;
        this.actorName = actorName;
        this.actorColor = actorColor;
    }

    /**
     * 거래처 버전 스냅샷 1건을 생성한다.
     *
     * @param partnerId 대상 거래처 UUID (필수)
     * @param revisionNo partner 별 단조 증가 버전 번호 (필수, max+1 채번)
     * @param revisionType 캡처 유형 CREATE/EDIT/RESTORE (필수)
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param partnerCode 거래처 식별자 스냅샷 (표시용)
     * @param snapshot 거래처 헤더 + 4탭 자식 full-snapshot DTO (필수)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드)
     * @param actorColor FE userIdToColor 결과 backup (선택)
     * @return 영속화 전 PartnerRevision entity
     * @throws IllegalArgumentException 필수 인자 누락 시
     */
    public static PartnerRevision of(UUID partnerId, Integer revisionNo,
                                     PartnerRevisionType revisionType, Integer sourceRevisionNo,
                                     String partnerCode, PartnerSnapshot snapshot,
                                     UUID actorId, String actorName, String actorColor) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
        if (revisionNo == null) {
            throw new IllegalArgumentException("revisionNo 는 필수입니다");
        }
        if (revisionType == null) {
            throw new IllegalArgumentException("revisionType 은 필수입니다");
        }
        if (snapshot == null) {
            throw new IllegalArgumentException("snapshot 은 필수입니다");
        }
        return new PartnerRevision(partnerId, revisionNo, revisionType, sourceRevisionNo,
                partnerCode, snapshot, actorId, actorName, actorColor);
    }
}
