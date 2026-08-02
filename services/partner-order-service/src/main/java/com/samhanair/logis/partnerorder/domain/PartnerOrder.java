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
import jakarta.persistence.OrderBy;
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
 * {@link #bizCode} 만 노출. {@link #id}와 {@link #partnerId}는 정체성/내부 추적용이며 화면에 노출하지 않는다.
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

    /** 거래처 내부 UUID snapshot. legacy 주문은 null이며 정체성 미해결로 병합할 수 없다. */
    @Column(name = "partner_id")
    private UUID partnerId;

    /** 사업자번호 (legacy bizNo). 거래처별 history 조회 키. */
    @Column(name = "biz_code", nullable = false, length = 20)
    private String bizCode;

    /** 사용자 표시용 주문번호 (YYYY/MM/DD-N 형식). */
    @Column(name = "order_no", nullable = false, length = 30, unique = true)
    private String orderNo;

    /**
     * slip-service 발행 결과의 slip 번호. 발행 성공 후 채워짐 (200 replay/201 신규),
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

    /** 실제 배송 현장의 구조화 주소 snapshot. 기존 주문은 출처가 없어 null을 유지한다. */
    @Column(name = "delivery_address", length = 500)
    private String deliveryAddress;

    /** 삭제자 표시명. {@code deleted_by} 는 감사 userId 를 보존하고, 화면용 이름만 본 컬럼에 저장한다. */
    @Column(name = "deleted_by_name", length = 100)
    private String deletedByName;

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

    // @OrderBy 결정적 정렬 — 협업 lineKey(활성라인 1-based index)가 loadSnapshot/applyOverlayPatchBatch
    // 세션 간 + 상세 응답/FE 표시에서 동일 라인을 가리키도록 보장(DB heap 반환 순서 비보장 회피).
    @OneToMany(mappedBy = "partnerOrder", cascade = CascadeType.ALL, orphanRemoval = false)
    @OrderBy("createdAt ASC, id ASC")
    private List<PartnerOrderLine> lines = new ArrayList<>();

    /**
     * PR-H4b 누적 수정 횟수 — partner_order_audit_logs 의 다음 revision_no 채번 보조 + FE timeline UI 표시.
     * V3 마이그에서 신규. 기존 row 는 0 으로 backfill.
     */
    @Column(name = "revision_count", nullable = false)
    private int revisionCount = 0;

    private PartnerOrder(UUID partnerId, String partnerCode, String bizCode, String orderNo,
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
        this.partnerId = partnerId;
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
     * <p><b>레거시(슬라이스 D1 이후)</b>: confirm 자동발행 폐지로 신규 흐름 미사용. 레거시 PENDING_RETRY
     * 주문 / outbox 스케줄러 호환을 위해 유지(코드 물리 제거는 후속).
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
        return new PartnerOrder(null, partnerCode, bizCode, orderNo, idempotencyKey, totalAmount);
    }

    /**
     * 거래처 포털 confirm 흐름 — slip 미발행 DRAFT 주문 생성 (슬라이스 D1).
     *
     * <p>confirm 자동발행 폐지(D-CF-02). 주문은 진행중(DRAFT) + slipPublishStatus=NOT_REQUIRED 로
     * 생성되며, 출고전표는 이후 명시적 convert 액션으로만 발행된다. from-estimate 경로
     * ({@link #createFromEstimate})와 동형(주문생성 일원화). sourceEstimateId 는 없다(거래처 직접 주문).
     *
     * @param partnerCode 거래처 코드
     * @param bizCode 사업자번호
     * @param orderNo 사용자 표시용 주문번호
     * @param idempotencyKey 멱등 키 (PO-CONF-{partnerCode}-{draftSeq}) — 주문 중복생성 가드
     * @param totalAmount DC 적용 후 server-side 합계
     * @return DRAFT 상태의 신규 PartnerOrder (영속화 전)
     */
    public static PartnerOrder createFromConfirm(String partnerCode, String bizCode, String orderNo,
                                                 String idempotencyKey, BigDecimal totalAmount) {
        return createFromConfirm((UUID) null, partnerCode, bizCode, orderNo, idempotencyKey,
                totalAmount, null);
    }

    /** 구조화된 배송주소를 함께 snapshot하는 거래처 직접 주문 생성 overload. */
    public static PartnerOrder createFromConfirm(String partnerCode, String bizCode, String orderNo,
                                                 String idempotencyKey, BigDecimal totalAmount,
                                                 String deliveryAddress) {
        return createFromConfirm((UUID) null, partnerCode, bizCode, orderNo, idempotencyKey,
                totalAmount, deliveryAddress);
    }

    /** partner-service에서 확인한 거래처 UUID를 함께 보존하는 신규 confirm 주문 생성. */
    public static PartnerOrder createFromConfirm(UUID partnerId, String partnerCode, String bizCode,
                                                 String orderNo, String idempotencyKey,
                                                 BigDecimal totalAmount) {
        return createFromConfirm(partnerId, partnerCode, bizCode, orderNo, idempotencyKey,
                totalAmount, null);
    }

    /** partner-service 정체성과 구조화된 배송주소를 함께 보존하는 신규 confirm 주문 생성. */
    public static PartnerOrder createFromConfirm(UUID partnerId, String partnerCode, String bizCode,
                                                 String orderNo, String idempotencyKey,
                                                 BigDecimal totalAmount, String deliveryAddress) {
        PartnerOrder order = new PartnerOrder(partnerId, partnerCode, bizCode,
                orderNo, idempotencyKey, totalAmount);
        order.status = PartnerOrderStatus.DRAFT;
        order.slipPublishStatus = SlipPublishStatus.NOT_REQUIRED;
        order.confirmedAt = null;
        order.deliveryAddress = normalizeOptionalText(deliveryAddress);
        return order;
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
        return createFromEstimate(null, partnerCode, bizCode, orderNo, idempotencyKey, totalAmount,
                sourceEstimateId, dueDate, memo);
    }

    /** partner-service에서 확인한 거래처 UUID를 함께 보존하는 신규 견적 변환 주문 생성. */
    public static PartnerOrder createFromEstimate(UUID partnerId, String partnerCode, String bizCode,
                                                  String orderNo, String idempotencyKey,
                                                  BigDecimal totalAmount, UUID sourceEstimateId,
                                                  LocalDate dueDate, String memo) {
        if (sourceEstimateId == null) {
            throw new IllegalArgumentException("sourceEstimateId 필수");
        }
        PartnerOrder order = new PartnerOrder(partnerId, partnerCode, bizCode,
                orderNo, idempotencyKey, totalAmount);
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
        UUID partnerId = java.util.Objects.equals(this.partnerCode, partnerCode)
                && java.util.Objects.equals(this.bizCode, bizCode)
                ? this.partnerId : null;
        updateHeader(partnerId, partnerCode, bizCode, dueDate, memo);
    }

    /** 거래처 표시 snapshot과 함께 내부 거래처 UUID를 원자적으로 갱신한다. */
    public void updateHeader(UUID partnerId, String partnerCode, String bizCode,
                             LocalDate dueDate, String memo) {
        updateHeader(partnerId, partnerCode, bizCode, dueDate, memo, this.deliveryAddress);
    }

    /** 주문 헤더와 구조화된 배송주소 snapshot을 원자적으로 갱신한다. */
    public void updateHeader(UUID partnerId, String partnerCode, String bizCode,
                             LocalDate dueDate, String memo, String deliveryAddress) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new IllegalArgumentException("partnerCode 필수");
        }
        if (bizCode == null || bizCode.isBlank()) {
            throw new IllegalArgumentException("bizCode 필수");
        }
        this.partnerId = partnerId;
        this.partnerCode = partnerCode;
        this.bizCode = bizCode;
        this.dueDate = dueDate;
        this.memo = memo == null || memo.isBlank() ? null : memo.trim();
        this.deliveryAddress = normalizeOptionalText(deliveryAddress);
    }

    /**
     * 협업 수정완료 overlay 요청사항 변경.
     *
     * <p>주문번호/거래처/금액/상태 등 핵심 필드는 변경하지 않고, 설명성 보조 필드인 memo 만 갱신한다.
     * CANCELED/CONVERTED/CONFIRMING 잠금 판단은 service 가 수행한다.
     *
     * @param memo 신규 요청사항. null 허용, 1000자 이하.
     * @return 현재 PartnerOrder (도메인 메서드 체인용)
     */
    public PartnerOrder updateOverlayMemo(String memo) {
        if (memo != null && memo.length() > 1000) {
            throw new IllegalArgumentException("memo 는 최대 1000자입니다");
        }
        this.memo = memo == null || memo.isBlank() ? null : memo.trim();
        return this;
    }

    /**
     * 협업 수정완료 overlay 납기 변경.
     *
     * @param dueDate 신규 납기. null 허용.
     * @return 현재 PartnerOrder (도메인 메서드 체인용)
     */
    public PartnerOrder updateOverlayDueDate(LocalDate dueDate) {
        this.dueDate = dueDate;
        return this;
    }

    /**
     * 협업 overlay 라인 키로 주문 라인을 찾는다.
     *
     * <p>partner_order_lines 에 lineNo 컬럼이 없으므로, line key 는 활성 라인 목록의 1-based 순번이다.
     * CONFIRMED 이후 협업 수정완료는 라인 추가/삭제를 허용하지 않으므로 해당 순번은 한 changeSet 적용
     * 범위에서 안정적이다.
     *
     * @param lineKey 활성 라인 1-based 순번
     * @return 해당 라인
     * @throws com.samhanair.logis.common.exception.BusinessException(NOT_FOUND) 라인이 없을 때
     */
    public PartnerOrderLine requireLineByLineKey(int lineKey) {
        if (lineKey < 1) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.INVALID_INPUT,
                    "lineKey 는 1 이상이어야 합니다: " + lineKey);
        }
        List<PartnerOrderLine> activeLines = getLines();
        if (lineKey > activeLines.size()) {
            throw new com.samhanair.logis.common.exception.BusinessException(
                    com.samhanair.logis.common.exception.ErrorCode.NOT_FOUND,
                    "주문 라인을 찾을 수 없습니다: lineKey=" + lineKey);
        }
        return activeLines.get(lineKey - 1);
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
     * 주문 헤더와 전체 라인을 soft-delete 처리하고 화면용 삭제자 이름을 별도 보존한다.
     *
     * <p>{@code actorUserId} 는 {@code deleted_by} 감사 필드에만 저장한다. 사용자 화면에는
     * {@code deleted_by_name} 만 노출해 UUID 비공개 원칙을 지킨다.
     */
    public void softDeleteCascadeWithName(String actorUserId, String actorName, LocalDateTime deletedAt) {
        markDeleted(actorUserId, deletedAt);
        this.deletedByName = actorName;
        for (PartnerOrderLine line : this.lines) {
            if (line.getDeletedAt() == null) {
                line.markDeleted(actorUserId, deletedAt);
            }
        }
    }

    /** 테스트/단건 복원 검증용: 주문 헤더만 삭제 처리하고 화면용 삭제자 이름을 별도 보존한다. */
    public void markDeletedWithName(String actorUserId, String actorName, LocalDateTime deletedAt) {
        markDeleted(actorUserId, deletedAt);
        this.deletedByName = actorName;
    }

    /**
     * slip-service 200 replay 또는 201 신규 발행 — slipNo 채움 + status=CONFIRMED.
     *
     * <p><b>레거시(슬라이스 D1 이후)</b>: confirm 자동발행 폐지로 신규 흐름 미사용. 레거시 PENDING_RETRY
     * 주문 / outbox 스케줄러 호환을 위해 유지(코드 물리 제거는 후속).
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

    /**
     * slip-service 5xx → outbox 큐로 전이. status 는 CONFIRMED, slipPublishStatus 만 PENDING_RETRY 유지.
     *
     * <p><b>레거시(슬라이스 D1 이후)</b>: confirm 자동발행 폐지로 신규 흐름 미사용. 레거시 PENDING_RETRY
     * 주문 / outbox 스케줄러 호환을 위해 유지(코드 물리 제거는 후속).
     */
    public void markSlipPendingRetry() {
        this.status = PartnerOrderStatus.CONFIRMED;
        this.slipPublishStatus = SlipPublishStatus.PENDING_RETRY;
    }

    /** outbox max-retry-hours 초과 — FAILED_PERMANENT + 운영 alert. */
    public void markSlipFailedPermanent() {
        this.slipPublishStatus = SlipPublishStatus.FAILED_PERMANENT;
    }

    /**
     * 거래처 취소 또는 admin 반려.
     *
     * <p><b>현재 死코드</b>: cancel() 을 호출하는 서비스/컨트롤러 경로가 Phase 2.4 시점 기준으로
     * 아직 구현되지 않았다. 도메인 메서드는 미래 "주문 취소" 슬라이스 구현을 위해 미리 선언되어 있으며,
     * {@link PartnerOrderStatus#CANCELED} 상태에서의 복원 가드({@link #requireRestorable()}) 와
     * 409 테스트 케이스는 이미 검증되어 있다. 취소 슬라이스 구현 시 이 주석을 제거하고
     * STATUS revision 캡처({@link com.samhanair.logis.partnerorder.revision.domain.PartnerOrderRevisionType#STATUS})
     * 훅을 연결할 것.
     */
    public void cancel() {
        this.status = PartnerOrderStatus.CANCELED;
    }

    /**
     * 보류 처리 — 진행중(DRAFT) 주문을 보류(ON_HOLD)로 전이한다 (Phase 2.5).
     *
     * <p>DRAFT 가 아니면 409 CONFLICT. 완료(CONFIRMED)는 출고전표가 발행되어 보류 불가.
     *
     * @throws ResponseStatusException 409 DRAFT 가 아닌 상태에서 호출 시
     */
    public void markOnHold() {
        if (this.status != PartnerOrderStatus.DRAFT) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "진행중 주문만 보류할 수 있습니다. 현재 상태: " + this.status.getDisplayName());
        }
        this.status = PartnerOrderStatus.ON_HOLD;
    }

    /**
     * 보류 해제 — 보류(ON_HOLD) 주문을 진행중(DRAFT)으로 되돌린다 (Phase 2.5).
     *
     * @throws ResponseStatusException 409 ON_HOLD 가 아닌 상태에서 호출 시
     */
    public void releaseHold() {
        if (this.status != PartnerOrderStatus.ON_HOLD) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "보류 주문만 해제할 수 있습니다. 현재 상태: " + this.status.getDisplayName());
        }
        this.status = PartnerOrderStatus.DRAFT;
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
        this.deletedByName = null;
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
                    "진행 중(전환)이거나 취소된 주문은 복원할 수 없습니다. 현재 상태: "
                            + this.status.getDisplayName());
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
        this.updateHeader(null, partnerCode, bizCode, dueDate, memo);
    }

    /** revision snapshot의 거래처 UUID까지 포함해 헤더를 복원한다. */
    public void restoreHeader(UUID partnerId, String partnerCode, String bizCode,
                              LocalDate dueDate, String memo) {
        this.updateHeader(partnerId, partnerCode, bizCode, dueDate, memo, this.deliveryAddress);
    }

    /** 버전 snapshot에 구조화 배송주소가 있으면 함께 복원한다. */
    public void restoreHeader(UUID partnerId, String partnerCode, String bizCode,
                              LocalDate dueDate, String memo, String deliveryAddress) {
        this.updateHeader(partnerId, partnerCode, bizCode, dueDate, memo, deliveryAddress);
    }

    private static String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    /**
     * 출고전표 전환 가능 상태인지 검사한다 (Phase 2.6a).
     *
     * <p><b>화이트리스트 방식</b>: 전환 대상은 {@link PartnerOrderStatus#DRAFT}(진행중) 또는
     * {@link PartnerOrderStatus#ON_HOLD}(보류) 상태인 주문만 허용한다.
     * 그 외 모든 상태(CONFIRMING / CONFIRMED / CANCELED / CONVERTED) 는 전환 불가.
     *
     * <p>추가로, slipNo 가 이미 있는 경우(confirm 흐름으로 발행 완료)도 전환 불가.
     * 이 가드가 CONFIRMED + slipNo=null (PENDING_RETRY 재시도 대기) 주문의
     * 이중발행을 원천 차단한다.
     * FE 화이트리스트 방어에 의존하지 않도록 CONVERTED + slipNo=null 비정상 조합도 도메인에서 차단한다.
     *
     * @throws ResponseStatusException(409) 전환 불가 상태 또는 slipNo 이미 존재 시
     */
    public void requireConvertible() {
        if (this.slipNo != null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "이미 출고전표가 발행된 주문은 전환할 수 없습니다. slipNo=" + this.slipNo);
        }
        boolean convertibleStatus = this.status == PartnerOrderStatus.DRAFT
                || this.status == PartnerOrderStatus.ON_HOLD;
        if (!convertibleStatus) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "출고전표로 전환 가능한 상태가 아닙니다(진행중/보류만 가능). 현재: "
                            + this.status.getDisplayName());
        }
    }

    /**
     * 모든 라인이 전량 전환되면 status 를 CONVERTED 로 표시한다 (Phase 2.6a).
     *
     * <p>활성 라인이 하나도 없으면 전환완료로 간주하지 않는다(방어).
     * 전량 전환 완료 시 slipPublishStatus 는 변경하지 않는다(별도 슬라이스 범위).
     */
    public void markConvertedIfComplete() {
        List<PartnerOrderLine> activeLines = getLines();
        if (activeLines.isEmpty()) {
            return;
        }
        boolean allConverted = activeLines.stream().allMatch(PartnerOrderLine::isFullyConverted);
        if (allConverted) {
            this.status = PartnerOrderStatus.CONVERTED;
        }
    }
}
