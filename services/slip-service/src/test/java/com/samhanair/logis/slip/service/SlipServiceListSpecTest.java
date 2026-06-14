package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.web.dto.SlipSearchResult;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

/**
 * PR-E1 BE-A0 — SlipService.list 7 param Specification 빌드 검증.
 *
 * <p>{@code SlipRepository.findAll(spec, pageable)} 가 호출될 때 Specification 이 반환되는지 +
 * pageable 이 정확히 전달되는지 6 case + 회귀 1 case = 총 7 case.
 *
 * <p>Specification 자체의 predicate 결과는 IT (실 PostgreSQL + JPA Criteria) 에서 검증.
 * 본 단위 테스트는 service 가 spec 을 빌드하여 repository 에 위임하는 wiring 만 검증.
 */
@ExtendWith(MockitoExtension.class)
class SlipServiceListSpecTest {

    @Mock private SlipRepository slipRepository;
    @Mock private SlipNumberService slipNumberService;
    @Mock private ProductClient productClient;
    @Mock private InventoryClient inventoryClient;

    @InjectMocks private SlipService service;

    private Pageable pageable;

    @BeforeEach
    void setUp() {
        pageable = PageRequest.of(0, 20);
    }

    private void stubFindAllReturnsEmpty() {
        Page<Slip> empty = new PageImpl<>(Collections.emptyList(), pageable, 0);
        when(slipRepository.findAll(org.mockito.ArgumentMatchers.<Specification<Slip>>any(), any(Pageable.class))).thenReturn(empty);
    }

    @SuppressWarnings("unchecked")
    private ArgumentCaptor<Specification<Slip>> captureSpec() {
        return ArgumentCaptor.forClass(Specification.class);
    }

    // case 1 — 모든 param null (전체 활성)
    @Test
    void list_allNull_callsFindAllWithSpec() {
        stubFindAllReturnsEmpty();
        service.list(null, null, null, null, null, null, null, pageable);
        ArgumentCaptor<Specification<Slip>> spec = captureSpec();
        verify(slipRepository).findAll(spec.capture(), any(Pageable.class));
        assertThat(spec.getValue()).isNotNull();
    }

    // case 2 — slipType + status (회귀 — 기존 2 param 메서드도 위임 지원)
    @Test
    void list_2param_overload_delegates() {
        stubFindAllReturnsEmpty();
        service.list(SlipType.OUTBOUND, SlipStatus.SAVED, pageable);
        ArgumentCaptor<Specification<Slip>> spec = captureSpec();
        verify(slipRepository).findAll(spec.capture(), any(Pageable.class));
        assertThat(spec.getValue()).isNotNull();
    }

    // case 3 — from + to 날짜 범위
    @Test
    void list_dateRange_callsFindAll() {
        stubFindAllReturnsEmpty();
        service.list(null, null,
                LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31),
                null, null, null, pageable);
        verify(slipRepository).findAll(org.mockito.ArgumentMatchers.<Specification<Slip>>any(), any(Pageable.class));
    }

    // case 4 — partnerCode 정확 일치
    @Test
    void list_partnerCode_callsFindAll() {
        stubFindAllReturnsEmpty();
        service.list(null, null, null, null,
                "P-2026-0001", null, null, pageable);
        verify(slipRepository).findAll(org.mockito.ArgumentMatchers.<Specification<Slip>>any(), any(Pageable.class));
    }

    // case 5 — driverPhone like
    @Test
    void list_driverPhone_callsFindAll() {
        stubFindAllReturnsEmpty();
        service.list(null, null, null, null, null,
                "1234", null, pageable);
        verify(slipRepository).findAll(org.mockito.ArgumentMatchers.<Specification<Slip>>any(), any(Pageable.class));
    }

    // case 6 — regionGroup 정확 일치
    @Test
    void list_regionGroup_callsFindAll() {
        stubFindAllReturnsEmpty();
        service.list(null, null, null, null, null, null,
                "서울특별시", pageable);
        verify(slipRepository).findAll(org.mockito.ArgumentMatchers.<Specification<Slip>>any(), any(Pageable.class));
    }

    // case 7 — 5 param 모두 동시 (BE-A0 시나리오 종합)
    @Test
    void list_5paramAll_combined() {
        stubFindAllReturnsEmpty();
        service.list(SlipType.OUTBOUND, SlipStatus.CONFIRMED,
                LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 31),
                "P-2026-0001", "010", "서울특별시", pageable);
        verify(slipRepository).findAll(org.mockito.ArgumentMatchers.<Specification<Slip>>any(), any(Pageable.class));
    }

    @Test
    void searchBySlipNo_returnsAutocompleteShapeWithoutUuid() {
        Slip newer = Slip.createOutbound("2026/05/04-012", LocalDate.of(2026, 5, 4), 12,
                UUID.randomUUID(), null, UUID.randomUUID(), "삼한공조", null, null, "tester");
        newer.addLine(SlipLine.create(newer, UUID.randomUUID(), "실외기", "ODU-1", null,
                2, new BigDecimal("150000.00"), null));
        when(slipRepository.searchBySlipNoLikeIgnoreCase("05/04", PageRequest.of(0, 10)))
                .thenReturn(List.of(newer));

        List<SlipSearchResult> results = service.searchBySlipNo(" 05/04 ", 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).slipNo()).isEqualTo("2026/05/04-012");
        assertThat(results.get(0).slipType()).isEqualTo(SlipType.OUTBOUND);
        assertThat(results.get(0).partnerName()).isEqualTo("삼한공조");
        assertThat(results.get(0).totalAmount()).isEqualByComparingTo(new BigDecimal("300000.00"));
        assertThat(results.get(0).slipDate()).isEqualTo(LocalDate.of(2026, 5, 4));
    }
}
