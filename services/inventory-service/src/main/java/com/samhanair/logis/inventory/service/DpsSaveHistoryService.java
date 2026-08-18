package com.samhanair.logis.inventory.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.domain.DpsProgramType;
import com.samhanair.logis.inventory.domain.DpsSaveHistory;
import com.samhanair.logis.inventory.domain.DpsSaveMode;
import com.samhanair.logis.inventory.repository.DpsSaveHistoryRepository;
import com.samhanair.logis.inventory.web.dto.DpsSaveHistoryDetailResponse;
import com.samhanair.logis.inventory.web.dto.DpsSaveHistoryListRow;
import com.samhanair.logis.inventory.web.dto.DpsSaveHistoryRequest;
import com.samhanair.logis.inventory.web.dto.DpsSaveHistorySaveResponse;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * DPS 저장내역 service.
 *
 * <p>자동 최신 저장은 사용자+프로그램별 활성 1건만 유지하며, 명시 저장은 append-only 로 누적한다.
 * 모든 삭제는 BaseEntity {@code markDeleted} 를 통한 soft-delete 만 수행한다.
 */
@Service
@RequiredArgsConstructor
public class DpsSaveHistoryService {

    private static final int MAX_RESPONSE_PAYLOAD_BYTES = 100 * 1024;

    private final DpsSaveHistoryRepository repository;
    private final ObjectMapper objectMapper;

    /**
     * DPS 결과를 저장한다.
     *
     * @param request 저장 요청
     * @param currentUser 현재 사용자 ID
     * @return 생성된 저장내역 ID 와 저장시각
     */
    @Transactional
    public DpsSaveHistorySaveResponse save(DpsSaveHistoryRequest request, String currentUser) {
        validateRequest(request);
        String user = normalizeUser(currentUser);
        DpsSaveHistory saved = saveInternal(request, user, true);
        return new DpsSaveHistorySaveResponse(saved.getCreatedAt());
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
    public Page<DpsSaveHistoryListRow> list(DpsProgramType programType,
                                            DpsSaveMode saveMode,
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
                .map(DpsSaveHistoryListRow::from);
    }

    /**
     * 저장내역 상세를 조회한다.
     *
     * @param id 저장내역 ID
     * @param currentUser 현재 사용자 ID
     * @return 복원용 상세 payload
     */
    @Transactional(readOnly = true)
    public DpsSaveHistoryDetailResponse findDetail(UUID id, String currentUser) {
        String user = normalizeUser(currentUser);
        DpsSaveHistory history = repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "해당 저장 내역을 찾을 수 없습니다."));
        if (!user.equals(history.getCreatedBy())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "다른 사용자의 저장내역입니다.");
        }
        return DpsSaveHistoryDetailResponse.from(history);
    }

    /**
     * 현재 사용자의 최신 자동저장을 조회한다.
     *
     * @param programType 프로그램 구분
     * @param currentUser 현재 사용자 ID
     * @return 복원용 상세 payload
     */
    @Transactional(readOnly = true)
    public DpsSaveHistoryDetailResponse findLatestAutoLatest(
            DpsProgramType programType,
            String currentUser) {
        if (programType == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "programType 은 필수입니다.");
        }
        return repository.findActiveAutoLatest(normalizeUser(currentUser), programType)
                .map(DpsSaveHistoryDetailResponse::from)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "자동 저장 내역이 없습니다."));
    }

    private DpsSaveHistory saveInternal(DpsSaveHistoryRequest request, String user, boolean allowRetry) {
        try {
            if (request.saveMode() == DpsSaveMode.AUTO_LATEST) {
                repository.findActiveAutoLatest(user, request.programType())
                        .ifPresent(previous -> previous.supersedeBy(user));
                repository.flush();
            }
            DpsSaveHistory history = DpsSaveHistory.create(
                    request.programType(),
                    request.saveMode(),
                    request.topic(),
                    request.requestParams(),
                    request.responsePayload());
            DpsSaveHistory saved = repository.save(history);
            repository.flush();
            return saved;
        } catch (DataIntegrityViolationException ex) {
            if (allowRetry && request.saveMode() == DpsSaveMode.AUTO_LATEST) {
                repository.findActiveAutoLatest(user, request.programType())
                        .ifPresent(previous -> previous.supersedeBy(user));
                return saveInternal(request, user, false);
            }
            throw ex;
        }
    }

    private void validateRequest(DpsSaveHistoryRequest request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "요청 본문은 필수입니다.");
        }
        if (request.programType() == null || request.saveMode() == null
                || request.requestParams() == null || request.responsePayload() == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "DPS 저장내역 필수값이 누락되었습니다.");
        }
        if (request.saveMode() == DpsSaveMode.MANUAL_NAMED
                && (request.topic() == null || request.topic().isBlank())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "명시 저장은 저장주제가 필수입니다.");
        }
        if (payloadSize(request.responsePayload()) > MAX_RESPONSE_PAYLOAD_BYTES) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    "비교 결과가 너무 큽니다. 기간을 좁혀 다시 시도하세요.");
        }
    }

    private int payloadSize(Object payload) {
        try {
            return objectMapper.writeValueAsBytes(payload).length;
        } catch (JsonProcessingException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "DPS 저장 payload 를 직렬화할 수 없습니다.", ex);
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
