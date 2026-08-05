package com.samhanair.logis.slip.estimate.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.estimate.revision.domain.EstimateSnapshot;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 견적서 헤더 — P2-1 (Stage 4) 영업 견적서 도메인.
 *
 * <p>매뉴얼 출처: {@code docs/manual/01-영업/06-견적서.md} §2 (P2-1 catalog).
 *
 * <p>상태 머신:
 * <pre>
 *   QUOTE_DRAFT → QUOTE_SENT → QUOTE_ACCEPTED → QUOTE_CONVERTED
 *                     ↘ QUOTE_REJECTED
 * </pre>
 *
 * <p>거래처 정보 snapshot — partner-service 의 partnerName / businessNo / address 를
 * 견적 발급 시점에 캡처하여 별도 컬럼으로 저장. 거래처 마스터가 후속 변경되어도
 * 견적서 인쇄 시 발급 당시의 정보가 유지된다 (회계/법적 일관성).
 *
 * <p>금액 합계 (totalSupply / totalVat / totalAmount) 는 라인 추가/제거/변경 시점에
 * {@link #recalculateTotals()} 가 자동 재계산.
 *
 * <p>convert(slipId) → CONVERTED 전이 시점에 EstimateToSlipConverter service 가 발행한
 * Slip(OUTBOUND DRAFT) 의 id 를 {@link #convertedSlipId} 에 기록. 같은 견적의 재변환은
 * CONVERTED 단계 가드로 차단 (idempotency).
 */
@Entity
@Getter
@Table(name = "estimates")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Estimate extends BaseEntity {

    /** 수정 가능 단계 — DRAFT/SENT 만. ACCEPTED 이후는 라인 변경 차단 (회계 일관성). */
    private static final Set<EstimateStatus> EDITABLE_STATUSES =
            EnumSet.of(EstimateStatus.QUOTE_DRAFT, EstimateStatus.QUOTE_SENT);

    /** 협업 수정완료가 차단되는 물리 종결 단계. */
    private static final Set<EstimateStatus> COLLAB_LOCKED_STATUSES =
            EnumSet.of(EstimateStatus.QUOTE_REJECTED, EstimateStatus.QUOTE_CONVERTED);

    private static final int MEMO_MAX_LENGTH = 1000;
    private static final int LINE_NOTE_MAX_LENGTH = 200;
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "estimate_no", nullable = false, length = 30)
    private String estimateNo;

    @Column(name = "estimate_date", nullable = false)
    private LocalDate estimateDate;

    @Column(name = "seq_no", nullable = false)
    private int seqNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private EstimateStatus status;

    @Column(name = "partner_id")
    private UUID partnerId;

    /** 거래처명 snapshot — 발급 시점의 partner.tradeName 캡처. */
    @Column(name = "partner_name", length = 100)
    private String partnerName;

    /** 거래처 사업자번호 snapshot — 발급 시점 capture. */
    @Column(name = "partner_business_no", length = 20)
    private String partnerBusinessNo;

    /** 거래처 주소 snapshot — 발급 시점 capture. */
    @Column(name = "partner_address", length = 200)
    private String partnerAddress;

    /** 유효기간 — 자유 입력 (default 30일 권장, 도메인 강제 X). 만료 후 status 자동 변경 X (운영 정책). */
    @Column(name = "valid_until")
    private LocalDate validUntil;

    /** 공급가액 합계 (라인 supplyAmount 합). recalculateTotals() 자동 재계산. */
    @Column(name = "total_supply", nullable = false, precision = 17, scale = 2)
    private BigDecimal totalSupply = BigDecimal.ZERO;

    /** 부가세 합계 (라인 vatAmount 합). */
    @Column(name = "total_vat", nullable = false, precision = 17, scale = 2)
    private BigDecimal totalVat = BigDecimal.ZERO;

    /** 합계 (totalSupply + totalVat). */
    @Column(name = "total_amount", nullable = false, precision = 17, scale = 2)
    private BigDecimal totalAmount = BigDecimal.ZERO;

    /** CONVERTED 전이 시 발행된 Slip(OUTBOUND DRAFT) 의 id — logical FK. */
    @Column(name = "converted_slip_id")
    private UUID convertedSlipId;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Column(name = "accepted_at")
    private LocalDateTime acceptedAt;

    @Column(name = "rejected_at")
    private LocalDateTime rejectedAt;

    @Column(name = "converted_at")
    private LocalDateTime convertedAt;

    @Column(name = "memo", length = 1000)
    private String memo;

    @Column(name = "requester_id", nullable = false, length = 50)
    private String requesterId;

    @Column(name = "deleted_by_name", length = 100)
    private String deletedByName;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @OneToMany(mappedBy = "estimate", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("lineNo ASC, id ASC")
    private List<EstimateLine> lines = new ArrayList<>();

    private Estimate(String estimateNo, LocalDate estimateDate, int seqNo,
                     UUID partnerId, String partnerName, String partnerBusinessNo,
                     String partnerAddress, LocalDate validUntil, String memo,
                     String requesterId) {
        this.estimateNo = estimateNo;
        this.estimateDate = estimateDate;
        this.seqNo = seqNo;
        this.status = EstimateStatus.QUOTE_DRAFT;
        this.partnerId = partnerId;
        this.partnerName = partnerName;
        this.partnerBusinessNo = partnerBusinessNo;
        this.partnerAddress = partnerAddress;
        this.validUntil = validUntil;
        this.memo = memo;
        this.requesterId = requesterId;
        this.version = 0L;
    }

    /**
     * 신규 견적서 생성 — DRAFT 상태로 출발. 거래처 정보는 service 레이어에서 partner-service 조회 후
     * snapshot 으로 전달.
     *
     * @param estimateNo 채번된 견적번호 ({@code yyyy/MM/dd-N})
     * @param estimateDate 견적 작성일
     * @param seqNo 같은 날짜 내 순번
     * @param partnerId 거래처 UUID (선택)
     * @param partnerName 거래처명 snapshot
     * @param partnerBusinessNo 사업자번호 snapshot (선택)
     * @param partnerAddress 거래처 주소 snapshot (선택)
     * @param validUntil 견적 유효기간 (선택)
     * @param memo 비고 (선택)
     * @param requesterId 작성자 user-id (필수)
     * @return DRAFT 상태의 신규 견적서 (라인 0개)
     * @throws IllegalArgumentException requesterId null/blank
     */
    public static Estimate create(String estimateNo, LocalDate estimateDate, int seqNo,
                                  UUID partnerId, String partnerName, String partnerBusinessNo,
                                  String partnerAddress, LocalDate validUntil, String memo,
                                  String requesterId) {
        if (requesterId == null || requesterId.isBlank()) {
            throw new IllegalArgumentException("requesterId 는 필수입니다");
        }
        return new Estimate(estimateNo, estimateDate, seqNo, partnerId, partnerName,
                partnerBusinessNo, partnerAddress, validUntil, memo, requesterId);
    }

    /**
     * 헤더 부분 수정 — DRAFT/SENT 단계만. null 이 아닌 인자만 적용.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT/SENT 가 아닐 때
     */
    public void editHeader(UUID partnerId, String partnerName, String partnerBusinessNo,
                           String partnerAddress, LocalDate validUntil, String memo) {
        requireEditable();
        if (partnerId != null) {
            this.partnerId = partnerId;
        }
        if (partnerName != null) {
            this.partnerName = partnerName;
        }
        if (partnerBusinessNo != null) {
            this.partnerBusinessNo = partnerBusinessNo;
        }
        if (partnerAddress != null) {
            this.partnerAddress = partnerAddress;
        }
        if (validUntil != null) {
            this.validUntil = validUntil;
        }
        if (memo != null) {
            this.memo = memo;
        }
    }

    /**
     * 라인 1건 추가. recalculateTotals() 자동 호출. DRAFT/SENT 단계만 허용.
     *
     * @param line {@link EstimateLine#create} 로 생성된 라인 (estimate 참조 이미 설정)
     */
    public void addLine(EstimateLine line) {
        requireEditable();
        this.lines.add(line);
        recalculateTotals();
    }

    /**
     * 라인 1건 제거 (orphan removal). recalculateTotals() 자동 호출.
     *
     * @param line 제거할 라인 인스턴스
     * @return 제거 성공 여부
     */
    public boolean removeLine(EstimateLine line) {
        requireEditable();
        boolean removed = this.lines.remove(line);
        if (removed) {
            recalculateTotals();
        }
        return removed;
    }

    /**
     * 라인 변경 후 호출 — 라인 quantity/unitPrice 변경 시 service 레이어에서 호출.
     */
    public void recalculateTotals() {
        BigDecimal supply = BigDecimal.ZERO;
        BigDecimal vat = BigDecimal.ZERO;
        for (EstimateLine line : this.lines) {
            if (line.getSupplyAmount() != null) {
                supply = supply.add(line.getSupplyAmount());
            }
            if (line.getVatAmount() != null) {
                vat = vat.add(line.getVatAmount());
            }
        }
        this.totalSupply = supply;
        this.totalVat = vat;
        this.totalAmount = supply.add(vat);
    }

    /**
     * DRAFT → SENT 전이. sentAt 기록.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 DRAFT 가 아닐 때 또는 라인 0건일 때
     */
    public void send() {
        requireStatus(EstimateStatus.QUOTE_DRAFT);
        if (this.lines.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "라인이 없는 견적서는 발송할 수 없습니다");
        }
        this.status = EstimateStatus.QUOTE_SENT;
        this.sentAt = LocalDateTime.now();
    }

    /**
     * SENT → ACCEPTED 전이. acceptedAt 기록.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 SENT 가 아닐 때
     */
    public void accept() {
        requireStatus(EstimateStatus.QUOTE_SENT);
        this.status = EstimateStatus.QUOTE_ACCEPTED;
        this.acceptedAt = LocalDateTime.now();
    }

    /**
     * SENT → REJECTED 전이. rejectedAt 기록.
     *
     * @throws BusinessException(CONFLICT) 현재 상태가 SENT 가 아닐 때
     */
    public void reject() {
        requireStatus(EstimateStatus.QUOTE_SENT);
        this.status = EstimateStatus.QUOTE_REJECTED;
        this.rejectedAt = LocalDateTime.now();
    }

    /**
     * → CONVERTED 전이 — Slip 자동 발행 후 service 레이어에서 호출.
     * convertedSlipId / convertedAt 기록.
     *
     * <p>2026-06-09 개발책임자: 견적은 <b>임의 상태(DRAFT/SENT/ACCEPTED)에서 언제든지</b> 출고전표 전환 가능.
     * 종전 ACCEPTED 강제 제거 — 이미 변환됨(CONVERTED, 중복 방지) / 거절됨(REJECTED) 만 차단.
     *
     * @param slipId 방금 발행된 Slip(OUTBOUND DRAFT) 의 id
     * @throws BusinessException(CONFLICT) 이미 변환됐거나 거절된 견적
     * @throws IllegalArgumentException slipId null
     */
    public void markConverted(UUID slipId) {
        if (this.status == EstimateStatus.QUOTE_CONVERTED) {
            throw new BusinessException(ErrorCode.CONFLICT, "이미 출고전표로 변환된 견적입니다");
        }
        if (this.status == EstimateStatus.QUOTE_REJECTED) {
            throw new BusinessException(ErrorCode.CONFLICT, "거절된 견적은 출고전표로 변환할 수 없습니다");
        }
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 는 필수입니다");
        }
        this.status = EstimateStatus.QUOTE_CONVERTED;
        this.convertedSlipId = slipId;
        this.convertedAt = LocalDateTime.now();
    }

    /** 목록 soft-delete 표시용 삭제자명을 함께 저장한다. */
    public void markDeletedWithName(String userId, String actorName) {
        markDeleted(userId);
        this.deletedByName = safeActorName(actorName);
    }

    /** 목록 soft-delete 복원 시 표시용 삭제자명을 제거한다. */
    public void markRestoredWithNameCleared() {
        markRestored();
        this.deletedByName = null;
    }

    /** 수정 가능 단계인지 — service 레이어 가드 헬퍼. */
    public boolean isEditable() {
        return EDITABLE_STATUSES.contains(this.status);
    }

    /** 라인 수정/추가/삭제 가드 — 불가능하면 즉시 CONFLICT. */
    public void requireEditable() {
        if (!isEditable()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "수정 가능한 상태가 아닙니다: " + this.status.getDisplayName());
        }
    }

    /**
     * 협업 수정완료 가능 단계인지 검증한다.
     *
     * <p>일반 편집({@link #requireEditable()})은 DRAFT/SENT 만 허용하지만, 협업 수정완료는
     * ACCEPTED 견적의 비고/유효기간/라인 메모 같은 soft overlay 를 허용한다. 단 REJECTED/CONVERTED
     * 는 물리 종결 단계이므로 409 로 차단한다.
     */
    public void guardCollabModifiable() {
        if (COLLAB_LOCKED_STATUSES.contains(this.status)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "협업 수정완료가 불가능한 상태입니다: " + this.status.getDisplayName());
        }
    }

    /** 협업 수정완료로 견적 비고를 덮어쓴다. */
    public Estimate overlayMemo(String memo) {
        guardCollabModifiable();
        validateOverlayLength(memo, "견적 비고", MEMO_MAX_LENGTH);
        this.memo = memo;
        return this;
    }

    /** 협업 수정완료로 견적 유효기간을 덮어쓴다. */
    public Estimate overlayValidUntil(LocalDate validUntil) {
        guardCollabModifiable();
        this.validUntil = validUntil;
        return this;
    }

    /**
     * 협업 수정완료로 1-based 활성 라인 index 의 메모를 덮어쓴다.
     *
     * @param lineKey 활성 라인 기준 1-based index
     * @param note 라인 메모
     * @return this
     * @throws BusinessException lineKey 가 범위를 벗어났을 때
     */
    public Estimate overlayLineNote(int lineKey, String note) {
        guardCollabModifiable();
        validateOverlayLength(note, "견적 라인 메모", LINE_NOTE_MAX_LENGTH);
        requireLineByLineKey(lineKey).changeNote(note);
        return this;
    }

    private void validateOverlayLength(String value, String fieldName, int maxLength) {
        if (value != null && value.length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    fieldName + "은(는) " + maxLength + "자 이하여야 합니다");
        }
    }

    /**
     * 1-based 활성 라인 index 로 견적 라인을 조회한다.
     *
     * <p>{@link #lines} 컬렉션은 {@code lineNo ASC, id ASC} 로 정렬되어 lineKey 가 결정적이다.
     */
    public EstimateLine requireLineByLineKey(int lineKey) {
        if (lineKey < 1 || lineKey > this.lines.size()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "견적 라인 lineKey 범위가 올바르지 않습니다: " + lineKey);
        }
        return this.lines.get(lineKey - 1);
    }

    /**
     * 현 견적 상태를 버전이력용 full-snapshot 으로 변환한다 (권한 재편 Phase 2.2 Task 2).
     *
     * <p>헤더 8필드(estimateNo/estimateDate/partner 3필드/validUntil/memo)와 미삭제 라인 전체를 한
     * 시점의 불변 {@link EstimateSnapshot} 으로 캡처한다. {@code estimate_revisions.snapshot}
     * (JSONB) 직렬화 대상이며, point-in-time 복원 시 이 스냅샷을 역직렬화해 헤더를 덮어쓰고 라인을
     * 전량 교체한다. 라인은 soft-deleted 행을 제외한다 — {@code @SQLRestriction} 으로 이미 DB
     * 레벨에서 걸러지지만 명시적으로 한 번 더 가드한다.
     *
     * <p>{@link com.samhanair.logis.slip.domain.Slip#toSnapshot()} 미러
     * (slipNo→estimateNo, slipDate→estimateDate).
     *
     * @return 현 견적의 헤더+라인 스냅샷 (라인 없으면 빈 리스트)
     */
    public EstimateSnapshot toSnapshot() {
        List<EstimateSnapshot.Line> snapshotLines = this.lines.stream()
                .filter(line -> !Boolean.TRUE.equals(line.getIsDeleted()))
                .map(line -> new EstimateSnapshot.Line(
                        line.getProductId(),
                        line.getProductName(),
                        line.getModelName(),
                        line.getSpecification(),
                        line.getQuantity(),
                        line.getUnitPrice(),
                        line.getSupplyAmount(),
                        line.getVatAmount(),
                        line.getLineTotal(),
                        line.getNote(),
                        // #822 — VAT 포함 단가 권위값 캡처. 누락 시 복원이 공급 semantics 재생성으로
                        // unit_price_with_vat 를 NULL 화해 legacy provenance 로 오전환된다(16b).
                        line.getUnitPriceWithVat(),
                        // R6-H3 — 세트 계보 캡처. head 만 true, 일반 라인은 null 로 생략(NON_NULL).
                        line.isSetHead() ? Boolean.TRUE : null,
                        line.getParentSetModel(),
                        line.getBundleSetOptions()))
                .toList();
        return new EstimateSnapshot(
                this.estimateNo,
                this.estimateDate,
                this.partnerId,
                this.partnerName,
                this.partnerBusinessNo,
                this.partnerAddress,
                this.validUntil,
                this.memo,
                snapshotLines);
    }

    /**
     * point-in-time 스냅샷으로 헤더+라인을 통째 복원한다 (권한 재편 Phase 2.2 Task 3).
     *
     * <p>{@link #toSnapshot()} 이 캡처한 동일 헤더 8필드를 스냅샷 값으로 덮어쓰고, 라인을 전량
     * 교체한다. 라인 추가/삭제/수정이 모두 스냅샷 기준으로 정확히 반영되도록 기존 라인을
     * {@code orphanRemoval=true} 정책에 따라 컬렉션에서 제거하고, 스냅샷 라인을
     * {@link EstimateLine#create} 로 재생성해 새로 추가한다 ({@link EstimateService#update} 의
     * 라인 교체 선례와 동일 — removeLine loop → addLine).
     *
     * <p>편집 가능 가드: {@link #requireEditable()} 를 가장 먼저 호출한다 — QUOTE_ACCEPTED /
     * QUOTE_CONVERTED / QUOTE_REJECTED 등 잠긴 단계의 견적은 복원도 CONFLICT 로 거부한다
     * (회계 일관성 — 확정 후 매출 정정 차단).
     *
     * <p>라인 금액 semantics (#824): 신규 스냅샷에서 unitPriceWithVat provenance와
     * supplyAmount/vatAmount/lineTotal이 모두 있으면 {@link EstimateLine#createFromAuthoritativeAmounts}
     * 로 저장된 권위 금액을 그대로 복원한다. 이력복원에서 권위 금액을 unitPriceWithVat로 재분해하지
     * 않아 비표준 VAT가 보존된다. unitPriceWithVat가 없는 구 JSONB 스냅샷은 공급단가 legacy 경로로
     * 하위호환한다.
     *
     * <p>합계는 스냅샷의 totalSupply/totalVat 값을 신뢰하지 않고 {@link #recalculateTotals()} 로
     * 재계산한다 (라인 기준). 권위 라인은 저장된 S/V/T를, legacy 라인은 생성 시 계산된 값을 사용한다.
     *
     * <p>status / version 등 라이프사이클 메타는 복원 대상이 아니며 — 복원도 신규 RESTORE revision
     * 으로 별도 기록되므로 본 메서드는 헤더/라인 상태만 되돌린다.
     *
     * <p>{@link com.samhanair.logis.slip.domain.Slip#restoreFromSnapshot} 미러
     * ({@code requireNotLocked} → {@code requireEditable}).
     *
     * @param snapshot 복원 대상 시점의 full-snapshot (null 불가)
     * @throws BusinessException(CONFLICT) 편집 불가 단계의 견적일 때
     * @throws IllegalArgumentException snapshot 이 null 일 때
     */
    public void restoreFromSnapshot(EstimateSnapshot snapshot) {
        requireEditable();
        if (snapshot == null) {
            throw new IllegalArgumentException("복원 스냅샷은 null 일 수 없습니다");
        }
        // 헤더 8필드 역적용 — toSnapshot() 이 캡처한 동일 필드 집합 (스냅샷 값 그대로 덮어씀)
        this.estimateNo = snapshot.estimateNo();
        this.estimateDate = snapshot.estimateDate();
        this.partnerId = snapshot.partnerId();
        this.partnerName = snapshot.partnerName();
        this.partnerBusinessNo = snapshot.partnerBusinessNo();
        this.partnerAddress = snapshot.partnerAddress();
        this.validUntil = snapshot.validUntil();
        this.memo = snapshot.memo();

        // 라인 전량 교체 — 기존 라인 제거(orphanRemoval=true) → 스냅샷 라인 재생성 add
        // (EstimateService.update 의 removeLine loop → addLine 선례 미러. 단 add/remove 의
        //  요소별 requireEditable/recalculateTotals 중복을 피하려고 컬렉션을 직접 조작한 뒤
        //  마지막에 recalculateTotals() 1회만 호출한다.)
        this.lines.clear();
        List<EstimateSnapshot.Line> snapshotLines = snapshot.lines();
        if (snapshotLines != null) {
            int lineNo = 1;
            for (EstimateSnapshot.Line snapLine : snapshotLines) {
                // #824 — 신규 권위 금액 snapshot은 S/V/T와 VAT 포함 단가(provenance)가 함께 있다.
                // unitPriceWithVat가 없는 구 JSONB는 S/V/T 필드가 있어도 종전 공급 semantics를 유지한다.
                boolean hasAuthoritativeAmounts = snapLine.unitPriceWithVat() != null
                        && snapLine.supplyAmount() != null
                        && snapLine.vatAmount() != null
                        && snapLine.lineTotal() != null;
                EstimateLine restored = hasAuthoritativeAmounts
                        ? EstimateLine.createFromAuthoritativeAmounts(this, lineNo++,
                                snapLine.productId(), snapLine.productName(), snapLine.modelName(),
                                snapLine.specification(), snapLine.quantity(), snapLine.supplyAmount(),
                                snapLine.vatAmount(), snapLine.lineTotal(), snapLine.note())
                        : snapLine.unitPriceWithVat() != null
                        ? EstimateLine.createFromVatInclusive(this, lineNo++,
                                snapLine.productId(),
                                snapLine.productName(),
                                snapLine.modelName(),
                                snapLine.specification(),
                                snapLine.quantity(),
                                snapLine.unitPriceWithVat(),
                                snapLine.note())
                        : EstimateLine.create(this, lineNo++,
                                snapLine.productId(),
                                snapLine.productName(),
                                snapLine.modelName(),
                                snapLine.specification(),
                                snapLine.quantity(),
                                snapLine.unitPrice(),
                                snapLine.note());
                // R6-H3 — 스냅샷의 세트 계보 복원. 계보가 없으면(일반 라인/구 스냅샷 null) 평면
                // 재생성 시 이후 저장에서 구성품 배분가가 가격기억에 각인되는 오염이 재유입된다.
                if (snapLine.parentSetModel() != null && !snapLine.parentSetModel().isBlank()) {
                    restored.assignBundleComponent(
                            snapLine.parentSetModel(), Boolean.TRUE.equals(snapLine.setHead()),
                            snapLine.bundleSetOptions());
                }
                this.lines.add(restored);
            }
        }
        // 합계는 스냅샷 totalXxx 무시 — 라인 기준 재계산 (라인 recompute 결과 사용)
        recalculateTotals();
    }

    private void requireStatus(EstimateStatus expected) {
        if (this.status != expected) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전이 가능한 상태가 아닙니다: 현재 " + this.status.getDisplayName()
                            + ", 필요 " + expected.getDisplayName());
        }
    }

    private static String safeActorName(String actorName) {
        if (actorName == null || actorName.isBlank()) {
            return null;
        }
        String trimmed = actorName.trim();
        if (UUID_PATTERN.matcher(trimmed).matches()) {
            return null;
        }
        return trimmed.length() > 100 ? trimmed.substring(0, 100) : trimmed;
    }
}
