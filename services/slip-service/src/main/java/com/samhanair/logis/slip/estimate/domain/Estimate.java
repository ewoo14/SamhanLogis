package com.samhanair.logis.slip.estimate.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
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

    /** 한국 부가세율 10% — VAT 자동 계산. */
    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

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

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @OneToMany(mappedBy = "estimate", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
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
     * ACCEPTED → CONVERTED 전이 — Slip 자동 발행 후 service 레이어에서 호출.
     * convertedSlipId / convertedAt 기록.
     *
     * @param slipId 방금 발행된 Slip(OUTBOUND DRAFT) 의 id
     * @throws BusinessException(CONFLICT) 현재 상태가 ACCEPTED 가 아닐 때
     * @throws IllegalArgumentException slipId null
     */
    public void markConverted(UUID slipId) {
        requireStatus(EstimateStatus.QUOTE_ACCEPTED);
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 는 필수입니다");
        }
        this.status = EstimateStatus.QUOTE_CONVERTED;
        this.convertedSlipId = slipId;
        this.convertedAt = LocalDateTime.now();
    }

    /** 수정 가능 단계인지 — service 레이어 가드 헬퍼. */
    public boolean isEditable() {
        return EDITABLE_STATUSES.contains(this.status);
    }

    /** 라인 수정/추가/삭제 가드 — 불가능하면 즉시 CONFLICT. */
    public void requireEditable() {
        if (!isEditable()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "수정 가능한 상태가 아닙니다: " + this.status);
        }
    }

    private void requireStatus(EstimateStatus expected) {
        if (this.status != expected) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "전이 가능한 상태가 아닙니다: 현재 " + this.status + ", 필요 " + expected);
        }
    }
}
