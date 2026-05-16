package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.inventory.domain.DpsProgramType;
import com.samhanair.logis.inventory.domain.DpsSaveHistory;
import com.samhanair.logis.inventory.domain.DpsSaveMode;
import com.samhanair.logis.inventory.repository.DpsSaveHistoryRepository;
import com.samhanair.logis.inventory.web.dto.DpsSaveHistoryRequest;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

/**
 * DPS 저장내역 서비스 단위 테스트.
 *
 * <p>legacy GAS DPS history 의 자동 저장, 명시 저장, 사용자 격리, payload 크기 제한을
 * production repository 없이 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class DpsSaveHistoryServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private DpsSaveHistoryRepository repository;

    private DpsSaveHistoryService service;

    @BeforeEach
    void setUp() {
        service = new DpsSaveHistoryService(repository, objectMapper);
    }

    @Test
    @DisplayName("AUTO_LATEST 저장은 기존 활성 자동저장을 soft-delete 하고 새 row 를 저장한다")
    void saveAutoLatest_supersedesPreviousActiveAutoLatest() {
        DpsSaveHistory previous = DpsSaveHistory.create(
                DpsProgramType.DPS_COMPARE,
                DpsSaveMode.AUTO_LATEST,
                "자동저장",
                json("{\"from\":\"2026-05-01\",\"mismatchCount\":3}"),
                json("{\"mismatchCount\":3}"));
        when(repository.findActiveAutoLatest("warehouse-user", DpsProgramType.DPS_COMPARE))
                .thenReturn(Optional.of(previous));
        when(repository.save(any(DpsSaveHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        service.save(autoRequest(), "warehouse-user");

        assertThat(previous.getIsDeleted()).isTrue();
        assertThat(previous.getDeletedBy()).isEqualTo("warehouse-user");

        ArgumentCaptor<DpsSaveHistory> captor = ArgumentCaptor.forClass(DpsSaveHistory.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTopic()).isEqualTo("자동저장");
        assertThat(captor.getValue().getSaveMode()).isEqualTo(DpsSaveMode.AUTO_LATEST);
    }

    @Test
    @DisplayName("MANUAL_NAMED 저장은 topic blank 를 400 으로 거부한다")
    void saveManualNamed_blankTopicRejected() {
        DpsSaveHistoryRequest request = new DpsSaveHistoryRequest(
                DpsProgramType.DPS_COMPARE,
                DpsSaveMode.MANUAL_NAMED,
                "  ",
                json("{\"mismatchCount\":0}"),
                json("{\"mismatchCount\":0}"));

        assertThatThrownBy(() -> service.save(request, "warehouse-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("저장주제");
    }

    @Test
    @DisplayName("100KB 초과 responsePayload 는 422 전용 코드로 거부한다")
    void save_payloadTooLargeRejected() {
        String oversized = "x".repeat(101 * 1024);
        DpsSaveHistoryRequest request = new DpsSaveHistoryRequest(
                DpsProgramType.DPS_COMPARE,
                DpsSaveMode.MANUAL_NAMED,
                "월말 마감",
                json("{\"mismatchCount\":1}"),
                objectMapper.createObjectNode().put("body", oversized));

        assertThatThrownBy(() -> service.save(request, "warehouse-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("비교 결과가 너무 큽니다");
    }

    @Test
    @DisplayName("목록 조회는 from/to 역전 시 내부에서 범위를 교환한다")
    void list_reversedRangeSwapsAndQueries() {
        when(repository.findByFilter(
                any(), any(), any(), any(), any(), any(PageRequest.class)))
                .thenReturn(org.springframework.data.domain.Page.empty());

        service.list(
                DpsProgramType.DPS_COMPARE,
                DpsSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-31"),
                LocalDate.parse("2026-05-01"),
                "warehouse-user",
                PageRequest.of(0, 50));

        verify(repository).findByFilter(
                "warehouse-user",
                DpsProgramType.DPS_COMPARE,
                DpsSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-01").atStartOfDay(),
                LocalDate.parse("2026-06-01").atStartOfDay(),
                PageRequest.of(0, 50));
    }

    private DpsSaveHistoryRequest autoRequest() {
        return new DpsSaveHistoryRequest(
                DpsProgramType.DPS_COMPARE,
                DpsSaveMode.AUTO_LATEST,
                null,
                json("{\"from\":\"2026-05-01\",\"mismatchCount\":3}"),
                json("{\"mismatchCount\":3}"));
    }

    private JsonNode json(String raw) {
        try {
            return objectMapper.readTree(raw);
        } catch (Exception ex) {
            throw new IllegalArgumentException(ex);
        }
    }
}
