package com.samhanair.logis.partnerorder.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 확정된 거래처 주문 (legacy partner-order/index.html sendOrderFromUi 6074 → 본 entity).
 * {@link #slipNo} 는 slip-service 발행 후 채워지며 UNIQUE 인덱스 + nullable 허용 (PENDING_RETRY 시 null).
 *
 * <p>UUID 비공개 가드 — 사용자 응답에서는 {@link #orderNo} (YYYY/MM/DD-N) / {@link #partnerCode} /
 * {@link #bizCode} 만 노출. {@link #id} 는 form 의 hidden field 또는 path variable 로만 사용.
 */
@Entity
@Getter
@Table(name = "partner_orders")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class PartnerOrder extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 거래처 코드 (M2 partner-auth-service 발급, JWT subject). UUID 비공개 가드. */
    @Column(name = "partner_code", nullable = false, length = 50)
    private String partnerCode;

    /** 사업자번호 (legacy bizNo). 거래처별 history 조회 키. */
    @Column(name = "biz_code", nullable = false, length = 20)
    private String bizCode;

    /** 사용자 표시용 주문번호 (YYYY/MM/DD-N 형식). */
    @Column(name = "order_no", nullable = false, length = 30, unique = true)
    private String orderNo;

    /**
     * slip-service 발행 결과의 slip 번호. 발행 성공 후 채워짐 (200/409),
     * PENDING_RETRY 상태 동안은 null. UNIQUE constraint 는 SQL 레벨에서 partial index.
     */
    @Column(name = "slip_no", length = 30)
    private String slipNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private PartnerOrderStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "slip_publish_status", nullable = false, length = 20)
    private SlipPublishStatus slipPublishStatus;

    /** 합계 (라인 priceVat 합산, server-side 계산). */
    @Column(name = "total_amount", precision = 15, scale = 2, nullable = false)
    private BigDecimal totalAmount;

    /** confirm 시각 (status=CONFIRMING 진입 시점). */
    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    /** slip 발행 성공 시각 (slipNo 채워진 순간). */
    @Column(name = "slip_published_at")
    private LocalDateTime slipPublishedAt;

    /** 영업자가 본사 direct PUT 으로 관리하는 납기일. 기존 row 는 null 허용. */
    @Column(name = "due_date")
    private LocalDate dueDate;

    /** 영업자가 본사 direct PUT 으로 관리하는 요청사항/메모. 기존 row 는 null 허용. */
    @Column(name = "memo", length = 1000)
    private String memo;

    /** JPA optimistic lock version. modifiedAt 비교는 사용자 메시지용으로 별도 유지한다. */
    @Version
    @Column(name = "lock_version", nullable = false)
    private Long lockVersion;

    /** Idempotency-Key 원본 (PO-CONF-{draftSeq} — 설계서 §3.6). 재시도 시 동일 키 재사용. */
    @Column(name = "idempotency_key", nullable = false, length = 80, unique = true)
    private String idempotencyKey;

    @OneToMany(mappedBy = "partnerOrder", cascade = CascadeType.ALL, orphanRemoval = false)
    private List<PartnerOrderLine> lines = new ArrayList<>();

    /**
     * PR-H4b 누적 수정 횟수 — partner_order_audit_logs 의 다음 revision_no 채번 보조 + FE timeline UI 표시.
     * V3 마이그에서 신규. 기존 row 는 0 으로 backfill.
     */
    @Column(name = "revision_count", nullable = false)
    private int revisionCount = 0;

    private PartnerOrder(String partnerCode, String bizCode, String orderNo,
                         String idempotencyKey, BigDecimal totalAmount) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 필수");
        }
        if (bizCode == null || bizCode.isBlank()) {
            throw new IllegalArgumentException("bizCode 필수");
        }
        if (orderNo == null || orderNo.isBlank()) {
            throw new IllegalArgumentException("orderNo 필수");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new IllegalArgumentException("idempotencyKey 필수");
        }
        this.partnerCode = partnerCode;
        this.bizCode = bizCode;
        this.orderNo = orderNo;
        this.idempotencyKey = idempotencyKey;
        this.totalAmount = totalAmount == null ? BigDecimal.ZERO : totalAmount;
        this.status = PartnerOrderStatus.CONFIRMING;
        this.slipPublishStatus = SlipPublishStatus.PENDING_RETRY;
        this.confirmedAt = LocalDateTime.now();
    }

    /**
     * confirm 흐름 진입 시점에 새 PartnerOrder 를 생성한다 (status=CONFIRMING).
     * slip 발행 결과에 따라 추후 {@link #markSlipPublished} 또는 {@link #markSlipPendingRetry} 호출.
     *
     * @param partnerCode 거래처 코드 (M2)
     * @param bizCode 사업자번호
     * @param orderNo 사용자 표시용 주문번호
     * @param idempotencyKey slip-service Idempotency-Key (PO-CONF-{draftSeq})
     * @param totalAmount DC 적용 후 server-side 계산 합계
     * @return CONFIRMING 상태의 신규 PartnerOrder (영속화 전)
     */
    public static PartnerOrder create(String partnerCode, String bizCode, String orderNo,
                                      String idempotencyKey, BigDecimal totalAmount) {
        return new PartnerOrder(partnerCode, bizCode, orderNo, idempotencyKey, totalAmount);
    }

    /** 라인 추가 — bidirectional 관계 동기화 + totalAmount 자동 누적. */
    public void addLine(PartnerOrderLine line) {
        line.bind(this);
        this.lines.add(line);
        this.totalAmount = this.totalAmount.add(line.getSubtotal());
    }

    /** 라인 합계 재계산 — 도메인 일관성 보존 (모든 라인 추가 후 호출). */
    public void recomputeTotal() {
        BigDecimal sum = BigDecimal.ZERO;
        for (PartnerOrderLine l : this.lines) {
            if (l.getDeletedAt() != null) {
                continue;
            }
            sum = sum.add(l.getSubtotal());
        }
        this.totalAmount = sum;
    }

    /**
     * 본사 direct PUT 헤더 수정.
     *
     * @param partnerCode 거래처 코드
     * @param bizCode 사업자번호
     * @param dueDate 납기일
     * @param memo 요청사항/메모
     */
    public void updateHeader(String partnerCode, String bizCode, LocalDate dueDate, String memo) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 필수");
        }
        if (bizCode == null || bizCode.isBlank()) {
            throw new IllegalArgumentException("bizCode 필수");
        }
        this.partnerCode = partnerCode;
        this.bizCode = bizCode;
        this.dueDate = dueDate;
        this.memo = memo == null || memo.isBlank() ? null : memo.trim();
    }

    /**
     * 본사 direct PUT 라인 전체 교체. 기존 active line 은 {@link BaseEntity#markDeleted(String)}
     * soft-delete 로 보존하고 새 snapshot 으로 재구성한다.
     *
     * <p>{@code orphanRemoval = false} 는 soft-delete 전략을 지키기 위한 명시 설정이다.
     * 라인 제거는 컬렉션 {@code remove()} 가 아니라 {@link BaseEntity#markDeleted(String)} 만 사용하며,
     * {@code @SQLRestriction("is_deleted = false")} 가 SELECT 시점에 deleted line 을 필터링한다.
     * 기존 active 라인만 markDeleted 처리한다. markDeleted 는 {@code isDeleted=true} 와 {@code deletedAt} 을 함께 세팅하여
     * {@code @SQLRestriction("is_deleted = false")} 와 정합을 유지하고, {@code deletedAt == null} 가드는 재처리를 방지한다.
     *
     * @param replacementLines 새 주문 라인 snapshot
     */
    public void replaceLines(List<PartnerOrderLine> replacementLines) {
        if (replacementLines == null || replacementLines.isEmpty()) {
            throw new IllegalArgumentException("lines 필수");
        }
        for (PartnerOrderLine line : this.lines) {
            if (line.getDeletedAt() == null) {
                line.markDeleted("system-partner-order-update");
            }
        }
        this.totalAmount = BigDecimal.ZERO;
        for (PartnerOrderLine line : replacementLines) {
            addLine(line);
        }
        recomputeTotal();
    }

    /**
     * slip-service 200 또는 409 idempotency duplicate — slipNo 채움 + status=CONFIRMED.
     *
     * @param slipNo slip-service 가 반환한 슬립 번호
     */
    public void markSlipPublished(String slipNo) {
        if (slipNo == null || slipNo.isBlank()) {
            throw new IllegalArgumentException("slipNo 필수");
        }
        this.slipNo = slipNo;
        this.status = PartnerOrderStatus.CONFIRMED;
        this.slipPublishStatus = SlipPublishStatus.PUBLISHED;
        this.slipPublishedAt = LocalDateTime.now();
    }

    /** slip-service 5xx → outbox 큐로 전이. status 는 CONFIRMED, slipPublishStatus 만 PENDING_RETRY 유지. */
    public void markSlipPendingRetry() {
        this.status = PartnerOrderStatus.CONFIRMED;
        this.slipPublishStatus = SlipPublishStatus.PENDING_RETRY;
    }

    /** outbox max-retry-hours 초과 — FAILED_PERMANENT + 운영 alert. */
    public void markSlipFailedPermanent() {
        this.slipPublishStatus = SlipPublishStatus.FAILED_PERMANENT;
    }

    /** 거래처 취소 또는 admin 반려. */
    public void cancel() {
        this.status = PartnerOrderStatus.CANCELED;
    }

    /** unmodifiable view — 외부 변경 차단. */
    public List<PartnerOrderLine> getLines() {
        return this.lines.stream()
                .filter(line -> line.getDeletedAt() == null)
                .toList();
    }

    /**
     * PR-H4b 단조 증가 revision 채번 — audit overlay 1행 INSERT 직전 호출.
     * 같은 mutation 의 다중 필드 변경은 service 레이어가 1회만 호출하여 같은 revisionNo 공유.
     *
     * @return 새 revisionNo (1, 2, 3, ...)
     */
    public int incrementRevision() {
        this.revisionCount += 1;
        return this.revisionCount;
    }
}
