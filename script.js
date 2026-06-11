// 1. 기상청 원본 주소 (절대 건드리지 않음!)
const TARGET_URL = "https://apihub.kma.go.kr/api/typ02/openApi/AmmIwxxmService/getMetar?pageNo=1&numOfRows=10&dataType=XML&icao=RKSI&authKey=5qWRhPLNTlOlkYTyzV5Trw";

// 2. 완벽하게 특수기호를 변환(인코딩)해서 프록시에 전달하는 코드
const METAR_URL = "https://corsproxy.io/?" + encodeURIComponent(TARGET_URL);

document.addEventListener("DOMContentLoaded", fetchWeatherData);

async function fetchWeatherData() {
    try {
        const response = await fetch(METAR_URL);
        if (!response.ok) throw new Error("네트워크 응답 에러");

        const xmlText = await response.text();

        // 프록시를 뚫고 들어갔으나 기상청이 01 에러를 반환했는지 1차 검증
        if (xmlText.includes("<resultCode>01</resultCode>")) {
            throw new Error("기상청 서버 응답 거부 (01 APPLICATION_ERROR)");
        }

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // 3. 네임스페이스(iwxxm:)를 무시하고 안전하게 태그를 찾는 파싱 함수
        const getVal = (tag) => {
            const localName = tag.includes(':') ? tag.split(':')[1] : tag;
            // NS 검색을 먼저 시도하고, 실패하면 일반 검색 시도
            const element = xmlDoc.getElementsByTagNameNS("*", localName)[0] || xmlDoc.getElementsByTagName(tag)[0];
            return element ? element.textContent : null;
        };

        // 데이터 추출
        const temp = parseFloat(getVal("iwxxm:airTemperature") || "0");
        const dewPoint = parseFloat(getVal("iwxxm:dewpointTemperature") || "0");
        const windDir = getVal("iwxxm:meanWindDirection") || "0";
        const windSpeed = parseFloat(getVal("iwxxm:meanWindSpeed") || "0");
        const visMeters = parseFloat(getVal("iwxxm:prevailingVisibility") || "0");
        const ceilingFt = getVal("iwxxm:height");
        const rawMetar = getVal("iwxxm:report"); // METAR 원문

        // 데이터 계산
        const humidity = calculateHumidity(temp, dewPoint);
        const safeHumidity = Math.max(0, Math.min(100, humidity)); 
        const feelsLike = calculateSummerFeelsLike(temp, safeHumidity);

        // UI 업데이트
        document.getElementById("temp").textContent = temp.toFixed(1);
        document.getElementById("feels-like").textContent = feelsLike;
        document.getElementById("wind-dir").textContent = formatWindDir(windDir);
        document.getElementById("wind-speed").textContent = Math.round(windSpeed);
        document.getElementById("visibility").textContent = visMeters >= 10000 ? "10 km ↑" : (visMeters / 1000).toFixed(1) + " km";
        document.getElementById("ceiling").textContent = ceilingFt ? parseInt(ceilingFt).toLocaleString() + " ft" : "--";
        
        document.getElementById("update-time").textContent = `업데이트: ${new Date().toLocaleTimeString()}`;

        // 4. 특보 판별 및 UI 변경 함수 실행
        extractAndDisplayWarnings(rawMetar);

    } catch (e) {
        console.error("데이터 로드 에러:", e);
        applyMockData();
    }
}

// 특보 추출 및 배경/테두리 색상 변경 함수
function extractAndDisplayWarnings(rawText) {
    const warningDiv = document.getElementById("airport-warnings");
    const warningSection = document.getElementById("warning-section");
    const warnings = [];

    // METAR 원문 기반 특보 체크
    if (rawText) {
        const textUpper = rawText.toUpperCase();
        if (textUpper.includes("TS")) warnings.push("⚡ 뇌우(Thunderstorm) 감지");
        if (textUpper.includes("FG")) warnings.push("🌫️ 안개(Fog) 주의");
        if (textUpper.includes("SN") || textUpper.includes("+SHSN")) warnings.push("❄️ 강설(Snow) 감지");
        if (textUpper.includes("WS")) warnings.push("🌪️ 윈드시어(Windshear) 감지");
        if (textUpper.includes("FZ")) warnings.push("🧊 결빙(Freezing) 주의");
    }

    // 숫자 데이터 기반 자체 특보 체크
    const windSpeed = parseFloat(document.getElementById("wind-speed").textContent);
    const visibilityStr = document.getElementById("visibility").textContent;

    if (!isNaN(windSpeed) && windSpeed >= 25) {
        warnings.push("💨 강풍 주의 (25kt 이상)");
    }
    
    if (visibilityStr.includes("km") && !visibilityStr.includes("↑")) {
        const visVal = parseFloat(visibilityStr);
        if (visVal < 1.0) warnings.push("👁️ 저시정 주의 (1km 미만)");
    }

    // 화면 출력 로직 (색상 변경 포함)
    if (warnings.length > 0) {
        warningDiv.innerHTML = warnings.map(w => `<p style="margin-bottom: 5px;">🚨 ${w}</p>`).join("");
        warningDiv.style.color = "#c53030";
        
        // 🚨 특보 발효 시 붉은색 테마 적용
        warningSection.style.backgroundColor = "#fff5f5";
        warningSection.style.borderLeftColor = "#e53e3e";
    } else {
        warningDiv.textContent = "✅ 현재 발효 중인 기상 특보나 악기상 코드가 없습니다.";
        warningDiv.style.color = "#2f855a";
        
        // ✅ 정상 시 녹색 테마 적용
        warningSection.style.backgroundColor = "#f0fff4";
        warningSection.style.borderLeftColor = "#38a169";
    }
}

// 유틸리티 함수들
function calculateSummerFeelsLike(temp, humidity) {
    const tw = temp * Math.atan(0.151977 * Math.pow(humidity + 8.313659, 0.5)) + Math.atan(temp + humidity) - Math.atan(humidity - 1.676331) + 0.00391838 * Math.pow(humidity, 1.5) * Math.atan(0.023101 * humidity) - 4.686035;
    const result = -0.2442 + (0.55399 * tw) + (0.45535 * temp) - (0.0022 * Math.pow(tw, 2)) + (0.00278 * tw * temp) + 3.0;
    return result.toFixed(1);
}

function calculateHumidity(temp, dewPoint) {
    return 100 * Math.exp((17.625 * dewPoint) / (243.04 + dewPoint)) / Math.exp((17.625 * temp) / (243.04 + temp));
}

function formatWindDir(degrees) {
    const deg = parseInt(degrees);
    if (isNaN(deg)) return degrees;
    const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
    return `${dirs[Math.round(deg / 45) % 8]}풍 (${deg}°)`;
}

function applyMockData() {
    document.getElementById("temp").textContent = "--";
    document.getElementById("feels-like").textContent = "--";
    document.getElementById("wind-dir").textContent = "--";
    document.getElementById("wind-speed").textContent = "--";
    document.getElementById("visibility").textContent = "--";
    document.getElementById("ceiling").textContent = "--";
    
    const warningDiv = document.getElementById("airport-warnings");
    warningDiv.textContent = "데이터를 불러올 수 없습니다.";
    warningDiv.style.color = "#4a5568";
}
