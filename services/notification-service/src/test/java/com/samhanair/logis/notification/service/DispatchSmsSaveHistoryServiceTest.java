package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.domain.DispatchSmsSaveHistory;
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import com.samhanair.logis.notification.repository.DispatchSmsSaveHistoryRepository;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistoryRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

/**
 * 배차문자 저장내역 service 단위 테스트.
 *
 * <p>preview AUTO_LATEST, 명시 저장 append-only, payload 제한,
 * 날짜 범위 정규화를 검증한다.
 */
@ExtendWith(MockitoExtension.class)
class DispatchSmsSaveHistoryServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private DispatchSmsSaveHistoryRepository repository;

    private DispatchSmsSaveHistoryService service;

    @Test
    @DisplayName("V7 제약은 soft-delete 된 과거 SEND_AUDIT 행을 보존하면서 복원을 막는다")
    void v7Constraint_allowsSoftDeletedLegacyRows() throws IOException {
        String sql = new String(new ClassPathResource(
                "db/migration/V7__retire_dispatch_sms_send_audit_history.sql")
                .getInputStream().readAllBytes(), StandardCharsets.UTF_8);

        assertThat(sql).contains(
                "CHECK (is_deleted OR save_mode IN ('AUTO_LATEST', 'MANUAL_NAMED'))");
    }

    @BeforeEach
    void setUp() {
        service = new DispatchSmsSaveHistoryService(repository, objectMapper, transactionManager());
    }

    @Test
    @DisplayName("AUTO_LATEST 저장은 기존 preview 자동저장을 soft-delete 하고 새 row 를 저장한다")
    void saveAutoLatest_supersedesPreviousActiveAutoLatest() {
        DispatchSmsSaveHistory previous = DispatchSmsSaveHistory.create(
                DispatchSmsProgramType.DISPATCH_SMS,
                DispatchSmsSaveMode.AUTO_LATEST,
                "자동저장",
                json("{\"date\":\"2026-05-17\",\"rowCount\":3}"),
                json("{\"totalMessages\":3,\"groups\":[]}"));
        when(repository.findActiveAutoLatest("dispatch-user", DispatchSmsProgramType.DISPATCH_SMS))
                .thenReturn(Optional.of(previous));
        when(repository.save(any(DispatchSmsSaveHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        service.save(autoRequest(), "dispatch-user");

        assertThat(previous.getIsDeleted()).isTrue();
        assertThat(previous.getDeletedBy()).isEqualTo("dispatch-user");

        ArgumentCaptor<DispatchSmsSaveHistory> captor =
                ArgumentCaptor.forClass(DispatchSmsSaveHistory.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getTopic()).isEqualTo("자동저장");
        assertThat(captor.getValue().getSaveMode()).isEqualTo(DispatchSmsSaveMode.AUTO_LATEST);
    }

    @Test
    @DisplayName("AUTO_LATEST partial unique 충돌은 최대 3회까지 재시도한다")
    void saveAutoLatest_retriesUpToThreeTimesAfterUniqueConflict() {
        when(repository.findActiveAutoLatest("dispatch-user", DispatchSmsProgramType.DISPATCH_SMS))
                .thenReturn(Optional.empty());
        when(repository.save(any(DispatchSmsSaveHistory.class)))
                .thenThrow(new DataIntegrityViolationException("ux_dispatch_sms_history_auto_latest"))
                .thenThrow(new DataIntegrityViolationException("ux_dispatch_sms_history_auto_latest"))
                .thenAnswer(inv -> inv.getArgument(0));

        service.save(autoRequest(), "dispatch-user");

        verify(repository, org.mockito.Mockito.times(3)).save(any(DispatchSmsSaveHistory.class));
    }

    @Test
    @DisplayName("MANUAL_NAMED 저장은 기존 AUTO_LATEST 를 supersede 하지 않고 append-only 로 저장한다")
    void saveManualNamed_doesNotSupersedeAutoLatest() {
        when(repository.save(any(DispatchSmsSaveHistory.class))).thenAnswer(inv -> inv.getArgument(0));

        service.save(manualNamedRequest(), "dispatch-user");

        verify(repository, org.mockito.Mockito.never())
                .findActiveAutoLatest(any(), any());
        ArgumentCaptor<DispatchSmsSaveHistory> captor =
                ArgumentCaptor.forClass(DispatchSmsSaveHistory.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getSaveMode()).isEqualTo(DispatchSmsSaveMode.MANUAL_NAMED);
        assertThat(captor.getValue().getTopic()).isEqualTo("명시 저장");
    }

    @Test
    @DisplayName("MANUAL_NAMED 저장은 topic blank 를 400 으로 거부한다")
    void saveManualNamed_blankTopicRejected() {
        DispatchSmsSaveHistoryRequest request = new DispatchSmsSaveHistoryRequest(
                DispatchSmsProgramType.DISPATCH_SMS,
                DispatchSmsSaveMode.MANUAL_NAMED,
                "  ",
                json("{\"rowCount\":0}"),
                json("{\"totalMessages\":0,\"groups\":[]}"));

        assertThatThrownBy(() -> service.save(request, "dispatch-user"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("저장주제");
    }

    @Test
    @DisplayName("100KB 초과 responsePayload 는 422 로 거부한다")
    void save_payloadTooLargeRejected() {
        String oversized = "x".repeat(101 * 1024);
        DispatchSmsSaveHistoryRequest request = new DispatchSmsSaveHistoryRequest(
                DispatchSmsProgramType.DISPATCH_SMS,
                DispatchSmsSaveMode.MANUAL_NAMED,
                "명시 저장",
                json("{\"rowCount\":1}"),
                objectMapper.createObjectNode().put("body", oversized));

        assertThatThrownBy(() -> service.save(request, "dispatch-user"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE);
    }

    @Test
    @DisplayName("목록 조회는 from/to 역전 시 내부에서 범위를 교환한다")
    void list_reversedRangeSwapsAndQueries() {
        when(repository.findByFilter(any(), any(), any(), any(), any(), any(PageRequest.class)))
                .thenReturn(org.springframework.data.domain.Page.empty());

        service.list(
                DispatchSmsProgramType.DISPATCH_SMS,
                DispatchSmsSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-31"),
                LocalDate.parse("2026-05-01"),
                "dispatch-user",
                PageRequest.of(0, 50));

        verify(repository).findByFilter(
                "dispatch-user",
                DispatchSmsProgramType.DISPATCH_SMS,
                DispatchSmsSaveMode.MANUAL_NAMED,
                LocalDate.parse("2026-05-01").atStartOfDay(),
                LocalDate.parse("2026-06-01").atStartOfDay(),
                PageRequest.of(0, 50));
    }

    @Test
    @DisplayName("latest 는 AUTO_LATEST 만 조회한다")
    void latest_onlyAutoLatest() {
        when(repository.findActiveAutoLatest("dispatch-user", DispatchSmsProgramType.DISPATCH_SMS))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findLatestAutoLatest(
                DispatchSmsProgramType.DISPATCH_SMS, "dispatch-user"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.DISPATCH_SMS_HISTORY_NOT_FOUND);
    }

    @Test
    @DisplayName("타인 저장내역 접근은 존재 은닉을 위해 404 전용 코드로 응답한다")
    void detail_otherUserHiddenUsesDispatchSmsHistoryNotFoundCode() {
        java.util.UUID id = java.util.UUID.randomUUID();
        when(repository.findByIdAndCreatedBy(id, "dispatch-user-b")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findDetail(id, "dispatch-user-b"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.DISPATCH_SMS_HISTORY_NOT_FOUND);
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

    private DispatchSmsSaveHistoryRequest autoRequest() {
        return new DispatchSmsSaveHistoryRequest(
                DispatchSmsProgramType.DISPATCH_SMS,
                DispatchSmsSaveMode.AUTO_LATEST,
                null,
                json("{\"date\":\"2026-05-17\",\"rowCount\":3}"),
                json("{\"totalMessages\":3,\"groups\":[{\"chatRoom\":\"A\"}]}"));
    }

    private DispatchSmsSaveHistoryRequest manualNamedRequest() {
        return new DispatchSmsSaveHistoryRequest(
                DispatchSmsProgramType.DISPATCH_SMS,
                DispatchSmsSaveMode.MANUAL_NAMED,
                "명시 저장",
                json("{\"date\":\"2026-05-17\",\"rowCount\":3}"),
                json("{\"totalMessages\":3,\"groups\":[]}"));
    }

    private JsonNode json(String raw) {
        try {
            return objectMapper.readTree(raw);
        } catch (Exception ex) {
            throw new IllegalArgumentException(ex);
        }
    }
}
