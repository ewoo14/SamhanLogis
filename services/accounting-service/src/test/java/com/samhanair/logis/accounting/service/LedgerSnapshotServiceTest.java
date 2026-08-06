package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.web.dto.LedgerHistoryResponse;
import com.samhanair.logis.accounting.web.dto.LedgerImageResponse;
import com.samhanair.logis.accounting.web.dto.PartnerLedgerResponse;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
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
    @Mock private PartnerLedgerReadService partnerLedgerReadService;
    @Mock private TaxInvoiceBatchRepository batchRepository;
    @Mock private LedgerSnapshotBatchNoGenerator batchNoGenerator;

    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());
    private LedgerSnapshotService service;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(batchNoGenerator.next(any()))
                .thenReturn("LED-20260804-000001");
        service = new LedgerSnapshotService(partnerLedgerReadService, batchRepository, objectMapper,
                batchNoGenerator);
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

    @Test
    @DisplayName("capture는 원장 조회에 요청 actor를 전달한다")
    void capturePreservesActor() {
        UUID actor = UUID.randomUUID();
        PartnerLedgerResponse ledger = displayedLedger();
        when(partnerLedgerReadService.read("P-001", LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 1))).thenReturn(ledger);

        assertThat(service.capture("P-001", LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 1), actor)).isSameAs(ledger);
        verify(partnerLedgerReadService).read("P-001", LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 1));
        var saved = org.mockito.ArgumentCaptor.forClass(TaxInvoiceBatch.class);
        verify(batchRepository).save(saved.capture());
        assertThat(saved.getValue().getProcessedBy()).isEqualTo(actor);
    }

    @Test
    @DisplayName("RED-A 현재 화면 read model을 저장하고 복원하면 행 수·금액이 같다")
    void captureStoresTheDisplayedReadModel() {
        PartnerLedgerResponse displayed = displayedLedger();
        when(partnerLedgerReadService.read("P-001", LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 1))).thenReturn(displayed);

        service.capture("P-001", LocalDate.of(2026, 8, 1),
                LocalDate.of(2026, 8, 1), null);

        var saved = org.mockito.ArgumentCaptor.forClass(TaxInvoiceBatch.class);
        verify(batchRepository).save(saved.capture());
        assertThat(saved.getValue().getTotalRowCount()).isEqualTo(1);
        PartnerLedgerResponse restored = SnapshotCompression.decompress(
                objectMapper, saved.getValue().getDataSnapshotJson(), PartnerLedgerResponse.class);

        assertThat(restored.documents()).hasSize(displayed.documents().size());
        assertThat(restored.documents().get(0).amount())
                .isEqualByComparingTo(displayed.documents().get(0).amount());
        assertThat(restored.documents()).containsExactlyElementsOf(displayed.documents());

        when(batchRepository.findByBatchNoAndDocumentType(saved.getValue().getBatchNo(),
                LedgerSnapshotService.DOCUMENT_TYPE)).thenReturn(Optional.of(saved.getValue()));
        LedgerHistoryResponse restoredResponse = service.restore(saved.getValue().getBatchNo());
        assertThat(restoredResponse.ledger().documents()).containsExactlyElementsOf(displayed.documents());
        assertThat(restoredResponse.ledger().lines()).isEmpty();
    }

    @Test
    @DisplayName("복원본 저장은 live 원장을 재조회하지 않고 원문 payload와 source lineage를 복사한다")
    void copyPreservesSnapshotPayloadAndLineage() {
        TaxInvoiceBatch source = savedBatch();
        when(batchRepository.findByBatchNoAndDocumentType("LED-20260801-001-P-001", "PARTNER_LEDGER"))
                .thenReturn(Optional.of(source));

        LedgerHistoryResponse copied = service.copy("LED-20260801-001-P-001", null);

        var saved = org.mockito.ArgumentCaptor.forClass(TaxInvoiceBatch.class);
        verify(batchRepository).save(saved.capture());
        assertThat(saved.getValue().getDataSnapshotJson()).isEqualTo(source.getDataSnapshotJson());
        assertThat(saved.getValue().getSourceBatchNo()).isEqualTo(source.getBatchNo());
        assertThat(copied.sourceBatchNo()).isEqualTo(source.getBatchNo());
        org.mockito.Mockito.verifyNoInteractions(partnerLedgerReadService);
    }

    private PartnerLedgerResponse displayedLedger() {
        return new PartnerLedgerResponse("P-001", "화면 거래처", "1234567890",
                LocalDate.of(2026, 8, 1), LocalDate.of(2026, 8, 1), List.of(
                        new PartnerLedgerResponse.Document("SALE", "S-001",
                                LocalDate.of(2026, 8, 1), "P-001", "화면 거래처", "서울",
                                new BigDecimal("100"), List.of(
                                        new PartnerLedgerResponse.Line("화면 품목", "M-1", 1,
                                                new BigDecimal("100"), new BigDecimal("100"))))));
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
