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
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
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

    /** 견적 -> 주문 변환 source estimate UUID. 변환 주문만 채운다. */
    @Column(name = "source_estimate_id")
    private UUID sourceEstimateId;

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

    /**
     * 견적 snapshot 을 거래처 주문으로 변환한다.
     *
     * <p>source estimate 는 외부 estimate-service UUID 이며, 본 service 는 logical reference 로만 보존한다.
     * confirm/outbox 흐름은 별도 사용자 확정 이후 진행하므로 전표 발행 상태는 {@link SlipPublishStatus#NOT_REQUIRED} 로 시작한다.
     */
    public static PartnerOrder createFromEstimate(String partnerCode, String bizCode, String orderNo,
                                                  String idempotencyKey, BigDecimal totalAmount,
                                                  UUID sourceEstimateId, LocalDate dueDate, String memo) {
        if (sourceEstimateId == null) {
            throw new IllegalArgumentException("sourceEstimateId 필수");
        }
        PartnerOrder order = new PartnerOrder(partnerCode, bizCode, orderNo, idempotencyKey, totalAmount);
        order.status = PartnerOrderStatus.DRAFT;
        order.slipPublishStatus = SlipPublishStatus.NOT_REQUIRED;
        order.confirmedAt = null;
        order.sourceEstimateId = sourceEstimateId;
        order.dueDate = dueDate;
        order.memo = memo == null || memo.isBlank() ? null : memo.trim();
        return order;
    }

    /** 라인 추가 — bidirectional 관계 동기화 + totalAmount 자동 누적. */
    public void addLine(PartnerOrderLine line) {
        line.bind(this);
        this.lines.add(line);
        this.totalAmount = this.totalAmount.add(line.getSubtotal());
    }

    /**
     * 라인 합계 재계산 — active line snapshot 기준 최종 합계를 다시 만든다.
     *
     * <p>{@link #addLine(PartnerOrderLine)} 이 추가 시점에 누적 합계를 유지하고, 본 메서드는 저장 직전/라인 교체 후
     * 방어적으로 재합산한다. 둘을 연속 호출해도 결과는 active line subtotal 합계와 동일하다.
     */
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

    /** 주문 헤더와 전체 라인을 soft-delete 처리한다. */
    public void softDeleteCascade(String actor) {
        markDeleted(actor);
        for (PartnerOrderLine line : this.lines) {
            if (line.getDeletedAt() == null) {
                line.markDeleted(actor);
            }
        }
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

    /**
     * soft-delete 된 주문을 활성 상태로 복구한다 (undelete).
     *
     * <p>삭제된 주문도 복원 대상이 됨에 따라 (설계서 §3.3a) undelete 가 필요하다.
     * {@link com.samhanair.logis.common.entity.BaseEntity#markRestored()} 를 통해
     * {@code is_deleted=false} 로 전환하고 {@code deletedAt}/{@code deletedBy} 를 클리어한다.
     *
     * <p>헤더/라인 내용 역적용은 별도 {@link #restoreHeader} + {@link #replaceLines} 로 수행한다.
     * 본 메서드는 undelete(활성화) 만 담당한다.
     *
     * <p>이미 활성(is_deleted=false) 상태인 주문에 호출해도 멱등하게 동작한다.
     *
     * <p>연결된 라인은 {@link #replaceLines(List)} 에서 soft-delete 후 재생성되므로
     * 별도 라인 undelete 처리가 불필요하다.
     */
    public void restoreFromDeleted() {
        markRestored();
    }

    /**
     * point-in-time 복원 가능 상태인지 검사한다 (Phase 2.4 버전이력 + 복원).
     *
     * <p><b>제외목록 방식</b>: 복원은 CONFIRMING · CANCELED 를 제외한 모든 상태에서 허용한다.
     * <ul>
     *   <li>{@link PartnerOrderStatus#CONFIRMING} — 출고전표 전환 중(transient) 상태: 거부</li>
     *   <li>{@link PartnerOrderStatus#CANCELED} — 취소 완료 상태: 거부</li>
     *   <li>{@link PartnerOrderStatus#DRAFT} — 진행중: 허용</li>
     *   <li>{@link PartnerOrderStatus#CONFIRMED} — 완료(출고전표 발행): 허용
     *       (복원 후 slip 재동기화 필요 여부는 호출자가 {@code slipResyncRequired} 플래그로 판단)</li>
     *   <li>추후 ON_HOLD 추가 시 이 가드 수정 불필요 (허용 기본)</li>
     * </ul>
     *
     * <p>설계서 §3.3 복원 가드 참조.
     *
     * @throws org.springframework.web.server.ResponseStatusException(409)
     *         CONFIRMING 또는 CANCELED 상태에서 호출 시
     */
    public void requireRestorable() {
        if (this.status == PartnerOrderStatus.CONFIRMING
                || this.status == PartnerOrderStatus.CANCELED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "진행 중(전환)이거나 취소된 주문은 복원할 수 없습니다. 현재 상태: " + this.status);
        }
    }

    /**
     * 복원 스냅샷의 헤더 필드를 현재 주문에 역적용한다 (Phase 2.4 point-in-time 복원).
     *
     * <p>복원 가능 상태 가드({@link #requireRestorable()})는 호출자가 선행 호출해야 한다.
     * 직접 필드 setter 금지 — 도메인 메서드를 통해서만 변경한다.
     *
     * <p><b>복원 대상</b>: partnerCode / bizCode / dueDate / memo 만 역적용한다.
     *
     * <p><b>복원 제외 (slip 연동 필드)</b>: status / slipNo / slipPublishStatus /
     * confirmedAt / slipPublishedAt 은 역적용하지 않는다.
     * CONFIRMED 상태 주문을 복원하더라도 출고전표 발행 사실은 보존된다 — 컨트롤러가
     * {@code slipResyncRequired} 플래그를 응답에 포함하여 재발행 필요 여부를 호출자에게 알린다.
     *
     * @param partnerCode 복원할 거래처 코드
     * @param bizCode     복원할 사업자번호
     * @param dueDate     복원할 납기일
     * @param memo        복원할 메모/요청사항
     */
    public void restoreHeader(String partnerCode, String bizCode, LocalDate dueDate, String memo) {
        this.updateHeader(partnerCode, bizCode, dueDate, memo);
    }
}
