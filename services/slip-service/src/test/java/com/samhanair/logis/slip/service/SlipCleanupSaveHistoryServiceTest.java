package com.samhanair.logis.slip.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SlipCleanupProgramType;
import com.samhanair.logis.slip.domain.SlipCleanupSaveHistory;
import com.samhanair.logis.slip.domain.SlipCleanupSaveMode;
import com.samhanair.logis.slip.repository.SlipCleanupSaveHistoryRepository;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistoryRequest;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

/**
 * 전표정리 저장내역 서비스 단위 테스트.
 *
 * <p>SP-08-3-3 전표정리 결과의 자동 저장, 명시 저장, payload 제한, 날짜 범위 정규화를 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class SlipCleanupSaveHistoryServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private SlipCleanupSaveHistoryRepository repository;

    private SlipCleanupSaveHistoryService service;

    @BeforeEach
    void setUp() {
        service = new SlipCleanupSaveHistoryService(repository, objectMapper, transactionManager());
    }

    @Test
    @DisplayName("AUTO_LATEST 저장은 기존 활성 자동저장을 soft-delete 하고 새 row 를 저장한다")
    void saveAutoLatest_supersedesPreviousActiveAutoLatest() {
        SlipCleanupSaveHistory previous = SlipCleanupSaveHistory.create(
                SlipCleanupProgramType.SLIP_CLEANUP,
                SlipCleanupSaveMode.AUTO_LATEST,
                "자동저장",
                json("{\"from\":\"2026-05-01\",\"rowCount\":3}"),
                json("{\"totalSlips\":3,\"entries\":[1,2,3]}"));
        when(repository.findActiveAutoLatest("sales-user", SlipCleanupProgramType.SLIP_CLEANUP))
                .thenReturn(Optional.of(previous));
        when(repository.save(any(SlipCleanupSaveHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        service.save(autoRequest(), "sales-user");

        assertThat(previous.getIsDeleted()).isTrue();
        assertThat(previous.getDeletedBy()).isEqualTo("sales-user");

        ArgumentCaptor<SlipCleanupSaveHistory> captor =
                ArgumentCaptor.forClass(SlipCleanupSaveHistory.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTopic()).isEqualTo("자동저장");
        assertThat(captor.getValue().getSaveMode()).isEqualTo(SlipCleanupSaveMode.AUTO_LATEST);
    }

    @Test
    @DisplayName("AUTO_LATEST partial unique 충돌은 최대 3회까지 재시도한다")
    void saveAutoLatest_retriesUpToThreeTimesAfterUniqueConflict() {
        when(repository.findActiveAutoLatest("sales-user", SlipCleanupProgramType.SLIP_CLEANUP))
                .thenReturn(Optional.empty());
        when(repository.save(any(SlipCleanupSaveHistory.class)))
                .thenThrow(new DataIntegrityViolationException("ux_slip_cleanup_history_auto_latest"))
                .thenThrow(new DataIntegrityViolationException("ux_slip_cleanup_history_auto_latest"))
                .thenAnswer(inv -> inv.getArgument(0));

        service.save(autoRequest(), "sales-user");

        verify(repository, org.mockito.Mockito.times(3)).save(any(SlipCleanupSaveHistory.class));
    }

    @Test
    @DisplayName("MANUAL_NAMED 저장은 topic blank 를 400 으로 거부한다")
    void saveManualNamed_blankTopicRejected() {
        SlipCleanupSaveHistoryRequest request = new SlipCleanupSaveHistoryRequest(
                SlipCleanupProgramType.SLIP_CLEANUP,
                SlipCleanupSaveMode.MANUAL_NAMED,
                "  ",
                json("{\"rowCount\":0}"),
                json("{\"totalSlips\":0,\"entries\":[]}"));

        assertThatThrownBy(() -> service.save(request, "sales-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("저장주제");
    }

    @Test
    @DisplayName("100KB 초과 responsePayload 는 422 로 거부한다")
    void save_payloadTooLargeRejected() {
        String oversized = "x".repeat(101 * 1024);
        SlipCleanupSaveHistoryRequest request = new SlipCleanupSaveHistoryRequest(
                SlipCleanupProgramType.SLIP_CLEANUP,
                SlipCleanupSaveMode.MANUAL_NAMED,
                "월말 마감",
                json("{\"rowCount\":1}"),
                objectMapper.createObjectNode().put("body", oversized));

        assertThatThrownBy(() -> service.save(request, "sales-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("전표정리 결과가 너무 큽니다");
    }

    @Test
    @DisplayName("목록 조회는 from/to 역전 시 내부에서 범위를 교환한다")
    void list_reversedRangeSwapsAndQueries() {
        when(repository.findByFilter(any(), any(), any(), any(), any(), any(PageRequest.class)))
                .thenReturn(org.springframework.data.domain.Page.empty());

        service.list(
                SlipCleanupProgramType.SLIP_CLEANUP,
                SlipCleanupSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-31"),
                LocalDate.parse("2026-05-01"),
                "sales-user",
                PageRequest.of(0, 50));

        verify(repository).findByFilter(
                "sales-user",
                SlipCleanupProgramType.SLIP_CLEANUP,
                SlipCleanupSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-01").atStartOfDay(),
                LocalDate.parse("2026-06-01").atStartOfDay(),
                PageRequest.of(0, 50));
    }

    @Test
    @DisplayName("soft-delete 된 row 는 상세 조회 대상에서 제외된다")
    void detail_deletedRowNotFound() {
        java.util.UUID id = java.util.UUID.randomUUID();
        when(repository.findByIdAndCreatedBy(id, "sales-user")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findDetail(id, "sales-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("찾을 수 없습니다");
    }

    @Test
    @DisplayName("latest 미존재는 전용 SLIP_CLEANUP_HISTORY_NOT_FOUND 코드로 응답한다")
    void latest_missingUsesSlipCleanupHistoryNotFoundCode() {
        when(repository.findActiveAutoLatest("sales-user", SlipCleanupProgramType.SLIP_CLEANUP))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findLatestAutoLatest(SlipCleanupProgramType.SLIP_CLEANUP, "sales-user"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.SLIP_CLEANUP_HISTORY_NOT_FOUND);
    }

    @Test
    @DisplayName("타인 저장내역 접근은 존재 은닉을 위해 404 전용 코드로 응답한다")
    void detail_otherUserHiddenUsesSlipCleanupHistoryNotFoundCode() {
        java.util.UUID id = java.util.UUID.randomUUID();
        when(repository.findByIdAndCreatedBy(id, "sales-user-b")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findDetail(id, "sales-user-b"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.SLIP_CLEANUP_HISTORY_NOT_FOUND);
    }

    private PlatformTransactionManager transactionManager() {
        return new AbstractPlatformTransactionManager() {
            @Override
            protected Object doGetTransaction() {
                return new Object();
            }

            @Override
            protected void doBegin(Object transaction, TransactionDefinition definition) {
            }

            @Override
            protected void doCommit(DefaultTransactionStatus status) {
            }

            @Override
            protected void doRollback(DefaultTransactionStatus status) {
            }
        };
    }

    private SlipCleanupSaveHistoryRequest autoRequest() {
        return new SlipCleanupSaveHistoryRequest(
                SlipCleanupProgramType.SLIP_CLEANUP,
                SlipCleanupSaveMode.AUTO_LATEST,
                null,
                json("{\"from\":\"2026-05-01\",\"to\":\"2026-05-16\",\"rowCount\":3}"),
                json("{\"totalSlips\":3,\"entries\":[{\"slipNo\":\"2026/05/16-1\"}]}"));
    }

    private JsonNode json(String raw) {
        try {
            return objectMapper.readTree(raw);
        } catch (Exception ex) {
            throw new IllegalArgumentException(ex);
        }
    }
}
