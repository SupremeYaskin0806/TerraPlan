import os
import json
import requests
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from groq import Groq
from dotenv import load_dotenv
load_dotenv()


app = Flask(__name__)

# --- API KEYS ---
WEATHER_API_KEY = os.environ.get("WEATHER_API_KEY", "90f3a7a974e9d890b99c3f06b9fe3ad2")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)

# ----------------------------------------------------
# 1. LIVE WEATHER HELPER
# ----------------------------------------------------
def fetch_weather_context(location_name=None, lat=None, lon=None):
    """Fetches real-time weather metrics from OpenWeatherMap."""
    try:
        if lat and lon:
            url = f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&appid={WEATHER_API_KEY}&units=metric"
        elif location_name:
            url = f"https://api.openweathermap.org/data/2.5/weather?q={location_name}&appid={WEATHER_API_KEY}&units=metric"
        else:
            return None

        res = requests.get(url, timeout=5)
        if res.status_code == 200:
            data = res.json()
            return {
                "city": data.get("name", "Unknown"),
                "country": data.get("sys", {}).get("country", ""),
                "temp": data.get("main", {}).get("temp"),
                "humidity": data.get("main", {}).get("humidity"),
                "description": data.get("weather", [{}])[0].get("description", "").title(),
                "wind_speed": data.get("wind", {}).get("speed"),
                "rain_1h": data.get("rain", {}).get("1h", 0)
            }
    except Exception as e:
        print(f"Weather Fetch Error: {e}")
    return None

