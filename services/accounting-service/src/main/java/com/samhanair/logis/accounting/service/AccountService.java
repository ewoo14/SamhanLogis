package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.web.dto.AccountTreeNodeResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 계정과목 마스터 service — Slice A 본 슬라이스는 트리 조회만. CRUD 는 admin 전용 향후 슬라이스. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AccountService {

    private static final Set<String> LEGACY_CONTROL_ACCOUNT_CODES =
            Set.of("100", "200", "300", "400", "500", "800", "900");

    private final ChartOfAccountRepository repository;

    /**
     * 계정 트리 조회 — code 오름차순 (FE 가 parentCode 로 nest).
     */
    public List<AccountTreeNodeResponse> findTree() {
        return repository.findAllByOrderByCodeAsc().stream()
                .map(AccountTreeNodeResponse::of)
                .toList();
    }

    /**
     * leaf 계정 검증 헬퍼 — 분개 라인 accountCode 가 ChartOfAccount 에 존재하고 isLeaf=true 여야 한다.
     *
     * @throws BusinessException(NOT_FOUND) 계정 코드 미존재
     * @throws BusinessException(INVALID_INPUT) leaf 가 아닌 통제 계정
     */
    public void requireLeafAccount(String code) {
        if (LEGACY_CONTROL_ACCOUNT_CODES.contains(code)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "통제 계정(parent)에는 분개할 수 없습니다: " + code);
        }
        ChartOfAccount account = repository.findById(code)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "존재하지 않는 계정 코드입니다: " + code));
        if (!account.isLeaf()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "통제 계정(parent)에는 분개할 수 없습니다: " + code + " " + account.getName());
        }
    }
}
