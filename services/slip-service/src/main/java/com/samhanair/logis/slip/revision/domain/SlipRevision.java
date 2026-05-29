package com.samhanair.logis.slip.revision.domain;

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
 * 전표 full-snapshot 버전이력 1건 (권한 재편 Phase 2.1).
 *
 * <p>전표 헤더+라인 전체를 한 시점의 {@link SlipSnapshot} (JSONB) 으로 보관한다.
 * {@code slip_revisions} 테이블 (V27) 매핑이며, 특정 {@code revisionNo} 의 스냅샷을 로드해
 * 전표를 통째로 point-in-time 복원하는 단일 source-of-truth 다.
 *
 * <p>BaseEntity 7 audit + {@code @SQLRestriction("is_deleted = false")} soft-delete 패턴을
 * 따른다. {@code slipId} 는 FK 미강제 — slip soft-delete 후에도 버전이력을 보존한다
 * (회계 감사 일관).
 *
 * <p>JSONB 직렬화는 {@link com.samhanair.logis.slip.domain.SlipCleanupSaveHistory} 와 동일한
 * Hibernate 6 {@code @JdbcTypeCode(SqlTypes.JSON)} 패턴을 재사용한다.
 */
@Entity
@Getter
@Table(name = "slip_revisions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SlipRevision extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    @Column(name = "revision_no", nullable = false)
    private Integer revisionNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "revision_type", nullable = false, length = 16)
    private SlipRevisionType revisionType;

    @Column(name = "source_revision_no")
    private Integer sourceRevisionNo;

    @Column(name = "slip_no", length = 40)
    private String slipNo;

    @Column(name = "slip_date")
    private LocalDate slipDate;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot", nullable = false, columnDefinition = "jsonb")
    private SlipSnapshot snapshot;

    @Column(name = "actor_id")
    private UUID actorId;

    @Column(name = "actor_name", length = 50)
    private String actorName;

    @Column(name = "actor_color", length = 20)
    private String actorColor;

    private SlipRevision(UUID slipId, Integer revisionNo, SlipRevisionType revisionType,
                         Integer sourceRevisionNo, String slipNo, LocalDate slipDate,
                         SlipSnapshot snapshot, UUID actorId, String actorName, String actorColor) {
        this.slipId = slipId;
        this.revisionNo = revisionNo;
        this.revisionType = revisionType;
        this.sourceRevisionNo = sourceRevisionNo;
        this.slipNo = slipNo;
        this.slipDate = slipDate;
        this.snapshot = snapshot;
        this.actorId = actorId;
        this.actorName = actorName;
        this.actorColor = actorColor;
    }

    /**
     * 전표 버전 스냅샷 1건을 생성한다.
     *
     * @param slipId 대상 전표 UUID (필수)
     * @param revisionNo slip 별 단조 증가 버전 번호 (필수, max+1 채번)
     * @param revisionType 캡처 유형 CREATE/EDIT/RESTORE (필수)
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param slipNo 전표번호 스냅샷 (표시용)
     * @param slipDate 전표 날짜 스냅샷
     * @param snapshot 전표 헤더+라인 full-snapshot DTO (필수)
     * @param actorId 변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName 변경 주체 표시명 (UUID 비공개 가드)
     * @param actorColor FE userIdToColor 결과 backup (선택)
     * @return 영속화 전 SlipRevision entity
     * @throws IllegalArgumentException 필수 인자 누락 시
     */
    public static SlipRevision of(UUID slipId, Integer revisionNo, SlipRevisionType revisionType,
                                  Integer sourceRevisionNo, String slipNo, LocalDate slipDate,
                                  SlipSnapshot snapshot, UUID actorId, String actorName,
                                  String actorColor) {
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 는 필수입니다");
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
        return new SlipRevision(slipId, revisionNo, revisionType, sourceRevisionNo,
                slipNo, slipDate, snapshot, actorId, actorName, actorColor);
    }
}
