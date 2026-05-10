package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.config.CompanyProperties;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.util.KoreanAmountConverter;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceLineRequest;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceCancelRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceCreateRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceDetailResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceLineRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoicePrintResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceSummaryResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세금계산서 service (Phase 10 Step 8 — P0-4 #3).
 *
 * <p>매뉴얼 출처: {@code docs/manual/03-회계/03-세금계산서.md}.
 *
 * <p>라이프사이클 표 (Layer 4 의무):
 *
 * <pre>
 *   create        : (없음) → DRAFT
 *   update        : DRAFT mutation 만 허용
 *   issue         : DRAFT → ISSUED + tax_invoice_no 채번 + 자동 분개 (110/255/400)
 *   cancel        : ISSUED → CANCELLED + 자동 역분개
 *   list / getOne : 조회
 * </pre>
 *
 * <p>자동 분개 패턴 (한국 일반기업회계기준 + 매뉴얼 §1-4):
 *
 * <pre>
 *   (차) 110 외상매출금        totalAmount
 *   (대) 255 부가세예수금                 vatAmount
 *   (대) 400 매출                         supplyAmount
 * </pre>
 *
 * <p>partnerId 는 분개 라인 partnerId 로 전파 → AR/AP 추적 (A4 의존). source_ref_id 는
 * TaxInvoice UUID — 추후 분개 → 세금계산서 역추적.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class TaxInvoiceService {

    /** 외상매출금 — 한국 표준 코드 110 (V1 시드). */
    public static final String ACCOUNT_RECEIVABLES = "110";
    /** 부가세예수금 — 한국 표준 코드 255 (V2 시드 신규). */
    public static final String ACCOUNT_VAT_PAYABLE = "255";
    /** 매출 — 한국 표준 코드 400 (V1 시드, 통제 계정 → 401 상품매출 라인 코드 사용). */
    public static final String ACCOUNT_REVENUE = "401";

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final TaxInvoiceNumberService taxInvoiceNumberService;
    private final JournalService journalService;
    private final CompanyProperties companyProperties;

    /**
     * shared:realtime-abstraction audit recorder — PR-H4b. AccountingAuditLogService 가 본
     * interface 를 구현. {@code @Autowired(required=false)} setter — 단위 테스트 (AuditLogRecorder
     * bean 미등록 환경) 회귀 0 보장.
     */
    private AuditLogRecorder auditRecorder;

    @Autowired(required = false)
    public void setAuditRecorder(AuditLogRecorder auditRecorder) {
        this.auditRecorder = auditRecorder;
    }

    /**
     * 신규 세금계산서 생성 (DRAFT). 라인 1개 이상 필수, 금액 자동 계산.
     */
    public TaxInvoiceDetailResponse create(CreateTaxInvoiceRequest request) {
        TaxInvoice ti = TaxInvoice.create(request.partnerId(), request.partnerBusinessNo(),
                request.partnerName(), request.partnerAddress(), request.supplyDate(),
                request.description());
        int lineNo = 1;
        for (CreateTaxInvoiceLineRequest lineReq : request.lines()) {
            TaxInvoiceLine line = TaxInvoiceLine.create(ti, lineNo++, lineReq.itemName(),
                    lineReq.spec(), lineReq.quantity(), lineReq.unitPrice(), lineReq.memo());
            ti.addLine(line);
        }
        TaxInvoice saved = taxInvoiceRepository.save(ti);
        return TaxInvoiceDetailResponse.of(saved);
    }

    /**
     * 수정 — DRAFT 상태에서 헤더 + 라인 일괄 교체.
     *
     * <p>PR-H4b — shared audit recorder 가 등록되어 있으면 헤더 변경 (partnerName/partnerAddress/
     * supplyDate/description) 별로 audit_log 1행 + SSE broadcast.
     */
    public TaxInvoiceDetailResponse update(UUID id, CreateTaxInvoiceRequest request) {
        TaxInvoice ti = findOrThrow(id);
        // diff snapshot — audit 비교용
        String oldPartnerName = ti.getPartnerName();
        String oldPartnerAddress = ti.getPartnerAddress();
        String oldSupplyDate = ti.getSupplyDate() == null ? null : ti.getSupplyDate().toString();
        String oldDescription = ti.getDescription();

        ti.updateBasic(request.partnerBusinessNo(), request.partnerName(),
                request.partnerAddress(), request.supplyDate(), request.description());
        // 라인 교체 — orphan removal 로 기존 라인 영속화 제거.
        List<TaxInvoiceLine> newLines = new ArrayList<>();
        int lineNo = 1;
        for (CreateTaxInvoiceLineRequest lineReq : request.lines()) {
            newLines.add(TaxInvoiceLine.create(ti, lineNo++, lineReq.itemName(),
                    lineReq.spec(), lineReq.quantity(), lineReq.unitPrice(), lineReq.memo()));
        }
        ti.replaceLines(newLines);

        if (auditRecorder != null) {
            UUID systemActor = new UUID(0L, 0L);
            recordIfChanged(ti.getId(), systemActor, "system", "taxInvoice.partnerName",
                    oldPartnerName, ti.getPartnerName());
            recordIfChanged(ti.getId(), systemActor, "system", "taxInvoice.partnerAddress",
                    oldPartnerAddress, ti.getPartnerAddress());
            recordIfChanged(ti.getId(), systemActor, "system", "taxInvoice.supplyDate",
                    oldSupplyDate, ti.getSupplyDate() == null ? null : ti.getSupplyDate().toString());
            recordIfChanged(ti.getId(), systemActor, "system", "taxInvoice.description",
                    oldDescription, ti.getDescription());
        }
        return TaxInvoiceDetailResponse.of(ti);
    }

    /** 변경된 경우만 audit row 1행 INSERT — UUID 비공개 가드 (actorName 표시). */
    private void recordIfChanged(UUID entityId, UUID actorId, String actorName,
                                 String fieldName, String oldVal, String newVal) {
        if (Objects.equals(oldVal, newVal)) {
            return;
        }
        try {
            auditRecorder.recordOverlayPatch(entityId, actorId, actorName, null,
                    fieldName, oldVal, newVal);
        } catch (RuntimeException ex) {
            // graceful — audit 실패가 비즈니스 mutation 차단하지 않음
        }
    }

    /**
     * 발행 — DRAFT → ISSUED. 발행번호 채번 + 자동 분개 게시 + journalId 연결.
     *
     * <p>자동 분개: (차) 110 / (대) 255+401. partnerId 라인 전파.
     */
    public TaxInvoiceDetailResponse issue(UUID id, String actorUserId) {
        TaxInvoice ti = findOrThrow(id);
        // 채번 (DB UNIQUE 백업).
        String taxInvoiceNo = taxInvoiceNumberService.next(ti.getSupplyDate());
        ti.issue(taxInvoiceNo, actorUserId);

        // 자동 분개 라인 구성: 110 차 / 255 대 / 401 대.
        List<JournalService.AutoJournalLineSpec> lineSpecs = new ArrayList<>();
        lineSpecs.add(new JournalService.AutoJournalLineSpec(
                ACCOUNT_RECEIVABLES,
                ti.getTotalAmount(),
                java.math.BigDecimal.ZERO,
                ti.getPartnerId(),
                "세금계산서 " + taxInvoiceNo + " 외상매출금"));
        if (ti.getVatAmount().signum() > 0) {
            lineSpecs.add(new JournalService.AutoJournalLineSpec(
                    ACCOUNT_VAT_PAYABLE,
                    java.math.BigDecimal.ZERO,
                    ti.getVatAmount(),
                    ti.getPartnerId(),
                    "세금계산서 " + taxInvoiceNo + " 부가세예수금"));
        }
        lineSpecs.add(new JournalService.AutoJournalLineSpec(
                ACCOUNT_REVENUE,
                java.math.BigDecimal.ZERO,
                ti.getSupplyAmount(),
                ti.getPartnerId(),
                "세금계산서 " + taxInvoiceNo + " 매출"));

        Journal journal = journalService.postAutoJournal(
                ti.getSupplyDate(),
                "세금계산서 발행 " + taxInvoiceNo + " (" + ti.getPartnerName() + ")",
                JournalSourceType.SLIP,
                ti.getId(),
                actorUserId,
                lineSpecs);
        ti.linkJournal(journal.getId());
        return TaxInvoiceDetailResponse.of(ti);
    }

    /**
     * 취소 — ISSUED → CANCELLED. 원분개 자동 역분개 + reverse_journal_id 연결.
     * 하위 호환용 — 취소 사유 없이 호출. 기존 controller 에서 사용.
     *
     * @deprecated P0-4 이후 {@link #cancelWithReason(UUID, TaxInvoiceCancelRequest, String)} 사용.
     */
    @Deprecated
    public TaxInvoiceDetailResponse cancel(UUID id, String actorUserId) {
        TaxInvoice ti = findOrThrow(id);
        ti.cancel(actorUserId);
        if (ti.getJournalId() != null) {
            Journal reversal = journalService.autoReverse(ti.getJournalId(), actorUserId);
            ti.linkReverseJournal(reversal.getId());
        }
        return TaxInvoiceDetailResponse.of(ti);
    }

    /**
     * 신규 세금계산서 DRAFT 생성 (P0-4 신규 DTO — {@link TaxInvoiceCreateRequest}).
     *
     * <p>invoiceType 문자열 → {@link TaxInvoiceType} 변환. 잘못된 값이면 400.
     * partnerCode / partnerBusinessNumber / issueDate / unit 필드 포함.
     *
     * @param request 발행 요청 DTO (P0-4)
     * @return 생성된 세금계산서 상세 응답
     */
    public TaxInvoiceDetailResponse createFromRequest(TaxInvoiceCreateRequest request) {
        TaxInvoiceType invoiceType = parseInvoiceType(request.invoiceType());

        TaxInvoice ti = TaxInvoice.create(
                request.partnerId(),
                request.partnerCode(),
                request.partnerBusinessNumber(),
                request.partnerName(),
                null,                // partnerAddress — P0-4 DTO 미포함, 향후 확장용
                request.issueDate(),
                request.memo(),
                invoiceType
        );

        int lineNo = 1;
        for (TaxInvoiceLineRequest lineReq : request.lines()) {
            TaxInvoiceLine line = TaxInvoiceLine.create(
                    ti, lineNo++,
                    lineReq.itemName(),
                    lineReq.specification(),
                    lineReq.unit(),
                    lineReq.quantity(),
                    lineReq.unitPrice(),
                    null   // memo — TaxInvoiceLineRequest 에 memo 미포함
            );
            ti.addLine(line);
        }
        TaxInvoice saved = taxInvoiceRepository.save(ti);
        return TaxInvoiceDetailResponse.of(saved);
    }

    /**
     * 취소 — ISSUED → CANCELLED (P0-4 신규 — 취소 사유 의무).
     *
     * <p>원분개 자동 역분개 + reverse_journal_id 연결.
     *
     * @param id          세금계산서 UUID
     * @param cancelReq   취소 사유 DTO (5자 이상)
     * @param actorUserId 취소자 user-id
     * @return 취소된 세금계산서 상세 응답
     */
    public TaxInvoiceDetailResponse cancelWithReason(UUID id, TaxInvoiceCancelRequest cancelReq,
                                                     String actorUserId) {
        TaxInvoice ti = findOrThrow(id);
        ti.cancel(cancelReq.reason(), actorUserId);
        if (ti.getJournalId() != null) {
            Journal reversal = journalService.autoReverse(ti.getJournalId(), actorUserId);
            ti.linkReverseJournal(reversal.getId());
        }
        return TaxInvoiceDetailResponse.of(ti);
    }

    /**
     * 발행 history 페이지 조회 (P0-4 신규 — type 필터 추가).
     *
     * <p>5 필터 조합: status / type / fromDate / toDate / partnerId. null 이면 무시.
     * 정렬: 발행일자 DESC, 발행번호 DESC.
     *
     * @param status    세금계산서 상태 (선택)
     * @param type      세금계산서 종류 SALES/PURCHASE (선택)
     * @param fromDate  공급일자 시작 (선택)
     * @param toDate    공급일자 종료 (선택)
     * @param partnerId 거래처 UUID (선택)
     * @param pageable  페이지 정보
     * @return 페이지 결과 (TaxInvoiceSummaryResponse)
     */
    @Transactional(readOnly = true)
    public Page<TaxInvoiceSummaryResponse> listWithType(TaxInvoiceStatus status,
                                                        TaxInvoiceType type,
                                                        LocalDate fromDate,
                                                        LocalDate toDate,
                                                        UUID partnerId,
                                                        Pageable pageable) {
        return taxInvoiceRepository
                .findByFiltersWithType(status, type, fromDate, toDate, partnerId, pageable)
                .map(TaxInvoiceSummaryResponse::of);
    }

    /**
     * 인쇄용 데이터 조회 (P0-4).
     *
     * <p>공급자 정보 (회사) + 공급받는자 정보 (거래처 snapshot) + 라인 + 합계 + 한글 금액.
     * ISSUED / CANCELLED 상태만 인쇄 허용 (DRAFT 인쇄 차단).
     *
     * @param id 세금계산서 UUID
     * @return 인쇄용 응답 DTO
     * @throws BusinessException(CONFLICT) DRAFT 상태일 때
     */
    @Transactional(readOnly = true)
    public TaxInvoicePrintResponse print(UUID id) {
        TaxInvoice ti = findOrThrow(id);
        if (ti.getStatus() == TaxInvoiceStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 상태의 세금계산서는 인쇄할 수 없습니다. 먼저 발행하세요.");
        }

        List<TaxInvoicePrintResponse.PrintLine> printLines = ti.getLines().stream()
                .map(l -> new TaxInvoicePrintResponse.PrintLine(
                        l.getLineNo(),
                        l.getItemName(),
                        l.getSpec(),
                        l.getQuantity(),
                        l.getUnit(),
                        l.getUnitPrice(),
                        l.getSupplyAmount(),
                        l.getVatAmount()
                ))
                .toList();

        return new TaxInvoicePrintResponse(
                companyProperties.getName(),
                companyProperties.getBusinessNumber(),
                companyProperties.getCeo(),
                companyProperties.getAddress(),
                companyProperties.getBusinessType(),
                companyProperties.getBusinessItem(),
                ti.getPartnerName(),
                ti.getPartnerBusinessNo(),
                ti.getPartnerAddress(),
                ti.getTaxInvoiceNo(),
                ti.getSupplyDate(),
                printLines,
                ti.getSupplyAmount(),
                ti.getVatAmount(),
                ti.getTotalAmount(),
                KoreanAmountConverter.convert(ti.getTotalAmount())
        );
    }

    /**
     * 페이지 조회 — 4 필터 (status, from, to, partnerId). 기존 호환용.
     *
     * <p>nativeQuery 전환으로 status / partnerId 를 String 으로 변환하여 전달합니다.
     * Hibernate 6 + PostgreSQL 에서 {@code LocalDate} 파라미터 바인딩 오류 방어.
     */
    @Transactional(readOnly = true)
    public Page<TaxInvoiceResponse> list(TaxInvoiceStatus status, LocalDate from, LocalDate to,
                                         UUID partnerId, Pageable pageable) {
        String statusStr = status != null ? status.name() : null;
        String partnerIdStr = partnerId != null ? partnerId.toString() : null;
        return taxInvoiceRepository.findByFilters(statusStr, from, to, partnerIdStr, pageable)
                .map(TaxInvoiceResponse::of);
    }

    /** 단건 조회 (라인 포함). */
    @Transactional(readOnly = true)
    public TaxInvoiceDetailResponse getOne(UUID id) {
        return TaxInvoiceDetailResponse.of(findOrThrow(id));
    }

    /**
     * invoiceType 문자열 → {@link TaxInvoiceType} 변환.
     * null / 빈 문자열이면 SALES 기본값. 잘못된 값이면 400.
     */
    private TaxInvoiceType parseInvoiceType(String raw) {
        if (raw == null || raw.isBlank()) {
            return TaxInvoiceType.SALES;
        }
        try {
            return TaxInvoiceType.valueOf(raw.toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "invoiceType 은 SALES 또는 PURCHASE 만 허용됩니다: " + raw);
        }
    }

    private TaxInvoice findOrThrow(UUID id) {
        return taxInvoiceRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "존재하지 않는 세금계산서입니다: " + id));
    }
}
