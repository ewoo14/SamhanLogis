package com.samhanair.logis.slip.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Naver Clova OCR 영수증 파싱 client 구현체 (SP-09-3).
 *
 * <p>전송 방식 분기 우선순위:
 * <ol>
 *   <li>{@code submit(imageBytes, filename, submitMethod)} 파라미터가 null/blank 가 아닌 경우 파라미터 우선</li>
 *   <li>파라미터가 null/blank 이면 ENV {@code OCR_SUBMIT_METHOD} (기본값 {@code DRY_RUN}) fallback</li>
 * </ol>
 *
 * <ul>
 *   <li>{@code DRY_RUN} (기본) — 실 API 호출 없이 즉시 mock 응답 반환.
 *       가게명 "테스트마트", 총액 12345, 부가세 1234, 발행일 {@code LocalDate.now()}.</li>
 *   <li>{@code CLOVA} — Naver Clova OCR 실 API 호출 (Phase 11 sandbox 연동 예정).
 *       ENV {@code CLOVA_OCR_API_KEY} + {@code CLOVA_OCR_SECRET_KEY} +
 *       {@code CLOVA_OCR_INVOKE_URL} 필요.
 *       현 슬라이스는 placeholder runtime guard 만 — 실 API 호출은 OCR_SUBMIT_FAILED 로 surface.</li>
 * </ul>
 *
 * <p>IT 격리: {@code @MockBean ReceiptOcrClient} 로 격리 의무
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 *
 * <p>Clova API 자격증명은 운영 PC {@code .env} 또는 AWS SSM Parameter Store 에서 주입.
 * 코드 내 하드코딩 금지. placeholder 값 차단 대상:
 * {@code PLACEHOLDER_DEV_ONLY}, {@code CHANGE_ME_LOCAL_ONLY}, {@code changeme}, {@code dummy}
 * (대소문자 무시).
 */
@Component
public class ReceiptOcrClientImpl implements ReceiptOcrClient {

    private static final Logger log = LoggerFactory.getLogger(ReceiptOcrClientImpl.class);

    /** DRY_RUN mock 응답 — 가게명. */
    private static final String DRY_RUN_VENDOR = "테스트마트";
    /** DRY_RUN mock 응답 — 총 결제금액. */
    private static final BigDecimal DRY_RUN_TOTAL = new BigDecimal("12345");
    /** DRY_RUN mock 응답 — 부가세 금액. */
    private static final BigDecimal DRY_RUN_VAT = new BigDecimal("1234");

    /** 전송 방식 서버 기본값 — DRY_RUN | CLOVA. 기본값 DRY_RUN (Phase 11 이전). */
    @Value("${ocr.submit-method:DRY_RUN}")
    private String defaultSubmitMethod;

    /** Clova OCR API 키 — CLOVA 모드 전용. DRY_RUN 시 미사용. */
    @Value("${ocr.clova-api-key:}")
    private String clovaApiKey;

    /** Clova OCR Secret 키 — CLOVA 모드 전용. DRY_RUN 시 미사용. */
    @Value("${ocr.clova-secret-key:}")
    private String clovaSecretKey;

    /** Clova OCR Invoke URL — CLOVA 모드 전용. DRY_RUN 시 미사용. */
    @Value("${ocr.clova-invoke-url:}")
    private String clovaInvokeUrl;

    /**
     * 영수증 이미지를 OCR 로 파싱한다.
     *
     * <p>전송 방식 결정 순서: {@code submitMethod} 파라미터 우선, null/blank 이면 서버 property fallback.
     *
     * @param imageBytes   영수증 이미지 바이트 배열
     * @param filename     원본 파일명 (확장자 포함)
     * @param submitMethod 요청 전송 방식 ("DRY_RUN" | "CLOVA"). null/blank 이면 서버 property 사용.
     * @return OCR 파싱 결과
     * @throws BusinessException(OCR_SUBMIT_FAILED) CLOVA placeholder 키 차단 또는 API 오류 시
     */
    @Override
    public ReceiptOcrResult submit(byte[] imageBytes, String filename, String submitMethod) {
        String effectiveMethod = (submitMethod != null && !submitMethod.isBlank())
                ? submitMethod
                : defaultSubmitMethod;

        if ("DRY_RUN".equalsIgnoreCase(effectiveMethod)) {
            return submitDryRun(filename);
        } else if ("CLOVA".equalsIgnoreCase(effectiveMethod)) {
            return submitClova(imageBytes, filename);
        } else {
            log.warn("[SP-09-3] 알 수 없는 submit-method={} — DRY_RUN 으로 fallback", effectiveMethod);
            return submitDryRun(filename);
        }
    }

