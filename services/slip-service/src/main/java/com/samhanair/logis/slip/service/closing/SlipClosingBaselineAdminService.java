package com.samhanair.logis.slip.service.closing;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.dto.closing.CreateSlipClosingBaselineRequest;
import com.samhanair.logis.slip.dto.closing.SlipClosingBaselineResponse;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 전표 종류별 마감 기준선의 관리자 CRUD. 기준선 설정은 현재 날짜와 무관하게 허용한다. */
@Service
@Transactional
@RequiredArgsConstructor
public class SlipClosingBaselineAdminService {

    private final SlipClosingBaselineRepository repository;

    @Transactional(readOnly = true)
    public List<SlipClosingBaselineResponse> list() {
        return repository.findAllByIsDeletedFalseOrderBySlipTypeAsc().stream()
                .map(SlipClosingBaselineResponse::from)
                .collect(Collectors.toList());
    }

    public SlipClosingBaselineResponse create(CreateSlipClosingBaselineRequest request) {
        SlipClosingBaseline existing = repository.findBySlipTypeAndIsDeletedFalse(request.slipType()).orElse(null);
        if (existing != null && existing.isEnabled()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 마감 기준선이 등록된 전표 종류입니다: " + request.slipType());
        }
        if (existing != null) {
            existing.configure(request.baselineDate());
            return SlipClosingBaselineResponse.from(existing);
        }
        return SlipClosingBaselineResponse.from(repository.save(
                SlipClosingBaseline.active(request.slipType(), request.baselineDate(), true)));
    }

    public void delete(UUID id, String callerId) {
        SlipClosingBaseline baseline = repository.findById(id)
                .filter(row -> !row.getIsDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "마감 기준선을 찾을 수 없습니다"));
        baseline.markDeleted(callerId == null || callerId.isBlank() ? "system" : callerId);
    }
}
