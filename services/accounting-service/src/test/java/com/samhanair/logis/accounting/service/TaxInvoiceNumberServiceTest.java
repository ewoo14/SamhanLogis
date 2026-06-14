package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.TaxInvoiceNumberSequence;
import com.samhanair.logis.accounting.repository.TaxInvoiceNumberSequenceRepository;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TaxInvoiceNumberServiceTest {

    @Mock TaxInvoiceNumberSequenceRepository sequenceRepository;

    @Test
    void next_세금계산서_발행번호는_날짜별로_순번_선행0을_붙이지_않는다() {
        LocalDate issueDate = LocalDate.of(2026, 4, 5);
        LocalDate otherIssueDate = LocalDate.of(2026, 4, 6);
        TaxInvoiceNumberSequence sequence = TaxInvoiceNumberSequence.create(issueDate);
        TaxInvoiceNumberSequence otherSequence = TaxInvoiceNumberSequence.create(otherIssueDate);
        TaxInvoiceNumberService service = new TaxInvoiceNumberService(sequenceRepository);
        when(sequenceRepository.findLockedByIssueDate(issueDate)).thenReturn(Optional.of(sequence));
        when(sequenceRepository.findLockedByIssueDate(otherIssueDate)).thenReturn(Optional.of(otherSequence));

        String taxInvoiceNo = service.next(issueDate);
        String otherTaxInvoiceNo = service.next(otherIssueDate);

        assertThat(taxInvoiceNo).isEqualTo("2026/04/05-1");
        assertThat(otherTaxInvoiceNo).isEqualTo("2026/04/06-1");
        assertThat(taxInvoiceNo).matches("\\d{4}/\\d{2}/\\d{2}-\\d+");
        assertThat(taxInvoiceNo).doesNotContain("-0");
        assertThat(otherTaxInvoiceNo).doesNotContain("-0");
        verify(sequenceRepository).insertIfAbsent(any(UUID.class), eq(issueDate));
        verify(sequenceRepository).insertIfAbsent(any(UUID.class), eq(otherIssueDate));
    }
}
