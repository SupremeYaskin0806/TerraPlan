let activeFarmContext = {
    crop: null,
    location: null,
    soil_type: 'Black Cotton Soil / Regur',
    land_size: null,
    land_unit: 'Acres',
    market_price: null,
    lat: null,
    lon: null
};

let landChartInstance = null; 
const chatHistory = [];

function cleanMarkdown(text) {
    if (!text) return '';
    let html = text.replace(/\r/g, '');
    
    // Strip accidental pipe table syntax
    html = html.replace(/\|[^\n]+\|/g, (match) => {
        let items = match.split('|').map(s => s.trim()).filter(Boolean);
        return items.length ? '• ' + items.join(' — ') : '';
    });
    html = html.replace(/^[-|: ]+$/gm, '');

    // Standard markdown formatting
    html = html.replace(/^### (.*$)/gm, '<div style="font-weight:700; margin:6px 0 2px;">$1</div>');
    html = html.replace(/^## (.*$)/gm, '<div style="font-weight:700; font-size:1.05rem; margin:8px 0 4px; color:#1b4332;">$1</div>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*[\*\-•]\s+(.*$)/gm, '<div style="margin: 4px 0; padding-left: 12px; position:relative;"><span style="position:absolute; left:0; color:#40916c;">•</span>$1</div>');
    html = html.replace(/\n\n+/g, '<div style="height:8px;"></div>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

document.addEventListener("DOMContentLoaded", () => {
    
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

    // Clear lat/lon if the user manually edits the location input (The Stale GPS Fix)
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
        document.getElementById('out-crop-subtitle').innerText = `${activeFarmContext.land_size} ${activeFarmContext.land_unit} • ${activeFarmContext.location} • ${data.crop_overview.inferred_soil_type} • ${data.crop_overview.season_category} (${data.crop_overview.total_duration_days})`;
        
        // Planting status updated to use the weather rationale
        document.getElementById('out-planting-status').innerText = data.recommended_start.suitability_status || "Recommended Window";
        
        // Weather with Fallback Fix
        if (weather) {
            document.getElementById('out-temp').innerText = `${weather.temp}°C`;
            document.getElementById('out-cond').innerText = weather.description;
        } else {
            document.getElementById('out-temp').innerText = `--°C`;
            document.getElementById('out-cond').innerText = "Seasonal Averages Applied";
        }
        
        // Use weather-based rationale for planting advice
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
        document.getElementById('out-spacing').innerText = data.how_to_grow.spacing;

        const fertList = document.getElementById('out-fertilizers');
        fertList.innerHTML = data.how_to_grow.fertilizer_schedule.map(f => `<li>${f}</li>`).join('');

        const pestList = document.getElementById('out-pests');
        pestList.innerHTML = data.how_to_grow.pest_disease_management.map(p => `<li>${p}</li>`).join('');

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

        // Render Smart Cultivation Zones
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

        // Pass the new zones array to the chart renderer
        renderLandChart(data.cultivation_zones);
    }

    function renderLandChart(zoneData) {
        const ctx = document.getElementById('landDivisionChart').getContext('2d');
        if (landChartInstance) landChartInstance.destroy();

        // Extract labels and percentages from the new schema
        const labels = zoneData.map(d => `${d.zone_name} - ${d.recommended_crop}`);
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

            // Fix applied: concatenating land size and unit
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
});