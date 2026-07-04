package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.UserBankTxnFilter;
import com.samhanair.logis.accounting.repository.UserBankTxnFilterRepository;
import com.samhanair.logis.accounting.web.dto.BankTransactionFilterPreferenceRequest;
import com.samhanair.logis.accounting.web.dto.BankTransactionFilterPreferenceResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** 사용자별 입출금내역 label 필터 서비스. */
@Service
@RequiredArgsConstructor
public class UserBankTxnFilterService {

    private final UserBankTxnFilterRepository repository;
    private final PlatformTransactionManager transactionManager;

    /**
     * 인증 사용자 범위에서 label 필터를 생성하거나 갱신한다.
     *
     * @param userId 인증 사용자 UUID
     * @param request 저장 요청
     * @return 저장된 필터 응답
     */
    public BankTransactionFilterPreferenceResponse upsert(
            UUID userId,
            BankTransactionFilterPreferenceRequest request) {
        try {
            return upsertInNewTransaction(userId, request);
        } catch (DataIntegrityViolationException | ConstraintViolationException ex) {
            return upsertInNewTransaction(userId, request);
        }
    }

    private BankTransactionFilterPreferenceResponse upsertInNewTransaction(
            UUID userId,
            BankTransactionFilterPreferenceRequest request) {
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        template.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return template.execute(status -> upsertOnce(userId, request));
    }

    private BankTransactionFilterPreferenceResponse upsertOnce(
            UUID userId,
            BankTransactionFilterPreferenceRequest request) {
        BankTransactionFilterPreferenceRequest safeRequest = request == null
                ? new BankTransactionFilterPreferenceRequest(null, null)
                : request;
        UserBankTxnFilter filter = repository.findByUserId(userId)
                .orElseGet(() -> UserBankTxnFilter.create(userId));
        filter.updateLabels(safeRequest.accountLabels(), safeRequest.cardLabels());
        return BankTransactionFilterPreferenceResponse.from(repository.saveAndFlush(filter));
    }

    /** 인증 사용자 범위에서 저장된 label 필터를 조회한다. 미저장 상태는 빈 선택으로 응답한다. */
    @Transactional(readOnly = true)
    public BankTransactionFilterPreferenceResponse get(UUID userId) {
        return repository.findByUserId(userId)
                .map(BankTransactionFilterPreferenceResponse::from)
                .orElseGet(BankTransactionFilterPreferenceResponse::empty);
    }
}
