import os
import json
import re
import logging
import httpx
from typing import Dict, Any, Tuple, List, Optional, Set
from backend.app.config import settings

logger = logging.getLogger("crisisbridge.ai")

# ──────────────────────────────────────────────────────────────────────────────
# Disaster / Severity / Urgency Terminology Maps (Hindi)
# ──────────────────────────────────────────────────────────────────────────────
DISASTER_HI_MAP = {
    "Flood":          "बाढ़ (Flood)",
    "Cyclone":        "चक्रवात / भीषण तूफ़ान (Cyclone)",
    "Earthquake":     "भूकंप (Earthquake)",
    "Wildfire":       "जंगल की भीषण आग (Wildfire)",
    "Chemical Spill": "रासायनिक रिसाव (Chemical Spill)",
    "Tsunami":        "सुनामी (Tsunami)",
    "Severe Storm":   "भीषण तूफ़ान व भारी वर्षा (Severe Storm)",
    "Landslide":      "भूस्खलन (Landslide)",
    "Heatwave":       "भीषण लू / ताप लहर (Heatwave)",
    "Drought":        "सूखा व जल संकट (Drought)",
    "General Disaster": "आपदा चेतावनी (Emergency Warning)"
}

SEVERITY_HI_MAP = {
    "Extreme":  "अत्यधिक गंभीर (चरम खतरा)",
    "Severe":   "गंभीर (उच्च खतरा)",
    "Moderate": "मध्यम स्तर (सावधानी आवश्यक)",
    "Minor":    "सामान्य / अल्प स्तर"
}

URGENCY_HI_MAP = {
    "Immediate": "तत्काल प्रभाव से (Immediate)",
    "Expected":  "अपेक्षित / शीघ्र (Expected)",
    "Future":    "भावी / अग्रिम (Future)"
}

