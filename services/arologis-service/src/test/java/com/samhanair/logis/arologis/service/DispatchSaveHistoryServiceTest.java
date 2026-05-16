package com.samhanair.logis.arologis.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.arologis.domain.DispatchProgramType;
import com.samhanair.logis.arologis.domain.DispatchSaveHistory;
import com.samhanair.logis.arologis.domain.DispatchSaveMode;
import com.samhanair.logis.arologis.repository.DispatchSaveHistoryRepository;
import com.samhanair.logis.arologis.web.dto.DispatchSaveHistoryRequest;
import com.samhanair.logis.common.exception.BusinessException;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;

/**
 * 배차 저장내역 서비스 단위 테스트.
 *
 * <p>legacy GAS 배차 4개 화면의 자동 저장, 명시 저장, 사용자 격리, payload 크기 제한을 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class DispatchSaveHistoryServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private DispatchSaveHistoryRepository repository;

    private DispatchSaveHistoryService service;

    @BeforeEach
    void setUp() {
        service = new DispatchSaveHistoryService(repository, objectMapper);
    }

    @Test
    @DisplayName("AUTO_LATEST 저장은 기존 활성 자동저장을 soft-delete 하고 새 row 를 저장한다")
    void saveAutoLatest_supersedesPreviousActiveAutoLatest() {
        DispatchSaveHistory previous = DispatchSaveHistory.create(
                DispatchProgramType.PRE_CLASSIFY,
                DispatchSaveMode.AUTO_LATEST,
                "자동저장",
                json("{\"from\":\"2026-05-01\",\"rowCount\":3}"),
                json("{\"rowCount\":3}"));
        when(repository.findActiveAutoLatest("dispatch-user", DispatchProgramType.PRE_CLASSIFY))
                .thenReturn(Optional.of(previous));
        when(repository.save(any(DispatchSaveHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        service.save(autoRequest(), "dispatch-user");

        assertThat(previous.getIsDeleted()).isTrue();
        assertThat(previous.getDeletedBy()).isEqualTo("dispatch-user");

        ArgumentCaptor<DispatchSaveHistory> captor = ArgumentCaptor.forClass(DispatchSaveHistory.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTopic()).isEqualTo("자동저장");
        assertThat(captor.getValue().getSaveMode()).isEqualTo(DispatchSaveMode.AUTO_LATEST);
    }

    @Test
    @DisplayName("AUTO_LATEST partial unique 충돌은 1회 재시도한다")
    void saveAutoLatest_retriesOnceAfterUniqueConflict() {
        when(repository.findActiveAutoLatest("dispatch-user", DispatchProgramType.PRE_CLASSIFY))
                .thenReturn(Optional.empty());
        when(repository.save(any(DispatchSaveHistory.class)))
                .thenThrow(new DataIntegrityViolationException("ux_dispatch_save_history_auto_latest"))
                .thenAnswer(inv -> inv.getArgument(0));

        service.save(autoRequest(), "dispatch-user");

        verify(repository, org.mockito.Mockito.times(2)).save(any(DispatchSaveHistory.class));
    }

    @Test
    @DisplayName("MANUAL_NAMED 저장은 topic blank 를 400 으로 거부한다")
    void saveManualNamed_blankTopicRejected() {
        DispatchSaveHistoryRequest request = new DispatchSaveHistoryRequest(
                DispatchProgramType.PRE_CLASSIFY,
                DispatchSaveMode.MANUAL_NAMED,
                "  ",
                json("{\"rowCount\":0}"),
                json("{\"rowCount\":0}"));

        assertThatThrownBy(() -> service.save(request, "dispatch-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("저장주제");
    }

    @Test
    @DisplayName("100KB 초과 responsePayload 는 422 로 거부한다")
    void save_payloadTooLargeRejected() {
        String oversized = "x".repeat(101 * 1024);
        DispatchSaveHistoryRequest request = new DispatchSaveHistoryRequest(
                DispatchProgramType.PRE_CLASSIFY,
                DispatchSaveMode.MANUAL_NAMED,
                "월말 마감",
                json("{\"rowCount\":1}"),
                objectMapper.createObjectNode().put("body", oversized));

        assertThatThrownBy(() -> service.save(request, "dispatch-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("배차 결과가 너무 큽니다");
    }

    @Test
    @DisplayName("목록 조회는 from/to 역전 시 내부에서 범위를 교환한다")
    void list_reversedRangeSwapsAndQueries() {
        when(repository.findByFilter(
                any(), any(), any(), any(), any(), any(PageRequest.class)))
                .thenReturn(org.springframework.data.domain.Page.empty());

        service.list(
                DispatchProgramType.PRE_CLASSIFY,
                DispatchSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-31"),
                LocalDate.parse("2026-05-01"),
                "dispatch-user",
                PageRequest.of(0, 50));

        verify(repository).findByFilter(
                "dispatch-user",
                DispatchProgramType.PRE_CLASSIFY,
                DispatchSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-01").atStartOfDay(),
                LocalDate.parse("2026-06-01").atStartOfDay(),
                PageRequest.of(0, 50));
    }

    @Test
    @DisplayName("soft-delete 된 row 는 repository SQLRestriction 으로 상세 조회 대상에서 제외된다")
    void detail_deletedRowNotFound() {
        java.util.UUID id = java.util.UUID.randomUUID();
        when(repository.findByIdAndCreatedBy(id, "dispatch-user")).thenReturn(Optional.empty());
        when(repository.existsById(id)).thenReturn(false);

        assertThatThrownBy(() -> service.findDetail(id, "dispatch-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("찾을 수 없습니다");
    }

    private DispatchSaveHistoryRequest autoRequest() {
        return new DispatchSaveHistoryRequest(
                DispatchProgramType.PRE_CLASSIFY,
                DispatchSaveMode.AUTO_LATEST,
                null,
                json("{\"from\":\"2026-05-01\",\"rowCount\":3}"),
                json("{\"rowCount\":3}"));
    }

    private JsonNode json(String raw) {
        try {
            return objectMapper.readTree(raw);
        } catch (Exception ex) {
            throw new IllegalArgumentException(ex);
        }
    }
}
