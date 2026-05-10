package com.samhanair.logis.accounting.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 공급자 (우리 회사) 정보 — 세금계산서 인쇄용 (P0-4).
 *
 * <p>application.yml {@code app.company.*} 에서 바인딩.
 * 환경변수 {@code SAMHAN_COMPANY_*} 로 운영 환경 주입 가능.
 */
@Component
@ConfigurationProperties(prefix = "app.company")
public class CompanyProperties {

    /** 회사명. */
    private String name;

    /** 사업자등록번호. */
    private String businessNumber;

    /** 대표자. */
    private String ceo;

    /** 주소. */
    private String address;

    /** 업태. */
    private String businessType;

    /** 종목. */
    private String businessItem;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getBusinessNumber() { return businessNumber; }
    public void setBusinessNumber(String businessNumber) { this.businessNumber = businessNumber; }

    public String getCeo() { return ceo; }
    public void setCeo(String ceo) { this.ceo = ceo; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getBusinessType() { return businessType; }
    public void setBusinessType(String businessType) { this.businessType = businessType; }

    public String getBusinessItem() { return businessItem; }
    public void setBusinessItem(String businessItem) { this.businessItem = businessItem; }
}
