package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.AccountingPeriod;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.domain.PeriodType;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CreateJournalLineRequest;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * JournalService 단위 테스트 (Mockito).
 *
 * <p>커버 시나리오:
 * <ul>
 *   <li>create — 분개번호 채번 + leaf 검증 + 라인 매핑</li>
 *   <li>post — 도메인 위임 + repository find 위임</li>
 *   <li>reverse — 차/대 swap + 신규 Journal 저장 + 원분개 REVERSED 마킹 + linkReversal</li>
 *   <li>NOT_FOUND — find 실패</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class JournalServiceTest {

    @Mock private JournalRepository journalRepository;
    @Mock private JournalNumberService journalNumberService;
    @Mock private AccountService accountService;
    @Mock private MonthEndCloseService monthEndCloseService;
    @Mock private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @Mock private PartnerLookupClient partnerLookupClient;
    @Mock private ChartOfAccountRepository chartOfAccountRepository;
    @Mock private CashReceiptRepository cashReceiptRepository;

    @InjectMocks private JournalService journalService;

    private static final LocalDate TODAY = LocalDate.of(2026, 5, 4);

    @BeforeEach
    void common() {
        lenient().when(journalNumberService.next(any(LocalDate.class))).thenReturn("2026/05/04-1");
        // 마감 가드 — 기본 stub 으로 "마감 없음" 반환 (Phase 10 Step 8 P2-4 service-layer guard).
        lenient().when(monthEndCloseService.findClosedPeriodCovering(any(LocalDate.class)))
                .thenReturn(Optional.empty());
        lenient().when(approvalLineAuthorizeClient.authorize(anyString(), anyString(), any(UUID.class)))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenReturn(Map.of());
        lenient().when(chartOfAccountRepository.findAllById(any()))
                .thenReturn(List.of());
        // accountService.requireLeafAccount 는 void — 기본 no-op (Mockito).
    }

    @Test
    @DisplayName("create — 채번 + leaf 검증 호출 + DRAFT 응답")
    void createSuccess() {
        when(journalRepository.save(any(Journal.class))).thenAnswer(inv -> inv.getArgument(0));
        CreateJournalRequest req = new CreateJournalRequest(
                TODAY,
                "테스트 분개",
                List.of(
                        new CreateJournalLineRequest("101", new BigDecimal("100000"), BigDecimal.ZERO, null, "현금 입금"),
                        new CreateJournalLineRequest("401", BigDecimal.ZERO, new BigDecimal("100000"), null, "상품매출")
                ));

        JournalDetailResponse resp = journalService.create(req);

        assertThat(resp.status()).isEqualTo(JournalStatus.DRAFT);
        assertThat(resp.lines()).hasSize(2);
        assertThat(resp.totalDebit()).isEqualByComparingTo("100000");
        assertThat(resp.totalCredit()).isEqualByComparingTo("100000");
    }

    @Test
    @DisplayName("create — 레거시 3자리 계정코드는 V101 정본으로 변환해 검증·저장")
    void createNormalizesLegacyAccountCodesBeforeValidationAndPersistence() {
        when(journalRepository.save(any(Journal.class))).thenAnswer(inv -> inv.getArgument(0));
        CreateJournalRequest req = new CreateJournalRequest(
                TODAY,
                "레거시 계정코드 호환",
                List.of(
                        new CreateJournalLineRequest("110", new BigDecimal("100000"), BigDecimal.ZERO, null, "레거시 차변"),
                        new CreateJournalLineRequest("401", BigDecimal.ZERO, new BigDecimal("100000"), null, "레거시 대변")
                ));

        JournalDetailResponse resp = journalService.create(req);

        verify(accountService).requireLeafAccount("1089");
        verify(accountService).requireLeafAccount("4019");
        assertThat(resp.lines()).extracting(line -> line.accountCode())
                .containsExactly("1089", "4019");
    }

    @Test
    @DisplayName("post — DRAFT → POSTED 위임")
    void postDelegatesToDomain() {
        Journal j = newPersistedDraft();
        when(journalRepository.findById(j.getId())).thenReturn(Optional.of(j));

        JournalDetailResponse resp = journalService.post(j.getId(), "user-A");

        assertThat(resp.status()).isEqualTo(JournalStatus.POSTED);
        assertThat(resp.postedBy()).isEqualTo("user-A");
    }

    @Test
    @DisplayName("reverse — 신규 역분개 생성(차/대 swap) + 원분개 REVERSED 마킹 + linkReversal")
    void reverseCreatesSwappedJournal() {
        Journal original = newPersistedDraft();
        original.post("user-A");
        when(journalRepository.findById(original.getId())).thenReturn(Optional.of(original));

        // save 가 호출되면 신규 역분개에 ID 부여 (UuidGenerator 모사).
        UUID reversalId = UUID.randomUUID();
        doAnswer(inv -> {
            Journal saved = inv.getArgument(0);
            setField(saved, "id", reversalId);
            return saved;
        }).when(journalRepository).save(any(Journal.class));

        when(journalNumberService.next(TODAY)).thenReturn("2026/05/04-2");

        JournalDetailResponse resp = journalService.reverse(original.getId(), "user-B");

        assertThat(resp.status()).isEqualTo(JournalStatus.POSTED);
        assertThat(resp.journalNo()).isEqualTo("2026/05/04-2");
        assertThat(resp.description()).isEqualTo("[역분개] 2026/05/04-1 테스트");
        // 차/대 swap 검증 — 첫 라인은 원래 debit=100000 / credit=0 → swap 후 debit=0 / credit=100000
        assertThat(resp.lines().get(0).debitAmount()).isEqualByComparingTo("0");
        assertThat(resp.lines().get(0).creditAmount()).isEqualByComparingTo("100000");
        // 원분개 상태
        assertThat(original.getStatus()).isEqualTo(JournalStatus.REVERSED);
        assertThat(original.getReversedJournalId()).isEqualTo(reversalId);
    }

    @Test
    @DisplayName("autoReverse — 적요에 원분개 번호를 각인한다")
    void autoReverseDescriptionIncludesOriginalJournalNo() {
        Journal original = newPersistedDraft();
        original.post("user-A");
        when(journalRepository.findById(original.getId())).thenReturn(Optional.of(original));
        doAnswer(inv -> {
            Journal saved = inv.getArgument(0);
            setField(saved, "id", UUID.randomUUID());
            return saved;
        }).when(journalRepository).save(any(Journal.class));

        Journal reversal = journalService.autoReverse(original.getId(), "user-B");

        assertThat(reversal.getDescription()).isEqualTo("[역분개] 2026/05/04-1 테스트");
    }

    @Test
    @DisplayName("autoReverse — 원분개 일자가 마감된 기간이면 409로 차단하고 원분개를 보존한다")
    void autoReverseRejectsClosedOriginalJournalDate() {
        Journal original = newPersistedDraft();
        original.post("user-A");
        when(journalRepository.findById(original.getId())).thenReturn(Optional.of(original));
        when(monthEndCloseService.findClosedPeriodCovering(TODAY))
                .thenReturn(Optional.of(closedMonthlyPeriod()));

        assertThatThrownBy(() -> journalService.autoReverse(original.getId(), "user-B"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
                    assertThat(ex.getMessage()).contains("마감된 회계 기간의 분개는 역분개할 수 없습니다");
                });

        assertThat(original.getStatus()).isEqualTo(JournalStatus.POSTED);
        assertThat(original.getReversedJournalId()).isNull();
        verify(journalRepository, never()).save(any(Journal.class));
        verify(journalNumberService, never()).next(TODAY);
    }

    @Test
    @DisplayName("reverse — 원분개 일자가 마감된 기간이면 수동 역분개도 409로 차단한다")
    void reverseRejectsClosedOriginalJournalDate() {
        Journal original = newPersistedDraft();
        original.post("user-A");
        when(journalRepository.findById(original.getId())).thenReturn(Optional.of(original));
        when(monthEndCloseService.findClosedPeriodCovering(TODAY))
                .thenReturn(Optional.of(closedMonthlyPeriod()));

        assertThatThrownBy(() -> journalService.reverse(original.getId(), "user-B"))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
                    assertThat(ex.getMessage()).contains("마감된 회계 기간의 분개는 역분개할 수 없습니다");
                });

        assertThat(original.getStatus()).isEqualTo(JournalStatus.POSTED);
        assertThat(original.getReversedJournalId()).isNull();
        verify(journalRepository, never()).save(any(Journal.class));
        verify(journalNumberService, never()).next(TODAY);
    }

    @Test
    @DisplayName("getOne — 미존재 시 NOT_FOUND")
    void getOneNotFound() {
        UUID id = UUID.randomUUID();
        when(journalRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> journalService.getOne(id))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("존재하지 않는 분개");
    }

    @Test
    @DisplayName("getOne — 라인 partnerName/accountName 을 배치 조회로 enrich 하고 partnerId 는 응답에서 숨긴다")
    void getOneEnrichesLineDisplayNamesByBatchLookup() {
        UUID partnerId = UUID.fromString("00000000-0000-0000-0000-000000000713");
        Journal journal = newPersistedDraft(partnerId);
        when(journalRepository.findById(journal.getId())).thenReturn(Optional.of(journal));
        when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenReturn(Map.of(partnerId,
                        new PartnerSummary(partnerId, "P-713", "삼한테스트상사", "123-45-67890", "서울")));
        when(chartOfAccountRepository.findAllById(any()))
                .thenReturn(List.of(
                        ChartOfAccount.create("101", "현금", AccountCategory.ASSET, "100", true, 1),
                        ChartOfAccount.create("401", "상품매출", AccountCategory.REVENUE, "400", true, 2)));

        JournalDetailResponse resp = journalService.getOne(journal.getId());

        assertThat(resp.lines().get(0).partnerName()).isEqualTo("삼한테스트상사");
        assertThat(resp.lines().get(0).accountName()).isEqualTo("현금");
        assertThat(resp.lines().get(1).partnerName()).isNull();
        assertThat(resp.lines().get(1).accountName()).isEqualTo("상품매출");
        verify(partnerLookupClient).findByPartnerIdsBatch(List.of(partnerId));
    }

    @Test
    @DisplayName("getOne — legacy 거래처 name 이 null 이어도 상세 응답 enrich 가 NPE 없이 계속된다")
    void getOneIgnoresLegacyPartnerWithNullName() {
        UUID partnerId = UUID.fromString("00000000-0000-0000-0000-000000000713");
        Journal journal = newPersistedDraft(partnerId);
        when(journalRepository.findById(journal.getId())).thenReturn(Optional.of(journal));
        when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenReturn(Map.of(partnerId,
                        new PartnerSummary(partnerId, "P-713", null, "123-45-67890", "서울")));
        when(chartOfAccountRepository.findAllById(any()))
                .thenReturn(List.of(
                        ChartOfAccount.create("101", "현금", AccountCategory.ASSET, "100", true, 1),
                        ChartOfAccount.create("401", "상품매출", AccountCategory.REVENUE, "400", true, 2)));

        JournalDetailResponse resp = journalService.getOne(journal.getId());

        assertThat(resp.lines().get(0).partnerName()).isNull();
        assertThat(resp.lines().get(0).accountName()).isEqualTo("현금");
        assertThat(resp.lines().get(1).accountName()).isEqualTo("상품매출");
        verify(partnerLookupClient).findByPartnerIdsBatch(List.of(partnerId));
    }

    @Test
    @DisplayName("getOne 은 CASH_RECEIPT 라이브 분개에 원천 입금보고서 전표번호를 함께 노출한다")
    void getOneAddsCashReceiptSlipNoForLiveCashReceiptJournal() {
        UUID cashReceiptId = UUID.fromString("00000000-0000-4000-8000-000000000717");
        Journal journal = Journal.create("2026/07/03-1", TODAY, "입금보고서 확정 2026/07/03-1",
                JournalSourceType.CASH_RECEIPT, cashReceiptId);
        setField(journal, "id", UUID.fromString("00000000-0000-4000-8000-000000000718"));
        // postAutoJournal 이 CASH_RECEIPT 게시 시점에 linkCashReceipt 를 호출하는 것을 모사(#771).
        journal.linkCashReceipt(cashReceiptId);
        CashReceipt receipt = CashReceipt.createManual("2026/07/03-1",
                UUID.fromString("00000000-0000-4000-8000-000000000719"),
                new BigDecimal("100000"), TODAY, "입금", "102", "110");
        setField(receipt, "id", cashReceiptId);

        when(journalRepository.findById(journal.getId())).thenReturn(Optional.of(journal));
        when(cashReceiptRepository.findByIdAndIsDeletedFalse(cashReceiptId)).thenReturn(Optional.of(receipt));

        JournalDetailResponse resp = journalService.getOne(journal.getId());

        assertThat(resp.sourceRefId()).isEqualTo(cashReceiptId);
        // #772 fix — 원분개도 전용 cashReceiptId 를 노출한다 (역분개 테스트와의 대칭성, line 334 참고).
        assertThat(resp.cashReceiptId()).isEqualTo(cashReceiptId);
        assertThat(resp.cashReceiptSlipNo()).isEqualTo("2026/07/03-1");
    }

    @Test
    @DisplayName("autoReverse — 역분개 상세는 원분개 UUID(sourceRefId)가 아닌 원천 입금보고서 "
            + "cashReceiptId/cashReceiptSlipNo 를 노출한다 (#771 source_ref_id 과부하 해소)")
    void autoReverseDetailExposesCashReceiptLinkNotOriginalJournalId() {
        UUID cashReceiptId = UUID.fromString("00000000-0000-4000-8000-000000000771");
        UUID originalId = UUID.fromString("00000000-0000-4000-8000-000000000772");
        UUID reversalId = UUID.fromString("00000000-0000-4000-8000-000000000773");

        // 원분개 — postAutoJournal 이 CASH_RECEIPT 게시 시점에 linkCashReceipt 를 호출하는 것을 모사.
        Journal original = Journal.create("2026/07/08-1", TODAY, "입금보고서 확정 2026/07/08-1",
                JournalSourceType.CASH_RECEIPT, cashReceiptId);
        setField(original, "id", originalId);
        original.linkCashReceipt(cashReceiptId);
        original.addLine(com.samhanair.logis.accounting.domain.JournalLine.create(
                original, 1, "102", new BigDecimal("100000"), BigDecimal.ZERO, null, "입금"));
        original.addLine(com.samhanair.logis.accounting.domain.JournalLine.create(
                original, 2, "110", BigDecimal.ZERO, new BigDecimal("100000"), null, "입금"));
        original.post("user-A");
        when(journalRepository.findById(originalId)).thenReturn(Optional.of(original));
        when(journalNumberService.next(TODAY)).thenReturn("2026/07/08-2");
        doAnswer(inv -> {
            Journal saved = inv.getArgument(0);
            setField(saved, "id", reversalId);
            return saved;
        }).when(journalRepository).save(any(Journal.class));

        Journal reversal = journalService.autoReverse(originalId, "user-B");

        // 도메인 레벨 — sourceRefId(이중 의미 = 원분개 UUID) 와 cashReceiptId(전용 링크)가 서로 다르다.
        assertThat(reversal.getSourceRefId()).isEqualTo(originalId);
        assertThat(reversal.getCashReceiptId()).isEqualTo(cashReceiptId);
        assertThat(reversal.getCashReceiptId()).isNotEqualTo(reversal.getSourceRefId());

        // 응답 DTO 레벨 — getOne(reversalId) 실호출로 cashReceiptId/cashReceiptSlipNo 를 검증.
        CashReceipt receipt = CashReceipt.createManual("2026/07/08-1",
                UUID.fromString("00000000-0000-4000-8000-000000000774"),
                new BigDecimal("100000"), TODAY, "입금", "102", "110");
        setField(receipt, "id", cashReceiptId);
        when(journalRepository.findById(reversalId)).thenReturn(Optional.of(reversal));
        when(cashReceiptRepository.findByIdAndIsDeletedFalse(cashReceiptId)).thenReturn(Optional.of(receipt));

        JournalDetailResponse resp = journalService.getOne(reversalId);

        assertThat(resp.cashReceiptId()).isEqualTo(cashReceiptId);
        assertThat(resp.cashReceiptSlipNo()).isEqualTo("2026/07/08-1");
        assertThat(resp.cashReceiptId()).isNotEqualTo(originalId);
        assertThat(resp.sourceRefId()).isEqualTo(originalId);
    }

    private Journal newPersistedDraft() {
        return newPersistedDraft(null);
    }

    private Journal newPersistedDraft(UUID firstLinePartnerId) {
        Journal j = Journal.create("2026/05/04-1", TODAY, "테스트",
                JournalSourceType.MANUAL, (UUID) null);
        UUID id = UUID.randomUUID();
        setField(j, "id", id);
        j.addLine(com.samhanair.logis.accounting.domain.JournalLine.create(
                j, 1, "101", new BigDecimal("100000"), BigDecimal.ZERO, firstLinePartnerId, "현금"));
        j.addLine(com.samhanair.logis.accounting.domain.JournalLine.create(
                j, 2, "401", BigDecimal.ZERO, new BigDecimal("100000"), null, "상품매출"));
        return j;
    }

    private AccountingPeriod closedMonthlyPeriod() {
        AccountingPeriod period = AccountingPeriod.create(PeriodType.MONTHLY, TODAY.withDayOfMonth(1), "5월 마감");
        period.close("master-1", BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, 0);
        return period;
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Field f = findField(target.getClass(), fieldName);
            f.setAccessible(true);
            f.set(target, value);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }

    private static Field findField(Class<?> clazz, String name) throws NoSuchFieldException {
        Class<?> c = clazz;
        while (c != null) {
            try {
                return c.getDeclaredField(name);
            } catch (NoSuchFieldException ex) {
                c = c.getSuperclass();
            }
        }
        throw new NoSuchFieldException(name);
    }

    @SuppressWarnings("unused")
    private void unused(String s) {
        // suppressing anyString unused-import elsewhere; keep static analyzers happy.
        anyString();
    }
}
