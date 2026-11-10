package com.photowall;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;

class LocationSearchTest {
    private final LocationSearch locations = new LocationSearch();
    LocationSearchTest() throws Exception {}

    @Test
    void sameNamedDistrictsKeepTheirCityContextAndDifferentCoordinates() {
        var result = locations.search("西湖区");
        var hangzhou = result.stream().filter(place -> place.label().contains("杭州") && place.name().equals("西湖区")).findFirst().orElseThrow();
        var nanchang = result.stream().filter(place -> place.label().contains("南昌") && place.name().equals("西湖区")).findFirst().orElseThrow();
        assertThat(hangzhou.level()).isEqualTo("district");
        assertThat(hangzhou.label()).contains("浙江");
        assertThat(nanchang.label()).contains("江西");
        assertThat(hangzhou.latitude()).isBetween(30.0, 30.5);
        assertThat(hangzhou.longitude()).isBetween(119.8, 120.4);
        assertThat(nanchang.latitude()).isBetween(28.0, 29.0);
        assertThat(hangzhou.id()).isNotEqualTo(nanchang.id());
    }

    @Test
    void qualifiedQueriesAndPinyinFindTheCorrectDistrict() {
        var result = locations.search("浙江 杭州 西湖");
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().label()).contains("浙江", "杭州", "西湖区");
        assertThat(locations.search("杭州西湖区")).extracting(LocationSearch.Location::id).contains(result.getFirst().id());
        assertThat(locations.search("xihu")).extracting(LocationSearch.Location::id).contains(result.getFirst().id());
        assertThat(locations.search("北京 朝阳")).allMatch(place -> place.label().contains("北京"));
    }

    @Test
    void legacyInternationalCityNamesAndNormalCitiesStillWork() {
        assertThat(locations.search("东京")).anyMatch(place -> place.country().equals("日本") && place.latitude() > 35);
        assertThat(locations.search("巴黎")).anyMatch(place -> place.country().equals("法国"));
        assertThat(locations.search("杭州").getFirst().name()).isEqualTo("杭州市");
    }

    @Test
    void emptyUnknownAndOverlongQueriesDoNotReturnUnboundedData() {
        assertThat(locations.search(" ")).isEmpty();
        assertThat(locations.search("不存在的测试地点XYZ")).isEmpty();
        assertThat(locations.search("x".repeat(81))).isEmpty();
        assertThat(locations.search("浙江")).hasSizeLessThanOrEqualTo(20);
    }
}
