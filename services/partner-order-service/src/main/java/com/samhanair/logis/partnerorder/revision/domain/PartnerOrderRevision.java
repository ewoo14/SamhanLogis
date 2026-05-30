package com.samhanair.logis.partnerorder.revision.domain;

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
 * 거래처 주문 full-snapshot 버전이력 1건 (Phase 2.4 버전이력 + 복원).
 *
 * <p>주문 헤더+라인 전체를 한 시점의 JSONB 스냅샷으로 보관한다.
 * {@code partner_order_revisions} 테이블 (V7) 매핑이며, 특정 {@code revisionNo} 의
 * 스냅샷을 로드해 주문을 통째로 point-in-time 복원하는 단일 source-of-truth 다.
 *
 * <p>BaseEntity 7 audit + {@code @SQLRestriction("is_deleted = false")} soft-delete 패턴을
 * 따른다. {@code partnerOrderId} 는 FK 미강제 — 주문 soft-delete 후에도 버전이력을 보존한다
 * (회계 감사 일관).
 *
 * <p>JSONB 직렬화는 Hibernate 6 {@code @JdbcTypeCode(SqlTypes.JSON)} 패턴을 재사용한다.
 * {@code snapshot} 필드는 Jackson {@code ObjectMapper} 로 직렬화된 JSON 문자열이며,
 * 서비스 계층에서 역직렬화하여 복원에 사용한다.
 *
 * <p><b>UUID 비공개 가드</b> ({@code feedback_uuid_no_user_visibility}):
 * {@code actorId} 는 감사 추적용. 사용자 화면에는 {@code actorName} 만 노출.
 * 게이트웨이 X-User-Name 미전파 시 {@code actorName=null} 저장 (UUID 노출 금지).
 *
 * <p><b>revision_no 채번</b>: 서비스 계층에서 {@code MAX(revision_no)+1} per order 로 채번.
 * {@code saveAndFlush} + {@code DataIntegrityViolationException} 1회 재시도 → 409.
 * {@code partner_orders.revision_count} 와는 별개 채널.
 *
 * <p>{@link com.samhanair.logis.slip.estimate.revision.domain.EstimateRevision} 미러
 * (estimateId→partnerOrderId, estimateNo→orderNo, estimateDate 제거, STATUS type 추가).
 */
@Entity
@Getter
@Table(name = "partner_order_revisions")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerOrderRevision extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 소속 거래처 주문 UUID (FK 미강제). */
    @Column(name = "partner_order_id", nullable = false)
    private UUID partnerOrderId;

    /** order 별 단조 증가 버전 번호 (1, 2, 3, ...). */
    @Column(name = "revision_no", nullable = false)
    private Integer revisionNo;

    /** 캡처 유형 (CREATE / EDIT / STATUS / RESTORE). */
    @Enumerated(EnumType.STRING)
    @Column(name = "revision_type", nullable = false, length = 16)
    private PartnerOrderRevisionType revisionType;

    /** RESTORE 시 출처 revision_no. 그 외 null. */
    @Column(name = "source_revision_no")
    private Integer sourceRevisionNo;

    /** 표시 식별자 스냅샷 (YYYY/MM/DD-N 형식). */
    @Column(name = "order_no", length = 30)
    private String orderNo;

    /**
     * 주문 헤더+라인 full-snapshot JSON 문자열.
     *
     * <p>Hibernate 6 {@code @JdbcTypeCode(SqlTypes.JSON)} 으로 PostgreSQL JSONB 컬럼에 매핑.
     * Jackson ObjectMapper 직렬화/역직렬화는 서비스 계층에서 담당.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot", nullable = false, columnDefinition = "jsonb")
    private String snapshot;

    /** 변경 주체 UUID — 감사 추적용. 화면 노출 금지 (UUID 비공개 가드). */
    @Column(name = "actor_id")
    private UUID actorId;

    /** 변경 주체 표시명 — UUID 비공개 가드 적용 후 저장. UUID 패턴이면 null. */
    @Column(name = "actor_name", length = 50)
    private String actorName;

    /** FE userIdToColor 결과 backup (선택). */
    @Column(name = "actor_color", length = 20)
    private String actorColor;

    private PartnerOrderRevision(UUID partnerOrderId, Integer revisionNo,
                                 PartnerOrderRevisionType revisionType, Integer sourceRevisionNo,
                                 String orderNo, String snapshot,
                                 UUID actorId, String actorName, String actorColor) {
        this.partnerOrderId = partnerOrderId;
        this.revisionNo = revisionNo;
        this.revisionType = revisionType;
        this.sourceRevisionNo = sourceRevisionNo;
        this.orderNo = orderNo;
        this.snapshot = snapshot;
        this.actorId = actorId;
        this.actorName = actorName;
        this.actorColor = actorColor;
    }

    /**
     * 거래처 주문 버전 스냅샷 1건을 생성한다.
     *
     * <p>직접 setter 금지 — 본 정적 팩토리만 사용.
     *
     * @param partnerOrderId 대상 거래처 주문 UUID (필수)
     * @param revisionNo     order 별 단조 증가 버전 번호 (필수, MAX+1 채번)
     * @param revisionType   캡처 유형 CREATE/EDIT/STATUS/RESTORE (필수)
     * @param sourceRevisionNo RESTORE 시 복원 출처 revision (그 외 null)
     * @param orderNo        주문번호 스냅샷 (표시용, nullable)
     * @param snapshot       헤더+라인 full-snapshot JSON 문자열 (필수)
     * @param actorId        변경 주체 UUID (감사용, 화면 노출 금지)
     * @param actorName      변경 주체 표시명 (UUID 비공개 가드 적용 후, nullable)
     * @param actorColor     FE userIdToColor 결과 backup (선택)
     * @return 영속화 전 PartnerOrderRevision 엔티티
     * @throws IllegalArgumentException 필수 인자 누락 시
     */
    public static PartnerOrderRevision of(UUID partnerOrderId, Integer revisionNo,
                                          PartnerOrderRevisionType revisionType,
                                          Integer sourceRevisionNo, String orderNo,
                                          String snapshot, UUID actorId,
                                          String actorName, String actorColor) {
        if (partnerOrderId == null) {
            throw new IllegalArgumentException("partnerOrderId 는 필수입니다");
        }
        if (revisionNo == null || revisionNo < 1) {
            throw new IllegalArgumentException("revisionNo 는 1 이상 필수입니다");
        }
        if (revisionType == null) {
            throw new IllegalArgumentException("revisionType 은 필수입니다");
        }
        if (snapshot == null || snapshot.isBlank()) {
            throw new IllegalArgumentException("snapshot 은 필수입니다");
        }
        return new PartnerOrderRevision(partnerOrderId, revisionNo, revisionType,
                sourceRevisionNo, orderNo, snapshot, actorId, actorName, actorColor);
    }
}
