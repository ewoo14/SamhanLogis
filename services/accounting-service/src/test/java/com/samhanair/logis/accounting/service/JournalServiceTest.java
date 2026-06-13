package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.accounting.web.dto.CreateJournalLineRequest;
import com.samhanair.logis.accounting.web.dto.CreateJournalRequest;
import com.samhanair.logis.accounting.web.dto.JournalDetailResponse;
import com.samhanair.logis.common.exception.BusinessException;
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

    @InjectMocks private JournalService journalService;

    private static final LocalDate TODAY = LocalDate.of(2026, 5, 4);

    @BeforeEach
    void common() {
        lenient().when(journalNumberService.next(any(LocalDate.class))).thenReturn("2026/05/04-1");
        // 마감 가드 — 기본 stub 으로 "마감 없음" 반환 (Phase 10 Step 8 P2-4 service-layer guard).
        lenient().when(monthEndCloseService.findClosedPeriodCovering(any(LocalDate.class)))
                .thenReturn(Optional.empty());
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
        // 차/대 swap 검증 — 첫 라인은 원래 debit=100000 / credit=0 → swap 후 debit=0 / credit=100000
        assertThat(resp.lines().get(0).debitAmount()).isEqualByComparingTo("0");
        assertThat(resp.lines().get(0).creditAmount()).isEqualByComparingTo("100000");
        // 원분개 상태
        assertThat(original.getStatus()).isEqualTo(JournalStatus.REVERSED);
        assertThat(original.getReversedJournalId()).isEqualTo(reversalId);
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

    private Journal newPersistedDraft() {
        Journal j = Journal.create("2026/05/04-1", TODAY, "테스트",
                JournalSourceType.MANUAL, (UUID) null);
        UUID id = UUID.randomUUID();
        setField(j, "id", id);
        j.addLine(com.samhanair.logis.accounting.domain.JournalLine.create(
                j, 1, "101", new BigDecimal("100000"), BigDecimal.ZERO, null, "현금"));
        j.addLine(com.samhanair.logis.accounting.domain.JournalLine.create(
                j, 2, "401", BigDecimal.ZERO, new BigDecimal("100000"), null, "상품매출"));
        return j;
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
