package com.samhanair.logis.accounting.collab;

import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.repository.CashReceiptRepository;
import com.samhanair.logis.accounting.service.CashReceiptService;
import com.samhanair.logis.common.exception.BusinessException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** 입금보고서 협업 포트 snapshot/changeSet 계약 테스트. */
class CashReceiptDocumentCollaborationPortTest {

    @Test
    void loadSnapshotSerializesEditableCashReceiptFields() {
        CashReceiptRepository repository = org.mockito.Mockito.mock(CashReceiptRepository.class);
        CashReceiptService service = org.mockito.Mockito.mock(CashReceiptService.class);
        UUID receiptId = UUID.randomUUID();
        CashReceipt receipt = CashReceipt.createManual(
                "2026/07/03-1",
                UUID.fromString("10000000-0000-0000-0000-000000000001"),
                BigDecimal.valueOf(120000),
                LocalDate.of(2026, 7, 3),
                "초기 메모",
                "103",
                "110");
        org.mockito.Mockito.when(repository.findById(receiptId)).thenReturn(Optional.of(receipt));

        CashReceiptDocumentCollaborationPort port = new CashReceiptDocumentCollaborationPort(
                repository, service, new ObjectMapper());

        String json = port.loadSnapshot(receiptId);

        org.assertj.core.api.Assertions.assertThat(json)
                .contains("\"slipNo\":\"2026/07/03-1\"")
                .contains("\"amount\":120000")
                .contains("\"transactionDate\":\"2026-07-03\"")
                .contains("\"memo\":\"초기 메모\"")
                .contains("\"debitAccountCode\":\"103\"");
    }

    @Test
    void applyChangeSetParsesAndAppliesSupportedFieldsOnly() {
        CashReceiptRepository repository = org.mockito.Mockito.mock(CashReceiptRepository.class);
        CashReceiptService service = org.mockito.Mockito.mock(CashReceiptService.class);
        UUID receiptId = UUID.randomUUID();
        java.util.Map<String, Object> parsed = new java.util.LinkedHashMap<>();
        parsed.put("amount", "121000");
        parsed.put("memo", "수정 메모");
        org.mockito.Mockito.when(service.parseChangeSet(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(parsed);

        CashReceiptDocumentCollaborationPort port = new CashReceiptDocumentCollaborationPort(
                repository, service, new ObjectMapper());

        port.applyChangeSet(receiptId, """
                {
                  "amount": {"before": "120000", "after": "121000"},
                  "/memo": {"after": "수정 메모"}
                }
                """);

        verify(service).applyOverlayPatchBatch(receiptId, parsed);
    }

    @Test
    void applyChangeSetRejectsUnsupportedFieldsBeforeApplying() {
        CashReceiptRepository repository = org.mockito.Mockito.mock(CashReceiptRepository.class);
        CashReceiptService service = org.mockito.Mockito.mock(CashReceiptService.class);
        java.util.Map<String, Object> parsed = new java.util.LinkedHashMap<>();
        parsed.put("journalId", UUID.randomUUID().toString());
        org.mockito.Mockito.when(service.parseChangeSet(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(parsed);
        CashReceiptDocumentCollaborationPort port = new CashReceiptDocumentCollaborationPort(
                repository, service, new ObjectMapper());

        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                        port.applyChangeSet(UUID.randomUUID(), """
                                {"journalId":{"after":"10000000-0000-0000-0000-000000000001"}}
                                """))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("입금보고서 협업 수정 필드가 아닙니다");
        org.mockito.Mockito.verify(service, org.mockito.Mockito.never())
                .applyOverlayPatchBatch(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    }

    @Test
    void restoreSnapshotConvertsSnapshotToEditableChangeSet() {
        CashReceiptRepository repository = org.mockito.Mockito.mock(CashReceiptRepository.class);
        CashReceiptService service = org.mockito.Mockito.mock(CashReceiptService.class);
        UUID receiptId = UUID.randomUUID();
        java.util.Map<String, Object> parsed = new java.util.LinkedHashMap<>();
        parsed.put("memo", "복원 메모");
        org.mockito.Mockito.when(service.parseChangeSet(org.mockito.ArgumentMatchers.contains("\"memo\"")))
                .thenReturn(parsed);
        CashReceiptDocumentCollaborationPort port = new CashReceiptDocumentCollaborationPort(
                repository, service, new ObjectMapper());

        port.restoreSnapshot(receiptId, """
                {"slipNo":"2026/07/03-1","memo":"복원 메모","journalId":"ignored"}
                """);

        verify(service).applyOverlayPatchBatch(receiptId, parsed);
    }
}
