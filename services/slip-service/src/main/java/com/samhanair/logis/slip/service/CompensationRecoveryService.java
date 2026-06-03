package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SerialCompensationFailure;
import com.samhanair.logis.slip.repository.SerialCompensationFailureRepository;
import com.samhanair.logis.slip.web.dto.CompensationFailureResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 시리얼/배치 보상 실패 복구 service.
 *
 * <p>원격 재고 보상 실패 감사 행을 운영자가 조회하고 수동 정합 완료 상태로 전이하는
 * 복구 루프를 제공한다.
 */
@Service
@RequiredArgsConstructor
public class CompensationRecoveryService {

    private final SerialCompensationFailureRepository failureRepository;

    /**
     * 해소 여부별 보상 실패 감사 행을 조회한다.
     *
     * @param resolved 해소 여부
     * @param pageable 페이지 요청
     * @return 최신 생성 순 보상 실패 응답 page
     */
    @Transactional(readOnly = true)
    public Page<CompensationFailureResponse> findFailures(boolean resolved, Pageable pageable) {
        return failureRepository.findByResolvedOrderByCreatedAtDesc(resolved, pageable)
                .map(CompensationFailureResponse::from);
    }

    /**
     * 보상 실패 감사 행을 수동 정합 완료로 표시한다.
     *
     * @param id 보상 실패 감사 행 ID
     * @return 갱신된 보상 실패 응답
     * @throws BusinessException(NOT_FOUND) 대상 감사 행을 찾을 수 없을 때
     */
    @Transactional
    public CompensationFailureResponse resolve(UUID id) {
        SerialCompensationFailure failure = failureRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "보상 실패 감사 행을 찾을 수 없습니다."));
        failure.resolve();
        SerialCompensationFailure saved = failureRepository.save(failure);
        return CompensationFailureResponse.from(saved);
    }
}
