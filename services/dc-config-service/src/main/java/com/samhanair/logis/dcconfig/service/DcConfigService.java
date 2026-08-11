package com.samhanair.logis.dcconfig.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.dcconfig.domain.DcConfig;
import com.samhanair.logis.dcconfig.domain.DcConfigSource;
import com.samhanair.logis.dcconfig.domain.Partner;
import com.samhanair.logis.dcconfig.audit.service.DcConfigAuditLogService;
import com.samhanair.logis.dcconfig.dto.PartnerDcConfigResponse;
import com.samhanair.logis.dcconfig.dto.UpdatePartnerDcConfigRequest;
import com.samhanair.logis.dcconfig.repository.DcConfigRepository;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래처별 DC 설정 조회.
 *
 * <p>DC 노출 5겹 가드: 본 서비스의 응답은 internal controller 만 사용해야 한다.
 * Public controller 가 본 서비스를 의존성 주입받지 않도록 BE 책임.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DcConfigService {

    private final DcConfigRepository dcConfigRepository;
    private final PartnerService partnerService;
    private final DcConfigAuditLogService dcConfigAuditLogService;

    private static final UUID SYSTEM_ACTOR_ID = new UUID(0L, 0L);

    /**
     * partnerCode 로 DC 설정 조회. 미설정 거래처는 빈 Optional 반환 (404 X — 0% DC 로 처리).
     */
    public Optional<DcConfig> findByPartnerCode(String partnerCode) {
        return dcConfigRepository.findByPartner_PartnerCode(partnerCode);
    }

    /**
     * 전체 DC 설정 벌크 조회 — #31 estimate-app prefetch (legacy getAllNotionDcConfigs_ 대체).
     *
     * <p>거래처별 DC리스트는 수백 행 규모(2026-06 기준 227행)라 비페이징 전량 반환.
     * partner fetch join 으로 N+1 없이 partnerCode 동반.
     */
    public java.util.List<DcConfig> listAll() {
        return dcConfigRepository.findAllWithPartner();
    }

    /**
     * partnerCode 로 DC 설정 강제 조회 (없으면 404).
     */
    public DcConfig getByPartnerCode(String partnerCode) {
        return dcConfigRepository.findWithPartnerByPartnerCode(partnerCode)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "DC 설정을 찾을 수 없습니다: " + partnerCode));
    }

    /**
     * Partner 보장 후 DC 설정 조회. (Partner 자체가 미존재면 404, DC 설정만 미존재는 빈 Optional)
     */
    public PartnerWithDc resolveByPartnerCode(String partnerCode) {
        Partner partner = partnerService.getByPartnerCode(partnerCode);
        return new PartnerWithDc(partner,
                dcConfigRepository.findByPartner_Id(partner.getId()).orElse(null));
    }

    /**
     * bizNo 로 Partner 보장 후 DC 설정 조회 — 3d partner-auth-service 로그인 RPC.
     *
     * <p>partnerCode resolver 와 동일 의미 (Partner 미존재 404, DC 미설정은 dcConfig=null).
     */
    public PartnerWithDc resolveByBizNo(String bizNo) {
        Partner partner = partnerService.getByBizNo(bizNo);
        return new PartnerWithDc(partner,
                dcConfigRepository.findByPartner_Id(partner.getId()).orElse(null));
    }

    /**
     * 4b — partnerCode 의 DC 설정을 인라인 PATCH. 외부 표시 문자열 입력값을 내부 도메인 값으로
     * 파싱한 뒤 {@link DcConfig} 의 change* 메서드를 호출한다.
     *
     * <p>요청 필드가 null/blank 면 해당 컬럼 변경 없음 (PATCH 시맨틱).
     *
     * <p>DC 설정이 미존재 시 자동으로 신규 생성 (source={@link DcConfigSource#ADMIN_EDIT}).
     *
     * @throws BusinessException NOT_FOUND — Partner 자체가 미존재
     * @throws BusinessException BAD_REQUEST — 파싱 실패 (잘못된 % / KRW 형식)
     */
    @Transactional
    public DcConfig updatePartnerDcConfig(String partnerCode, UpdatePartnerDcConfigRequest req) {
        return updatePartnerDcConfig(partnerCode, req, SYSTEM_ACTOR_ID, "system");
    }

    /** PATCH 변경을 실제 diff로 기록한 뒤 응답하는 외부 거래처 DC 수정 경로. */
    @Transactional
    public DcConfig updatePartnerDcConfig(String partnerCode, UpdatePartnerDcConfigRequest req,
                                          UUID actorId, String actorName) {
        Partner partner = partnerService.getByPartnerCode(partnerCode);
        DcConfig dc = dcConfigRepository.findByPartner_Id(partner.getId())
                .orElseGet(() -> dcConfigRepository.save(DcConfig.create(partner, DcConfigSource.ADMIN_EDIT)));
        PartnerDcConfigResponse before = PartnerDcConfigResponse.from(dc);

        BigDecimal homeRate = parsePercent(req.homeMultiDc());
        BigDecimal commercialRate = parsePercent(req.commercialMultiDc());
        if (homeRate != null || commercialRate != null) {
            dc.changeRates(
                    homeRate != null ? homeRate : dc.getHomeDiscountRate(),
                    commercialRate != null ? commercialRate : dc.getCommercialDiscountRate());
        }

        Boolean iHose = parseYesNo(req.flexibleHoseTypeI());
        if (iHose != null) {
            dc.changeShowIHose(iHose);
        }

        BigDecimal d360 = parseWon(req.threeSixty());
        BigDecimal d4way = parseWon(req.fourWay());
        BigDecimal d1way = parseWon(req.oneWay());
        BigDecimal stand = parseWon(req.stand());
        BigDecimal deluxe = parseWon(req.deluxe());
        BigDecimal firstGrade = parseWon(req.firstGrade());
        if (d360 != null || d4way != null || d1way != null
                || stand != null || deluxe != null || firstGrade != null) {
            dc.changeOptionAmounts(
                    d360 != null ? d360 : dc.getDiscount360Amount(),
                    d4way != null ? d4way : dc.getDiscount4WayAmount(),
                    d1way != null ? d1way : dc.getDiscount1WayAmount(),
                    stand != null ? stand : dc.getDiscountStandAmount(),
                    deluxe != null ? deluxe : dc.getDiscountDeluxeAmount(),
                    firstGrade != null ? firstGrade : dc.getDiscountFirstGradeAmount());
        }

        Boolean unitProc = parseYesNo(req.unitProcess());
        if (unitProc != null) {
            dc.changeUnitProcessingEnabled(unitProc);
        }

        if (req.remark() != null) {
            dc.changeNote(req.remark().isBlank() ? null : req.remark());
        }

        PartnerDcConfigResponse after = PartnerDcConfigResponse.from(dc);
        List<ChangeEntry> changes = new ArrayList<>();
        addChange(changes, "homeMultiDc", before.homeMultiDc(), after.homeMultiDc());
        addChange(changes, "commercialMultiDc", before.commercialMultiDc(), after.commercialMultiDc());
        addChange(changes, "flexibleHoseTypeI", before.flexibleHoseTypeI(), after.flexibleHoseTypeI());
        addChange(changes, "threeSixty", before.threeSixty(), after.threeSixty());
        addChange(changes, "fourWay", before.fourWay(), after.fourWay());
        addChange(changes, "oneWay", before.oneWay(), after.oneWay());
        addChange(changes, "stand", before.stand(), after.stand());
        addChange(changes, "deluxe", before.deluxe(), after.deluxe());
        addChange(changes, "firstGrade", before.firstGrade(), after.firstGrade());
        addChange(changes, "unitProcess", before.unitProcess(), after.unitProcess());
        addChange(changes, "remark", before.remark(), after.remark());
        if (!changes.isEmpty()) {
            dcConfigAuditLogService.recordBatch(dc.getId(),
                    actorId == null ? SYSTEM_ACTOR_ID : actorId,
                    actorName == null || actorName.isBlank() ? "system" : actorName,
                    null, changes);
        }
        return dc;
    }

    private static void addChange(List<ChangeEntry> changes, String fieldName,
                                  String oldValue, String newValue) {
        if (!Objects.equals(oldValue, newValue)) {
            changes.add(new ChangeEntry(fieldName, oldValue, newValue));
        }
    }

    /** "46%" → BigDecimal("0.46"). null/blank → null. 파싱 실패 → BAD_REQUEST. */
    private BigDecimal parsePercent(String raw) {
        if (raw == null || raw.isBlank() || "—".equals(raw)) return null;
        String digits = raw.replace("%", "").replace(",", "").trim();
        try {
            BigDecimal pct = new BigDecimal(digits);
            return pct.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "DC율 형식 오류: " + raw);
        }
    }

    /** "₩70,000" → BigDecimal(70000). null/blank → null. 파싱 실패 → BAD_REQUEST. */
    private BigDecimal parseWon(String raw) {
        if (raw == null || raw.isBlank() || "—".equals(raw)) return null;
        String digits = raw.replace("₩", "").replace(",", "").trim();
        try {
            return new BigDecimal(digits);
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "금액 형식 오류: " + raw);
        }
    }

    /** "Yes"/"No" (case-insensitive) → Boolean. null/blank/기타 → null. */
    private Boolean parseYesNo(String raw) {
        if (raw == null || raw.isBlank() || "—".equals(raw)) return null;
        String s = raw.trim();
        if (s.equalsIgnoreCase("Yes") || s.equalsIgnoreCase("Y") || s.equalsIgnoreCase("true")) {
            return Boolean.TRUE;
        }
        if (s.equalsIgnoreCase("No") || s.equalsIgnoreCase("N") || s.equalsIgnoreCase("false")) {
            return Boolean.FALSE;
        }
        return null;
    }

    /** Partner + (nullable) DcConfig 페어 — internal RPC 응답 빌드용. */
    public record PartnerWithDc(Partner partner, DcConfig dcConfig) {}
}
