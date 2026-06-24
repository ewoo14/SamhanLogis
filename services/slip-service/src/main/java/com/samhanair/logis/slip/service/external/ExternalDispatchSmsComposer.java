package com.samhanair.logis.slip.service.external;

import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipLine;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Component;

/** 타배송사 기사에게 보낼 배차의뢰 SMS 본문을 생성한다. */
@Component
public class ExternalDispatchSmsComposer {

    private static final int MAX_BODY_LENGTH = 2000;
    private static final String ELLIPSIS = "…";

    /**
     * 기사별 1건 SMS 본문을 생성한다.
     *
     * <p>본문은 배송사명/일자 머리말과 전표별 1줄로 구성한다. 품목은 대표 모델명과 총수량만
     * 표시해 라인 전체 나열을 피하고, 2000자를 넘으면 남은 전표 수를 "…외 M건" 으로 축약한다.
     */
    public String compose(String carrierName, LocalDate dispatchDate, List<Slip> slips) {
        String header = "[배차의뢰] " + safeText(carrierName, "타배송사") + " " + dispatchDate;
        StringBuilder body = new StringBuilder(header);
        List<Slip> safeSlips = slips == null ? List.of() : slips;
        for (int i = 0; i < safeSlips.size(); i++) {
            String line = "\n" + composeSlipLine(safeSlips.get(i));
            int remaining = safeSlips.size() - i;
            if (body.length() + line.length() > MAX_BODY_LENGTH) {
                appendRemainder(body, remaining);
                break;
            }
            body.append(line);
        }
        if (body.length() > MAX_BODY_LENGTH) {
            return body.substring(0, MAX_BODY_LENGTH);
        }
        return body.toString();
    }

    private static String composeSlipLine(Slip slip) {
        int lineCount = slip.getLines() == null ? 0 : slip.getLines().size();
        String suffix = lineCount > 1 ? " 외 " + (lineCount - 1) + "건" : "";
        return safeText(slip.getSlipNo(), "전표번호없음")
                + " "
                + safeText(slip.getDeliveryAddress(), safeText(slip.getDestinationWarehouseName(), "배송지미지정"))
                + " "
                + summarizeItems(slip.getLines())
                + suffix;
    }

    private static String summarizeItems(List<SlipLine> lines) {
        if (lines == null || lines.isEmpty()) {
            return "품목미지정";
        }
        SlipLine first = lines.get(0);
        String model = safeText(first.getModelName(), safeText(first.getProductName(), "품목미지정"));
        int totalQuantity = lines.stream().mapToInt(SlipLine::getQuantity).sum();
        return model + " " + totalQuantity + "대";
    }

    private static void appendRemainder(StringBuilder body, int remaining) {
        String marker = "\n" + ELLIPSIS + "외 " + remaining + "건";
        if (body.length() + marker.length() <= MAX_BODY_LENGTH) {
            body.append(marker);
            return;
        }
        int keep = Math.max(0, MAX_BODY_LENGTH - marker.length());
        body.setLength(keep);
        body.append(marker);
    }

    private static String safeText(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
