package com.samhanair.logis.slip.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SlipCleanupProgramType;
import com.samhanair.logis.slip.domain.SlipCleanupSaveHistory;
import com.samhanair.logis.slip.domain.SlipCleanupSaveMode;
import com.samhanair.logis.slip.repository.SlipCleanupSaveHistoryRepository;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistoryDetailResponse;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistoryListRow;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistoryRequest;
import com.samhanair.logis.slip.web.dto.SlipCleanupSaveHistorySaveResponse;
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
 * 전표정리 저장내역 service.
 *
 * <p>자동 최신 저장은 사용자+프로그램별 활성 1건만 유지하며, 명시 저장은 append-only 로 누적한다.
 * 모든 삭제는 BaseEntity {@code markDeleted} 를 통한 soft-delete 만 수행한다.
 */
@Service
@RequiredArgsConstructor
public class SlipCleanupSaveHistoryService {

    private static final int MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024;
    private static final int MAX_AUTO_LATEST_RETRIES = 3;

    private final SlipCleanupSaveHistoryRepository repository;
    private final ObjectMapper objectMapper;
    private final PlatformTransactionManager transactionManager;

    /**
     * 전표정리 결과를 저장한다.
     *
     * @param request 저장 요청
     * @param currentUser 현재 사용자 ID
     * @return 생성된 저장내역 ID 와 저장시각
     */
    public SlipCleanupSaveHistorySaveResponse save(
            SlipCleanupSaveHistoryRequest request,
            String currentUser) {
        validateRequest(request);
        String user = normalizeUser(currentUser);
        SlipCleanupSaveHistory saved = saveWithAutoLatestRetry(request, user);
        return new SlipCleanupSaveHistorySaveResponse(saved.getCreatedAt());
    }

    private SlipCleanupSaveHistory saveWithAutoLatestRetry(
            SlipCleanupSaveHistoryRequest request,
            String user) {
        if (request.saveMode() != SlipCleanupSaveMode.AUTO_LATEST) {
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
    public Page<SlipCleanupSaveHistoryListRow> list(
            SlipCleanupProgramType programType,
            SlipCleanupSaveMode saveMode,
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
                .map(SlipCleanupSaveHistoryListRow::from);
    }

    /**
     * 저장내역 상세를 조회한다.
     *
     * @param id 저장내역 ID
     * @param currentUser 현재 사용자 ID
     * @return 복원용 상세 payload
     */
    @Transactional(readOnly = true)
    public SlipCleanupSaveHistoryDetailResponse findDetail(UUID id, String currentUser) {
        String user = normalizeUser(currentUser);
        return repository.findByIdAndCreatedBy(id, user)
                .map(SlipCleanupSaveHistoryDetailResponse::from)
                .orElseThrow(this::detailNotAccessible);
    }

    /**
     * 현재 사용자의 최신 자동저장을 조회한다.
     *
     * @param programType 프로그램 구분
     * @param currentUser 현재 사용자 ID
     * @return 복원용 상세 payload
     */
    @Transactional(readOnly = true)
    public SlipCleanupSaveHistoryDetailResponse findLatestAutoLatest(
            SlipCleanupProgramType programType,
            String currentUser) {
        if (programType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "programType 은 필수입니다.");
        }
        return repository.findActiveAutoLatest(normalizeUser(currentUser), programType)
                .map(SlipCleanupSaveHistoryDetailResponse::from)
                .orElseThrow(() -> new BusinessException(ErrorCode.SLIP_CLEANUP_HISTORY_NOT_FOUND,
                        "자동 저장 내역이 없습니다."));
    }

    private SlipCleanupSaveHistory saveInNewTransaction(
            SlipCleanupSaveHistoryRequest request,
            String user) {
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return transactionTemplate.execute(status -> saveInternal(request, user));
    }

    private SlipCleanupSaveHistory saveInternal(
            SlipCleanupSaveHistoryRequest request,
            String user) {
        if (request.saveMode() == SlipCleanupSaveMode.AUTO_LATEST) {
            repository.findActiveAutoLatest(user, request.programType())
                    .ifPresent(previous -> previous.supersedeBy(user));
            repository.flush();
        }
        SlipCleanupSaveHistory history = SlipCleanupSaveHistory.create(
                request.programType(),
                request.saveMode(),
                request.topic(),
                request.requestParams(),
                request.responsePayload());
        SlipCleanupSaveHistory saved = repository.save(history);
        repository.flush();
        return saved;
    }

    private void validateRequest(SlipCleanupSaveHistoryRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "요청 본문은 필수입니다.");
        }
        if (request.programType() == null || request.saveMode() == null
                || request.requestParams() == null || request.responsePayload() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "전표정리 저장내역 필수값이 누락되었습니다.");
        }
        if (request.saveMode() == SlipCleanupSaveMode.MANUAL_NAMED
                && (request.topic() == null || request.topic().isBlank())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "명시 저장은 저장주제가 필수입니다.");
        }
        if (payloadSize(request.responsePayload()) > MAX_RESPONSE_PAYLOAD_BYTES) {
            throw new BusinessException(ErrorCode.SLIP_CLEANUP_HISTORY_PAYLOAD_TOO_LARGE,
                    "전표정리 결과가 너무 큽니다. 기간을 좁혀 다시 시도하세요.");
        }
    }

    private BusinessException detailNotAccessible() {
        return new BusinessException(ErrorCode.SLIP_CLEANUP_HISTORY_NOT_FOUND, "해당 저장 내역을 찾을 수 없습니다.");
    }

    private int payloadSize(Object payload) {
        try {
            return objectMapper.writeValueAsBytes(payload).length;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "전표정리 저장 payload 를 직렬화할 수 없습니다.", ex);
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
