package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.financial.VatAmountCalculator;
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
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.math.RoundingMode;
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
 * 세금계산서 헤더 (Phase 10 Step 8 — P0-4 #3).
 *
 * <p>매뉴얼 출처: {@code docs/manual/03-회계/03-세금계산서.md}.
 *
 * <p>상태 머신:
 *
 * <pre>
 *   DRAFT → ISSUED → CANCELLED
 * </pre>
 *
 * <p>라이프사이클 표 (Layer 4 의무):
 *
 * <table>
 *   <caption>TaxInvoice 라이프사이클</caption>
 *   <tr><th>메서드</th><th>from → to</th><th>부수효과</th></tr>
 *   <tr><td>{@link #issue(String, String)}</td><td>DRAFT → ISSUED</td>
 *     <td>tax_invoice_no 채번 + 자동 분개 ID 연결 (호출 service 책임)</td></tr>
 *   <tr><td>{@link #markReceived(String)}</td><td>DRAFT → ISSUED</td>
 *     <td>INBOUND 수신 확정만 수행, OUTBOUND 자동 매출분개 생성 없음</td></tr>
 *   <tr><td>{@link #cancel(String)}</td><td>ISSUED → CANCELLED</td>
 *     <td>역분개 자동 생성 + cancelled_at/by + reverse_journal_id 연결</td></tr>
 *   <tr><td>{@link #addLine}/{@link #updateBasic}</td><td>(DRAFT only)</td>
 *     <td>ISSUED 이후 mutation 차단 (CONFLICT)</td></tr>
 * </table>
 *
 * <p>거래처(공급받는자) 정보는 발행 시점 스냅샷 — partner-service 의 추후 거래처명/주소 변경
 * 영향 없이 발행 당시 모습 보존. 한국 일반기업회계기준 + 세법 audit 의무.
 *
 * <p>VAT 계산: {@code vatAmount = supplyAmount * 0.10} (공통 원 단위 절사).
 *
 * <p>낙관적 락: {@link Version} — 동시 mutation 충돌 감지.
 */
@Entity
@Getter
@Table(name = "tax_invoices")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class TaxInvoice extends BaseEntity {

    /** VAT 세율 — 한국 표준 10%. */
    public static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * 세금계산서 발행번호 — {@code yyyy/MM/dd-N}. ISSUED 진입 시 채번. DRAFT 단계 NULL.
     * partial UNIQUE INDEX (NULL 허용) — DB 레벨 보장.
     */
    @Column(name = "tax_invoice_no", length = 20)
    private String taxInvoiceNo;

    /** 거래처(공급받는자) UUID — partner-service 참조 (logical FK). */
    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    /**
     * 거래처 코드 (snapshot at create) — 비즈니스 식별자, UUID 비공개 원칙 대응.
     * P0-4 V11 신규 컬럼. legacy 레코드 = NULL.
     *
     * <p>#825 재수렴 #1 — V61 에서 VARCHAR(100) 확장 (partners.partner_code VARCHAR(100),
     * 이카운트 실측 max=86자 · 매출/매입 전표 100 과 통일).
     */
    @Column(name = "partner_code", length = 100)
    private String partnerCode;

    /** 거래처 사업자등록번호 (snapshot at create). */
    @Column(name = "partner_business_no", length = 20)
    private String partnerBusinessNo;

    /** 거래처 상호 (snapshot at create). */
    @Column(name = "partner_name", nullable = false, length = 200)
    private String partnerName;

    /** 거래처 주소 (snapshot at create). */
    @Column(name = "partner_address", length = 500)
    private String partnerAddress;

    /** 공급일자 — 슬립 발행/정산 시점 (또는 헤더 입력값). */
    @Column(name = "supply_date", nullable = false)
    private LocalDate supplyDate;

    /** 공급가액 합계 (라인 합계). */
    @Column(name = "supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal supplyAmount;

    /** 부가세 합계 = supply * 0.10. */
    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal vatAmount;

    /** 합계 = supply + vat. */
    @Column(name = "total_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    /**
     * 세금계산서 종류 — 매출(SALES) / 매입(PURCHASE).
     * V7 마이그레이션 신규 컬럼, NULL 허용 (기존 레코드 = SALES 기본).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "invoice_type", length = 20)
    private TaxInvoiceType invoiceType;

    /** 발행/수신 방향 — OUTBOUND(우리가 발행) / INBOUND(거래처가 발행). */
    @Enumerated(EnumType.STRING)
    @Column(name = "direction", nullable = false, length = 20)
    private TaxInvoiceDirection direction;

    /** 상태 (DRAFT / ISSUED / CANCELLED). */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private TaxInvoiceStatus status;

    /** 발행 시각 — ISSUED 트랜지션 시 기록. */
    @Column(name = "issued_at")
    private LocalDateTime issuedAt;

    /** 발행자 user-id — ISSUED 트랜지션 시 기록. */
    @Column(name = "issued_by", length = 50)
    private String issuedBy;

    /** 취소 시각 — CANCELLED 트랜지션 시 기록. */
    @Column(name = "cancelled_at")
    private LocalDateTime cancelledAt;

    /** 취소자 user-id. */
    @Column(name = "cancelled_by", length = 50)
    private String cancelledBy;

    /**
     * 취소 사유 — CANCELLED 전이 시 의무 (5자 이상, 최대 1000자).
     * P0-4 V11 신규 컬럼. legacy 레코드 = NULL.
     */
    @Column(name = "cancel_reason", length = 1000)
    private String cancelReason;

    /** 자동 분개 Journal UUID — ISSUED 시점에 service 가 연결. */
    @Column(name = "journal_id")
    private UUID journalId;

    /** 역분개 Journal UUID — CANCELLED 시점에 service 가 연결. */
    @Column(name = "reverse_journal_id")
    private UUID reverseJournalId;

    /** 외부 e-Tax (NTS Hometax) 발행 ID — 본 슬라이스 예약 컬럼 (P0-4 #4 향후). */
    @Column(name = "e_tax_external_id", length = 100)
    private String eTaxExternalId;

    /** 적요 / 비고. */
    @Column(name = "description", length = 500)
    private String description;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @OneToMany(mappedBy = "taxInvoice", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("lineNo ASC")
    private List<TaxInvoiceLine> lines = new ArrayList<>();

    private TaxInvoice(UUID partnerId, String partnerCode, String partnerBusinessNo,
                       String partnerName, String partnerAddress, LocalDate supplyDate,
                       String description, TaxInvoiceType invoiceType) {
        this.partnerId = partnerId;
        this.partnerCode = partnerCode;
        this.partnerBusinessNo = partnerBusinessNo;
        this.partnerName = partnerName;
        this.partnerAddress = partnerAddress;
        this.supplyDate = supplyDate;
        this.description = description;
        this.invoiceType = invoiceType != null ? invoiceType : TaxInvoiceType.SALES;
        this.direction = TaxInvoiceDirection.OUTBOUND;
        this.status = TaxInvoiceStatus.DRAFT;
        this.supplyAmount = BigDecimal.ZERO;
        this.vatAmount = BigDecimal.ZERO;
        this.totalAmount = BigDecimal.ZERO;
        this.version = 0L;
    }

    /**
     * 신규 세금계산서 생성 (DRAFT) — partnerCode 포함 풀 시그니처.
     *
     * <p>invoiceType 미지정 시 SALES 기본값 적용 (한국 물류업체 특성).
     *
     * @param partnerId         거래처 UUID (필수)
     * @param partnerCode       거래처 코드 — 비즈니스 식별자 (선택, ≤100자)
     * @param partnerBusinessNo 사업자등록번호 (선택, ≤20자)
     * @param partnerName       상호 (필수, ≤200자) — snapshot
     * @param partnerAddress    주소 (선택, ≤500자) — snapshot
     * @param supplyDate        공급일자 (필수)
     * @param description       적요 (선택, ≤500자)
     * @param invoiceType       종류 (선택, null 이면 SALES)
     */
    public static TaxInvoice create(UUID partnerId, String partnerCode, String partnerBusinessNo,
                                    String partnerName, String partnerAddress, LocalDate supplyDate,
                                    String description, TaxInvoiceType invoiceType) {
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
        if (partnerName == null || partnerName.isBlank() || partnerName.length() > 200) {
            throw new IllegalArgumentException("partnerName 은 1~200자 필수입니다");
        }
        if (supplyDate == null) {
            throw new IllegalArgumentException("supplyDate 는 필수입니다");
        }
        if (partnerCode != null && partnerCode.length() > 100) {
            throw new IllegalArgumentException("partnerCode 는 최대 100자입니다");
        }
        if (partnerBusinessNo != null && partnerBusinessNo.length() > 20) {
            throw new IllegalArgumentException("partnerBusinessNo 는 최대 20자입니다");
        }
        if (partnerAddress != null && partnerAddress.length() > 500) {
            throw new IllegalArgumentException("partnerAddress 는 최대 500자입니다");
        }
        if (description != null && description.length() > 500) {
            throw new IllegalArgumentException("description 은 최대 500자입니다");
        }
        return new TaxInvoice(partnerId, partnerCode, partnerBusinessNo, partnerName, partnerAddress,
                supplyDate, description, invoiceType);
    }

    /**
     * 신규 세금계산서 생성 (DRAFT) — partnerCode 생략, invoiceType 지정. 기존 호출부 호환용.
     *
     * @param partnerId         거래처 UUID (필수)
     * @param partnerBusinessNo 사업자등록번호 (선택)
     * @param partnerName       상호 (필수)
     * @param partnerAddress    주소 (선택)
     * @param supplyDate        공급일자 (필수)
     * @param description       적요 (선택)
     * @param invoiceType       종류 (선택, null 이면 SALES)
     */
    public static TaxInvoice create(UUID partnerId, String partnerBusinessNo, String partnerName,
                                    String partnerAddress, LocalDate supplyDate,
                                    String description, TaxInvoiceType invoiceType) {
        return create(partnerId, null, partnerBusinessNo, partnerName, partnerAddress,
                supplyDate, description, invoiceType);
    }

    /**
     * 신규 세금계산서 생성 (DRAFT) — partnerCode 생략, invoiceType 기본값 SALES. 기존 호출부 호환용.
     *
     * @param partnerId         거래처 UUID (필수)
     * @param partnerBusinessNo 사업자등록번호 (선택)
     * @param partnerName       상호 (필수)
     * @param partnerAddress    주소 (선택)
     * @param supplyDate        공급일자 (필수)
     * @param description       적요 (선택)
     */
    public static TaxInvoice create(UUID partnerId, String partnerBusinessNo, String partnerName,
                                    String partnerAddress, LocalDate supplyDate,
                                    String description) {
        return create(partnerId, null, partnerBusinessNo, partnerName, partnerAddress,
                supplyDate, description, TaxInvoiceType.SALES);
    }

    /**
     * 매출전표 N:1 묶음 발행용 DRAFT 생성.
     *
     * <p>매출전표 라인을 세금계산서 라인으로 스냅샷하고, 라인 합계로 헤더 금액을 계산합니다.
     * 현재 도메인은 {@link TaxInvoiceType} 으로 매출/매입을 구분하므로 매출전표 묶음은
     * {@link TaxInvoiceType#SALES} 로 생성합니다.
     */
    public static TaxInvoice createDraftFromSalesSlips(String taxInvoiceNo, LocalDate issuedDate,
            UUID partnerId, String partnerCode, String partnerName, String partnerBusinessNo,
            List<SalesAccountingSlipLine> sourceLines, String actorUserId) {
        if (taxInvoiceNo == null || taxInvoiceNo.isBlank() || taxInvoiceNo.length() > 20) {
            throw new IllegalArgumentException("taxInvoiceNo 는 1~20자 필수입니다");
        }
        if (sourceLines == null || sourceLines.isEmpty()) {
            throw new IllegalArgumentException("sourceLines 는 1건 이상 필수입니다");
        }
        TaxInvoice taxInvoice = create(partnerId, partnerCode, partnerBusinessNo, partnerName, null,
                issuedDate, "매출전표 묶음 발행", TaxInvoiceType.SALES);
        taxInvoice.taxInvoiceNo = taxInvoiceNo;
        taxInvoice.issuedBy = actorUserId;
        int lineNo = 1;
        for (SalesAccountingSlipLine sourceLine : sourceLines) {
            if (sourceLine.getAllocations() == null || sourceLine.getAllocations().isEmpty()) {
                taxInvoice.lines.add(TaxInvoiceLine.createFromSalesAccountingSlipLine(
                        taxInvoice, lineNo++, sourceLine));
            } else {
                for (SalesAccountingSlipAllocation allocation : sourceLine.getAllocations()) {
                    taxInvoice.lines.add(TaxInvoiceLine.createFromSalesAccountingSlipAllocation(
                            taxInvoice, lineNo++, sourceLine, allocation));
                }
            }
        }
        taxInvoice.recalcTotals();
        return taxInvoice;
    }

    /**
     * 거래처 발행 전자세금계산서 수신 등록용 DRAFT 생성.
     *
     * <p>매입전표 POSTED N건을 하나의 INBOUND TaxInvoice 로 묶을 때 사용합니다.
     * 수신 세금계산서는 {@link #markReceived(String)} 로 ISSUED 전이하되 OUTBOUND
     * 매출 자동분개를 만들지 않습니다.
     */
    public static TaxInvoice createInbound(String taxInvoiceNo, LocalDate issuedDate,
            UUID partnerId, String partnerCode, String partnerName, String partnerBusinessNo,
            BigDecimal totalSupply, BigDecimal totalVat, BigDecimal totalAmount,
            String actorUserId) {
        if (taxInvoiceNo == null || taxInvoiceNo.isBlank() || taxInvoiceNo.length() > 20) {
            throw new IllegalArgumentException("taxInvoiceNo 는 1~20자 필수입니다");
        }
        if (totalSupply == null || totalSupply.signum() < 0) {
            throw new IllegalArgumentException("totalSupply 는 0 이상 필수입니다");
        }
        if (totalVat == null || totalVat.signum() < 0) {
            throw new IllegalArgumentException("totalVat 는 0 이상 필수입니다");
        }
        if (totalAmount == null || totalAmount.signum() < 0) {
            throw new IllegalArgumentException("totalAmount 는 0 이상 필수입니다");
        }
        TaxInvoice taxInvoice = create(partnerId, partnerCode, partnerBusinessNo, partnerName,
                null, issuedDate, "매입세금계산서 수신 등록", TaxInvoiceType.PURCHASE);
        taxInvoice.taxInvoiceNo = taxInvoiceNo;
        taxInvoice.direction = TaxInvoiceDirection.INBOUND;
        taxInvoice.supplyAmount = totalSupply.setScale(2, RoundingMode.HALF_UP);
        taxInvoice.vatAmount = totalVat.setScale(2, RoundingMode.HALF_UP);
        taxInvoice.totalAmount = totalAmount.setScale(2, RoundingMode.HALF_UP);
        taxInvoice.issuedBy = actorUserId;
        return taxInvoice;
    }

    /**
     * 헤더 기본 정보 갱신 (DRAFT 만). 거래처 참조(partnerId) + partner snapshot / supplyDate /
     * description 변경.
     *
     * <p>#825 CH1 — 편집에서 거래처를 교체하면 호출자(FE)가 새 거래처의 partnerId 와
     * 상호/사업자번호 snapshot 을 함께 전송한다. partnerId 를 반영하지 않으면 "원 거래처
     * UUID + 새 거래처 상호" 불일치(무결성 훼손)가 생기므로 도메인에서 함께 갱신한다.
     *
     * <p>#825 CM-a — partnerCode(거래처 코드, 비즈니스 식별자) 도 함께 갱신한다. create 는
     * partnerCode 를 채우는데 updateBasic 이 미갱신하면 거래처 교체 후 "P2 거래처 + P1 코드"
     * 잔존 불일치가 생기므로 partnerId 와 동일하게 도메인에서 함께 반영한다 (선택 필드 —
     * null 이면 null 로 갱신, DTO 계약과 동일한 nullable 의미).
     *
     * @param partnerId         거래처 UUID (필수) — 거래처 교체 시 새 거래처 UUID
     * @param partnerCode       거래처 코드 (선택, ≤100자) — 거래처 교체 시 새 거래처 코드
     * @param partnerBusinessNo 사업자등록번호 snapshot (선택)
     * @param partnerName       상호 snapshot (필수, 1~200자)
     * @param partnerAddress    주소 snapshot (선택)
     * @param supplyDate        공급일자 (필수)
     * @param description       적요 (선택)
     * @throws BusinessException(CONFLICT) DRAFT 가 아닐 때
     * @throws IllegalArgumentException partnerId/partnerName/supplyDate 필수값 위반 또는
     *     partnerCode 100자 초과 시
     */
    public void updateBasic(UUID partnerId, String partnerCode, String partnerBusinessNo,
                            String partnerName, String partnerAddress, LocalDate supplyDate,
                            String description) {
        requireDraft("헤더 수정은 ");
        if (partnerId == null) {
            throw new IllegalArgumentException("partnerId 는 필수입니다");
        }
        if (partnerCode != null && partnerCode.length() > 100) {
            throw new IllegalArgumentException("partnerCode 는 최대 100자입니다");
        }
        if (partnerName == null || partnerName.isBlank() || partnerName.length() > 200) {
            throw new IllegalArgumentException("partnerName 은 1~200자 필수입니다");
        }
        if (supplyDate == null) {
            throw new IllegalArgumentException("supplyDate 는 필수입니다");
        }
        this.partnerId = partnerId;
        this.partnerCode = partnerCode;
        this.partnerBusinessNo = partnerBusinessNo;
        this.partnerName = partnerName;
        this.partnerAddress = partnerAddress;
        this.supplyDate = supplyDate;
        this.description = description;
    }

    /**
     * 라인 추가 (DRAFT 만). 합계 자동 재계산.
     *
     * @throws BusinessException(CONFLICT) DRAFT 가 아닐 때
     */
    public void addLine(TaxInvoiceLine line) {
        requireDraft("라인 추가는 ");
        this.lines.add(line);
        recalcTotals();
    }

    /** 라인 일괄 교체 (DRAFT 만, update 헬퍼). */
    public void replaceLines(List<TaxInvoiceLine> newLines) {
        requireDraft("라인 교체는 ");
        this.lines.clear();
        if (newLines != null) {
            this.lines.addAll(newLines);
        }
        recalcTotals();
    }

    /**
     * 발행 (DRAFT → ISSUED). tax_invoice_no 채번된 값을 인자로 받아 set.
     * 자동 분개 ID 는 service 가 신규 Journal 저장 후 {@link #linkJournal(UUID)} 로 연결.
     *
     * @param taxInvoiceNo 채번된 발행번호 ({@code yyyy/MM/dd-N})
     * @param actorUserId 발행자 user-id (필수)
     * @throws BusinessException(CONFLICT) DRAFT 아니거나, 라인 0건이거나, 합계 0
     */
    public void issue(String taxInvoiceNo, String actorUserId) {
        requireDraft("발행은 ");
        if (taxInvoiceNo == null || taxInvoiceNo.isBlank() || taxInvoiceNo.length() > 20) {
            throw new IllegalArgumentException("taxInvoiceNo 는 1~20자 필수입니다");
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        if (this.lines.isEmpty()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "라인이 1개 이상 있어야 발행할 수 있습니다");
        }
        recalcTotals();
        if (this.supplyAmount.signum() <= 0) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "공급가액 합계가 0 이하인 세금계산서는 발행할 수 없습니다");
        }
        this.taxInvoiceNo = taxInvoiceNo;
        this.status = TaxInvoiceStatus.ISSUED;
        this.issuedAt = LocalDateTime.now();
        this.issuedBy = actorUserId;
    }

    /**
     * 수신 확정 (INBOUND DRAFT → ISSUED).
     *
     * <p>{@link #issue(String, String)} 는 OUTBOUND 발행 플로우에서 자동 매출분개를
     * 연결하는 서비스와 함께 쓰입니다. INBOUND 수신 등록은 거래처가 이미 발행한
     * 세금계산서를 신고/마감 집계 대상으로 확정하는 전이만 수행합니다.
     *
     * @param actorUserId 수신 처리자 user-id
     * @throws BusinessException(CONFLICT) INBOUND 가 아니거나 DRAFT 가 아닐 때
     */
    public void markReceived(String actorUserId) {
        if (this.direction != TaxInvoiceDirection.INBOUND) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    TaxInvoiceDirection.INBOUND.getDisplayName() + " 세금계산서만 수신 처리 가능: "
                            + taxInvoiceNo + " 방향=" + direction.getDisplayName());
        }
        if (this.status != TaxInvoiceStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    TaxInvoiceStatus.DRAFT.getDisplayName() + " 상태에서만 수신 처리 가능: "
                            + taxInvoiceNo + " 상태=" + status.getDisplayName());
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        this.status = TaxInvoiceStatus.ISSUED;
        this.issuedBy = actorUserId;
    }

    /**
     * 자동 분개 Journal 연결 — service 가 발행 직후 호출.
     */
    public void linkJournal(UUID journalId) {
        this.journalId = journalId;
    }

    /**
     * 취소 (ISSUED → CANCELLED) — cancelReason 의무 버전 (P0-4).
     * 역분개 Journal 은 service 가 신규로 만들어 {@link #linkReverseJournal(UUID)} 로 연결.
     *
     * @param reason 취소 사유 (5자 이상, 최대 1000자, 필수)
     * @param actorUserId 취소자 user-id (필수)
     * @throws BusinessException(CONFLICT) ISSUED 아닐 때
     * @throws IllegalArgumentException reason 5자 미만이거나 actorUserId 없을 때
     */
    public void cancel(String reason, String actorUserId) {
        if (this.status != TaxInvoiceStatus.ISSUED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "취소는 " + TaxInvoiceStatus.ISSUED.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + this.status.getDisplayName() + ")");
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        if (reason == null || reason.strip().length() < 5) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "취소 사유는 5자 이상이어야 합니다");
        }
        if (reason.length() > 1000) {
            throw new IllegalArgumentException("취소 사유는 최대 1000자입니다");
        }
        this.status = TaxInvoiceStatus.CANCELLED;
        this.cancelledAt = LocalDateTime.now();
        this.cancelledBy = actorUserId;
        this.cancelReason = reason.strip();
    }

    /**
     * 취소 (ISSUED → CANCELLED) — 하위 호환 메서드 (cancelReason 생략 시 빈 사유로 처리).
     *
     * @deprecated P0-4 이후 {@link #cancel(String, String)} 을 사용하세요.
     */
    @Deprecated
    public void cancel(String actorUserId) {
        if (this.status != TaxInvoiceStatus.ISSUED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "취소는 " + TaxInvoiceStatus.ISSUED.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + this.status.getDisplayName() + ")");
        }
        if (actorUserId == null || actorUserId.isBlank()) {
            throw new IllegalArgumentException("actorUserId 는 필수입니다");
        }
        this.status = TaxInvoiceStatus.CANCELLED;
        this.cancelledAt = LocalDateTime.now();
        this.cancelledBy = actorUserId;
    }

    /** 역분개 Journal 연결 — service 가 cancel 직후 호출. */
    public void linkReverseJournal(UUID reverseJournalId) {
        this.reverseJournalId = reverseJournalId;
    }

    /**
     * 외부 e-Tax 발행 ID 직접 기입.
     *
     * @deprecated SP-09-1 이후 {@link #markEmitted(String)} 을 사용하세요.
     *     {@code markEmitted} 는 ISSUED 상태 검증 + 중복 발행 방지 검증을 수행합니다.
     *     본 메서드는 상태 검증 없이 eTaxExternalId 를 직접 설정하므로 우회 위험이 있습니다.
     */
    @Deprecated(since = "SP-09-1", forRemoval = true)
    public void linkETaxExternalId(String eTaxExternalId) {
        this.eTaxExternalId = eTaxExternalId;
    }

    /**
     * e-Tax 실 발행 완료 마킹 (SP-09-1).
     *
     * <p>사전 조건:
     *
     * <ul>
     *   <li>상태 = {@link TaxInvoiceStatus#ISSUED} — 아닐 시 {@link BusinessException}(TAX_INVOICE_NOT_EMITTABLE)</li>
     *   <li>eTaxExternalId = null — 이미 발행된 경우 {@link BusinessException}(TAX_INVOICE_ALREADY_EMITTED)</li>
     * </ul>
     *
     * @param eTaxExternalId 외부 e-Tax 발급 ID (필수, 1~100자)
     * @throws BusinessException(TAX_INVOICE_NOT_EMITTABLE) ISSUED 상태가 아닐 때
     * @throws BusinessException(TAX_INVOICE_ALREADY_EMITTED) 이미 eTaxExternalId 설정된 경우
     */
    public void markEmitted(String eTaxExternalId) {
        if (this.status != TaxInvoiceStatus.ISSUED) {
            throw new BusinessException(ErrorCode.TAX_INVOICE_NOT_EMITTABLE,
                    "e-Tax 전송은 " + TaxInvoiceStatus.ISSUED.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + this.status.getDisplayName() + ")");
        }
        if (this.eTaxExternalId != null && !this.eTaxExternalId.isBlank()) {
            throw new BusinessException(ErrorCode.TAX_INVOICE_ALREADY_EMITTED,
                    "이미 e-Tax 전송된 세금계산서입니다 (externalId: " + this.eTaxExternalId + ")");
        }
        if (eTaxExternalId == null || eTaxExternalId.isBlank()) {
            throw new IllegalArgumentException("eTaxExternalId 는 필수입니다");
        }
        if (eTaxExternalId.length() > 100) {
            throw new IllegalArgumentException("eTaxExternalId 는 최대 100자입니다");
        }
        this.eTaxExternalId = eTaxExternalId;
    }

    /** 라인 합계 → 헤더 supply/vat/total 재계산. 공통 부가세 계산기를 사용한다. */
    public void recalcTotals() {
        BigDecimal supplySum = this.lines.stream()
                .map(TaxInvoiceLine::getSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal vatSum = this.lines.stream()
                .map(TaxInvoiceLine::getVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        // 라인별 vat 가 supply*0.1 로 사전 계산되어 들어오지만, 헤더 vat 는 라인 합으로 산출
        // (라인별 반올림 누적 차이 흡수). 라인이 없거나 vat 0 이면 supply*0.1 fallback.
        if (vatSum.signum() == 0 && supplySum.signum() > 0) {
            vatSum = VatAmountCalculator.fromSupply(supplySum).setScale(2);
        }
        this.supplyAmount = supplySum.setScale(2, RoundingMode.HALF_UP);
        this.vatAmount = vatSum.setScale(2, RoundingMode.HALF_UP);
        this.totalAmount = this.supplyAmount.add(this.vatAmount);
    }

    /**
     * DRAFT 상태 요구 가드 — CashReceipt.requireDraft 패턴과 동일하게, 호출부가 조사(은/는)까지
     * 포함한 완결 문구를 전달한다("헤더 수정은 " 등, 끝에 공백 포함). 여기서는 상태 라벨과
     * "(현재: …)" 접미만 이어 붙인다 — 조사를 여기서 고정하면 명사별 받침 유무에 따라
     * 비문("라인 추가은" 등)이 생기므로 호출부 책임으로 둔다.
     *
     * @param messagePrefix 조사 포함 완결 문구 (예: {@code "라인 추가는 "})
     * @throws BusinessException(CONFLICT) DRAFT 가 아닐 때
     */
    private void requireDraft(String messagePrefix) {
        if (this.status != TaxInvoiceStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    messagePrefix + TaxInvoiceStatus.DRAFT.getDisplayName()
                            + " 상태에서만 허용됩니다 (현재: " + this.status.getDisplayName() + ")");
        }
    }
}
