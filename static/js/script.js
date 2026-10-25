let activeFarmContext = {
    crop: null,
    location: null,
    soil_type: 'Black Cotton Soil / Regur',
    land_size: null,
    land_unit: 'Acres',
    market_price: null,
    lat: null,
    lon: null,
    soil_n: 0,
    soil_p: 0,
    soil_k: 0,
    used_soil_fallback: false
};

let landChartInstance = null; 
const chatHistory = [];

function cleanMarkdown(text) {
    if (!text) return '';
    let html = text.replace(/\r/g, '');
    
    html = html.replace(/\|[^\n]+\|/g, (match) => {
        let items = match.split('|').map(s => s.trim()).filter(Boolean);
        return items.length ? '• ' + items.join(' — ') : '';
    });
    html = html.replace(/^[-|: ]+$/gm, '');

    html = html.replace(/^### (.*$)/gm, '<div style="font-weight:700; margin:6px 0 2px;">$1</div>');
    html = html.replace(/^## (.*$)/gm, '<div style="font-weight:700; font-size:1.05rem; margin:8px 0 4px; color:#1b4332;">$1</div>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*[\*\-•]\s+(.*$)/gm, '<div style="margin: 4px 0; padding-left: 12px; position:relative;"><span style="position:absolute; left:0; color:#40916c;">•</span>$1</div>');
    html = html.replace(/\n\n+/g, '<div style="height:8px;"></div>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

document.addEventListener("DOMContentLoaded", () => {
    
    const ESP32_IP = "10.240.68.29"; 

    // ==========================================
    // 1. CHIP SELECTION & FORM CONTROLS
    // ==========================================
    window.selectCrop = (name) => {
        document.getElementById('input-crop').value = name;
    };

    const unknownPriceCheck = document.getElementById('check-unknown-price');
    const priceInput = document.getElementById('input-market-price');
    if (unknownPriceCheck && priceInput) {
        unknownPriceCheck.addEventListener('change', (e) => {
            if (e.target.checked) {
                priceInput.value = "Auto-Market Lookup";
                priceInput.disabled = true;
            } else {
                priceInput.value = "";
                priceInput.disabled = false;
            }
        });
    }

    const unknownSoilCheck = document.getElementById('check-unknown-soil');
    const soilN = document.getElementById('input-soil-n');
    const soilP = document.getElementById('input-soil-p');
    const soilK = document.getElementById('input-soil-k');

    if (unknownSoilCheck && soilN && soilP && soilK) {
        unknownSoilCheck.addEventListener('change', (e) => {
            const disabled = e.target.checked;
            soilN.disabled = disabled;
            soilP.disabled = disabled;
            soilK.disabled = disabled;
            if (disabled) {
                soilN.value = '';
                soilP.value = '';
                soilK.value = '';
            }
        });
    }

    // ==========================================
    // 2. GEOLOCATION AUTO-DETECT
    // ==========================================
    const detectBtn = document.getElementById('btn-detect-gps');
    const geoStatus = document.getElementById('location-geo-status');

    if (detectBtn) {
        detectBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                geoStatus.innerText = "Querying device GPS...";
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        activeFarmContext.lat = pos.coords.latitude.toFixed(4);
                        activeFarmContext.lon = pos.coords.longitude.toFixed(4);
                        document.getElementById('input-location').value = `GPS: ${activeFarmContext.lat}, ${activeFarmContext.lon}`;
                        geoStatus.innerText = `GPS coordinates locked (${activeFarmContext.lat}, ${activeFarmContext.lon})`;
                    },
                    (err) => {
                        geoStatus.innerText = "Location permission denied. Enter manually.";
                    },
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            }
        });
    }

    const locationInput = document.getElementById('input-location');
    if (locationInput) {
        locationInput.addEventListener('input', () => {
            activeFarmContext.lat = null;
            activeFarmContext.lon = null;
            if (geoStatus) geoStatus.innerText = "Provides local weather & climate context";
        });
    }

    // ==========================================
    // 3. GENERATE FARM STRATEGY EXECUTION
    // ==========================================
    const sendToLCD = async (headingText) => {
        try {
            await fetch(`http://${ESP32_IP}/update`, { 
                method: "POST",
                body: headingText,
                headers: { "Content-Type": "text/plain" }
            });
            console.log("Sent to LCD successfully");
        } catch (error) {
            console.error("Failed to send data to LCD", error);
        }
    };

    const plannerForm = document.getElementById('farm-planner-form');
    const genButton = document.getElementById('btn-generate-plan');
    const resultsContainer = document.getElementById('results-display');

    if (plannerForm) {
        plannerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            activeFarmContext.crop = document.getElementById('input-crop').value.trim();
            activeFarmContext.location = document.getElementById('input-location').value.trim();
            activeFarmContext.soil_type = document.getElementById('input-soil-type').value;
            activeFarmContext.land_size = document.getElementById('input-land-size').value.trim();
            activeFarmContext.land_unit = document.getElementById('input-land-unit').value;
            activeFarmContext.market_price = priceInput.value.trim() || 'Market Average';
            
            // Precise Soil Health Card fallback evaluation
            let inputN = parseFloat(document.getElementById('input-soil-n')?.value);
            let inputP = parseFloat(document.getElementById('input-soil-p')?.value);
            let inputK = parseFloat(document.getElementById('input-soil-k')?.value);
            let unknownSoil = document.getElementById('check-unknown-soil')?.checked || false;

            activeFarmContext.used_soil_fallback = unknownSoil || (isNaN(inputN) && isNaN(inputP) && isNaN(inputK));

            if (activeFarmContext.used_soil_fallback) {
                const sType = activeFarmContext.soil_type.toLowerCase();
                if (sType.includes('black')) { activeFarmContext.soil_n = 10; activeFarmContext.soil_p = 8; activeFarmContext.soil_k = 40; } 
                else if (sType.includes('red') || sType.includes('yellow')) { activeFarmContext.soil_n = 8; activeFarmContext.soil_p = 5; activeFarmContext.soil_k = 15; }
                else if (sType.includes('alluvial')) { activeFarmContext.soil_n = 15; activeFarmContext.soil_p = 10; activeFarmContext.soil_k = 30; } 
                else if (sType.includes('laterite')) { activeFarmContext.soil_n = 10; activeFarmContext.soil_p = 5; activeFarmContext.soil_k = 10; }
                else { activeFarmContext.soil_n = 10; activeFarmContext.soil_p = 10; activeFarmContext.soil_k = 20; }
            } else {
                activeFarmContext.soil_n = inputN || 0;
                activeFarmContext.soil_p = inputP || 0;
                activeFarmContext.soil_k = inputK || 0;
            }

            genButton.innerText = "⏳ Synthesizing Agronomic Models...";
            genButton.disabled = true;

            try {
                const response = await fetch('/api/analyze_farm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(activeFarmContext)
                });

                const resData = await response.json();
                genButton.innerText = "⚡ Generate Comprehensive Farm Plan";
                genButton.disabled = false;

                if (resData.success && resData.data) {
                    renderFarmDashboard(resData.data, resData.weather);
                    resultsContainer.style.display = 'block';
                    resultsContainer.scrollIntoView({ behavior: 'smooth' });
                    
                    let weatherStr = resData.weather ? `${resData.weather.temp}C ${resData.weather.description}` : "Seasonal Avg";
                    
                    let startDate = resData.data.timeline_stages && resData.data.timeline_stages.length > 0 
                        ? resData.data.timeline_stages[0].date_range 
                        : "Optimal Window";

                    let lcdPayload = [
                        resData.data.crop_overview.crop,
                        activeFarmContext.location,
                        weatherStr,
                        startDate, 
                        resData.data.economics.estimated_net_profit
                    ].join("|");
                    
                    sendToLCD(lcdPayload);
                } else {
                    alert("Strategy compilation failed. Please check inputs.");
                }
            } catch (error) {
                console.error(error);
                genButton.innerText = "⚡ Generate Comprehensive Farm Plan";
                genButton.disabled = false;
                alert("Failed to connect to TerraPlan intelligence servers.");
            }
        });
    }

    // ==========================================
    // 4. DASHBOARD RENDERER & CHART.JS BINDING
    // ==========================================
    function renderFarmDashboard(data, weather) {
        document.getElementById('out-crop-title').innerText = `Farm Strategy: ${data.crop_overview.crop}`;
        document.getElementById('out-crop-subtitle').innerText = `${activeFarmContext.land_size} ${activeFarmContext.land_unit}\n${activeFarmContext.location}\n${data.crop_overview.inferred_soil_type}\n${data.crop_overview.season_category} (${data.crop_overview.total_duration_days})`;
        
        document.getElementById('out-planting-status').innerText = data.recommended_start.suitability_status || "Recommended Window";
        
        if (weather) {
            document.getElementById('out-temp').innerText = `${weather.temp}°C`;
            document.getElementById('out-cond').innerText = weather.description;
        } else {
            document.getElementById('out-temp').innerText = `--°C`;
            document.getElementById('out-cond').innerText = "Seasonal Averages Applied";
        }
        
        document.getElementById('out-weather-impact').innerHTML = `<strong>Planting Guide:</strong> ${data.recommended_start.weather_based_rationale}<br><br><strong>Current Impact:</strong> ${data.weather_impact.actionable_advice}`;
        document.getElementById('out-irrigation-directive').innerHTML = `<strong>💧 Weather Adjustment:</strong> ${data.weather_impact.irrigation_adjustment}`;

        const trendEl = document.getElementById('out-market-trend');
        trendEl.innerText = `${data.market_intelligence.current_trend === 'Rising' ? '📈' : '📉'} ${data.market_intelligence.current_trend}`;
        trendEl.className = `trend-badge ${data.market_intelligence.current_trend === 'Rising' ? 'trend-up' : 'trend-down'}`;
        document.getElementById('out-market-price').innerText = data.market_intelligence.estimated_price_range;
        document.getElementById('out-market-reason').innerText = data.market_intelligence.trend_reason;

        document.getElementById('out-inv').innerText = data.economics.estimated_investment;
        document.getElementById('out-yield').innerText = data.economics.expected_yield;
        document.getElementById('out-rev').innerText = data.economics.estimated_revenue;
        document.getElementById('out-profit').innerText = data.economics.estimated_net_profit;

        document.getElementById('out-landprep').innerText = data.how_to_grow.land_preparation;

        // --- PRECISE SEED POPULATION CALCULATOR ---
        let seedAreaSqM = parseFloat(activeFarmContext.land_size);
        const landUnit = activeFarmContext.land_unit.toLowerCase();
        if (landUnit.includes('acre')) seedAreaSqM *= 4046.86;
        else if (landUnit.includes('hectare')) seedAreaSqM *= 10000;
        else if (landUnit.includes('cent')) seedAreaSqM *= 40.47;
        else if (landUnit.includes('gunta')) seedAreaSqM *= 101.17;

        let spacingText = data.how_to_grow.spacing.toLowerCase();
        let plantsRequired = "Calculating...";
        let seedsToBuy = "Calculating...";
        
        try {
            let numbers = spacingText.match(/\d+(\.\d+)?/g);
            if (numbers && numbers.length >= 2) {
                let rowSpace = parseFloat(numbers[0]);
                let plantSpace = parseFloat(numbers[1]);
                
                if (spacingText.includes('cm')) {
                    rowSpace = rowSpace / 100;
                    plantSpace = plantSpace / 100;
                }
                
                let areaPerPlant = rowSpace * plantSpace;
                let exactPlants = Math.floor(seedAreaSqM / areaPerPlant);
                let totalSeeds = Math.floor(exactPlants * 1.10);
                
                plantsRequired = exactPlants.toLocaleString('en-IN');
                seedsToBuy = totalSeeds.toLocaleString('en-IN');
                
                document.getElementById('out-spacing').innerHTML = `${data.how_to_grow.spacing}<br>
                <span style="color:#1b4332; font-weight:600; display:block; margin-top:8px;">🎯 Target Plant Population: ${plantsRequired} plants</span>
                <span style="color:#e65100; font-size:0.9em;">🛒 Purchase ${seedsToBuy} seeds (Includes 10% safety buffer)</span>`;
            } else {
                document.getElementById('out-spacing').innerText = data.how_to_grow.spacing;
            }
        } catch (e) {
            document.getElementById('out-spacing').innerText = data.how_to_grow.spacing;
            console.error("Could not parse spacing for seed math", e);
        }

        // --- PRECISE FERTILIZER CALCULATOR ---
        const fertList = document.getElementById('out-fertilizers');
        let areaAcres = parseFloat(activeFarmContext.land_size);
        const fertUnit = activeFarmContext.land_unit.toLowerCase();
        if (fertUnit.includes('hectare')) areaAcres *= 2.471;
        else if (fertUnit.includes('cent')) areaAcres *= 0.01;
        else if (fertUnit.includes('gunta')) areaAcres *= 0.025;
        else if (fertUnit.includes('meter')) areaAcres *= 0.000247;

        const cropReqs = {
            'tomato': { n: 60, p: 32, k: 40 },
            'cotton': { n: 48, p: 24, k: 24 },
            'rice':   { n: 40, p: 20, k: 20 },
            'chilli': { n: 60, p: 24, k: 32 },
            'maize':  { n: 48, p: 24, k: 16 },
            'default':{ n: 50, p: 25, k: 25 }
        };

        const cropKey = activeFarmContext.crop.toLowerCase();
        const req = cropReqs[cropKey] || cropReqs['default'];

        let deficitN = ((req.n - activeFarmContext.soil_n) * areaAcres).toFixed(1);
        let deficitP = ((req.p - activeFarmContext.soil_p) * areaAcres).toFixed(1);
        let deficitK = ((req.k - activeFarmContext.soil_k) * areaAcres).toFixed(1);

        if (deficitN < 0) deficitN = 0;
        if (deficitP < 0) deficitP = 0;
        if (deficitK < 0) deficitK = 0;

        let fertHTML = `<li style="background: #ffebee; color: #b71c1c; padding: 6px; border-radius: 4px; margin-bottom: 8px;"><strong>⚠️ Strict Application Limits for ${areaAcres.toFixed(1)} Acres:</strong></li>`;
        
        if (activeFarmContext.used_soil_fallback) {
            fertHTML += `<li style="background: #fff3e0; color: #e65100; padding: 6px; border-radius: 4px; margin-bottom: 8px; font-size: 0.9em;"><strong>ℹ️ Notice:</strong> Exact soil test not provided. Fertilizer volumes were estimated using regional baselines for <em>${activeFarmContext.soil_type.split('(')[0].trim()}</em>.</li>`;
        }

        fertHTML += `<li><strong>Nitrogen (N) Deficit:</strong> Apply exactly ${deficitN} kg</li>`;
        fertHTML += `<li><strong>Phosphorus (P) Deficit:</strong> Apply exactly ${deficitP} kg</li>`;
        fertHTML += `<li><strong>Potassium (K) Deficit:</strong> Apply exactly ${deficitK} kg</li>`;

        if (deficitN == 0 && deficitP == 0 && deficitK == 0) {
            fertHTML += `<li style="color:#2e7d32; font-weight:bold;">✅ Soil nutrients are optimal. DO NOT apply base fertilizers.</li>`;
        }

        fertList.innerHTML = fertHTML;

        // --- DYNAMIC WEATHER-DRIVEN PEST & DISEASE ALERTS ---
        const pestList = document.getElementById('out-pests');
        let tempVal = parseFloat(weather ? weather.temp : 25);
        let condString = (weather ? weather.description.toLowerCase() : "clear");
        
        let dynamicPestAlert = "";
        if ((condString.includes('rain') || condString.includes('cloud') || condString.includes('storm')) && tempVal >= 20 && tempVal <= 30) {
            dynamicPestAlert = `<li style="background: #fff3e0; color: #e65100; padding: 6px; border-radius: 4px; margin-bottom: 8px;"><strong>🚨 Weather Trigger:</strong> High humidity and warm temps detected. Extreme risk of Fungal Blight and Mildew. <strong>Action:</strong> Apply preventative fungicide spray.</li>`;
        } else if (tempVal > 30 && (condString.includes('clear') || condString.includes('sun'))) {
            dynamicPestAlert = `<li style="background: #fff3e0; color: #e65100; padding: 6px; border-radius: 4px; margin-bottom: 8px;"><strong>🚨 Weather Trigger:</strong> Dry heat detected. High risk of sucking pests (Aphids, Thrips, Whiteflies). <strong>Action:</strong> Monitor undersides of leaves; ready Neem oil or standard insecticide.</li>`;
        } else {
            dynamicPestAlert = `<li style="background: #e8f5e9; color: #2e7d32; padding: 6px; border-radius: 4px; margin-bottom: 8px;"><strong>✅ Weather Trigger:</strong> Conditions are currently stable. Standard scouting recommended.</li>`;
        }

        pestList.innerHTML = dynamicPestAlert + data.how_to_grow.pest_disease_management.map(p => `<li>${p}</li>`).join('');

        const actionList = document.getElementById('out-actions');
        actionList.innerHTML = data.action_checklist_today.map(a => `<li>${a}</li>`).join('');

        const timelineEl = document.getElementById('out-timeline-stages');
        timelineEl.innerHTML = data.timeline_stages.map(stage => `
            <div class="timeline-step">
                <div class="timeline-header-row">
                    <span class="timeline-week-pill">${stage.stage}</span>
                    ${stage.date_range ? `<span class="timeline-date-pill">📅 ${stage.date_range}</span>` : ''}
                </div>
                <h4>${stage.title}</h4>
                <p>${stage.tasks}</p>
            </div>
        `).join('');

        const landDetailsEl = document.getElementById('out-land-details');
        landDetailsEl.innerHTML = data.cultivation_zones.map(z => `
            <div style="background: var(--bg-main); padding: 14px; border-radius: 8px; margin-bottom: 12px; border: 1px solid var(--border-color);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="color: var(--primary-dark); font-size: 0.95rem;">${z.zone_name} (${z.area_allocated})</strong>
                    <span class="badge-pill" style="margin: 0; padding: 3px 8px;">${z.percentage}%</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px;">
                    <span><strong style="color:var(--primary);">🌱 Crop:</strong> ${z.recommended_crop}</span>
                    <span><strong style="color:#0277bd;">💧 Irrigation:</strong> ${z.irrigation_method} <em>(${z.water_requirement})</em></span>
                    <span><strong style="color:#e65100;">🧠 Strategy:</strong> ${z.rationale}</span>
                </div>
            </div>
        `).join('');

        renderLandChart(data.cultivation_zones);
    }

    function renderLandChart(zoneData) {
        const ctx = document.getElementById('landDivisionChart').getContext('2d');
        if (landChartInstance) landChartInstance.destroy();

        const labels = zoneData.map(d => `${d.zone_name}\n${d.recommended_crop}`);
        const percentages = zoneData.map(d => d.percentage);

        landChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: percentages,
                    backgroundColor: ['#1b4332', '#40916c', '#52b788', '#95d5b2', '#d8f3dc'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                cutout: '70%'
            }
        });
    }

    // ==========================================
    // 5. CROP MATCHER
    // ==========================================
    const matcherBtn = document.getElementById('btn-run-matcher');
    const matcherResults = document.getElementById('matcher-results');
    const heroMatcherBtn = document.getElementById('hero-quick-match-btn');

    if (heroMatcherBtn) {
        heroMatcherBtn.addEventListener('click', () => {
            document.getElementById('recommendations').scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (matcherBtn) {
        matcherBtn.addEventListener('click', async () => {
            matcherBtn.innerText = "Evaluating Suitability...";
            matcherBtn.disabled = true;

            const sizeVal = document.getElementById('input-land-size').value.trim() || '5';
            const unitVal = document.getElementById('input-land-unit').value || 'Acres';

            const payload = {
                location: document.getElementById('input-location').value.trim() || 'Regional Agro-Zone',
                land_size: `${sizeVal} ${unitVal}`, 
                soil_type: document.getElementById('rec-soil').value,
                water_source: document.getElementById('rec-water').value
            };

            try {
                const res = await fetch('/api/recommend_crops', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                matcherBtn.innerText = "Run Crop Matcher";
                matcherBtn.disabled = false;

                if (data.recommendations) {
                    matcherResults.innerHTML = data.recommendations.map(r => `
                        <div class="match-card">
                            <span class="badge-pill">#${r.rank} Recommended</span>
                            <h3>${r.crop}</h3>
                            <p><strong>Suitability:</strong> ${r.suitability} | <strong>Duration:</strong> ${r.duration}</p>
                            <p><strong>Est. Return:</strong> ${r.estimated_margin}</p>
                            <p style="margin-top:8px; font-size:0.85rem; color:#4a5d52;">${r.rationale}</p>
                            <button class="btn btn-primary" style="margin-top:12px; width:100%;" onclick="selectCrop('${r.crop}'); document.getElementById('planner').scrollIntoView({behavior:'smooth'});">Plan ${r.crop} Strategy</button>
                        </div>
                    `).join('');
                    matcherResults.style.display = 'grid';
                }
            } catch (err) {
                matcherBtn.innerText = "Run Crop Matcher";
                matcherBtn.disabled = false;
                alert("Failed to calculate crop match recommendations.");
            }
        });
    }

    // ==========================================
    // 6. CHAT DRAWER & ADVISOR LOGIC
    // ==========================================
    const advisorBtn = document.getElementById('open-advisor-btn');
    const closeDrawerBtn = document.getElementById('close-drawer-btn');
    const drawer = document.getElementById('advisor-drawer');
    const chatForm = document.getElementById('chat-drawer-form');
    const chatInput = document.getElementById('chat-user-input');
    const chatBox = document.getElementById('chat-history-box');

    if (advisorBtn && closeDrawerBtn && drawer) {
        advisorBtn.addEventListener('click', () => drawer.classList.add('open'));
        closeDrawerBtn.addEventListener('click', () => drawer.classList.remove('open'));
    }

    if (chatForm) {
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = chatInput.value.trim();
            if (!text) return;

            chatBox.innerHTML += `<div class="chat-msg user-msg">${text}</div>`;
            chatInput.value = '';
            chatBox.scrollTop = chatBox.scrollHeight;

            const loadId = 'chat-load-' + Date.now();
            chatBox.innerHTML += `<div id="${loadId}" class="chat-msg ai-msg">Consulting agronomist engine...</div>`;
            chatBox.scrollTop = chatBox.scrollHeight;

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        farm_context: activeFarmContext,
                        history: chatHistory
                    })
                });
                const resData = await response.json();
                document.getElementById(loadId)?.remove();

                chatHistory.push({ role: 'user', content: text });
                chatHistory.push({ role: 'assistant', content: resData.reply });

                chatBox.innerHTML += `<div class="chat-msg ai-msg">${cleanMarkdown(resData.reply)}</div>`;
                chatBox.scrollTop = chatBox.scrollHeight;
            } catch (error) {
                document.getElementById(loadId)?.remove();
                chatBox.innerHTML += `<div class="chat-msg ai-msg" style="color:red;">Error connecting to advisor.</div>`;
            }
        });
    }
 
    // ==========================================
    // 7. KNOWLEDGE ACCORDION
    // ==========================================
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const body = header.nextElementSibling;
            const isOpen = body.style.display === 'block';
            document.querySelectorAll('.accordion-body').forEach(b => b.style.display = 'none');
            body.style.display = isOpen ? 'none' : 'block';
        });
    });

    // ==========================================
    // 8. LIVE SOIL MOISTURE SENSOR (ESP32)
    // ==========================================
    const moistureDisplay = document.getElementById('moisture-display');
    const irrigationDisplay = document.getElementById('irrigation-display');

    function calculateIrrigationVolume(currentMoisture, context) {
        if (!context.land_size || !context.crop) return null; 

        let areaSqM = parseFloat(context.land_size);
        const unit = context.land_unit.toLowerCase();
        if (unit.includes('acre')) areaSqM *= 4046.86;
        else if (unit.includes('hectare')) areaSqM *= 10000;
        else if (unit.includes('cent')) areaSqM *= 40.47;
        else if (unit.includes('gunta')) areaSqM *= 101.17;

        let targetMoisture = 60; 
        let cropFactor = 1.0; 
        const crop = context.crop.toLowerCase();
        if (crop.includes('rice') || crop.includes('paddy')) { targetMoisture = 85; cropFactor = 1.3; } 
        else if (crop.includes('cotton') || crop.includes('maize')) { targetMoisture = 50; cropFactor = 0.8; } 
        else if (crop.includes('tomato') || crop.includes('chilli')) { targetMoisture = 65; cropFactor = 1.1; }

        let soilFactor = 1.0;
        const soil = context.soil_type.toLowerCase();
        if (soil.includes('sandy')) soilFactor = 0.7; 
        else if (soil.includes('black') || soil.includes('clay')) soilFactor = 1.2; 

        let tempText = document.getElementById('out-temp')?.innerText || "25";
        let condText = document.getElementById('out-cond')?.innerText.toLowerCase() || "";
        let currentTemp = parseFloat(tempText);
        let weatherMultiplier = 1.0;

        if (currentTemp > 35) weatherMultiplier = 1.25; 
        else if (currentTemp < 20) weatherMultiplier = 0.85; 

        if (condText.includes('rain') || condText.includes('shower') || condText.includes('storm')) {
            weatherMultiplier = 0.0; 
        }

        if (currentMoisture >= targetMoisture || weatherMultiplier === 0.0) {
            return { volume: 0, target: targetMoisture, reason: weatherMultiplier === 0.0 ? "Halted due to rain" : "Soil Wet", area: areaSqM };
        }

        const deficit = targetMoisture - currentMoisture;
        const litersPerSqM = (deficit * 0.4) * cropFactor * soilFactor * weatherMultiplier;
        const totalLiters = areaSqM * litersPerSqM;

        return { volume: totalLiters, target: targetMoisture, reason: "Dispense", area: areaSqM };
    }

    if (moistureDisplay && irrigationDisplay) {
        setInterval(async () => {
            try {
                const response = await fetch(`http://${ESP32_IP}/sensor`);
                if (!response.ok) throw new Error("Sensor offline");
                
                const moisturePercent = parseFloat(await response.text()); 
                moistureDisplay.innerText = moisturePercent.toFixed(1) + "%";

                if (!activeFarmContext.crop || !activeFarmContext.land_size) {
                    irrigationDisplay.innerText = "Awaiting Farm Plan Generation...";
                    return;
                }

                const irrigationData = calculateIrrigationVolume(moisturePercent, activeFarmContext);
                
                if (irrigationData.volume === 0) {
                    irrigationDisplay.innerHTML = `<span style="color:#d32f2f; font-weight:bold;">Standby: ${irrigationData.reason}</span>`;
                } else {
                    const formattedLiters = irrigationData.volume.toLocaleString('en-IN', { maximumFractionDigits: 1 });
                    const rainDeduction = irrigationData.area.toLocaleString('en-IN', { maximumFractionDigits: 0 });

                    // structured layout for clarity
                    irrigationDisplay.innerHTML = `
                        <div style="margin-top: 5px; font-size: 0.95em; line-height: 1.6;">
                            <span style="display:block; margin-bottom:6px;"><strong>Target:</strong> ${irrigationData.target}% | <strong>Volume required:</strong> ${formattedLiters} Liters</span>
                            <span style="display:block; margin-bottom:6px; color:#1b4332; background:#e8f5e9; padding:6px; border-radius:4px;">
                                <strong>⏱️ Schedule:</strong> Do not dispense at once. Split volume equally into two sessions (early morning & late evening) to prevent surface runoff and evaporation.
                            </span>
                            <span style="display:block; color:#e65100; background:#fff3e0; padding:6px; border-radius:4px;">
                                <strong>🌧️ Rain Rule:</strong> If it rains, halt pump and subtract exactly <strong>${rainDeduction} Liters</strong> from today's requirement for every 1mm of rainfall.
                            </span>
                        </div>
                    `;
                }
                
            } catch (error) {
                console.error("Cannot reach ESP32", error);
                moistureDisplay.innerText = "Offline";
                irrigationDisplay.innerText = "Check ESP32 Power";
            }
        }, 3000);
    }
});