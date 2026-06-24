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
import com.samhanair.logis.slip.domain.external.ExternalDispatchSlip;
import com.samhanair.logis.slip.dto.external.CreateExternalDispatchRequest;
import com.samhanair.logis.slip.dto.external.ExternalDispatchPrintDataResponse;
import com.samhanair.logis.slip.dto.external.ExternalDispatchResponse;
import com.samhanair.logis.slip.repository.SlipRepository;
import com.samhanair.logis.slip.repository.external.ExternalCarrierRepository;
import com.samhanair.logis.slip.repository.external.ExternalDispatchRepository;
import com.samhanair.logis.slip.repository.external.ExternalDispatchSlipRepository;
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
    private final ExternalDispatchSlipRepository externalDispatchSlipRepository;
    private final SlipRepository slipRepository;
    private final ExternalDispatchSmsComposer smsComposer;
    private final NotificationClient notificationClient;

    /**
     * 선택 전표를 외부기사/배송사에게 지정 채널로 발송한다.
     *
     * <p>PRINT 는 출력물을 공식 발송 수단으로 보아 즉시 SENT 처리한다. SMS/BOTH 는 SMS 발송
     * 성공 시 전표를 DISPATCHED 로 종료하고, 실패 시 external_dispatch FAILED 이력만 보존해
     * 전표 dispatchStatus 를 UNDISPATCHED 로 남긴다.
     */
    public ExternalDispatchResponse dispatch(CreateExternalDispatchRequest req, UUID sentBy) {
        ExternalDispatchChannel channel = req.channel();
        if (!isSupportedChannel(channel)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "타배송사 발송 채널은 SMS, PRINT, BOTH 만 지원합니다.");
        }

        ExternalCarrier carrier = loadActiveCarrier(req.carrierId());
        List<Slip> slips = loadAndValidateSlips(req.slipIds());
        LocalDate dispatchDate = LocalDate.now(SEOUL);

        ExternalDispatch dispatch = ExternalDispatch.create(
                carrier.getId(), channel, dispatchDate, sentBy);
        for (int i = 0; i < slips.size(); i++) {
            dispatch.addSlip(slips.get(i).getId(), i + 1);
        }

        boolean sent = channel == ExternalDispatchChannel.PRINT || sendSms(carrier, dispatchDate, slips);

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

    /**
     * 선택 전표를 외부기사/배송사에게 SMS 로 발송한다.
     *
     * <p>슬3 호출부 호환용 위임 메서드다. 신규 호출부는 {@link #dispatch(CreateExternalDispatchRequest, UUID)} 를 사용한다.
     */
    public ExternalDispatchResponse dispatchBySms(CreateExternalDispatchRequest req, UUID sentBy) {
        return dispatch(req, sentBy);
    }

    /**
     * 배차의뢰서 인쇄 화면에 필요한 발송 이력 상세를 조회한다.
     *
     * <p>응답에는 UUID 를 포함하지 않고, 전표 상세는 한 번의 line fetch 로 읽어 N+1 을 피한다.
     */
    @Transactional(readOnly = true)
    public ExternalDispatchPrintDataResponse getPrintData(UUID externalDispatchId) {
        ExternalDispatch dispatch = externalDispatchRepository.findById(externalDispatchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "타배송사 발송 이력을 찾을 수 없습니다."));
        ExternalCarrier carrier = externalCarrierRepository.findById(dispatch.getCarrierId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "외부기사/배송사를 찾을 수 없습니다."));

        List<ExternalDispatchSlip> rows =
                externalDispatchSlipRepository.findPrintRowsByExternalDispatchId(dispatch.getId());
        List<UUID> slipIds = rows.stream().map(ExternalDispatchSlip::getSlipId).toList();
        Map<UUID, Slip> slipsById = slipRepository.findAllWithLinesByIdInAndIsDeletedFalse(slipIds).stream()
                .collect(Collectors.toMap(Slip::getId, Function.identity()));

        List<ExternalDispatchPrintDataResponse.PrintSlipLine> items = rows.stream()
                .map(row -> toPrintLine(row, slipsById.get(row.getSlipId())))
                .toList();

        return new ExternalDispatchPrintDataResponse(
                carrier.getName(),
                carrier.getPhone(),
                dispatch.getDispatchDate(),
                dispatch.getChannel(),
                items);
    }

    private boolean sendSms(ExternalCarrier carrier, LocalDate dispatchDate, List<Slip> slips) {
        validateCarrierPhone(carrier);
        String subject = "[배차의뢰] " + carrier.getName() + " " + dispatchDate;
        String body = smsComposer.compose(carrier.getName(), dispatchDate, slips);
        return notificationClient.sendExternalSmsWithResult(carrier.getPhone(), subject, body);
    }

    private boolean isSupportedChannel(ExternalDispatchChannel channel) {
        return channel == ExternalDispatchChannel.SMS
                || channel == ExternalDispatchChannel.PRINT
                || channel == ExternalDispatchChannel.BOTH;
    }

    private ExternalDispatchPrintDataResponse.PrintSlipLine toPrintLine(
            ExternalDispatchSlip row,
            Slip slip
    ) {
        if (slip == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "발송 이력에 포함된 전표를 찾을 수 없습니다.");
        }
        return new ExternalDispatchPrintDataResponse.PrintSlipLine(
                slip.getSlipNo(),
                safeText(slip.getDeliveryAddress(), safeText(slip.getShippingAddress(), "-")),
                safeText(slip.getSignerName(), safeText(slip.getPartnerName(), "-")),
                safeText(slip.getRecipientPhone(), safeText(slip.getReceiverPhone(), "-")),
                smsComposer.summarizeItems(slip),
                row.getSequence());
    }

    private ExternalCarrier loadActiveCarrier(UUID carrierId) {
        ExternalCarrier carrier = externalCarrierRepository.findById(carrierId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "외부기사/배송사를 찾을 수 없습니다."));
        if (!carrier.isActive()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "비활성 외부기사/배송사에는 발송할 수 없습니다: " + carrier.getName());
        }
        return carrier;
    }

    private void validateCarrierPhone(ExternalCarrier carrier) {
        if (carrier.getPhone() == null || carrier.getPhone().isBlank()) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "외부기사/배송사 전화번호가 없어 SMS 를 발송할 수 없습니다: " + carrier.getName());
        }
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

    private static String safeText(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
