package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.UserCodefImportScope;
import com.samhanair.logis.accounting.domain.CodefScopeMode;
import com.samhanair.logis.accounting.repository.UserCodefImportScopeRepository;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeRequest;
import com.samhanair.logis.accounting.web.dto.CodefImportScopeResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.OptimisticLockException;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** 사용자별 외부계정 가져오기 선택 scope 서비스. */
@Service
@RequiredArgsConstructor
public class UserCodefImportScopeService {

    private final UserCodefImportScopeRepository repository;
    private final PlatformTransactionManager transactionManager;

    /**
     * 인증 사용자 범위에서 선택 scope 를 생성하거나 갱신한다.
     *
     * @param userId  인증 사용자 UUID
     * @param request 저장 요청
     * @return 저장된 scope 응답
     */
    public CodefImportScopeResponse upsert(UUID userId, CodefImportScopeRequest request) {
        CodefScopeMode scopeMode = parseScopeMode(request.scopeMode());
        validateScope(scopeMode, request.accountRefs(), request.cardRefs(), request.loanRefs());
        try {
            return upsertInNewTransaction(userId, request, scopeMode);
        } catch (BusinessException ex) {
            throw ex;
        } catch (OptimisticLockingFailureException | OptimisticLockException
                 | DataIntegrityViolationException | ConstraintViolationException ex) {
            throw new BusinessException(ErrorCode.CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT,
                    ErrorCode.CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT.getDefaultMessage(), ex);
        }
    }

    /** 새 CODEF scope 요청의 명시적 범위와 선택 목록을 이중 검증한다. */
    private static void validateScope(CodefScopeMode scopeMode, java.util.List<String> accountRefs,
                                      java.util.List<String> cardRefs, java.util.List<String> loanRefs) {
        boolean hasSelection = hasValues(accountRefs) || hasValues(cardRefs) || hasValues(loanRefs);
        if ((scopeMode == CodefScopeMode.ALL && hasSelection)
                || (scopeMode == CodefScopeMode.SELECTED && !hasSelection)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "scopeMode 와 선택 목록이 일치하지 않습니다");
        }
    }

    private static boolean hasValues(java.util.List<String> refs) {
        return refs != null && !refs.isEmpty();
    }

    private CodefImportScopeResponse upsertInNewTransaction(UUID userId, CodefImportScopeRequest request,
                                                             CodefScopeMode scopeMode) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template.execute(status -> upsertOnce(userId, request, scopeMode));
    }

    private CodefImportScopeResponse upsertOnce(UUID userId, CodefImportScopeRequest request,
                                                CodefScopeMode scopeMode) {
        UserCodefImportScope scope = repository
                .findByUserIdAndConnectedId(userId, request.connectedId().trim())
                .map(existing -> {
                    verifyVersion(existing, request.version());
                    return existing;
                })
                .orElseGet(() -> {
                    if (request.version() != null) {
                        throw new BusinessException(ErrorCode.CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT);
                    }
                    return UserCodefImportScope.create(userId, request.connectedId());
                });
        scope.updateSelections(
                request.accountRefs(),
                request.cardRefs(),
                request.loanRefs(),
                request.defaultImportType(),
                scopeMode);
        return CodefImportScopeResponse.from(repository.saveAndFlush(scope));
    }

    /** 저장 직전 클라이언트 스냅샷과 현재 행 버전을 대조한다. */
    private static void verifyVersion(UserCodefImportScope scope, Long requestedVersion) {
        if (requestedVersion == null || scope.getVersion() != requestedVersion.longValue()) {
            throw new BusinessException(ErrorCode.CODEF_SCOPE_OPTIMISTIC_LOCK_CONFLICT);
        }
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
                        "저장된 가져오기 선택이 없습니다. 먼저 가져오기 선택을 저장하세요."));
    }

    private static void validateConnectedId(String connectedId) {
        if (connectedId == null || connectedId.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "연결 식별자는 필수입니다.");
        }
    }

    private static CodefScopeMode parseScopeMode(String rawScopeMode) {
        try {
            return CodefScopeMode.parse(rawScopeMode);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, ex.getMessage());
        }
    }
}
