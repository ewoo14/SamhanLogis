package com.samhanair.logis.notification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.samhanair.logis.notification.client.BlockedPartnerLookupClient;
import com.samhanair.logis.notification.domain.DispatchSmsProgramType;
import com.samhanair.logis.notification.domain.DispatchSmsSaveMode;
import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.NotificationStatus;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.service.NotificationService.SendResult;
import com.samhanair.logis.notification.dto.DispatchBatchSendRequest;
import com.samhanair.logis.notification.dto.DispatchBatchSendRequest.SendEntry;
import com.samhanair.logis.notification.dto.DispatchBatchSendResponse;
import com.samhanair.logis.notification.dto.DispatchBatchSendResponse.SendResultDetail;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.web.dto.DispatchSmsSaveHistoryRequest;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 배차안내 SMS 실 발송 서비스 — PR-E1 BE-4 (Samhan Public 이식).
 *
 * <p>preview 단계에서 운영자가 메시지를 검토 / 수정한 뒤 본 endpoint 를 호출. 단톡방 매핑은 이미
 * preview 시 적용되어 (partnerCode, message, recipientPhone) 쌍이 요청에 포함됨.
 *
 * <p>처리 흐름:
 * <ol>
 *   <li>각 entry → BLOCKED 거래처 가드 재확인 (preview 와 send 사이 시점차).</li>
 *   <li>blocked 미해당 → {@link NotificationService#send} 위임 (NotificationRequest entity 저장 +
 *       SmsAdapter 호출 + 결과 누적).</li>
 *   <li>blocked 해당 → 발송 skip + blocked 카운트 증가.</li>
 *   <li>SP-09-2 — 발송 완료 후 {@code dispatch_sms_save_history} 에 {@code SEND_AUDIT} row 자동 저장
 *       (성공/실패 건수 + 감사용 raw 결과 JSON 포함). 저장 실패는 발송 결과에 영향 없이 warn 로그만.</li>
 *   <li>응답 = sent / failed / blocked 카운트 + 상세 결과.</li>
 * </ol>
 *
 * <p>채널 = SMS, recipientType = EXTERNAL_PHONE (단톡방 운영자 / 거래처 담당자 외부 번호).
 *
 * <p>장애 격리 — 1건 실패가 전체 배치를 중단하지 않도록 entry 단위 try/catch (failed 누적).
 *
 * <p>UUID 비공개 가드 — 본 서비스는 UUID 미사용 (partnerCode + recipientPhone 만).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DispatchBatchSendService {

    private final BlockedPartnerLookupClient blockedPartnerLookupClient;
    private final NotificationService notificationService;
    private final DispatchSmsSaveHistoryService dispatchSmsSaveHistoryService;
    private final ObjectMapper objectMapper;

    /**
     * 실 발송 — entry N건 일괄 처리.
     *
     * <p>SP-09-2: 발송 완료 후 {@code dispatch_sms_save_history} 에 {@code SEND_AUDIT} row 를 자동 저장한다.
     * 감사 저장 실패는 발송 결과에 영향 없이 warn 로그만 기록한다.
     *
     * @param req 입력 (date + entries N건)
     * @param requestedBy 요청 사용자 ID (감사 저장 audit 용)
     * @return 결과 카운트 (sent / failed / blocked) + 상세
     */
    @Transactional
    public DispatchBatchSendResponse send(DispatchBatchSendRequest req, String requestedBy) {
        if (req == null || req.date() == null || req.entries() == null) {
            throw new IllegalArgumentException("date / entries 필수");
        }

        int sent = 0;
        int failed = 0;
        int blocked = 0;
        List<SendResultDetail> details = new ArrayList<>(req.entries().size());

        for (SendEntry entry : req.entries()) {
            String partnerCode = entry.partnerCode();
            String phone = entry.recipientPhone();

            // 현재 저장소에는 단톡방 API/어댑터가 없다. 단톡방 이름을 Aligo 전화번호로
            // 해석하면 오발송이므로 SMS 경로에 절대 진입시키지 않는다.
            if (phone != null && phone.startsWith("room:")) {
                failed++;
                details.add(new SendResultDetail(partnerCode, phone, "FAILED",
                        "단톡방 직접 전송 수단이 없어 외부 단톡방에 수동 전달해야 합니다."));
                continue;
            }

            // (1) BLOCKED 가드 (preview 이후 신규 차단 가능성 회피)
            boolean isBlocked = false;
            try {
                isBlocked = blockedPartnerLookupClient.isBlocked(partnerCode);
            } catch (Exception ex) {
                log.warn("DispatchBatchSendService — blocked lookup 실패 partnerCode={}, msg={}",
                        partnerCode, ex.getMessage());
                isBlocked = true;
            }
            if (isBlocked) {
                blocked++;
                details.add(new SendResultDetail(partnerCode, phone, "BLOCKED",
                        "발송금지 거래처 — 자동 제외"));
                continue;
            }

            // (2) SMS 발송 위임 (NotificationService → SmsAdapter)
            try {
                NotificationSendRequest payload = new NotificationSendRequest(
                        RecipientType.EXTERNAL_PHONE,
                        null,
                        phone,
                        NotificationChannel.SMS,
                        "DISPATCH_BATCH",
                        null,
                        entry.message(),
                        null);
                // SP-09-2: gateway result (msg_id / raw) 를 SEND_AUDIT detail 에 연결하기 위해 sendWithGatewayResult 사용
                SendResult sendResult = notificationService.sendWithGatewayResult(payload);
                NotificationRequest result = sendResult.notificationRequest();
                NotificationGatewayResult gwResult = sendResult.gatewayResult();
                if (NotificationStatus.SENT == result.getStatus()) {
                    sent++;
                    details.add(new SendResultDetail(partnerCode, phone, "SENT", null,
                            gwResult.messageId(), gwResult.rawResponse()));
                } else {
                    failed++;
                    details.add(new SendResultDetail(partnerCode, phone, "FAILED",
                            "게이트웨이 응답 status=" + result.getStatus().getDisplayName(),
                            null, gwResult.rawResponse()));
                }
            } catch (Exception ex) {
                failed++;
                log.warn("DispatchBatchSendService — entry 발송 실패 partnerCode={}, phone={}, msg={}",
                        partnerCode, phone, ex.getMessage());
                details.add(new SendResultDetail(partnerCode, phone, "FAILED", ex.getMessage()));
            }
        }

        log.info("DispatchBatchSendService — date={}, sent={}, failed={}, blocked={}",
                req.date(), sent, failed, blocked);

        DispatchBatchSendResponse response =
                new DispatchBatchSendResponse(req.date(), sent, failed, blocked, details);

        // (3) SP-09-2 — 발송 결과를 SEND_AUDIT row 로 자동 저장 (fail-soft)
        saveSendAudit(req, response, requestedBy);

        return response;
    }

    /**
     * SP-09-2 — 발송 완료 후 {@code dispatch_sms_save_history} 에 {@code SEND_AUDIT} row 자동 저장.
     *
     * <p>저장 실패는 발송 결과에 영향 없이 warn 로그만 기록한다 (fail-soft).
     * topic 은 "{@code date} 배차안내 발송 감사" 형식으로 자동 생성.
     *
     * @param req 원본 발송 요청 (감사용 requestParams 구성)
     * @param response 발송 결과 (감사용 responsePayload 구성)
     * @param requestedBy 요청 사용자 ID
     */
    private void saveSendAudit(DispatchBatchSendRequest req,
                                DispatchBatchSendResponse response,
                                String requestedBy) {
        try {
            // requestParams: date + rowCount + 집계 카운트 (FE extractCounts 호환 — H-FE-01 fix)
            ObjectNode requestParams = objectMapper.createObjectNode();
            requestParams.put("date", req.date().toString());
            requestParams.put("rowCount", req.entries().size());
            requestParams.put("sent", response.sent());
            requestParams.put("failed", response.failed());
            requestParams.put("blocked", response.blocked());

            // responsePayload: sent / failed / blocked + details 배열 + per-entry msgId/gatewayRaw
            ObjectNode responsePayload = objectMapper.createObjectNode();
            responsePayload.put("date", req.date().toString());
            responsePayload.put("sent", response.sent());
            responsePayload.put("failed", response.failed());
            responsePayload.put("blocked", response.blocked());
            ArrayNode detailsNode = responsePayload.putArray("details");
            for (SendResultDetail detail : response.details()) {
                ObjectNode d = objectMapper.createObjectNode();
                d.put("partnerCode", detail.partnerCode());
                d.put("recipientPhone", detail.recipientPhone());
                d.put("status", detail.status());
                if (detail.reason() != null) {
                    d.put("reason", detail.reason());
                }
                // SP-09-2: Aligo msg_id + raw gateway 결과 per-entry 저장 (운영 추적 — Codex HIGH fix)
                if (detail.msgId() != null) {
                    d.put("msgId", detail.msgId());
                }
                if (detail.gatewayRaw() != null) {
                    d.put("gatewayRaw", detail.gatewayRaw());
                }
                detailsNode.add(d);
            }

            String topic = req.date() + " 배차안내 발송 감사";
            DispatchSmsSaveHistoryRequest auditRequest = new DispatchSmsSaveHistoryRequest(
                    DispatchSmsProgramType.DISPATCH_SMS,
                    DispatchSmsSaveMode.SEND_AUDIT,
                    topic,
                    requestParams,
                    responsePayload);

            dispatchSmsSaveHistoryService.save(auditRequest, requestedBy);
            log.info("DispatchBatchSendService — SEND_AUDIT 저장 완료 date={} user={}", req.date(), requestedBy);
        } catch (Exception ex) {
            log.warn("DispatchBatchSendService — SEND_AUDIT 저장 실패 (발송 결과 영향 없음) date={} msg={}",
                    req.date(), ex.getMessage());
        }
    }
}