# ----------------------------------------------------
# 2. ROUTES
# ----------------------------------------------------
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze_farm', methods=['POST'])
def analyze_farm():
    """Generates a complete, structured agricultural strategy with dynamic zoning and water planning."""
    payload = request.json or {}
    crop = payload.get('crop', 'Vegetables')
    location = payload.get('location', 'General Agricultural Zone')
    soil_type = payload.get('soil_type', 'Auto-Detect')
    land_size = payload.get('land_size', '1')
    land_unit = payload.get('land_unit', 'Acres')
    market_price = payload.get('market_price', 'Market Average')
    lat = payload.get('lat')
    lon = payload.get('lon')

    current_date_str = datetime.now().strftime("%d %B %Y")

    weather_data = fetch_weather_context(location, lat, lon)
    weather_summary_str = (
        f"{weather_data['temp']}°C, {weather_data['humidity']}% humidity, {weather_data['description']}, Wind: {weather_data['wind_speed']} m/s"
        if weather_data else "Seasonal regional averages apply"
    )

    system_prompt = f"""You are TerraPlan's Senior Agricultural Intelligence Engine specialized in Indian agronomy.

MANDATES:
1. CURRENCY: All financial figures MUST strictly be in Indian Rupees (₹ / INR).
2. SOIL AUTO-DETECT: If the user passes 'Auto-Detect', scientifically infer the dominant soil type for the given location and state it in 'inferred_soil_type'.
3. WEATHER-GUIDED PLANTING: Explicitly use the provided weather data to justify the 'recommended_start' window.
4. TIMELINE: Anchor the timeline starting from the true agronomic recommended sowing date relative to today ({current_date_str}).
5. CULTIVATION ZONING & IRRIGATION: Scale the farmer's total land ({land_size} {land_unit}) and divide it into manageable cultivation zones. Recommend complementary crops for rotation/borders, and determine the exact irrigation method and daily/weekly water requirement for each zone based on soil and weather.

Analyze the parameters and output a STRICT JSON object matching this schema:
{{
  "crop_overview": {{
    "crop": string,
    "variety_suggestions": [string],
    "inferred_soil_type": string,
    "season_category": string,
    "total_duration_days": string
  }},
  "recommended_start": {{
    "window": string,
    "suitability_status": string,
    "weather_based_rationale": string
  }},
  "how_to_grow": {{
    "land_preparation": string,
    "seed_rate_per_unit": string,
    "spacing": string,
    "fertilizer_schedule": [string],
    "pest_disease_management": [string]
  }},
  "cultivation_zones": [
    {{
      "zone_name": "e.g., Zone A - Main Commercial",
      "recommended_crop": string,
      "percentage": number,
      "area_allocated": string,
      "irrigation_method": string,
      "water_requirement": "e.g., 40,000 Liters/week",
      "rationale": string
    }}
  ],
  "timeline_stages": [
    {{"stage": "Week 1–2", "date_range": string, "title": string, "tasks": string}},
    {{"stage": "Week 3–4", "date_range": string, "title": string, "tasks": string}},
    {{"stage": "Week 5–8", "date_range": string, "title": string, "tasks": string}},
    {{"stage": "Week 9–12", "date_range": string, "title": string, "tasks": string}},
    {{"stage": "Week 13+", "date_range": string, "title": string, "tasks": string}}
  ],
  "weather_impact": {{
    "current_conditions": string,
    "actionable_advice": string,
    "irrigation_adjustment": string
  }},
  "risk_alerts": [string],
  "market_intelligence": {{
    "current_trend": "Rising" | "Falling" | "Stable",
    "trend_reason": string,
    "estimated_price_range": string
  }},
  "economics": {{
    "estimated_investment": string,
    "expected_yield": string,
    "estimated_revenue": string,
    "estimated_net_profit": string,
    "profit_per_unit": string
  }},
  "action_checklist_today": [string]
}}"""

    user_query = f"""Farm Parameters:
- Target Crop: {crop}
- Farm Location: {location}
- User Selected Soil: {soil_type}
- Total Land: {land_size} {land_unit}
- User Provided Price: {market_price}
- Current Reference Date: {current_date_str}
- Current Local Weather Metrics: {weather_summary_str}
- Currency: Indian Rupees (₹)"""

    try:
        response = client.chat.completions.create(
            model='openai/gpt-oss-120b',
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query}
            ],
            response_format={"type": "json_object"}
        )
        plan_json = json.loads(response.choices[0].message.content)
        return jsonify({"success": True, "data": plan_json, "weather": weather_data})
    except Exception as e:
        print(f"Engine Generation Error: {e}")
        return jsonify({"success": False, "error": "Agricultural strategy calculation failed."}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    """Stateful agronomic advisor chat supporting active farm context."""
    payload = request.json or {}
    user_message = payload.get('message', '')
    farm_context = payload.get('farm_context', {})
    history = payload.get('history', [])

    if not user_message:
        return jsonify({'error': 'Message required'}), 400

    context_str = f"Active Farm Context: Crop: {farm_context.get('crop', 'Not selected')}, Location: {farm_context.get('location', 'General')}, Soil: {farm_context.get('soil_type', 'General')}, Size: {farm_context.get('land_size', '1')} {farm_context.get('land_unit', 'Acres')}."

    system_prompt = f"""You are TerraPlan's Interactive Agricultural Advisor.
{context_str}

STRICT RESPONSE GUIDELINES:
1. Provide ultra-concise, direct, and practical agricultural guidance (2 to 4 bullet points maximum).
2. NEVER output markdown tables (do NOT use '|---|' or table formatting).
3. Use simple bolding (**key point**) and bullet points (•).
4. All costs and prices must strictly be in Indian Rupees (₹).
5. Elaborate in depth ONLY if the user explicitly asks for detailed explanations."""

    messages = [{"role": "system", "content": system_prompt}]
    for msg in history[-8:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": user_message})

    try:
        response = client.chat.completions.create(
            model='openai/gpt-oss-120b',
            messages=messages
        )
        return jsonify({'reply': response.choices[0].message.content})
    except Exception as e:
        print(f"Chat Error: {e}")
        return jsonify({'reply': 'Unable to connect to the agronomy advisor server.'}), 500

@app.route('/api/recommend_crops', methods=['POST'])
def recommend_crops():
    """Returns top 3 suitable crops based on soil, location, and seasonal parameters in INR (₹)."""
    payload = request.json or {}
    location = payload.get('location', 'General Region')
    land_size = payload.get('land_size', '1')
    water_source = payload.get('water_source', 'Borewell / Canal')
    soil_type = payload.get('soil_type', 'Loamy / Black Soil')

    system_prompt = """You are an Agricultural Crop Selection Consultant for Indian farmers.
Evaluate location, soil, and water availability.
All margins and return figures MUST strictly be in Indian Rupees (₹ per acre / quintal).
Return a STRICT JSON object formatted as:
{
  "recommendations": [
    {
      "rank": 1,
      "crop": string,
      "suitability": "High" | "Medium-High",
      "duration": string,
      "estimated_margin": string,
      "rationale": string
    }
  ]
}"""

    query = f"Location: {location}, Size: {land_size}, Water Source: {water_source}, Soil: {soil_type}."

    try:
        response = client.chat.completions.create(
            model='openai/gpt-oss-120b',
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            response_format={"type": "json_object"}
        )
        return jsonify(json.loads(response.choices[0].message.content))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)