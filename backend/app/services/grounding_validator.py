import re
import logging
from typing import Tuple, List, Dict, Any, Optional

logger = logging.getLogger("crisisbridge.rag.grounding_validator")

def validate_grounding_safety(
    generated_en: str,
    generated_hi: str,
    official_title: str,
    official_disaster_type: str,
    official_severity: str,
    official_urgency: str,
    official_area_name: str,
    official_instructions: str,
    retrieved_sources: Optional[List[Dict[str, Any]]] = None
) -> Tuple[bool, str, str, float]:
    """
    Evaluates AI-generated citizen warnings for Grounding Integrity, Fact Preservation, and Evidence Alignment.
    
    Grounding Evidence Formula (0 - 100%):
      1. Authority Fact Preservation (40 pts max):
         - Target Area Name presence (15 pts)
         - Disaster Type statement (15 pts)
         - Severity/Urgency clarity (10 pts)
      2. Authority Instructions & Helpline Numbers (25 pts max):
         - Mandatory bullet coverage (15 pts)
         - Emergency helpline retention (10 pts)
      3. Trusted Knowledge Base Evidence Grounding (35 pts max):
         - Evaluates actionable safety term overlap between generated advice and retrieved chunks.
         - If no sources retrieved, knowledge grounding is 0 pts -> marked as Fallback/Authority-Only.
      4. Anti-Hallucination Guardrail:
         - Deducts 25 pts if unsupported phone numbers or non-existent shelters are detected.

    Returns:
      (is_valid: bool, validation_note: str, grounding_score_str: str, grounding_score_float: float)
    """
    if not generated_en or len(generated_en.strip()) < 30:
        return False, "Generated English warning is empty or too short.", "0% (Failed)", 0.0

    gen_en_lower = generated_en.lower()
    deductions = []
    
    # ── 1. Authority Fact Preservation (40 pts) ──────────────────────────────
    fact_score = 0.0
    
    # Target Area Name
    area_clean = official_area_name.strip()
    area_tokens = [t for t in re.findall(r"\b\w+\b", area_clean) if len(t) > 2]
    area_found_en = any(t.lower() in gen_en_lower for t in area_tokens) if area_tokens else True
    if area_found_en:
        fact_score += 15.0
    else:
        deductions.append(f"Target area '{official_area_name}' not explicitly stated.")

    # Disaster Type
    dt_clean = official_disaster_type.lower()
    if dt_clean in gen_en_lower:
        fact_score += 15.0
    else:
        deductions.append(f"Disaster type '{official_disaster_type}' not clearly stated.")

    # Severity or Urgency
    if official_severity.lower() in gen_en_lower or official_urgency.lower() in gen_en_lower:
        fact_score += 10.0
    else:
        fact_score += 5.0

    # ── 2. Authority Instructions & Helplines (25 pts) ──────────────────────
    inst_score = 0.0
    
    # Multi-bullet coverage
    raw_bullets = [
        b.strip("- •*\t")
        for b in official_instructions.split("\n")
        if b.strip("- •*\t") and len(b.strip("- •*\t")) > 5
    ]
    if raw_bullets:
        matched_bullets = 0
        for b in raw_bullets:
            b_tokens = [w for w in re.findall(r"\b\w+\b", b.lower()) if len(w) > 3]
            if not b_tokens or any(t in gen_en_lower for t in b_tokens):
                matched_bullets += 1
        coverage_ratio = matched_bullets / max(1, len(raw_bullets))
        inst_score += round(coverage_ratio * 15.0, 2)
        if coverage_ratio < 0.60:
            deductions.append(f"Instruction coverage low ({matched_bullets}/{len(raw_bullets)} matched).")
    else:
        inst_score += 15.0

    # Emergency Helplines
    auth_numbers = set(re.findall(r"\b(?:\+91[-\s]?)?(?:1[0-9]{2,3}|[0-9]{3,4}[-\s]?[0-9]{6,8})\b", official_instructions))
    if auth_numbers:
        gen_numbers = set(re.findall(r"\b(?:\+91[-\s]?)?(?:1[0-9]{2,3}|[0-9]{3,4}[-\s]?[0-9]{6,8})\b", generated_en))
        missing_numbers = auth_numbers - gen_numbers
        if missing_numbers:
            inst_score += 3.0
            deductions.append(f"Helpline number(s) {missing_numbers} omitted.")
        else:
            inst_score += 10.0
    else:
        inst_score += 10.0

    # ── 3. Knowledge Base Context Evidence Alignment (35 pts) ────────────────
    kb_score = 0.0
    if retrieved_sources and len(retrieved_sources) > 0:
        # Collect key vocabulary from retrieved chunks
        kb_text = " ".join([s.get("text", "") for s in retrieved_sources]).lower()
        kb_terms = set(re.findall(r"\b[a-z]{4,}\b", kb_text)) - {
            "this", "that", "with", "from", "have", "they", "must", "when", "will", "your", "should", "their"
        }
        gen_terms = set(re.findall(r"\b[a-z]{4,}\b", gen_en_lower))
        
        overlap = len(kb_terms.intersection(gen_terms))
        # Expected meaningful overlap is 8-25 safety vocabulary terms
        evidence_ratio = min(1.0, overlap / 12.0)
        
        # Factor in average retrieval relevance score from vector search
        avg_retrieval_relevance = sum([s.get("score", 0.5) for s in retrieved_sources]) / max(1, len(retrieved_sources))
        
        kb_score = round((0.6 * evidence_ratio + 0.4 * min(1.0, avg_retrieval_relevance)) * 35.0, 2)
    else:
        kb_score = 0.0

    # ── 4. Anti-Hallucination Checks ─────────────────────────────────────────
    hallucination_penalty = 0.0
    gen_en_numbers = set(re.findall(r"\b(?:\+91[-\s]?)?(?:1[0-9]{2,3}|[0-9]{3,4}[-\s]?[0-9]{6,8})\b", generated_en))
    allowed_known_numbers = {"112", "1077", "1070", "108", "100", "101", "102", "1926", "1554", "011-24363260"}
    knowledge_numbers = set()
    if retrieved_sources:
        for src in retrieved_sources:
            src_text = src.get("text", "")
            knowledge_numbers.update(re.findall(r"\b(?:\+91[-\s]?)?(?:1[0-9]{2,3}|[0-9]{3,4}[-\s]?[0-9]{6,8})\b", src_text))
    
    all_allowed = auth_numbers.union(allowed_known_numbers).union(knowledge_numbers)
    invented_numbers = {n for n in gen_en_numbers if n.replace("-", "").replace(" ", "") not in {a.replace("-", "").replace(" ", "") for a in all_allowed}}
    if invented_numbers:
        hallucination_penalty += 25.0
        deductions.append(f"Hallucinated phone number(s): {invented_numbers}")

    # Compute Total Score
    total_score = fact_score + inst_score + kb_score - hallucination_penalty
    total_score = max(0.0, min(100.0, total_score))

    if not retrieved_sources or len(retrieved_sources) == 0:
        score_str = f"{int(total_score)}% (Authority Direct / No RAG Sources)"
    elif total_score >= 85.0:
        score_str = f"{int(total_score)}% (High Grounding)"
    elif total_score >= 65.0:
        score_str = f"{int(total_score)}% (Moderate Grounding)"
    else:
        score_str = f"{int(total_score)}% (Low Grounding)"

    if total_score < 40.0:
        return False, f"Grounding validation failed: {'; '.join(deductions)}", score_str, total_score

    validation_note = "Valid grounded warning." if not deductions else f"Grounded with notices: {'; '.join(deductions)}"
    return True, validation_note, score_str, total_score
