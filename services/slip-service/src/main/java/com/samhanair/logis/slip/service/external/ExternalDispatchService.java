package com.samhanair.logis.slip.service.external;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipStatus;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.domain.dispatch.SlipDispatchStatus;
import com.samhanair.logis.slip.domain.external.ExternalCarrier;
import com.samhanair.logis.slip.domain.external.ExternalDispatch;
import com.samhanair.logis.slip.domain.external.ExternalDispatchChannel;
import com.samhanair.logis.slip.dto.external.CreateExternalDispatchRequest;
import com.samhanair.logis.slip.dto.external.ExternalDispatchResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.external.ExternalCarrierRepository;
import com.samhanair.logis.slip.repository.external.ExternalDispatchRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 타배송사 발송 서비스. 슬3는 SMS 단방향 발송만 수행한다. */
@Service
@Transactional
@RequiredArgsConstructor
public class ExternalDispatchService {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private final ExternalCarrierRepository externalCarrierRepository;
    private final ExternalDispatchRepository externalDispatchRepository;
    private final SlipRepository slipRepository;
    private final ExternalDispatchSmsComposer smsComposer;
    private final NotificationClient notificationClient;

    /**
     * 선택 전표를 외부기사/배송사에게 SMS 로 발송한다.
     *
     * <p>성공 시 전표는 DISPATCHED 로 종료한다. 실패 시 external_dispatch FAILED 이력만 보존하고
     * 전표 dispatchStatus 는 UNDISPATCHED 로 남겨 재시도할 수 있게 한다.
     */
    public ExternalDispatchResponse dispatchBySms(CreateExternalDispatchRequest req, UUID sentBy) {
        if (req.channel() != ExternalDispatchChannel.SMS) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "슬3 타배송사 발송은 SMS 채널만 지원합니다.");
        }

        ExternalCarrier carrier = loadActiveCarrier(req.carrierId());
        List<Slip> slips = loadAndValidateSlips(req.slipIds());
        LocalDate dispatchDate = LocalDate.now(SEOUL);

        ExternalDispatch dispatch = ExternalDispatch.create(
                carrier.getId(), ExternalDispatchChannel.SMS, dispatchDate, sentBy);
        for (int i = 0; i < slips.size(); i++) {
            dispatch.addSlip(slips.get(i).getId(), i + 1);
        }

        String subject = "[배차의뢰] " + carrier.getName() + " " + dispatchDate;
        String body = smsComposer.compose(carrier.getName(), dispatchDate, slips);
        boolean sent = notificationClient.sendExternalSmsWithResult(carrier.getPhone(), subject, body);

        if (sent) {
            slips.forEach(Slip::markDispatchedExternally);
            dispatch.markSent(LocalDateTime.now(SEOUL));
        } else {
            dispatch.markFailed();
        }

        // SMS 는 외부 side effect 라 완전 원자화할 수 없으므로, 성공/실패 판정 이후 DB 상태 전이를
        // 즉시 flush 해 FK/상태 SQL 예외가 HTTP 응답 이후에 늦게 드러나는 창을 줄인다.
        ExternalDispatch saved = externalDispatchRepository.saveAndFlush(dispatch);
        List<String> slipNos = slips.stream().map(Slip::getSlipNo).toList();
        return ExternalDispatchResponse.from(saved, carrier.getName(), slipNos);
    }

    private ExternalCarrier loadActiveCarrier(UUID carrierId) {
        ExternalCarrier carrier = externalCarrierRepository.findById(carrierId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "외부기사/배송사를 찾을 수 없습니다."));
        if (!carrier.isActive()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "비활성 외부기사/배송사에는 발송할 수 없습니다: " + carrier.getName());
        }
        if (carrier.getPhone() == null || carrier.getPhone().isBlank()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "외부기사/배송사 전화번호가 없어 SMS 를 발송할 수 없습니다: " + carrier.getName());
        }
        return carrier;
    }

    private List<Slip> loadAndValidateSlips(List<UUID> slipIds) {
        List<UUID> distinctIds = slipIds.stream().distinct().toList();
        List<Slip> loaded = slipRepository.findAllByIdInAndIsDeletedFalseForExternalDispatchUpdate(distinctIds);
        if (loaded.size() != distinctIds.size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "발송 대상 전표 중 찾을 수 없는 전표가 있습니다.");
        }
        Map<UUID, Slip> byId = loaded.stream().collect(Collectors.toMap(Slip::getId, Function.identity()));
        List<Slip> ordered = distinctIds.stream().map(byId::get).toList();
        ordered.forEach(this::validateDispatchReady);
        return ordered;
    }

    private void validateDispatchReady(Slip slip) {
        if (slip.getSlipType() != SlipType.OUTBOUND
                || slip.getStatus() != SlipStatus.COMPLETED
                || slip.getInspectorUserId() == null
                || slip.getInspectorSignedAt() == null
                || slip.getDispatchStatus() != SlipDispatchStatus.UNDISPATCHED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "검수 완료 및 미배차 상태의 출고전표만 타배송사 SMS 발송할 수 있습니다: "
                            + slip.getSlipNo());
        }
    }
}
