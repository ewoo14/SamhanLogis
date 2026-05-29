package com.samhanair.logis.slip.estimate.revision.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

/**
 * 견적 full-snapshot 버전이력 1건 (권한 재편 Phase 2.2).
 *
 * <p>견적 헤더+라인 전체를 한 시점의 {@link EstimateSnapshot} (JSONB) 으로 보관한다.
 * {@code estimate_revisions} 테이블 (V28) 매핑이며, 특정 {@code revisionNo} 의 스냅샷을 로드해
 * 견적을 통째로 point-in-time 복원하는 단일 source-of-truth 다.
 *
 * <p>BaseEntity 7 audit + {@code @SQLRestriction("is_deleted = false")} soft-delete 패턴을
 * 따른다. {@code estimateId} 는 FK 미강제 — estimate soft-delete 후에도 버전이력을 보존한다
 * (회계 감사 일관).
 *
 * <p>JSONB 직렬화는 Hibernate 6 {@code @JdbcTypeCode(SqlTypes.JSON)} 패턴을 재사용한다.
 *
 * <p>{@link com.samhanair.logis.slip.revision.domain.SlipRevision} 미러
 * (slipId→estimateId, slipNo→estimateNo).
 */
@Entity
@Getter
@Table(name = "estimate_revisions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class EstimateRevision extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "estimate_id", nullable = false)
    private UUID estimateId;

    @Column(name = "revision_no", nullable = false)
    private Integer revisionNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "revision_type", nullable = false, length = 16)
    private EstimateRevisionType revisionType;

    @Column(name = "source_revision_no")
    private Integer sourceRevisionNo;

    @Column(name = "estimate_no", length = 40)
    private String estimateNo;

    @Column(name = "estimate_date")
    private LocalDate estimateDate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot", nullable = false, columnDefinition = "jsonb")
    private EstimateSnapshot snapshot;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "actor_name", length = 50)
    private String actorName;

    @Column(name = "actor_color", length = 20)
    private String actorColor;

    private EstimateRevision(UUID estimateId, Integer revisionNo, EstimateRevisionType revisionType,
                             Integer sourceRevisionNo, String estimateNo, LocalDate estimateDate,
                             EstimateSnapshot snapshot, UUID actorId, String actorName,
                             String actorColor) {
        this.estimateId = estimateId;
        this.revisionNo = revisionNo;
        this.revisionType = revisionType;
        this.sourceRevisionNo = sourceRevisionNo;
        this.estimateNo = estimateNo;
        this.estimateDate = estimateDate;
        this.snapshot = snapshot;
        this.actorId = actorId;
        this.actorName = actorName;
        this.actorColor = actorColor;
    }

    /**
     * 견적 버전 스냅샷 1건을 생성한다.
     *
     * @param estimateId 대상 견적 UUID (필수)
     * @param revisionNo estimate 별 단조 증가 버전 번호 (필수, max+1 채번)
     * @param revisionType 캡처 유형 CREATE/EDIT/RESTORE (필수)
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param estimateNo 견적번호 스냅샷 (표시용)
     * @param estimateDate 견적 날짜 스냅샷
     * @param snapshot 견적 헤더+라인 full-snapshot DTO (필수)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드)
     * @param actorColor FE userIdToColor 결과 backup (선택)
     * @return 영속화 전 EstimateRevision entity
     * @throws IllegalArgumentException 필수 인자 누락 시
     */
    public static EstimateRevision of(UUID estimateId, Integer revisionNo,
                                      EstimateRevisionType revisionType, Integer sourceRevisionNo,
                                      String estimateNo, LocalDate estimateDate,
                                      EstimateSnapshot snapshot, UUID actorId, String actorName,
                                      String actorColor) {
        if (estimateId == null) {
            throw new IllegalArgumentException("estimateId 는 필수입니다");
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
        return new EstimateRevision(estimateId, revisionNo, revisionType, sourceRevisionNo,
                estimateNo, estimateDate, snapshot, actorId, actorName, actorColor);
    }
}
