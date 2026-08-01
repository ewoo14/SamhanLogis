package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.web.dto.LedgerHistoryResponse;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

/** 거래처별 원장 자동 저장·날짜별 이력·복원 공통 계약 테스트. */
@ExtendWith(MockitoExtension.class)
class LedgerSnapshotServiceTest {

    @Mock private LedgerImageService ledgerImageService;
    @Mock private TaxInvoiceBatchRepository batchRepository;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private LedgerSnapshotService service;

    @BeforeEach
    void setUp() {
        service = new LedgerSnapshotService(ledgerImageService, batchRepository, objectMapper);
    }

    @Test
    @DisplayName("날짜별 이력 조회는 원장 문서 유형과 거래처 키로 필터링한다")
    void history_filtersByDocumentContract() {
        TaxInvoiceBatch batch = savedBatch();
        when(batchRepository.findDocumentHistory(eq("PARTNER_LEDGER"), eq("P-001"),
                eq(LocalDate.of(2026, 8, 1)), eq(LocalDate.of(2026, 8, 31)), eq(PageRequest.of(0, 20))))
                .thenReturn(new PageImpl<>(List.of(batch)));

        var page = service.history("P-001", LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 31), PageRequest.of(0, 20));

        assertThat(page.getContent()).singleElement().satisfies(row -> {
            assertThat(row.batchNo()).isEqualTo("LED-20260801-001-P-001");
            assertThat(row.partnerCode()).isEqualTo("P-001");
            assertThat(row.ledger()).isNull();
        });
        verify(batchRepository).findDocumentHistory("PARTNER_LEDGER", "P-001",
                LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 31), PageRequest.of(0, 20));
    }

    @Test
    @DisplayName("저장 배치번호로 gzip+base64 원장 스냅샷을 복원한다")
    void restore_decompressesSavedSnapshot() {
        TaxInvoiceBatch batch = savedBatch();
        when(batchRepository.findByBatchNoAndDocumentType("LED-20260801-001-P-001", "PARTNER_LEDGER"))
                .thenReturn(Optional.of(batch));

        LedgerHistoryResponse restored = service.restore("LED-20260801-001-P-001");

        assertThat(restored.partnerCode()).isEqualTo("P-001");
        assertThat(restored.ledger().partnerName()).isEqualTo("복원 거래처");
        assertThat(restored.ledger().lines()).isEmpty();
    }

    private TaxInvoiceBatch savedBatch() {
        LedgerImageResponse ledger = new LedgerImageResponse("P-001", "복원 거래처", "",
                List.of(), LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 1), List.of());
        TaxInvoiceBatch batch = TaxInvoiceBatch.createDocumentSnapshot("PARTNER_LEDGER", "P-001",
                "LED-20260801-001-P-001", LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 1), null);
        batch.complete(0, 1, null, null, SnapshotCompression.compress(objectMapper, ledger));
        return batch;
    }
}
