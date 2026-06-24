package com.samhanair.logis.slip.service.cutoff;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.domain.DeliveryTag;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.cutoff.SlipOutboundCutoff;
import com.samhanair.logis.slip.dto.cutoff.CreateSlipCutoffRequest;
import com.samhanair.logis.slip.dto.cutoff.DeliveryTagOption;
import com.samhanair.logis.slip.dto.cutoff.SlipCutoffResponse;
import com.samhanair.logis.slip.dto.cutoff.UpdateSlipCutoffRequest;
import com.samhanair.logis.slip.repository.cutoff.SlipOutboundCutoffRepository;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 출고전표 마감시각 마스터 CRUD 서비스.
 *
 * <p>OUTBOUND 방향 {@link DeliveryTag} 별로 컷오프 시각을 등록·수정·삭제한다.
 * {@link OutboundCutoffGuard} 가 이 서비스의 데이터를 읽어 게이트 판정을 수행한다.
 */
@Service
@Transactional
@RequiredArgsConstructor
public class SlipOutboundCutoffService {

    private final SlipOutboundCutoffRepository repository;

    /**
     * 전체 마감시각 목록을 태그 이름 오름차순으로 반환한다.
     *
     * @return 마감시각 목록 (soft-delete 제외)
     */
    @Transactional(readOnly = true)
    public List<SlipCutoffResponse> list() {
        return repository.findAllByOrderByDeliveryTagAsc()
                .stream()
                .map(SlipCutoffResponse::from)
                .collect(Collectors.toList());
    }

    /**
     * 신규 마감시각을 등록한다.
     *
     * <p>같은 {@link DeliveryTag} 의 활성 row 가 이미 존재하면 {@code 409 CONFLICT} 를 반환한다.
     * 태그가 OUTBOUND 방향이 아닌 경우 {@code 400 INVALID_INPUT} 을 반환한다.
     *
     * @param req 등록 요청
     * @return 등록된 마감시각 응답
     * @throws BusinessException(INVALID_INPUT) OUTBOUND 방향이 아닌 태그를 전달했을 때
     * @throws BusinessException(CONFLICT)      같은 태그의 활성 마감시각이 이미 존재할 때
     */
    public SlipCutoffResponse create(CreateSlipCutoffRequest req) {
        // 1. OUTBOUND 방향 검증
        if (req.deliveryTag() == null || req.deliveryTag().getDirection() != SlipType.OUTBOUND) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "출고 마감시각은 OUTBOUND 방향 배송태그에만 설정할 수 있습니다");
        }
        // 2. 활성 중복 검증 (소프트딜리트 제외, partial unique index 보조)
        if (repository.existsByDeliveryTag(req.deliveryTag())) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "이미 마감시각이 등록된 배송 태그입니다: " + req.deliveryTag().getKoreanLabel());
        }
        // 3. 엔티티 생성 + 활성 여부 적용
        SlipOutboundCutoff cutoff = SlipOutboundCutoff.create(req.deliveryTag(), req.cutoffTime());
        if (Boolean.FALSE.equals(req.active())) {
            cutoff.deactivate();
        }
        return SlipCutoffResponse.from(repository.save(cutoff));
    }

    /**
     * 마감시각을 부분 수정한다 (PATCH 시맨틱).
     *
     * @param id  마감시각 UUID
     * @param req 수정 요청 (null 필드는 미변경)
     * @return 수정된 마감시각 응답
     * @throws BusinessException(NOT_FOUND) UUID 에 해당하는 마감시각을 찾을 수 없을 때
     */
    public SlipCutoffResponse update(UUID id, UpdateSlipCutoffRequest req) {
        SlipOutboundCutoff cutoff = loadOrThrow(id);
        cutoff.changeTime(req.cutoffTime(), req.active());
        return SlipCutoffResponse.from(cutoff);
    }

    /**
     * 마감시각을 soft-delete 처리한다.
     *
     * @param id       마감시각 UUID
     * @param callerId 호출자 user-id (감사 목적)
     * @throws BusinessException(NOT_FOUND) UUID 에 해당하는 마감시각을 찾을 수 없을 때
     */
    public void delete(UUID id, String callerId) {
        SlipOutboundCutoff cutoff = loadOrThrow(id);
        cutoff.markDeleted(callerOrSystem(callerId));
    }

    /**
     * OUTBOUND 방향 배송태그 목록 — FE 등록 드롭다운 바인딩용.
     *
     * <p>전체 {@link DeliveryTag} 중 {@link SlipType#OUTBOUND} 방향만 필터링한다.
     *
     * @return OUTBOUND 배송태그 옵션 목록
     */
    @Transactional(readOnly = true)
    public List<DeliveryTagOption> availableOutboundTags() {
        return Arrays.stream(DeliveryTag.values())
                .filter(tag -> tag.getDirection() == SlipType.OUTBOUND)
                .map(DeliveryTagOption::from)
                .collect(Collectors.toList());
    }

    private SlipOutboundCutoff loadOrThrow(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "출고 마감시각 설정을 찾을 수 없습니다"));
    }

    private static String callerOrSystem(String callerId) {
        return (callerId == null || callerId.isBlank()) ? "system" : callerId;
    }
}