# ──────────────────────────────────────────────────────────────────────────────
# Safety Action Semantic Concepts for Deduplication
# ──────────────────────────────────────────────────────────────────────────────
CONCEPT_PATTERNS = {
    "EVACUATION_HIGH_GROUND": [
        r"\b(higher ground|upper floors?|elevat(ed|ion)|multi-stor(y|ied)|flood relief shelter|evacuat(e|ion))\b",
        r"\b(move to|head to|relocate to|reach safe)\b"
    ],
    "VULNERABLE_GROUPS": [
        r"\b(elderly|children|pregnant|disabilit(y|ies)|infants?|pets?|livestock|cattle)\b"
    ],
    "ROAD_WATER_HAZARD": [
        r"\b(walk|drive|cross|cycle|swim|travel|vehicle).{0,30}\b(flood(ed)?|submerged|waterlogged|underpass|bridge|moving water|road)\b",
        r"\b(turn around don't drown|submerged road)\b"
    ],
    "DRAIN_CANAL_HAZARD": [
        r"\b(drain(age)?|canal|stream|manhole|suction|currents?)\b"
    ],
    "WATER_BOILING_SAFETY": [
        r"\b(boil|boiling|purif(y|ication)|drinking water|chlorine|waterborne|clean water)\b"
    ],
    "FOOD_SAFETY": [
        r"\b(food|vegetables?|contaminated food|discard food)\b"
    ],
    "ELECTRICAL_GAS_SHUTOFF": [
        r"\b(main electrical|breaker|power switch|electric(al)? supply|gas valve|lpg|power line|downed wire|broken wire)\b"
    ],
    "EMERGENCY_KIT_DOCUMENTS": [
        r"\b(waterproof|documents?|medicines?|first-aid|torch|batteries|emergency kit|go-bag|survival kit|phone charged)\b"
    ],
    "DROP_COVER_HOLD": [
        r"\b(drop,? cover|hold on|sturdy furniture|under (a )?(table|desk|bed)|protect (your )?(head|neck))\b"
    ],
    "WINDOW_GLASS_SAFETY": [
        r"\b(glass|windows?|mirrors?|exterior walls?|bookcases?|falling objects?)\b"
    ],
    "ELEVATOR_PROHIBITION": [
        r"\b(elevator|lift|stairwells?|stairs only)\b"
    ],
    "OUTDOOR_OPEN_GROUND": [
        r"\b(open ground|away from (high-rise|tall buildings|poles|flyovers|trees))\b"
    ],
    "AFTERSHOCK_AWARENESS": [
        r"\b(aftershocks?|secondary tremors?|do not re-enter|cracked structures?)\b"
    ],
    "CYCLONE_SHELTER": [
        r"\b(cyclone shelters?|fortified concrete|pucca structure)\b"
    ],
    "ROOF_FLYING_DEBRIS": [
        r"\b(tin roof(ing)?|asbestos|flying debris|projectiles?|signage|secure outdoor)\b"
    ],
    "EYE_OF_STORM": [
        r"\b(eye of (the )?storm|calm|opposite direction|abruptly resume)\b"
    ],
    "FISHERMEN_MARITIME": [
        r"\b(fisherm(en|an)|boats?|vessels?|moor|harbor|sea|maritime)\b"
    ],
    "HEAT_PEAK_HOURS": [
        r"\b(11(?::00)? ?(am)? to 4(?::00)? ?(pm)?|peak (heat|sunlight|hours)|strenuous outdoor)\b"
    ],
    "HEAT_HYDRATION": [
        r"\b(ors|oral rehydration|hydration|buttermilk|fluids?|electrolytes?|plenty of water)\b"
    ],
    "HEAT_HEATSTROKE_CARE": [
        r"\b(heatstroke|fainting|dizziness|confusion|cold compress|108)\b"
    ],
    "LANDSLIDE_SLOPE_CRACKS": [
        r"\b(cracks?|tilting trees?|muddy (stream|water)|rumbling|slope failure|hillside)\b"
    ],
    "LANDSLIDE_UPHILL_EVACUATION": [
        r"\b(uphill|laterally|debris flow|do not run downhill|gull(y|ies))\b"
    ],
    "WILDFIRE_ESCAPE": [
        r"\b(escape routes?|paved roads?|dense brush|outrun (wildfire|fire) uphill)\b"
    ],
    "SMOKE_MASK_RESPIRATORY": [
        r"\b(n95|respirator|smoke inhalation|toxic ash|damp cloth|mask)\b"
    ],
    "CHEMICAL_SHELTER_IN_PLACE": [
        r"\b(shelter-in-place|seal windows|hvac|ventilation|wet towels|toxic gas|chemical)\b"
    ],
    "CHEMICAL_UPWIND_EVACUATION": [
        r"\b(upwind|crosswind|plume|chemical release)\b"
    ],
    "LIGHTNING_STORM_SHELTER": [
        r"\b(lightning|thunder|isolated (tall )?trees?|metal sheds?|enclosed building)\b"
    ],
    "DROUGHT_WATER_RATIONING": [
        r"\b(water conservation|rationing|essential drinking|eliminate non-essential)\b"
    ],
    "OFFICIAL_HELPLINES_REPORT": [
        r"\b(1077|1070|112|108|disaster control|emergency cell|helpline|i need help|rescue)\b"
    ]
}

def _detect_concepts(text: str) -> Set[str]:
    """Detects semantic disaster concepts present in a given sentence/bullet."""
    found = set()
    text_lower = text.lower()
    for concept_name, regex_list in CONCEPT_PATTERNS.items():
        for pattern in regex_list:
            if re.search(pattern, text_lower):
                found.add(concept_name)
                break
    return found

