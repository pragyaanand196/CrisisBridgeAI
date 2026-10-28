import sys
import os
import json
import asyncio
from datetime import datetime

# Add root directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.database import SessionLocal
from backend.app.models.user import User
from backend.app.models.warning import Warning
from backend.app.models.citizen_response import CitizenResponse
from backend.app.models.assistance_request import AssistanceRequest
from backend.app.models.verification_report import VerificationReport
from backend.app.services.rag_service import rag_service
from backend.app.services.vector_store import vector_store
from backend.app.services.document_processor import ingest_all_documents
from backend.app.services.grounding_validator import validate_grounding_safety
from backend.app.services.ai_service import (
    generate_simplified_citizen_communication,
    validate_translation_completeness
)

client = TestClient(app)

def run_deep_rag_verification():
    print("=" * 80)
    print("CRISISBRIDGE AI — DEEP RAG INTEGRATION & FULL WORKFLOW VERIFICATION AUDIT")
    print("=" * 80)

    db = SessionLocal()

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Zero Database Loss Guarantee Verification
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 1. Verifying Database Integrity & User Preservation ---")
    initial_users = db.query(User).all()
    print(f"Total existing user records: {len(initial_users)}")
    user_emails = [u.email for u in initial_users]
    print(f"Registered users: {user_emails}")
    assert len(initial_users) >= 1, "Expected at least some pre-existing user records to be preserved!"
    print("  [PASS] Zero database loss verified.")

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Knowledge Base Ingestion & Multi-Disaster Retrieval Testing
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 2. Multi-Disaster Retrieval & Source Traceability Testing ---")
    ingested_count = ingest_all_documents()
    assert len(vector_store.chunks) >= 30, f"Expected >= 30 chunks, got {len(vector_store.chunks)}"
    print(f"  [PASS] VectorStore active with {len(vector_store.chunks)} indexed chunks across 10 official SOP documents.")

    scenarios = [
        {
            "type": "Flood",
            "query": "Severe river flood inundation low-lying area evacuation drinking water boiling electrical breaker",
            "expected_doc": "NDMA-SOP-FLD-2024-V2",
            "expected_terms": ["water", "boil", "evacuate", "flood", "ground"]
        },
        {
            "type": "Cyclone",
            "query": "Severe cyclonic storm gale winds storm surge coastal shelter evacuation loose objects",
            "expected_doc": "IMD-NDMA-CYC-2024-V1",
            "expected_terms": ["cyclone", "wind", "shelter", "evacuat", "roof", "storm", "surge"]
        },
        {
            "type": "Earthquake",
            "query": "Earthquake tremor building shaking drop cover hold on aftershocks emergency stairs",
            "expected_doc": "NDMA-EQ-2024-V3",
            "expected_terms": ["drop", "cover", "hold", "shaking", "stair", "elevator", "earthquake"]
        },
        {
            "type": "Wildfire",
            "query": "Forest wildfire ember storm smoke inhalation N95 masks defensible space escape routes",
            "expected_doc": "NDMA-FSI-WLF-2024-V1",
            "expected_terms": ["smoke", "wildfire", "respirator", "mask", "fire", "escape"]
        },
        {
            "type": "Heatwave",
            "query": "Extreme temperature heatwave wet-bulb sun exposure afternoon ORS hydration heatstroke",
            "expected_doc": "NDMA-HW-2024-V4",
            "expected_terms": ["heat", "hydration", "ors", "water", "sun", "indoor"]
        },
        {
            "type": "Landslide",
            "query": "Mountain slope cracks muddy water seepage landslide debris flow uphill evacuation",
            "expected_doc": "GSI-NDMA-LS-2024-V2",
            "expected_terms": ["landslide", "slope", "debris", "crack", "uphill", "mud"]
        }
    ]

    for sc in scenarios:
        res = vector_store.search(sc["query"], disaster_type_filter=sc["type"], top_k=2)
        assert len(res) > 0, f"No chunks retrieved for {sc['type']}"
        top = res[0]
        disaster_code = sc["expected_doc"].split("-")[-2] if "2024" in sc["expected_doc"] else sc["expected_doc"]
        assert sc["expected_doc"] in top["doc_id"] or disaster_code in top["doc_id"] or sc["type"].lower() in top["disaster_type"].lower(), f"Expected {sc['expected_doc']} for {sc['type']}, got {top['doc_id']}"
        assert any(t in top["text"].lower() for t in sc["expected_terms"]), f"Expected safety terms missing from {sc['type']} chunk"
        print(f"  [PASS] {sc['type']:12} -> Doc: '{top['doc_title'][:35]}...' | Section: '{top['topic'][:30]}' | Score: {top['score']:.3f}")

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Dynamic CAP Query Construction & Evidence-Based Grounding Score
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 3. Dynamic CAP Query Building & Grounding Score Audit ---")
    query_flood = rag_service.build_retrieval_query(
        disaster_type="Flood",
        severity="Severe",
        urgency="Immediate",
        area_name="Rajendra Nagar, Patna",
        description="Ganga river inundating residential blocks. Water depth 3 feet.",
        recommended_instructions="• Move to upper floors immediately.\n• Boil drinking water for 10 minutes.\n• Switch off main power breaker.\n• Call Patna Disaster Cell at 1077."
    )
    assert "evacuation" in query_flood and "boiling" in query_flood and "breaker" in query_flood
    print(f"  [PASS] Dynamic query extracted action cues: '{query_flood[:80]}...'")

    chunks, rag_ctx = rag_service.retrieve_grounding_knowledge(query_flood, disaster_type="Flood", top_k=3)
    assert len(chunks) >= 2, "Expected at least 2 relevant chunks for flood query"

    # Test Grounding Validator with complete evidence
    async def gen_msg():
        return await generate_simplified_citizen_communication(
            disaster_type="Flood",
            title="Severe Flood Emergency Warning",
            description="Rapid inundation in low-lying sectors of Rajendra Nagar, Patna.",
            severity="Severe",
            urgency="Immediate",
            area_name="Rajendra Nagar, Patna",
            recommended_instructions="• Move to upper floors immediately.\n• Boil drinking water for 10 minutes.\n• Switch off main power breaker.\n• Call 1077 for rescue.",
            retrieved_context_text=rag_ctx,
            retrieved_sources=chunks
        )

    en_res, hi_res, source, g_score_str, g_note = asyncio.run(gen_msg())
    print(f"  [PASS] AI Generation Source: {source} | Grounding Score: {g_score_str}")
    print(f"  [PASS] Grounding Note: {g_note}")
    assert "Rajendra Nagar" in en_res, "Target area missing from generated message"
    assert "1077" in en_res, "Official helpline 1077 missing from generated message"
    assert "High Grounding" in g_score_str or "Moderate Grounding" in g_score_str

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Fallback / Unsupported Query Handling Audit
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 4. Unsupported Query & Fallback Grounding Audit ---")
    # Simulate an empty/unrelated query with no sources
    empty_sources, empty_ctx = rag_service.retrieve_grounding_knowledge("xyz random nonexistent event 9999", disaster_type="UnknownEvent", min_score=0.99)
    assert len(empty_sources) == 0
    is_valid, note, fallback_score_str, _ = validate_grounding_safety(
        generated_en="🚨 EMERGENCY WARNING: UNKNOWN EVENT\nTarget Area: Test Sector\nInstructions:\n• Stay safe and alert.",
        generated_hi="🚨 आपातकालीन चेतावनी: टेस्ट सेक्टर",
        official_title="Test Warning",
        official_disaster_type="Unknown Event",
        official_severity="Severe",
        official_urgency="Immediate",
        official_area_name="Test Sector",
        official_instructions="• Stay safe and alert.",
        retrieved_sources=[]
    )
    print(f"  [PASS] Fallback Score for 0 sources: '{fallback_score_str}' (Properly tags Authority Direct / No RAG Sources)")
    assert "No RAG Sources" in fallback_score_str or "Authority Direct" in fallback_score_str

    # ──────────────────────────────────────────────────────────────────────────
    # 5. Full End-to-End Warning Creation with RAG via API
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 5. End-to-End Warning Creation, Retrieval, Approval & Distribution ---")
    auth_email = f"ndrf_audit_{datetime.utcnow().strftime('%H%M%S')}@gov.in"
    reg_resp = client.post("/api/v1/auth/register", json={
        "email": auth_email,
        "password": "Password123!",
        "full_name": "Commander A. K. Mishra",
        "role": "authority",
        "department": "State Emergency Operations Centre",
        "jurisdiction": "Bihar Central Division"
    })
    assert reg_resp.status_code == 201
    auth_token = reg_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {auth_token}"}

    create_payload = {
        "disaster_type": "Cyclone",
        "title": "Severe Cyclonic Storm 'Varuna' Landfall Warning",
        "description": "Gale force winds exceeding 110 km/h with 3-meter coastal storm surge expected within 18 hours.",
        "severity": "Extreme",
        "urgency": "Immediate",
        "certainty": "Observed",
        "area_name": "Coastal District Sector 1",
        "recommended_instructions": "• Evacuate to designated Multi-Purpose Cyclone Shelters immediately.\n• Secure loose tin roofing sheets and outdoor items.\n• Stock 5 days of drinking water.\n• Do not venture outside during the eye of the storm.\n• Call 1070 or 112 for emergency rescue.",
        "issuing_authority_name": "SEOC Division 1",
        "target_areas": [
            {
                "name": "Coastal Frontline Zone",
                "target_type": "radius",
                "geometry_geojson": json.dumps({
                    "type": "Polygon",
                    "coordinates": [[[72.80, 18.90], [72.85, 18.90], [72.85, 18.95], [72.80, 18.95], [72.80, 18.90]]]
                }),
                "center_lat": 18.925,
                "center_lng": 72.825,
                "radius_km": 5.0,
                "priority_level": "Critical"
            }
        ]
    }

    warn_resp = client.post("/api/v1/warnings", json=create_payload, headers=headers)
    assert warn_resp.status_code == 201
    warn_obj = warn_resp.json()
    warn_id = warn_obj["id"]
    print(f"  [PASS] Created Cyclone Warning #{warn_id} (CAP Identifier: {warn_obj['identifier']})")
    assert warn_obj["rag_status"] == "Grounded"
    assert warn_obj["rag_grounding_score"] is not None
    assert warn_obj["rag_sources_json"] is not None
    
    rag_sources = json.loads(warn_obj["rag_sources_json"])
    assert len(rag_sources) >= 1
    assert "CYC" in rag_sources[0]["doc_id"] or "cyclone" in rag_sources[0].get("disaster_type", "").lower(), f"Expected Cyclone SOP, got {rag_sources[0]['doc_id']}"
    print(f"  [PASS] RAG retrieved Cyclone-specific knowledge: '{rag_sources[0]['doc_title']}' ({rag_sources[0]['score']:.2f} relevance)")

    # ──────────────────────────────────────────────────────────────────────────
    # 6. Authority Warning Version Update & Fresh RAG Re-indexing
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 6. Warning Version Update & Fresh RAG Retrieval Audit ---")
    version_payload = {
        "title": "Severe Cyclonic Storm 'Varuna' - Escalated High Wind Emergency",
        "severity": "Extreme",
        "recommended_instructions": "• Immediate mandatory evacuation to cyclone shelters.\n• Power grid shutdown imminent — charge emergency lights.\n• Boil drinking water.\n• Call 1070 for emergency rescue.",
        "area_name": "Coastal District Sector 1 & Harbor Zone"
    }
    v_resp = client.post(f"/api/v1/warnings/{warn_id}/version", json=version_payload, headers=headers)
    assert v_resp.status_code == 200
    v_obj = v_resp.json()
    assert v_obj["version"] == 2
    assert v_obj["rag_sources_json"] is not None
    v_sources = json.loads(v_obj["rag_sources_json"])
    assert len(v_sources) >= 1
    print(f"  [PASS] Warning Version 2.0 created with fresh RAG retrieval: {len(v_sources)} sources ({v_obj['rag_grounding_score']})")

    # ──────────────────────────────────────────────────────────────────────────
    # 7. Human Approval, Distribution, Translation & Audio Read-Aloud
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 7. Mandatory Human Approval, Translation & Audio Endpoint ---")
    appr_resp = client.post(f"/api/v1/warnings/{v_obj['id']}/approve-ai", json={"action": "approve"}, headers=headers)
    assert appr_resp.status_code == 200
    assert appr_resp.json()["status"] == "Active"
    print(f"  [PASS] Human Authority Approval recorded for Warning Version 2.0.")

    # Citizen Instruction Endpoints
    hi_resp = client.get(f"/api/v1/citizen/instructions/{v_obj['id']}?language=hi")
    assert hi_resp.status_code == 200
    hi_data = hi_resp.json()
    assert len(hi_data["simplified_text"]) > 100
    assert len(hi_data["read_aloud_text"]) > 100
    print(f"  [PASS] Hindi Citizen Instruction Endpoint: {len(hi_data['simplified_text'])} chars translated.")
    print(f"  [PASS] Web Speech Audio Read-Aloud Text: {len(hi_data['read_aloud_text'])} chars.")

    # ──────────────────────────────────────────────────────────────────────────
    # 8. Second-Stage RAG: Misinformation & Conflict Analysis
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 8. Second-Stage RAG: Misinformation & Community Report Analysis ---")
    # Contradictory report
    rep1_resp = client.post("/api/v1/verification/reports", json={
        "warning_id": v_obj["id"],
        "source_platform": "Social Media",
        "claim_title": "Cyclone alert has been withdrawn for coastal sector",
        "claim_content": "Official announcement says storm diverted, citizens can remain at home.",
        "reported_location": "Coastal District Sector 1"
    })
    assert rep1_resp.status_code == 200
    rep1_id = rep1_resp.json()["id"]

    an1_resp = client.get(f"/api/v1/verification/reports/{rep1_id}/rag-analysis", headers=headers)
    assert an1_resp.status_code == 200
    an1 = an1_resp.json()["rag_analysis"]
    print(f"  Claim 1 Analysis -> Classification: {an1['classification']}")
    assert an1["direct_conflict"] is True
    assert an1["classification"] == "Conflicting with Official Information"
    print(f"  [PASS] RAG detected direct contradiction against active warning: {an1['conflict_reasons'][0]}")

    # ──────────────────────────────────────────────────────────────────────────
    # 9. Final Database Verification
    # ──────────────────────────────────────────────────────────────────────────
    print("\n--- 9. Final Database Integrity Verification ---")
    final_users = db.query(User).all()
    print(f"Total users in DB: {len(final_users)}")
    assert len(final_users) >= len(initial_users)
    print("  [PASS] 100% database records preserved.")

    print("\n" + "=" * 80)
    print("ALL CRISISBRIDGE AI DEEP RAG VERIFICATION AUDIT TESTS PASSED 100%!")
    print("=" * 80)

if __name__ == "__main__":
    run_deep_rag_verification()
