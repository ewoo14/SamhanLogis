package com.samhanair.logis.notification.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.domain.DispatchSmsSaveHistory;
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import com.samhanair.logis.notification.repository.DispatchSmsSaveHistoryRepository;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistoryDetailResponse;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistoryListRow;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistoryRequest;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistorySaveResponse;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 배차문자 저장내역 service.
 *
 * <p>preview 자동 최신 저장은 사용자+프로그램별 활성 1건만 유지하고, 명시 저장은
 * append-only 로 누적한다. 모든 삭제는 BaseEntity soft-delete 만 사용한다.
 */
@Service
@RequiredArgsConstructor
public class DispatchSmsSaveHistoryService {

    private static final int MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024;
    private static final int MAX_AUTO_LATEST_RETRIES = 3;

    private final DispatchSmsSaveHistoryRepository repository;
    private final ObjectMapper objectMapper;
    private final PlatformTransactionManager transactionManager;

    /**
     * 배차문자 미리보기/발송 결과를 저장한다.
     *
     * @param request 저장 요청
     * @param currentUser 현재 사용자 ID
     * @return 생성된 저장내역 ID 와 저장시각
     */
    public DispatchSmsSaveHistorySaveResponse save(
            DispatchSmsSaveHistoryRequest request,
            String currentUser) {
        validateRequest(request);
        String user = normalizeUser(currentUser);
        DispatchSmsSaveHistory saved = saveWithAutoLatestRetry(request, user);
        return new DispatchSmsSaveHistorySaveResponse(saved.getId(), saved.getCreatedAt());
    }

    private DispatchSmsSaveHistory saveWithAutoLatestRetry(
            DispatchSmsSaveHistoryRequest request,
            String user) {
        if (request.saveMode() != DispatchSmsSaveMode.AUTO_LATEST) {
            return saveInNewTransaction(request, user);
        }

        DataIntegrityViolationException lastFailure = null;
        for (int attempt = 1; attempt <= MAX_AUTO_LATEST_RETRIES; attempt++) {
            try {
                return saveInNewTransaction(request, user);
            } catch (DataIntegrityViolationException ex) {
                lastFailure = ex;
                if (attempt == MAX_AUTO_LATEST_RETRIES) {
                    break;
                }
                backoffBeforeRetry(attempt);
            }
        }
        throw lastFailure;
    }

    private void backoffBeforeRetry(int attempt) {
        try {
            Thread.sleep(25L * attempt);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("AUTO_LATEST 저장 재시도 대기가 중단되었습니다.", ex);
        }
    }

    /**
     * 저장내역 목록을 조회한다.
     *
     * @param programType 프로그램 구분. null 이면 ALL
     * @param saveMode 저장 방식. null 이면 ALL
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param currentUser 현재 사용자 ID
     * @param pageable page/size/sort
     * @return 목록 page
     */
    @Transactional(readOnly = true)
    public Page<DispatchSmsSaveHistoryListRow> list(
            DispatchSmsProgramType programType,
            DispatchSmsSaveMode saveMode,
            LocalDate from,
            LocalDate to,
            String currentUser,
            Pageable pageable) {
        DateRange range = DateRange.of(from, to);
        return repository.findByFilter(
                        normalizeUser(currentUser),
                        programType,
                        saveMode,
                        range.fromInclusive(),
                        range.toExclusive(),
                        pageable)
                .map(DispatchSmsSaveHistoryListRow::from);
    }

    /**
     * 저장내역 상세를 조회한다.
     *
     * @param id 저장내역 ID
     * @param currentUser 현재 사용자 ID
     * @return 복원용 상세 payload
     */
    @Transactional(readOnly = true)
    public DispatchSmsSaveHistoryDetailResponse findDetail(UUID id, String currentUser) {
        String user = normalizeUser(currentUser);
        return repository.findByIdAndCreatedBy(id, user)
                .map(DispatchSmsSaveHistoryDetailResponse::from)
                .orElseThrow(this::detailNotAccessible);
    }

    /**
     * 현재 사용자의 최신 preview 자동저장을 조회한다.
     *
     * @param programType 프로그램 구분
     * @param currentUser 현재 사용자 ID
     * @return 복원용 상세 payload
     */
    @Transactional(readOnly = true)
    public DispatchSmsSaveHistoryDetailResponse findLatestAutoLatest(
            DispatchSmsProgramType programType,
            String currentUser) {
        if (programType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "programType 은 필수입니다.");
        }
        return repository.findActiveAutoLatest(normalizeUser(currentUser), programType)
                .map(DispatchSmsSaveHistoryDetailResponse::from)
                .orElseThrow(() -> new BusinessException(ErrorCode.DISPATCH_SMS_HISTORY_NOT_FOUND,
                        "자동 저장 내역이 없습니다."));
    }

    private DispatchSmsSaveHistory saveInNewTransaction(
            DispatchSmsSaveHistoryRequest request,
            String user) {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return transactionTemplate.execute(status -> saveInternal(request, user));
    }

    private DispatchSmsSaveHistory saveInternal(
            DispatchSmsSaveHistoryRequest request,
            String user) {
        if (request.saveMode() == DispatchSmsSaveMode.AUTO_LATEST) {
            repository.findActiveAutoLatest(user, request.programType())
                    .ifPresent(previous -> previous.supersedeBy(user));
            repository.flush();
        }
        DispatchSmsSaveHistory history = DispatchSmsSaveHistory.create(
                request.programType(),
                request.saveMode(),
                request.topic(),
                request.requestParams(),
                request.responsePayload());
        DispatchSmsSaveHistory saved = repository.save(history);
        repository.flush();
        return saved;
    }

    private void validateRequest(DispatchSmsSaveHistoryRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "요청 본문은 필수입니다.");
        }
        if (request.programType() == null || request.saveMode() == null
                || request.requestParams() == null || request.responsePayload() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "배차문자 저장내역 필수값이 누락되었습니다.");
        }
        if (request.saveMode().requiresTopic()
                && (request.topic() == null || request.topic().isBlank())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "명시 저장은 저장주제가 필수입니다.");
        }
        if (payloadSize(request.responsePayload()) > MAX_RESPONSE_PAYLOAD_BYTES) {
            throw new BusinessException(ErrorCode.DISPATCH_SMS_HISTORY_PAYLOAD_TOO_LARGE,
                    "배차문자 결과가 너무 큽니다. 기간을 좁혀 다시 시도하세요.");
        }
    }

    private BusinessException detailNotAccessible() {
        return new BusinessException(ErrorCode.DISPATCH_SMS_HISTORY_NOT_FOUND, "해당 저장 내역을 찾을 수 없습니다.");
    }

    private int payloadSize(Object payload) {
        try {
            return objectMapper.writeValueAsBytes(payload).length;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "배차문자 저장 payload 를 직렬화할 수 없습니다.", ex);
        }
    }

    private String normalizeUser(String currentUser) {
        if (currentUser == null || currentUser.isBlank()) {
            return "system";
        }
        return currentUser.trim();
    }

    private record DateRange(LocalDateTime fromInclusive, LocalDateTime toExclusive) {
        static DateRange of(LocalDate from, LocalDate to) {
            LocalDate start = from;
            LocalDate end = to;
            if (start != null && end != null && start.isAfter(end)) {
                start = to;
                end = from;
            }
            return new DateRange(
                    start == null ? null : start.atStartOfDay(),
                    end == null ? null : end.plusDays(1).atStartOfDay());
        }
    }
}
