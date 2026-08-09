package com.samhanair.logis.slip.estimate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.estimate.domain.Estimate;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

/** #1092 S2 RED-B: 담당 변경은 requesterId만 바꾸고 BaseEntity.createdBy를 보존한다. */
@ExtendWith(MockitoExtension.class)
class EstimateOwnerAxisTest {

    @Mock private com.samhanair.logis.slip.estimate.repository.EstimateRepository estimateRepository;
    @Mock private com.samhanair.logis.slip.estimate.repository.EstimateLineRepository estimateLineRepository;
    @Mock private EstimateNumberService estimateNumberService;
    @Mock private com.samhanair.logis.slip.client.ProductClient productClient;
    @Mock private EstimateToSlipConverter slipConverter;
    @Mock private com.samhanair.logis.slip.estimate.revision.service.EstimateRevisionService revisionService;
    @Mock private com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher realtimePublisher;
    @Mock private com.samhanair.logis.slip.price.service.PartnerProductPriceMemoryService priceMemoryService;
    @InjectMocks private EstimateService service;

    @BeforeEach
    void assignedList_isScopedByRequesterId() {
        when(estimateRepository.searchAssigned(eq("owner-a"), any(), any(), any(), any(), eq(false), any()))
                .thenReturn(Page.empty());
        service.listAssigned("owner-a", null, null, null, null, false, PageRequest.of(0, 20));
        verify(estimateRepository).searchAssigned(
                eq("owner-a"), eq(null), eq(null), eq(null), eq(null), eq(false), any());
    }

    @Test
    void changingOwner_preservesImmutableCreatedByAuditValue() throws Exception {
        Estimate estimate = Estimate.create(
                "2026/08/08-1", LocalDate.of(2026, 8, 8), 1,
                UUID.randomUUID(), "거래처", null, null, null, null, "old-owner");
        setField(estimate, "createdBy", "original-creator");

        Method changeOwner = Estimate.class.getMethod("changeRequesterId", String.class);
        changeOwner.invoke(estimate, "new-owner");

        assertThat(estimate.getRequesterId()).isEqualTo("new-owner");
        assertThat(estimate.getCreatedBy()).isEqualTo("original-creator");
    }

    @Test
    void changingOrderOwnerThroughEstimateService_isRejectedAtServiceBoundary() {
        assertThatThrownBy(() -> service.changeOwner(UUID.randomUUID(), "owner-b", "PARTNER_ORDER"))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("종합견적서 계열 외");
    }

    @Test
    void assignedList_withoutCallerIdentity_isRejectedFailClosed() {
        assertThatThrownBy(() -> service.listAssigned(null, null, null, null, null, false,
                PageRequest.of(0, 20)))
                .isInstanceOf(com.samhanair.logis.common.exception.BusinessException.class)
                .hasMessageContaining("담당자 식별자");
    }

    private static void setField(Object target, String name, String value) throws Exception {
        Field field = target.getClass().getSuperclass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