    /**
     * DRY_RUN 전송 — 즉시 mock 성공 반환.
     *
     * <p>반환값: 가게명 "테스트마트", 총액 12345, 부가세 1234, 발행일 today.
     *
     * @param filename 원본 파일명 (로그용)
     * @return DRY_RUN mock 성공 결과
     */
    private ReceiptOcrResult submitDryRun(String filename) {
        String rawJson = "{\"mode\":\"DRY_RUN\",\"filename\":\"" + filename + "\"}";
        log.info("[SP-09-3] DRY_RUN OCR — filename={}", filename);
        return ReceiptOcrResult.success(DRY_RUN_VENDOR, DRY_RUN_TOTAL, DRY_RUN_VAT,
                LocalDate.now(), rawJson);
    }

    /**
     * Clova OCR 실 API 전송 — Phase 11 sandbox + 운영 PC .env 에서 활성화.
     *
     * <p>런타임 guard (자격증명 검사):
     * <ul>
     *   <li>{@code clovaApiKey}, {@code clovaSecretKey}, {@code clovaInvokeUrl} 중 하나라도
     *       blank 이면 OCR_SUBMIT_FAILED</li>
     *   <li>알려진 placeholder 값이면 OCR_SUBMIT_FAILED — 3개 키 모두 동일 적용
     *       (대상: PLACEHOLDER_DEV_ONLY, CHANGE_ME_LOCAL_ONLY, changeme, dummy)</li>
     * </ul>
     *
     * <p>현 슬라이스는 구조만 준비 — 실 Clova API 호출은 Phase 11 구현.
     *
     * @param imageBytes 이미지 바이트 배열 (로그/구조용)
     * @param filename   파일명 (로그용)
     * @throws BusinessException(OCR_SUBMIT_FAILED) 자격증명 미설정·placeholder·API 미구현 시
     */
    private ReceiptOcrResult submitClova(byte[] imageBytes, String filename) {
        if (clovaApiKey == null || clovaApiKey.isBlank()) {
            throw new BusinessException(ErrorCode.OCR_SUBMIT_FAILED,
                    "CLOVA_OCR_API_KEY 미설정 — ocr.clova-api-key 환경변수를 확인하세요");
        }
        if (isPlaceholderKey(clovaApiKey)) {
            throw new BusinessException(ErrorCode.OCR_SUBMIT_FAILED,
                    "CLOVA_OCR_API_KEY 가 placeholder 입니다. 실 Clova API 키 설정 필요.");
        }
        if (clovaSecretKey == null || clovaSecretKey.isBlank()) {
            throw new BusinessException(ErrorCode.OCR_SUBMIT_FAILED,
                    "CLOVA_OCR_SECRET_KEY 미설정 — ocr.clova-secret-key 환경변수를 확인하세요");
        }
        if (isPlaceholderKey(clovaSecretKey)) {
            throw new BusinessException(ErrorCode.OCR_SUBMIT_FAILED,
                    "CLOVA_OCR_SECRET_KEY 가 placeholder 입니다. 실 Clova Secret 키 설정 필요.");
        }
        if (clovaInvokeUrl == null || clovaInvokeUrl.isBlank()) {
            throw new BusinessException(ErrorCode.OCR_SUBMIT_FAILED,
                    "CLOVA_OCR_INVOKE_URL 이 placeholder/빈 값 입니다. 실 sandbox URL 설정 필요.");
        }
        if (isPlaceholderKey(clovaInvokeUrl)) {
            throw new BusinessException(ErrorCode.OCR_SUBMIT_FAILED,
                    "CLOVA_OCR_INVOKE_URL 이 placeholder/빈 값 입니다. 실 sandbox URL 설정 필요.");
        }
        // TODO(Phase 11): RestClient 를 이용한 Naver Clova OCR 실 API 호출 구현.
        log.warn("[SP-09-3] CLOVA 실 API 호출 미구현 — Phase 11 sandbox 연동 예정. filename={}", filename);
        throw new BusinessException(ErrorCode.OCR_SUBMIT_FAILED,
                "Clova OCR 실 API 호출은 Phase 11 에서 구현 예정입니다.");
    }

    /**
     * 알려진 placeholder 키 판별 (대소문자 무시).
     *
     * <p>차단 대상: {@code placeholder_dev_only}, {@code change_me_local_only},
     * {@code changeme}, {@code dummy}.
     * 신규 placeholder 추가 시 이 메서드만 수정.
     *
     * @param key 검사할 API 키
     * @return placeholder 이면 true
     */
    private boolean isPlaceholderKey(String key) {
        String lower = key.toLowerCase(Locale.ROOT);
        return lower.equals("placeholder_dev_only")
                || lower.equals("change_me_local_only")
                || lower.equals("changeme")
                || lower.equals("dummy");
    }
}
