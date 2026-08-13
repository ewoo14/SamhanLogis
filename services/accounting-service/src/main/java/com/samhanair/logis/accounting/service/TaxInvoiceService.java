package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.config.CompanyProperties;
import com.samhanair.logis.accounting.domain.SupplierProfile;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
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
 *   issue         : DRAFT → ISSUED + tax_invoice_no 채번 + 자동 분개 (1089/2559/4019)
 *   cancel        : ISSUED → CANCELLED + 자동 역분개
 *   list / getOne : 조회
 * </pre>
 *
 * <p>자동 분개 패턴 (한국 일반기업회계기준 + 매뉴얼 §1-4):
 *
 * <pre>
 *   (차) 1089 외상매출금       totalAmount
 *   (대) 2559 부가세예수금                vatAmount
 *   (대) 4019 상품매출         supplyAmount
 * </pre>
 *
 * <p>partnerId 는 분개 라인 partnerId 로 전파 → AR/AP 추적 (A4 의존). source_ref_id 는
 * TaxInvoice UUID — 추후 분개 → 세금계산서 역추적.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class TaxInvoiceService {

    /** 외상매출금 — V101 이카운트 정본 코드 1089. */
    public static final String ACCOUNT_RECEIVABLES = "1089";
    /** 부가세예수금 — V101 이카운트 정본 코드 2559. */
    public static final String ACCOUNT_VAT_PAYABLE = "2559";
    /** 매출 — V101 이카운트 leaf 코드 4019(상품매출). */
    public static final String ACCOUNT_REVENUE = "4019";

    private final TaxInvoiceRepository taxInvoiceRepository;
    private final TaxInvoiceNumberService taxInvoiceNumberService;
    private final JournalService journalService;
    private final CompanyProperties companyProperties;
    private final SupplierProfileRepository supplierProfileRepository;

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
     *
     * <p>#825 CM-a — partnerCode 도 함께 저장한다 (기존 표준 create 경로가 partnerCode 를
     * 전달하지 않아 null 로 저장되던 누락 보정 — invoiceType 은 기존과 동일하게 SALES 기본).
     */
    public TaxInvoiceDetailResponse create(CreateTaxInvoiceRequest request) {
        TaxInvoice ti = TaxInvoice.create(request.partnerId(), request.partnerCode(),
                request.partnerBusinessNo(), request.partnerName(), request.partnerAddress(),
                request.supplyDate(), request.description(), TaxInvoiceType.SALES);
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
     * <p>#825 CH1 — 편집에서 거래처를 교체하면 FE 가 새 거래처의 {@code partnerId} 와
     * 상호/사업자번호 snapshot 을 함께 전송한다. {@code request.partnerId()} 를 도메인에
     * 반영해 "원 거래처 UUID + 새 거래처 상호" 불일치(무결성 훼손)를 차단한다 (create 와
     * 동일 계약 — partnerId {@code @NotNull}).
     *
     * <p>#825 CM-a — {@code request.partnerCode()} 도 함께 반영한다. 미반영 시 /issue-request
     * 생성분(partnerCode 채워짐)을 편집으로 거래처 교체하면 P1 코드가 잔존해 partnerId/name/
     * bizNo(P2)와 불일치가 생긴다 (선택 필드 — null 이면 null 로 갱신, create 와 동일 계약).
     *
     * <p>PR-H4b — shared audit recorder 가 등록되어 있으면 헤더 변경 (partnerName/partnerAddress/
     * supplyDate/description) 별로 audit_log 1행 + SSE broadcast. partnerId(UUID) 는 기존
     * 관례(인간가독 snapshot 필드만 기록)에 따라 audit diff 에 포함하지 않는다 — UUID 사용자
     * 비공개 가드. 거래처 교체는 partnerName diff 로 인간가독 포착된다.
     * <p>B2: partnerId 값이 바뀌면 표시 문자열이 같아도 {@code taxInvoice.partner} 전용
     * audit을 기록한다. 표시 문자열에는 거래처 상호와 코드만 넣고 내부 UUID는 넣지 않는다.
     */
    public TaxInvoiceDetailResponse update(UUID id, CreateTaxInvoiceRequest request) {
        TaxInvoice ti = findOrThrow(id);
        // diff snapshot — audit 비교용
        UUID oldPartnerId = ti.getPartnerId();
        String oldPartnerCode = ti.getPartnerCode();
        String oldPartnerName = ti.getPartnerName();
        String oldPartnerAddress = ti.getPartnerAddress();
        String oldSupplyDate = ti.getSupplyDate() == null ? null : ti.getSupplyDate().toString();
        String oldDescription = ti.getDescription();

        ti.updateBasic(request.partnerId(), request.partnerCode(), request.partnerBusinessNo(),
                request.partnerName(), request.partnerAddress(), request.supplyDate(),
                request.description());
        boolean partnerChanged = !Objects.equals(oldPartnerId, ti.getPartnerId());
        /*
         * 라인 교체는 기존 라인 제거를 먼저 DB에 반영한 뒤 신규 라인을 추가한다.
         * Hibernate action queue 는 같은 flush 에서 INSERT 를 DELETE 보다 먼저 실행할 수 있어
         * (tax_invoice_id, line_no) active UNIQUE 와 충돌한다. 특히 같은 테스트/상위
         * 트랜잭션 안에서 update 직후 issue 채번 native query 가 AUTO flush 를 유발하면
         * 기존 line_no 가 아직 살아 있는 상태로 신규 line_no INSERT 가 먼저 나간다.
         */
        ti.replaceLines(List.of());
        taxInvoiceRepository.flush();

        List<TaxInvoiceLine> newLines = new ArrayList<>();
        int lineNo = 1;
        for (CreateTaxInvoiceLineRequest lineReq : request.lines()) {
            newLines.add(TaxInvoiceLine.create(ti, lineNo++, lineReq.itemName(),
                    lineReq.spec(), lineReq.quantity(), lineReq.unitPrice(), lineReq.memo()));
        }
        ti.replaceLines(newLines);

        if (auditRecorder != null) {
            UUID systemActor = new UUID(0L, 0L);
            if (partnerChanged) {
                recordPartnerChanged(ti.getId(), systemActor, "system",
                        oldPartnerCode, oldPartnerName, ti.getPartnerCode(), ti.getPartnerName());
            }
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

    /** 거래처 UUID 교체를 표시 가능한 snapshot으로 기록한다. 문자열이 같아도 교체 사실을 보존한다. */
    private void recordPartnerChanged(UUID entityId, UUID actorId, String actorName,
                                      String oldPartnerCode, String oldPartnerName,
                                      String newPartnerCode, String newPartnerName) {
        try {
            auditRecorder.recordOverlayPatch(entityId, actorId, actorName, null,
                    "taxInvoice.partner",
                    partnerDisplayValue(oldPartnerName, oldPartnerCode),
                    partnerDisplayValue(newPartnerName, newPartnerCode));
        } catch (RuntimeException ex) {
            // 원자 처리(개발책임자 결정 A·2026-07-20) — audit 기록은 같은 트랜잭션(REQUIRED)이라
            // recordOverlayPatch 실패 시 tx 가 오염돼 커밋 시점에 거래처 교체까지 동반 롤백된다
            // (무감사 거래처 교체 차단·회계 무결성 우선). 즉 best-effort(감사만 누락·mutation 성공)가
            // 아니라 audit+mutation 동반 성공/실패다. 이 catch 는 즉시 예외 대신 커밋 시점
            // UnexpectedRollbackException 으로 위임할 뿐 결과(원자)는 동일하며, 기존 recordIfChanged 와
            // 같은 계열이다. (진짜 best-effort 격리는 shared audit 계층 REQUIRES_NEW 후속 검토 대상.)
        }
    }

    /** 거래처 audit용 인간가독 표시값. 내부 UUID는 절대 포함하지 않는다. */
    private static String partnerDisplayValue(String partnerName, String partnerCode) {
        String displayName = partnerName == null || partnerName.isBlank() ? "상호 미등록" : partnerName;
        String displayCode = partnerCode == null || partnerCode.isBlank() ? "코드 미등록" : partnerCode;
        return displayName + " (" + displayCode + ")";
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
     * <p>자동 분개: (차) 1089 / (대) 2559+4019. partnerId 라인 전파.
     */
    public TaxInvoiceDetailResponse issue(UUID id, String actorUserId) {
        TaxInvoice ti = findOrThrow(id);
        // 채번 (DB UNIQUE 백업).
        String taxInvoiceNo = taxInvoiceNumberService.next(ti.getSupplyDate());
        ti.issue(taxInvoiceNo, actorUserId);

        // 자동 분개 라인 구성: 1089 차 / 2559 대 / 4019 대.
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
     * <p>원분개 일자가 마감된 회계 기간이면 {@link JournalService#autoReverse} 가 CONFLICT(409)
     * 로 차단한다 — 세금계산서도 입금보고서(CashReceipt)와 동일하게 마감된 원분개의 취소를
     * 허용하지 않는다(#719 개발책임자 결정, 기존 "세금계산서는 마감이어도 역분개 허용" 예외 철회).
     * 예외 발생 시 트랜잭션이 롤백되어 세금계산서는 ISSUED, 원분개는 POSTED 로 유지된다.
     *
     * @deprecated P0-4 이후 {@link #cancelWithReason(UUID, TaxInvoiceCancelRequest, String)} 사용.
     * @throws BusinessException(CONFLICT) 원분개 일자가 마감된 회계 기간에 속할 때
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
     * <p>원분개 일자가 마감된 회계 기간이면 {@link JournalService#autoReverse} 가 CONFLICT(409)
     * 로 차단한다 — 세금계산서도 입금보고서(CashReceipt)와 동일하게 마감된 원분개의 취소를
     * 허용하지 않는다(#719 개발책임자 결정, 기존 "세금계산서는 마감이어도 역분개 허용" 예외 철회).
     * 예외 발생 시 트랜잭션이 롤백되어 세금계산서는 ISSUED, 원분개는 POSTED 로 유지된다
     * (도메인 {@code ti.cancel(...)} 이 먼저 상태를 CANCELLED 로 바꾸지만, 이후 역분개
     * 가드가 던지는 예외로 트랜잭션 전체가 롤백되어 영속 상태는 변경되지 않는다).
     *
     * @param id          세금계산서 UUID
     * @param cancelReq   취소 사유 DTO (5자 이상)
     * @param actorUserId 취소자 user-id
     * @return 취소된 세금계산서 상세 응답
     * @throws BusinessException(CONFLICT) 원분개 일자가 마감된 회계 기간에 속할 때
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
                    TaxInvoiceStatus.DRAFT.getDisplayName() + " 상태의 세금계산서는 인쇄할 수 없습니다. 먼저 발행하세요.");
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

        // 공급자 정보: primary SupplierProfile 우선, 부재 시 CompanyProperties fallback
        // (spec §1d — TaxInvoicePrintResponse 계약 불변)
        java.util.Optional<SupplierProfile> primaryOpt =
                supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse();
        String supplierName;
        String supplierBusinessNo;
        String supplierCeo;
        String supplierAddress;
        String supplierBusinessType;
        String supplierBusinessItem;
        if (primaryOpt.isPresent()) {
            SupplierProfile sp = primaryOpt.get();
            supplierName = sp.getCompanyName();
            supplierBusinessNo = sp.getBusinessNumber();
            supplierCeo = sp.getRepresentativeName();
            supplierAddress = sp.getBusinessAddress();
            supplierBusinessType = sp.getBusinessType();
            supplierBusinessItem = sp.getBusinessItem();
        } else {
            supplierName = companyProperties.getName();
            supplierBusinessNo = companyProperties.getBusinessNumber();
            supplierCeo = companyProperties.getCeo();
            supplierAddress = companyProperties.getAddress();
            supplierBusinessType = companyProperties.getBusinessType();
            supplierBusinessItem = companyProperties.getBusinessItem();
        }

        return new TaxInvoicePrintResponse(
                supplierName,
                supplierBusinessNo,
                supplierCeo,
                supplierAddress,
                supplierBusinessType,
                supplierBusinessItem,
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
                    "세금계산서 종류는 " + TaxInvoiceType.SALES.getDisplayName()
                            + " 또는 " + TaxInvoiceType.PURCHASE.getDisplayName()
                            + "만 허용됩니다. 허용되지 않는 종류입니다.");
        }
    }

    private TaxInvoice findOrThrow(UUID id) {
        return taxInvoiceRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "존재하지 않는 세금계산서입니다: " + id));
    }
}
