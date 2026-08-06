package com.samhanair.logis.notification.service;

import com.samhanair.logis.notification.client.OutboundSlipDto;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * 배차안내 SMS 메시지 템플릿 조립 서비스 (PR-E1 BE-4 — Samhan Public 이식).
 *
 * <p>legacy GAS 8번 (배차안내문자) 의 메시지 양식 이식:
 * <pre>
 *   [배차안내]
 *   거래처: {partnerName}
 *   시간: {scheduledAt 시각, 미지정 시 "시간 미정"}
 *   주소: {deliveryAddress, 80자 초과 시 truncate + "..."}
 *   품목:
 *     - {productName} {quantity}개
 *     - ...
 * </pre>
 *
 * <p>SMS 본문 길이 가드 — 한글 SMS 90byte / LMS 2000byte. 본 템플릿은 LMS 발송 전제로 truncate
 * 정책 운용 (주소 80자 truncate, 품목 100건 cap). 채널별 분기는 각 알림 소비자가 결정한다.
 *
 * <p>UUID 비공개 가드 — 본 템플릿은 partnerName / partnerCode (사용자 노출 식별자) 만 사용, UUID 무.
 */
@Service
public class MessageTemplateService {

    /** 시간 포맷 — 한국 SMS 관행 ("HH:mm" 24h). */
    static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    /** 주소 truncate 임계 — 80자 초과 시 "..." 부착. */
    static final int ADDRESS_MAX_LENGTH = 80;

    /** 품목 cap — 한 메시지에 100건 초과 시 잘림 표시. */
    static final int LINES_CAP = 100;

    /**
     * 출고전표 1건을 배차안내 SMS 본문 1건으로 조립.
     *
     * @param slip 출고전표 view
     * @return 한국어 안내 본문 (최대 2000byte 권장)
     */
    public String renderDispatchMessage(OutboundSlipDto slip) {
        if (slip == null) {
            throw new IllegalArgumentException("slip 필수");
        }
        StringBuilder sb = new StringBuilder(512);
        sb.append("[배차안내]\n");
        sb.append("거래처: ").append(safe(slip.partnerName())).append('\n');
        sb.append("시간: ").append(formatTime(slip)).append('\n');
        sb.append("주소: ").append(truncateAddress(slip.deliveryAddress())).append('\n');
        sb.append("품목:\n");
        sb.append(formatLines(slip.lines()));
        return sb.toString();
    }

    /** 시간 포맷 — scheduledAt 이 null 이면 "시간 미정", 아니면 "HH:mm". */
    private String formatTime(OutboundSlipDto slip) {
        if (slip.scheduledAt() == null) {
            return "시간 미정";
        }
        return TIME_FORMAT.format(slip.scheduledAt());
    }

    /** 주소 truncate — 80자 초과 시 "..." 부착, null/blank 시 "주소 미입력". */
    private String truncateAddress(String address) {
        if (address == null || address.isBlank()) {
            return "주소 미입력";
        }
        String trimmed = address.trim();
        if (trimmed.length() <= ADDRESS_MAX_LENGTH) {
            return trimmed;
        }
        return trimmed.substring(0, ADDRESS_MAX_LENGTH) + "...";
    }

    /** 품목 라인 — null/empty 시 "품목 없음", 100건 초과 시 cap + 잘림 표시. */
    private String formatLines(List<OutboundSlipDto.OutboundSlipLineDto> lines) {
        if (lines == null || lines.isEmpty()) {
            return "  - 품목 없음\n";
        }
        boolean truncated = lines.size() > LINES_CAP;
        List<OutboundSlipDto.OutboundSlipLineDto> limited =
                truncated ? lines.subList(0, LINES_CAP) : lines;
        String body = limited.stream()
                .map(line -> "  - " + safe(line.productName()) + " " + line.quantity() + "개")
                .collect(Collectors.joining("\n"));
        if (truncated) {
            body = body + "\n  ... (이하 " + (lines.size() - LINES_CAP) + "건 생략)";
        }
        return body + "\n";
    }

    /** null → 빈 문자열, 그 외 trim. */
    private String safe(String s) {
        return s == null ? "" : s.trim();
    }
}
