package com.samhanair.logis.common.ecount;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import org.springframework.web.multipart.MultipartFile;

/** 이카운트 import controller 공통 multipart 검증. */
public final class EcountImportFileValidator {

    private static final long MAX_SIZE_BYTES = 10L * 1024 * 1024;

    private EcountImportFileValidator() {
    }

    public static void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        String contentType = file.getContentType();
        if (contentType != null && !contentType.isBlank()
                && !contentType.equalsIgnoreCase("text/csv")
                && !contentType.equalsIgnoreCase("application/csv")
                && !contentType.equalsIgnoreCase("application/vnd.ms-excel")) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일만 업로드할 수 있습니다");
        }
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "파일 크기 한도 초과: " + file.getSize() + " > " + MAX_SIZE_BYTES);
        }
    }
}
