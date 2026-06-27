package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import com.samhanair.logis.accounting.repository.UserCodefImportScopeRepository;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeRequest;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 사용자별 외부계정 가져오기 선택 scope 서비스. */
@Service
@RequiredArgsConstructor
public class UserCodefImportScopeService {

    private final UserCodefImportScopeRepository repository;

    /**
     * 인증 사용자 범위에서 선택 scope 를 생성하거나 갱신한다.
     *
     * @param userId  인증 사용자 UUID
     * @param request 저장 요청
     * @return 저장된 scope 응답
     */
    @Transactional
    public CodefImportScopeResponse upsert(UUID userId, CodefImportScopeRequest request) {
        UserCodefImportScope scope = repository
                .findByUserIdAndConnectedId(userId, request.connectedId().trim())
                .orElseGet(() -> UserCodefImportScope.create(userId, request.connectedId()));
        scope.updateSelections(
                request.accountRefs(),
                request.cardRefs(),
                request.loanRefs(),
                request.defaultImportType());
        return CodefImportScopeResponse.from(repository.save(scope));
    }

    /** 인증 사용자 범위에서 선택 scope 를 조회한다. 미저장 상태는 빈 선택으로 응답한다. */
    @Transactional(readOnly = true)
    public CodefImportScopeResponse get(UUID userId, String connectedId) {
        validateConnectedId(connectedId);
        return repository.findByUserIdAndConnectedId(userId, connectedId.trim())
                .map(CodefImportScopeResponse::from)
                .orElseGet(() -> CodefImportScopeResponse.empty(connectedId.trim()));
    }

    /** 저장선택 기반 import 에 사용할 scope 를 조회한다. */
    @Transactional(readOnly = true)
    public UserCodefImportScope getRequired(UUID userId, String connectedId) {
        validateConnectedId(connectedId);
        return repository.findByUserIdAndConnectedId(userId, connectedId.trim())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "저장된 가져오기 선택이 없습니다."));
    }

    private static void validateConnectedId(String connectedId) {
        if (connectedId == null || connectedId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "connectedId 는 필수입니다.");
        }
    }
}
