package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.config.CompanyProperties;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceCancelRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceCreateRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceDetailResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceLineRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoicePrintResponse;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceSummaryResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.shared.realtime.audit.AuditLogRecorder;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

/**
 * TaxInvoiceService 단위 테스트 (P0-4, Mockito Lenient).
 *
 * <p>10 시나리오:
 *
 * <ol>
 *   <li>createFromRequest — DRAFT 생성, invoiceType SALES, 합계 자동 계산</li>
 *   <li>createFromRequest — invoiceType PURCHASE 정상 처리</li>
 *   <li>createFromRequest — 잘못된 invoiceType 400 INVALID_INPUT</li>
 *   <li>createFromRequest — 사업자번호 형식 오류 400 (DTO @Pattern 검증은 Controller 레벨,
 *       Service 는 통과 — 도메인 partnerBusinessNo 길이만 검증)</li>
 *   <li>issue — DRAFT → ISSUED, invoiceNo 채번, journalId 연결</li>
 *   <li>cancelWithReason — ISSUED → CANCELLED, cancelReason 기록</li>
 *   <li>cancelWithReason — reason 5자 미만 → BusinessException INVALID_INPUT</li>
 *   <li>print — ISSUED 상태 인쇄 데이터 반환 (한글 금액 포함)</li>
 *   <li>print — DRAFT 상태 → BusinessException CONFLICT</li>
 *   <li>listWithType — type=SALES 필터 위임 검증</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TaxInvoiceServiceTest {

    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private TaxInvoiceNumberService taxInvoiceNumberService;
    @Mock private JournalService journalService;
    @Mock private CompanyProperties companyProperties;
    @Mock private SupplierProfileRepository supplierProfileRepository;
    @Mock private AuditLogRecorder auditRecorder;

    @InjectMocks private TaxInvoiceService taxInvoiceService;

    private static final LocalDate ISSUE_DATE = LocalDate.of(2026, 5, 11);
    private static final UUID PARTNER_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        taxInvoiceService.setAuditRecorder(auditRecorder);
        // 회사 정보 stub (CompanyProperties fallback)
        lenient().when(companyProperties.getName()).thenReturn("(주)삼한공조시스템");
        lenient().when(companyProperties.getBusinessNumber()).thenReturn("123-45-67890");
        lenient().when(companyProperties.getCeo()).thenReturn("김미선");
        lenient().when(companyProperties.getAddress()).thenReturn("서울특별시 강남구");
        lenient().when(companyProperties.getBusinessType()).thenReturn("도소매");
        lenient().when(companyProperties.getBusinessItem()).thenReturn("공조기기");

        // SupplierProfile primary — 기본값 empty (CompanyProperties fallback 경로 활성화)
        lenient().when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.empty());

        // repository.save stub — 저장된 엔티티 그대로 반환
        lenient().when(taxInvoiceRepository.save(any(TaxInvoice.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        // 발행번호 채번 stub
        lenient().when(taxInvoiceNumberService.next(any())).thenReturn("2026/05/11-1");
    }

    // ── 시나리오 1 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("1. createFromRequest — DRAFT 생성, SALES 기본, supplyAmount 100000")
    void scenario1_createFromRequest_salesDefault() {
        TaxInvoiceCreateRequest req = new TaxInvoiceCreateRequest(
                null,           // invoiceType null → SALES 기본
                PARTNER_ID,
                "P-001",
                "테스트거래처",
                "123-45-67890",
                ISSUE_DATE,
                "테스트 메모",
                List.of(new TaxInvoiceLineRequest("운임 기본료", "kg", new BigDecimal("100"),
                        "건", new BigDecimal("1000"), null, null))
        );

        TaxInvoiceDetailResponse res = taxInvoiceService.createFromRequest(req);

        assertThat(res.status()).isEqualTo(TaxInvoiceStatus.DRAFT);
        assertThat(res.invoiceType()).isEqualTo(TaxInvoiceType.SALES);
        assertThat(res.supplyAmount()).isEqualByComparingTo("100000.00");
        assertThat(res.vatAmount()).isEqualByComparingTo("10000.00");
        assertThat(res.totalAmount()).isEqualByComparingTo("110000.00");
        assertThat(res.taxInvoiceNo()).isNull();
    }

    // ── 시나리오 2 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("2. createFromRequest — invoiceType PURCHASE 정상 처리")
    void scenario2_createFromRequest_purchaseType() {
        TaxInvoiceCreateRequest req = new TaxInvoiceCreateRequest(
                "PURCHASE",
                PARTNER_ID,
                "P-002",
                "매입거래처",
                "987-65-43210",
                ISSUE_DATE,
                null,
                List.of(new TaxInvoiceLineRequest("원자재", null, new BigDecimal("10"),
                        "박스", new BigDecimal("50000"), null, null))
        );

        TaxInvoiceDetailResponse res = taxInvoiceService.createFromRequest(req);

        assertThat(res.invoiceType()).isEqualTo(TaxInvoiceType.PURCHASE);
        assertThat(res.status()).isEqualTo(TaxInvoiceStatus.DRAFT);
    }

    // ── 시나리오 3 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("3. createFromRequest — 잘못된 invoiceType → BusinessException INVALID_INPUT")
    void scenario3_createFromRequest_invalidInvoiceType() {
        String rawInvoiceType = "BAD_ENUM";
        TaxInvoiceCreateRequest req = new TaxInvoiceCreateRequest(
                rawInvoiceType,
                PARTNER_ID, "P-003", "거래처", "123-45-67890",
                ISSUE_DATE, null,
                List.of(new TaxInvoiceLineRequest("품목", null,
                        BigDecimal.ONE, null, BigDecimal.TEN, null, null))
        );

        assertThatThrownBy(() -> taxInvoiceService.createFromRequest(req))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("매출 또는 매입")
                .hasMessageNotContaining("SALES")
                .hasMessageNotContaining("PURCHASE")
                .hasMessageNotContaining(rawInvoiceType);
    }

    // ── 시나리오 4 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("4. createFromRequest — partnerCode 100자 이하 정상, 101자 도메인 가드 거부 (#825 재수렴 #1)")
    void scenario4_createFromRequest_partnerCodeValidation() {
        String longCode = "A".repeat(100); // 정확히 100자 — 정상 (partners VARCHAR(100) · 실측 max=86 정렬)
        TaxInvoiceCreateRequest req = new TaxInvoiceCreateRequest(
                "SALES",
                PARTNER_ID,
                longCode,
                "거래처",
                null,   // partnerBusinessNumber 선택
                ISSUE_DATE, null,
                List.of(new TaxInvoiceLineRequest("품목", null,
                        BigDecimal.ONE, null, new BigDecimal("1000"), null, null))
        );

        TaxInvoiceDetailResponse res = taxInvoiceService.createFromRequest(req);
        assertThat(res.partnerCode()).isEqualTo(longCode);

        // 101자 — DTO @Size(max=100) 는 controller 레벨, Service 는 도메인 가드가 이중 방어
        TaxInvoiceCreateRequest tooLong = new TaxInvoiceCreateRequest(
                "SALES",
                PARTNER_ID,
                "X".repeat(101),
                "거래처",
                null,
                ISSUE_DATE, null,
                List.of(new TaxInvoiceLineRequest("품목", null,
                        BigDecimal.ONE, null, new BigDecimal("1000"), null, null))
        );
        assertThatThrownBy(() -> taxInvoiceService.createFromRequest(tooLong))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("partnerCode")
                .hasMessageContaining("100");
    }

    // ── 시나리오 5 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("5. issue — DRAFT → ISSUED, invoiceNo 2026/05/11-1, journalId 연결")
    void scenario5_issue_draftToIssued() throws Exception {
        TaxInvoice ti = buildIssuableDraft();
        UUID tiId = UUID.randomUUID();
        setId(ti, tiId);

        when(taxInvoiceRepository.findById(tiId)).thenReturn(Optional.of(ti));

        Journal mockJournal = buildMockJournal();
        when(journalService.postAutoJournal(
                any(), any(), any(JournalSourceType.class), any(), any(), any()))
                .thenReturn(mockJournal);

        TaxInvoiceDetailResponse res = taxInvoiceService.issue(tiId, "accountant-1");

        assertThat(res.status()).isEqualTo(TaxInvoiceStatus.ISSUED);
        assertThat(res.taxInvoiceNo()).isEqualTo("2026/05/11-1");
        assertThat(res.issuedBy()).isEqualTo("accountant-1");
        assertThat(res.journalId()).isEqualTo(mockJournal.getId());
    }

    // ── 시나리오 6 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("6. cancelWithReason — ISSUED → CANCELLED, cancelReason 기록, reverseJournalId 연결")
    void scenario6_cancelWithReason_success() throws Exception {
        TaxInvoice ti = buildIssuedInvoice();
        UUID tiId = UUID.randomUUID();
        setId(ti, tiId);

        when(taxInvoiceRepository.findById(tiId)).thenReturn(Optional.of(ti));

        Journal reversal = buildMockJournal();
        when(journalService.autoReverse(any(), any())).thenReturn(reversal);

        TaxInvoiceCancelRequest cancelReq = new TaxInvoiceCancelRequest("고객 요청으로 인한 취소");
        TaxInvoiceDetailResponse res = taxInvoiceService.cancelWithReason(
                tiId, cancelReq, "accountant-2");

        assertThat(res.status()).isEqualTo(TaxInvoiceStatus.CANCELLED);
        assertThat(res.cancelledBy()).isEqualTo("accountant-2");
        assertThat(res.cancelReason()).isEqualTo("고객 요청으로 인한 취소");
        assertThat(res.reverseJournalId()).isEqualTo(reversal.getId());
    }

    // ── 시나리오 7 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("7. cancelWithReason — reason 4자 → BusinessException INVALID_INPUT")
    void scenario7_cancelWithReason_reasonTooShort() throws Exception {
        TaxInvoice ti = buildIssuedInvoice();
        UUID tiId = UUID.randomUUID();
        setId(ti, tiId);

        when(taxInvoiceRepository.findById(tiId)).thenReturn(Optional.of(ti));

        TaxInvoiceCancelRequest cancelReq = new TaxInvoiceCancelRequest("짧음");  // 3자
        assertThatThrownBy(() -> taxInvoiceService.cancelWithReason(tiId, cancelReq, "user"))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_INPUT))
                .hasMessageContaining("5자");
    }

    // ── 시나리오 8 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("8. print — ISSUED 상태, 회사 정보 + 한글 금액 포함 반환")
    void scenario8_print_issuedInvoice() throws Exception {
        TaxInvoice ti = buildIssuedInvoice();
        UUID tiId = UUID.randomUUID();
        setId(ti, tiId);

        when(taxInvoiceRepository.findById(tiId)).thenReturn(Optional.of(ti));

        TaxInvoicePrintResponse res = taxInvoiceService.print(tiId);

        assertThat(res.supplierName()).isEqualTo("(주)삼한공조시스템");
        assertThat(res.supplierCeo()).isEqualTo("김미선");
        assertThat(res.recipientName()).isEqualTo("테스트거래처");
        assertThat(res.totalAmount()).isEqualByComparingTo("110000.00");
        assertThat(res.totalAmountKorean()).startsWith("일금").endsWith("원정");
        assertThat(res.lines()).hasSize(1);
    }

    // ── 시나리오 9 ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("9. print — DRAFT 상태 → BusinessException CONFLICT")
    void scenario9_print_draftBlocked() throws Exception {
        TaxInvoice ti = buildDraftInvoice();
        UUID tiId = UUID.randomUUID();
        setId(ti, tiId);

        when(taxInvoiceRepository.findById(tiId)).thenReturn(Optional.of(ti));

        assertThatThrownBy(() -> taxInvoiceService.print(tiId))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.CONFLICT))
                .hasMessageContaining("임시저장")
                .hasMessageNotContaining("DRAFT");
    }

    // ── 시나리오 10 ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("10. listWithType — type=SALES 필터 Repository 위임 검증")
    void scenario10_listWithType_salesFilter() {
        TaxInvoice ti = buildDraftInvoice();
        Page<TaxInvoice> mockPage = new PageImpl<>(List.of(ti));
        when(taxInvoiceRepository.findByFiltersWithType(
                any(), any(), any(), any(), any(), any()))
                .thenReturn(mockPage);

        Page<TaxInvoiceSummaryResponse> result = taxInvoiceService.listWithType(
                TaxInvoiceStatus.ISSUED, TaxInvoiceType.SALES,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31),
                null, PageRequest.of(0, 20));

        assertThat(result).hasSize(1);
        verify(taxInvoiceRepository).findByFiltersWithType(
                TaxInvoiceStatus.ISSUED, TaxInvoiceType.SALES,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31),
                null, PageRequest.of(0, 20));
    }

    // ── 시나리오 11 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("11. print — primary SupplierProfile 존재 시 그 값 사용 (CompanyProperties 아님)")
    void scenario11_print_usesSupplierProfileWhenPresent() throws Exception {
        // primary SupplierProfile stub
        com.samhanair.logis.accounting.domain.SupplierProfile sp =
                com.samhanair.logis.accounting.domain.SupplierProfile.create(
                        "2148720659", null, "（주）삼한공조시스템DB", "김미선DB",
                        "서울 DB 주소", "도소매DB", "가전DB", null, "02-0000-0000", null, true);
        lenient().when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.of(sp));

        TaxInvoice ti = buildIssuedInvoice();
        UUID tiId = UUID.randomUUID();
        setId(ti, tiId);
        when(taxInvoiceRepository.findById(tiId)).thenReturn(Optional.of(ti));

        TaxInvoicePrintResponse res = taxInvoiceService.print(tiId);

        // SupplierProfile 값 사용 검증
        assertThat(res.supplierName()).isEqualTo("（주）삼한공조시스템DB");
        assertThat(res.supplierCeo()).isEqualTo("김미선DB");
        assertThat(res.supplierAddress()).isEqualTo("서울 DB 주소");
        // CompanyProperties 값(강남구) 미사용 확인
        assertThat(res.supplierAddress()).doesNotContain("강남구");
    }

    // ── 시나리오 12 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("12. print — primary SupplierProfile 부재 시 CompanyProperties fallback")
    void scenario12_print_fallbackToCompanyPropertiesWhenNoPrimary() throws Exception {
        // primary SupplierProfile 없음 (BeforeEach 에서 empty 로 설정됨)
        lenient().when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.empty());

        TaxInvoice ti = buildIssuedInvoice();
        UUID tiId = UUID.randomUUID();
        setId(ti, tiId);
        when(taxInvoiceRepository.findById(tiId)).thenReturn(Optional.of(ti));

        TaxInvoicePrintResponse res = taxInvoiceService.print(tiId);

        // CompanyProperties fallback 값 사용 검증
        assertThat(res.supplierName()).isEqualTo("(주)삼한공조시스템");
        assertThat(res.supplierCeo()).isEqualTo("김미선");
        assertThat(res.supplierAddress()).isEqualTo("서울특별시 강남구");
    }

    // ── 헬퍼 메서드 ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("update — 동일 partnerId + description 변경은 partner audit을 만들지 않는다")
    void updateSamePartnerIdDoesNotRecordPartnerAudit() throws Exception {
        TaxInvoice invoice = buildDraftInvoice();
        UUID invoiceId = UUID.randomUUID();
        setId(invoice, invoiceId);
        when(taxInvoiceRepository.findById(invoiceId)).thenReturn(Optional.of(invoice));

        taxInvoiceService.update(invoiceId, updateRequest(PARTNER_ID, "설명 변경"));

        verify(auditRecorder, never()).recordOverlayPatch(
                any(), any(), any(), any(), org.mockito.ArgumentMatchers.eq("taxInvoice.partner"), any(), any());
    }

    @Test
    @DisplayName("update — 다른 partnerId + 동일 code/name은 표시값이 같아도 partner audit을 만든다")
    void updateDifferentPartnerIdRecordsPartnerAuditDespiteSameDisplayValue() throws Exception {
        TaxInvoice invoice = buildDraftInvoice();
        UUID invoiceId = UUID.randomUUID();
        setId(invoice, invoiceId);
        when(taxInvoiceRepository.findById(invoiceId)).thenReturn(Optional.of(invoice));

        taxInvoiceService.update(invoiceId, updateRequest(UUID.randomUUID(), "설명 변경"));

        verify(auditRecorder).recordOverlayPatch(
                invoiceId, new UUID(0L, 0L), "system", null, "taxInvoice.partner",
                "테스트거래처 (P-001)", "테스트거래처 (P-001)");
    }

    private static com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceRequest updateRequest(
            UUID partnerId, String description) {
        return new com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceRequest(
                partnerId, "P-001", "123-45-67890", "테스트거래처", "서울", ISSUE_DATE, description,
                List.of(new com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceLineRequest(
                        "운임 기본료", "kg", BigDecimal.ONE, new BigDecimal("1000"), null)));
    }

    /** DRAFT 상태 TaxInvoice — 라인 없음. */
    private TaxInvoice buildDraftInvoice() {
        return TaxInvoice.create(PARTNER_ID, "P-001", "123-45-67890",
                "테스트거래처", "서울", ISSUE_DATE, "메모", TaxInvoiceType.SALES);
    }

    /** 라인 포함 DRAFT — issue() 호출 가능 상태. */
    private TaxInvoice buildIssuableDraft() {
        TaxInvoice ti = buildDraftInvoice();
        TaxInvoiceLine line = TaxInvoiceLine.create(ti, 1, "운임 기본료", "kg", "건",
                new BigDecimal("100"), new BigDecimal("1000"), null);
        ti.addLine(line);
        return ti;
    }

    /**
     * 라인 포함 ISSUED 상태 (직접 issue 호출 + journalId reflection 주입).
     * journalId 가 null 이면 cancelWithReason 내 autoReverse 가 호출되지 않으므로 필수.
     */
    private TaxInvoice buildIssuedInvoice() throws Exception {
        TaxInvoice ti = buildIssuableDraft();
        ti.issue("2026/05/11-1", "system");
        // journalId reflection 주입 — cancel 시 autoReverse 경로 활성화
        Field journalIdField = TaxInvoice.class.getDeclaredField("journalId");
        journalIdField.setAccessible(true);
        journalIdField.set(ti, UUID.randomUUID());
        return ti;
    }

    /**
     * Journal 팩토리 생성 후 id reflection set.
     * Journal.create() 는 DRAFT 상태로 생성되므로 post() 는 호출하지 않음.
     * (단위 테스트에서는 journal 의 상태보다 id 만 필요)
     */
    private Journal buildMockJournal() throws Exception {
        Journal j = Journal.create("2026/05/11-1", ISSUE_DATE,
                "테스트 분개", JournalSourceType.SLIP, UUID.randomUUID());
        Field idField = Journal.class.getDeclaredField("id");
        idField.setAccessible(true);
        idField.set(j, UUID.randomUUID());
        return j;
    }

    /** TaxInvoice.id 필드 reflection set. */
    private void setId(TaxInvoice ti, UUID id) throws Exception {
        Field f = TaxInvoice.class.getDeclaredField("id");
        f.setAccessible(true);
        f.set(ti, id);
    }
}
