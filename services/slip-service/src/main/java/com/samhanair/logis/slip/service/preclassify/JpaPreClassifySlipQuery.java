package com.samhanair.logis.slip.service.preclassify;

import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** slip-service가 보유한 출고전표를 직접 조회하는 S2 원천 어댑터. */
@Component
@RequiredArgsConstructor
public class JpaPreClassifySlipQuery implements PreClassifySlipQuery {
    private final SlipRepository repository;
    @Override
    public List<PreClassifySlip> find(LocalDate from, LocalDate to) {
        return repository.findByPeriodWithLines(SlipType.OUTBOUND, from, to, null).stream()
                .map(s -> new PreClassifySlip(s.getSlipNo(), s.getPartnerCode(), s.getPartnerName(), s.getDeliveryAddress(),
                        s.getDeliveryTag() == null ? null : s.getDeliveryTag().name(), warehouseType(s.getSourceWarehouseCode())))
                .toList();
    }
    private String warehouseType(String code) {
        if ("2".equals(code)) return "SANGIL";
        if ("00003".equals(code)) return "CHOWOL";
        return "UNKNOWN";
    }
}