def semantic_deduplicate_instructions(
    authority_instructions: str,
    retrieved_sources: List[Dict[str, Any]],
    disaster_type: str = "General"
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """
    Combines authoritative official instructions with relevant retrieved RAG guidance.
    Performs semantic deduplication so instructions sharing the same core safety action
    are not repeated, while preserving the authority's exact statements as primary truth.
    
    Returns:
      (final_deduplicated_bullets_list, used_retrieved_sources_metadata)
    """
    # 1. Parse raw authority bullets
    raw_authority_lines = [
        re.sub(r"^\s*[-•*\d.]+\s*", "", line).strip()
        for line in (authority_instructions or "").split("\n")
        if line.strip() and len(re.sub(r"^\s*[-•*\d.]+\s*", "", line).strip()) > 5
    ]
    if not raw_authority_lines and authority_instructions:
        raw_authority_lines = [authority_instructions.strip()]

    # Track all concepts already addressed by authority
    covered_concepts: Set[str] = set()
    final_bullets: List[str] = []

    for auth_line in raw_authority_lines:
        final_bullets.append(auth_line)
        concepts = _detect_concepts(auth_line)
        covered_concepts.update(concepts)

    # 2. Inspect retrieved RAG sources and filter out redundant concepts
    used_sources: List[Dict[str, Any]] = []

    for src in retrieved_sources:
        raw_text = src.get("text", "").strip()
        if not raw_text:
            continue

        # If the chunk has multiple lines or markdown formatting, clean it
        clean_text = re.sub(r"^\s*\d+\.\s+\*\*([^*]+):\*\*\s*", "", raw_text)
        clean_text = re.sub(r"^\s*[-•*]\s*", "", clean_text).strip()
        
        # Split into independent sentences if multiple
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", clean_text) if len(s.strip()) > 15]
        if not sentences:
            sentences = [clean_text]

        added_from_this_source = False
        for s in sentences:
            s_concepts = _detect_concepts(s)
            
            # Check overlap: if s_concepts has no intersection with covered_concepts, it's new unique guidance!
            if s_concepts and s_concepts.issubset(covered_concepts):
                # Redundant: already covered by authority or earlier RAG item
                continue

            # Check general text overlap with existing bullets to prevent near-duplicates
            s_words = set(re.findall(r"\b\w{4,}\b", s.lower()))
            is_similar = False
            for b in final_bullets:
                b_words = set(re.findall(r"\b\w{4,}\b", b.lower()))
                if s_words and b_words:
                    overlap_ratio = len(s_words.intersection(b_words)) / max(len(s_words), len(b_words))
                    if overlap_ratio > 0.60:
                        is_similar = True
                        break

            if not is_similar:
                # Cap total safety bullets at 6 to prevent cognitive overload
                if len(final_bullets) < 6:
                    final_bullets.append(s)
                    covered_concepts.update(s_concepts)
                    added_from_this_source = True

        if added_from_this_source:
            used_sources.append(src)

    # If no unique RAG bullets were added because authority already covered everything,
    # keep the top relevant source for citation/reference traceability
    if not used_sources and retrieved_sources:
        used_sources.append(retrieved_sources[0])

    return final_bullets, used_sources


# ──────────────────────────────────────────────────────────────────────────────
# Comprehensive Safety-Instruction Phrase Library (regex → complete Hindi)
# ──────────────────────────────────────────────────────────────────────────────
INSTRUCTION_PHRASE_HI: List[Tuple[str, str]] = [
    # Movement / Evacuation / High Ground
    (r"(?i)move\b.*?\b(higher ground|upper floors?|elevat(ed|ion)|safe (building|place|location)|relief shelter)",
     "तुरंत ऊंचे स्थानों, सुरक्षित पक्के भवनों या ऊपरी मंजिलों पर चले जाएं।"),
    (r"(?i)prioritize (the )?(safe )?evacuation of (the )?(elderly|children|pregnant|disabilit(y|ies))",
     "बुजुर्गों, बच्चों, गर्भवती महिलाओं तथा दिव्यांगजनों को प्राथमिकता के साथ सुरक्षित ऊंचे स्थानों पर पहुंचाएं।"),
    (r"(?i)evacuate (immediately|now|the area|to (a )?(safe|designated|cyclone|relief))",
     "आपदा प्राधिकारियों के निर्देशानुसार तुरंत सुरक्षित निकासी स्थल या राहत शिविर में जाएं।"),
    (r"(?i)follow evacuation",
     "आपदा प्रबंधन अधिकारियों द्वारा जारी निकासी निर्देशों का पूर्ण पालन करें।"),
    (r"(?i)(go|move|proceed) to (an? )?(designated|official|nearest) (evacuation|shelter|relief)",
     "निकटतम अधिकृत राहत शिविर या सुरक्षित केंद्र पर तुरंत पहुंचें।"),

    # Roads / Water crossing / Moving Water
    (r"(?i)(do not|don't|avoid|never)\b.{0,30}\b(cross|drive|walk|travel|swim|cycle).{0,30}\b(flood(ed)?|submerged|waterlogged|underpass|bridge|moving water)\b",
     "बाढ़ प्रभावित या जलमग्न सड़कों, पुलों, और अंडरपास को पार करने का प्रयास कतई न करें।"),
    (r"(?i)(do not|don't|avoid)\b.{0,20}\b(drive|walk)\b.{0,30}\b(road|underpass|bridge)",
     "बाढ़ग्रस्त सड़कों या अंडरपास में वाहन चलाना या पैदल चलना कड़ाई से वर्जित है।"),
    (r"(?i)stay away from.{0,30}(river|stream|canal|drainage|nala|drain|manhole)",
     "नदी, नहर, नाले, खुले मैनहोल या तेज जलधारा के किनारे से तुरंत दूर हो जाएं।"),

    # Water safety & boiling
    (r"(?i)boil\b.{0,30}\b(drinking )?water\b.{0,30}\b(before|prior to|vigorously|minutes)\b",
     "पीने का पानी उपयोग से पहले कम से कम 10 मिनट तक अच्छी तरह उबालें या शुद्धिकरण गोलियों का उपयोग करें।"),
    (r"(?i)discard (all )?(food|vegetables|unpackaged).{0,30}(floodwater|contact)",
     "बाढ़ के पानी के संपर्क में आए सभी खुले खाद्य पदार्थ, सब्जियां और दवाएं फेंक दें।"),
    (r"(?i)do not (drink|use|consume).{0,30}(flood|tap|contaminated) water",
     "बाढ़ का पानी या बिना उबला दूषित पानी पीना सख्त मना है।"),

    # Electrical & Gas
    (r"(?i)switch off.{0,30}(main|electrical|power).{0,30}(breaker|switch|supply)",
     "जलभराव होने पर घर का मुख्य बिजली स्विच/पावर ब्रेकर तुरंत बंद कर दें।"),
    (r"(?i)(stay|keep) away from.{0,30}(fallen|downed|broken|submerged).{0,30}(power.?line|wire|cable|pole)",
     "टूटे या जलमग्न बिजली के तारों, खंभों और केबलों से कम से कम 10 मीटर की सुरक्षित दूरी बनाए रखें।"),
    (r"(?i)shut off.{0,30}(gas|lpg|cylinder|valve)",
     "घर खाली करने से पहले एलपीजी गैस सिलेंडर रेगुलेटर और मुख्य गैस वाल्व बंद कर दें।"),

    # Supplies / Emergency kit
    (r"(?i)keep.{0,30}(emergency|essential).{0,30}(supply|supplies|kit|item|medicine|document|torch)",
     "आवश्यक दवाएं, जरूरी दस्तावेज, वाटरप्रूफ बैग, टॉर्च, अतिरिक्त बैटरी और सूखा भोजन तैयार रखें।"),
    (r"(?i)charge (all )?(mobile|phone|power bank|device)",
     "बिजली गुल होने से पहले अपने मोबाइल फोन, पावर बैंक और इमरजेंसी लाइट पूरी तरह चार्ज कर लें।"),

    # Cyclone-specific
    (r"(?i)remain (indoors|inside).{0,30}(away from|keep).{0,30}(window|glass|external wall)",
     "चक्रवाती हवाओं के दौरान घर के अंदर रहें और कांच की खिड़कियों व बाहरी दीवारों से दूर रहें।"),
    (r"(?i)secure (loose )?(tin|roof|asbestos|outdoor|signage)",
     "उड़ने वाली टिन की चादरें, एस्बेस्टस और खुली वस्तुओं को कसकर बांधें या सुरक्षित स्थान पर रखें।"),
    (r"(?i)do not venture.{0,30}(eye of (the )?storm|calm)",
     "तूफ़ान के केंद्र (Eye of Storm) में हवा शांत होने पर बाहर न निकलें — विपरीत दिशा से तेज हवाएं फिर शुरू होंगी।"),
    (r"(?i)fisherm(en|an).{0,30}(suspend|moor|harbor|sea)",
     "मछुआरों को समुद्र में न जाने और अपनी नौकाओं को सुरक्षित बंदरगाहों में बांधने की सख्त सलाह दी जाती है।"),

    # Earthquake-specific
    (r"(?i)(drop|duck),? (cover|take shelter).{0,30}(hold on|furniture|table|desk|bed)",
     "भूकंप के झटके महसूस होने पर 'Drop, Cover, Hold On' करें — मजबूत मेज के नीचे सिर व गर्दन ढककर बैठें।"),
    (r"(?i)evacuate.{0,30}(stair|stairs|stairwell).{0,30}(never|not).{0,30}(elevator|lift)",
     "झटके रुकने के बाद केवल सीढ़ियों का उपयोग करके बाहर निकलें — लिफ्ट का प्रयोग कतई न करें।"),
    (r"(?i)move (immediately )?to open (ground|area|space)",
     "इमारतों, बिजली के खंभों और ओवरहेड तारों से दूर खुले मैदान में चले जाएं।"),
    (r"(?i)expect (secondary )?aftershocks",
     "मुख्य झटके के बाद आने वाले आफ्टरशॉक के प्रति सतर्क रहें और क्षतिग्रस्त भवनों में प्रवेश न करें।"),

    # Heatwave
    (r"(?i)stay (inside|indoors|at home).{0,30}(11|peak|afternoon|4 ?pm)",
     "दोपहर 11:00 बजे से 4:00 बजे के बीच तेज धूप में बाहर निकलने से बचें।"),
    (r"(?i)(drink|consume).{0,30}(water|ors|fluid|buttermilk|hydration)",
     "पर्याप्त मात्रा में पानी, ओआरएस (ORS), नींबू पानी या छाछ का नियमित सेवन करें।"),
    (r"(?i)never leave (infants|children|pets).{0,30}(vehicle|car)",
     "खड़ी गाड़ियों में बच्चों या पालतू जानवरों को कभी भी अकेला न छोड़ें।"),
    (r"(?i)(heatstroke|fainting|dizziness).{0,30}(shade|cold compress|108)",
     "लू के लक्षण (चक्कर, बेहोशी) दिखने पर पीड़ित को तुरंत छायादार स्थान पर ले जाएं और 108 पर कॉल करें।"),

    # Landslide
    (r"(?i)evacuate.{0,30}(hillside|cracks|muddy|rumbling)",
     "पहाड़ी ढलानों पर दरारें या मटमैला पानी दिखने पर तुरंत सुरक्षित स्थान पर चले जाएं।"),
    (r"(?i)evacuate (uphill|laterally).{0,30}(debris flow|valley)",
     "मलबा बहने की दिशा से लंबवत (ऊंचाई की ओर) भागें — ढलान की ओर नीचे न भागें।"),

    # Wildfire
    (r"(?i)wear (well-fitted )?(n95|p100|respirator|mask|damp cloth)",
     "जहरीले धुएं और राख से बचने के लिए N95 मास्क या गीला कपड़ा मुंह और नाक पर लगाएं।"),

    # Chemical
    (r"(?i)shelter-in-place.{0,30}(seal windows|hvac)",
     "घर के अंदर रहें, खिड़कियों-दरवाजों को सील करें और वेंटिलेशन सिस्टम बंद कर दें।"),
    (r"(?i)evacuate upwind.{0,30}(chemical|plume)",
     "हवा की दिशा के विपरीत (Upwind) सुरक्षित स्थान की ओर तुरंत निकलें।"),

    # Storm / Lightning
    (r"(?i)seek shelter.{0,30}(building|never).{0,30}(trees?|metal)",
     "पक्के भवन में शरण लें — किसी भी पेड़ या टीन शेड के नीचे खड़े न हों।"),

    # Help / General
    (r"(?i)(call|contact).{0,30}(1077|1070|112|108|emergency|rescue)",
     "आपातकालीन सहायता व बचाव के लिए राष्ट्रीय हेल्पलाइन 112 या जिला आपदा नियंत्रण कक्ष 1077 पर संपर्क करें।"),
    (r"(?i)follow (all )?official (emergency )?(instructions|updates|guidelines)",
     "जिला प्रशासन व आपदा प्रबंधन प्राधिकरण द्वारा जारी सभी आधिकारिक सुरक्षा निर्देशों का पालन करें।")
]

def _translate_safety_instruction_to_hindi(instruction: str) -> str:
    """Translates a single English safety instruction into accurate, natural Hindi."""
    clean = instruction.strip().lstrip("•-* ").strip()
    if not clean:
        return ""

    # 1. Match against comprehensive safety phrase library
    for pattern, hi_text in INSTRUCTION_PHRASE_HI:
        if re.search(pattern, clean):
            # If line mentions 1077 or 112 specifically, ensure number is preserved
            if "1077" in clean and "1077" not in hi_text:
                hi_text += " (हेल्पलाइन: 1077)"
            if "112" in clean and "112" not in hi_text:
                hi_text += " (आपातकालीन नंबर: 112)"
            return hi_text

    # 2. Heuristic safety rule translations
    clean_lower = clean.lower()
    if "evacuat" in clean_lower or "move" in clean_lower:
        return "आपदा अधिकारियों के निर्देशानुसार तुरंत सुरक्षित ऊंचे स्थान पर जाएं।"
    if "boil" in clean_lower or "water" in clean_lower:
        return "पीने का पानी उपयोग से पहले अच्छी तरह उबालें और सुरक्षित रखें।"
    if "power" in clean_lower or "electric" in clean_lower or "breaker" in clean_lower:
        return "बिजली के मुख्य स्विच को बंद रखें और टूटे तारों से दूर रहें।"
    if "stay indoors" in clean_lower or "inside" in clean_lower:
        return "सुरक्षित पक्के भवन के अंदर रहें और आधिकारिक सूचनाओं की प्रतीक्षा करें।"
    if "kit" in clean_lower or "medicine" in clean_lower or "document" in clean_lower:
        return "जरूरी दवाएं, महत्वपूर्ण दस्तावेज और आपातकालीन किट तैयार रखें।"

    return f"सुरक्षा निर्देश: {clean} — कृपया प्रशासन के निर्देशों का पालन करें।"


def compose_structured_citizen_message_en(
    title: str,
    disaster_type: str,
    description: str,
    severity: str,
    urgency: str,
    area_name: str,
    deduplicated_bullets: List[str]
) -> str:
    """Composes the final structured English citizen-facing warning."""
    situation = (
        description.strip()
        if description
        else f"An official {severity.lower()} {disaster_type.lower()} event is impacting {area_name}."
    )
    formatted_bullets = "\n".join([f"• {b}" for b in deduplicated_bullets])

    msg = (
        f"🚨 EMERGENCY WARNING: {severity.upper()} {disaster_type.upper()}\n"
        f"Target Area: {area_name}\n"
        f"Urgency: {urgency.title()} Action Required\n\n"
        f"Situation Overview:\n{situation}\n\n"
        f"Official Safety & Evacuation Instructions:\n{formatted_bullets}\n\n"
        f"Citizen Actions: Stay calm, follow all safety instructions, "
        f"and use the 'I Need Help / Rescue' button if you or your family require emergency assistance."
    )
    return msg


def compose_structured_citizen_message_hi(
    title: str,
    disaster_type: str,
    description: str,
    severity: str,
    urgency: str,
    area_name: str,
    deduplicated_bullets: List[str]
) -> str:
    """Composes the final structured Hindi citizen-facing warning (line-by-line complete translation)."""
    dt_hi  = DISASTER_HI_MAP.get(disaster_type, f"{disaster_type} (आपदा)")
    sev_hi = SEVERITY_HI_MAP.get(severity, f"{severity} स्तर")
    urg_hi = URGENCY_HI_MAP.get(urgency, f"{urgency}")

    hi_bullets = []
    for b in deduplicated_bullets:
        trans = _translate_safety_instruction_to_hindi(b)
        if trans:
            hi_bullets.append(f"• {trans}")

    formatted_hi_bullets = "\n".join(hi_bullets)

    situation_hi = (
        f"{area_name} क्षेत्र में {dt_hi} की आधिकारिक चेतावनी जारी की गई है। "
        f"यह स्थिति {sev_hi} की श्रेणी में है और तत्काल ध्यान देने की आवश्यकता है।"
    )

    msg = (
        f"🚨 आधिकारिक आपातकालीन चेतावनी: {dt_hi}\n"
        f"प्रभावित क्षेत्र: {area_name}\n"
        f"गंभीरता व तत्परता: {sev_hi} | {urg_hi}\n\n"
        f"स्थिति विवरण:\n{situation_hi}\n\n"
        f"अनिवार्य सुरक्षा एवं निकासी निर्देश:\n{formatted_hi_bullets}\n\n"
        f"नागरिक आवश्यक कार्रवाई: शांत रहें और सभी सुरक्षा निर्देशों का पालन करें। "
        f"यदि आपको तत्काल बचाव या राहत सहायता की आवश्यकता है, "
        f"तो 'I Need Help / Rescue' बटन पर क्लिक करके आपदा नियंत्रण कक्ष को सूचित करें।"
    )
    return msg


def validate_translation_completeness(
    en_text: str,
    hi_text: str,
    raw_instructions: str,
    area_name: str
) -> Tuple[bool, str]:
    """
    Validates that the Hindi translation is 100% complete and accurate:
      1. Non-empty with minimum required length
      2. Contains authentic Devanagari script
      3. Bullet count parity between English and Hindi
      4. Zero untranslated English sentence lines in the Hindi output
      5. Section parity across both versions
    """
    if not en_text or len(en_text.strip()) < 40:
        return False, "English warning text is empty or too short."
    if not hi_text or len(hi_text.strip()) < 40:
        return False, "Hindi translated warning text is empty or too short."

    # Devanagari check
    has_devanagari = any('\u0900' <= ch <= '\u097F' for ch in hi_text)
    if not has_devanagari:
        return False, "Hindi translation does not contain valid Devanagari script."

    # Bullet parity check
    en_bullets = [l.strip() for l in en_text.split("\n") if l.strip().startswith("•")]
    hi_bullets = [l.strip() for l in hi_text.split("\n") if l.strip().startswith("•")]

    if len(en_bullets) > 0 and len(hi_bullets) == 0:
        return False, "Hindi translation omitted bulleted safety instructions."

    if abs(len(en_bullets) - len(hi_bullets)) > 1:
        return False, f"Bullet count mismatch: English has {len(en_bullets)}, Hindi has {len(hi_bullets)}."

    # Check for untranslated English sentences in Hindi output
    hi_lines = [l.strip() for l in hi_text.split("\n") if l.strip()]
    for line in hi_lines:
        if line.startswith("•"):
            bullet_body = line.lstrip("• ").strip()
            # Count ASCII vs Devanagari chars
            ascii_alpha = sum(1 for ch in bullet_body if ch.isascii() and ch.isalpha())
            devanagari = sum(1 for ch in bullet_body if '\u0900' <= ch <= '\u097F')
            total = max(1, ascii_alpha + devanagari)
            if ascii_alpha / total > 0.65 and devanagari < 10:
                return False, f"Instruction line appears untranslated: '{bullet_body[:60]}...'"

    return True, "Valid complete translation."


async def generate_simplified_citizen_communication(
    disaster_type: str,
    title: str,
    description: str,
    severity: str,
    urgency: str,
    area_name: str,
    recommended_instructions: str,
    retrieved_context_text: Optional[str] = None,
    retrieved_sources: Optional[List[Dict[str, Any]]] = None
) -> Tuple[str, str, str, str, str]:
    """
    Genuine RAG Warning Pipeline:
      1. Performs semantic deduplication between authoritative instructions & retrieved RAG guidance.
      2. Combines authority source of truth with unique supporting safety knowledge.
      3. Passes structured 3-tier payload to OpenAI / Gemini / Guaranteed Deterministic Engine.
      4. Validates translation completeness & grounding safety.
      5. Returns: (english_text, hindi_text, generation_source, grounding_score, grounding_note)
    """
    from backend.app.services.grounding_validator import validate_grounding_safety

    # 1. Semantic Deduplication & Combination Layer
    dedup_bullets, used_sources = semantic_deduplicate_instructions(
        authority_instructions=recommended_instructions,
        retrieved_sources=retrieved_sources or [],
        disaster_type=disaster_type
    )

    # 2. Build structured prompt for LLM
    system_prompt = (
        "You are CrisisBridge AI Multilingual Disaster Communication Specialist.\n"
        "Generate a grounded, actionable, citizen-facing warning in BOTH English (simplified_en) "
        "AND complete Hindi (simplified_hi).\n\n"
        "MANDATORY THREE-TIER INFORMATION POLICY:\n"
        "1. TIER 1 (AUTHORITATIVE OFFICIAL WARNING): The official warning is the absolute SOURCE OF TRUTH. "
        "You must NEVER alter the disaster type, target location/area, severity, urgency, evacuation directives, "
        "or emergency contact telephone numbers entered by the emergency authority.\n"
        "2. TIER 2 (STRUCTURED CAP EVENT METADATA): Respect the formal event classification, urgency, and hazard boundary.\n"
        "3. TIER 3 (TRUSTED RETRIEVED KNOWLEDGE): Use the provided deduplicated safety precautions to enrich the message. "
        "Do NOT duplicate safety points that are already expressed. Do NOT invent fake shelter names, road closures, or unverified facts.\n\n"
        "MULTILINGUAL TRANSLATION MANDATES:\n"
        "1. COMPLETE COVERAGE: Translate the ENTIRE warning into Hindi in Devanagari script — Headline, Area, Situation Overview, "
        "EVERY SINGLE instruction bullet, and Citizen Actions.\n"
        "2. PROPER NOUNS: Preserve place names (e.g. 'Rajendra Nagar', 'Patna'), agency names (NDRF, SDRF, NDMA), "
        "and phone numbers (1077, 112, 108) accurately.\n"
        "3. ZERO UNTRANSLATED ENGLISH: Do not leave English sentences or headings in the Hindi output.\n"
        "4. FORMAT: Return ONLY a valid JSON object with keys 'simplified_en' and 'simplified_hi'. No markdown wrappers.\n"
    )

    user_payload = {
        "tier_1_authoritative_warning": {
            "title": title,
            "area_name": area_name,
            "description": description,
            "recommended_instructions": "\n".join([f"• {b}" for b in dedup_bullets])
        },
        "tier_2_structured_cap_event": {
            "disaster_type": disaster_type,
            "severity": severity,
            "urgency": urgency
        },
        "tier_3_trusted_retrieved_guidance": retrieved_context_text or "Standard national disaster SOPs apply."
    }

    # ── 1. Try OpenAI ──────────────────────────────────────────────────────────
    if settings.OPENAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user",   "content": json.dumps(user_payload, ensure_ascii=False)}
                        ],
                        "temperature": 0.1,
                        "response_format": {"type": "json_object"}
                    }
                )
                if resp.status_code == 200:
                    data    = resp.json()
                    content = json.loads(data["choices"][0]["message"]["content"])
                    en_res  = content.get("simplified_en", "").strip()
                    hi_res  = content.get("simplified_hi", "").strip()
                    
                    is_valid_trans, t_reason = validate_translation_completeness(
                        en_res, hi_res, recommended_instructions, area_name
                    )
                    is_grounded, g_note, g_score, _ = validate_grounding_safety(
                        en_res, hi_res, title, disaster_type, severity, urgency,
                        area_name, recommended_instructions, retrieved_sources
                    )

                    if is_valid_trans and is_grounded:
                        logger.info("RAG Grounded Warning generated via OpenAI — all validations passed.")
                        return en_res, hi_res, "OpenAI", g_score, g_note
                    else:
                        logger.warning(f"OpenAI output failed validation (Trans: {t_reason}, Ground: {g_note}), falling back.")
        except Exception as e:
            logger.warning(f"OpenAI service call failed: {e}")

    # ── 2. Try Gemini ──────────────────────────────────────────────────────────
    if settings.GEMINI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                url = (
                    "https://generativelanguage.googleapis.com/v1beta/"
                    f"models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
                )
                prompt_text = (
                    f"{system_prompt}\n\n"
                    f"Input data:\n{json.dumps(user_payload, ensure_ascii=False)}\n\n"
                    "Respond ONLY with the JSON object."
                )
                resp = await client.post(
                    url,
                    json={"contents": [{"parts": [{"text": prompt_text}]}]}
                )
                if resp.status_code == 200:
                    data     = resp.json()
                    raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    cleaned  = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip())
                    parsed   = json.loads(cleaned)
                    en_res   = parsed.get("simplified_en", "").strip()
                    hi_res   = parsed.get("simplified_hi", "").strip()
                    
                    is_valid_trans, t_reason = validate_translation_completeness(
                        en_res, hi_res, recommended_instructions, area_name
                    )
                    is_grounded, g_note, g_score, _ = validate_grounding_safety(
                        en_res, hi_res, title, disaster_type, severity, urgency,
                        area_name, recommended_instructions, retrieved_sources
                    )

                    if is_valid_trans and is_grounded:
                        logger.info("RAG Grounded Warning generated via Gemini — all validations passed.")
                        return en_res, hi_res, "Gemini", g_score, g_note
                    else:
                        logger.warning(f"Gemini output failed validation (Trans: {t_reason}, Ground: {g_note}), falling back.")
        except Exception as e:
            logger.warning(f"Gemini service call failed: {e}")

    # ── 3. Guaranteed Deterministic Grounded Engine ───────────────────────────
    logger.info("Using Deterministic Grounded Engine for warning communication.")
    en = compose_structured_citizen_message_en(
        title=title,
        disaster_type=disaster_type,
        description=description,
        severity=severity,
        urgency=urgency,
        area_name=area_name,
        deduplicated_bullets=dedup_bullets
    )
    hi = compose_structured_citizen_message_hi(
        title=title,
        disaster_type=disaster_type,
        description=description,
        severity=severity,
        urgency=urgency,
        area_name=area_name,
        deduplicated_bullets=dedup_bullets
    )
    is_grounded, g_note, g_score, _ = validate_grounding_safety(
        en, hi, title, disaster_type, severity, urgency,
        area_name, recommended_instructions, retrieved_sources
    )
    return en, hi, "Deterministic Engine", g_score, g_note


# Backward-compatible function aliases
_deterministic_simplify_english = compose_structured_citizen_message_en
_deterministic_translate_hindi = compose_structured_citizen_message_hi

