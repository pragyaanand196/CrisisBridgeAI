import re
import json
import logging
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from backend.app.services.vector_store import vector_store
from backend.app.services.document_processor import ingest_all_documents

logger = logging.getLogger("crisisbridge.rag.service")

class RAGService:
    """
    RAG Orchestration Service for CrisisBridge AI:
      1. Context-Aware Dynamic Retrieval Query Construction from CAP Structured Events
      2. Multi-Document Knowledge Retrieval with Relevance Thresholding & Traceability
      3. Grounded Context Formatting for Generative AI Models
      4. Misinformation & Conflicting Information Contextual Analysis
    """

    def __init__(self):
        # Ensure vector store is loaded or ingested
        if not vector_store.chunks:
            logger.info("Initializing vector store from trusted knowledge documents...")
            try:
                ingest_all_documents()
            except Exception as e:
                logger.warning(f"Initial knowledge ingestion failed: {e}")

    def build_retrieval_query(
        self,
        disaster_type: str,
        severity: str,
        urgency: str,
        area_name: str,
        description: str,
        recommended_instructions: str,
        cap_payload: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Dynamically constructs a context-aware retrieval query from actual CAP warning event.
        Extracts disaster hazard, severity, action directives, and environmental conditions.
        """
        query_terms = [disaster_type, severity, urgency]

        # Extract action cues from instructions
        inst_lower = (recommended_instructions or "").lower()
        if "evacuat" in inst_lower or "move" in inst_lower or "high ground" in inst_lower:
            query_terms.append("evacuation procedures safe routes shelter")
        if "boil" in inst_lower or "water" in inst_lower or "drink" in inst_lower:
            query_terms.append("drinking water contamination boiling purification")
        if "power" in inst_lower or "electric" in inst_lower or "wire" in inst_lower or "breaker" in inst_lower:
            query_terms.append("electrical shutoff breaker power line safety")
        if "surge" in inst_lower or "coastal" in inst_lower or "wind" in inst_lower or "roof" in inst_lower:
            query_terms.append("storm surge high wind structural defense")
        if "shak" in inst_lower or "drop" in inst_lower or "cover" in inst_lower or "hold" in inst_lower:
            query_terms.append("drop cover hold on aftershocks structural integrity")
        if "smoke" in inst_lower or "mask" in inst_lower or "fire" in inst_lower or "n95" in inst_lower:
            query_terms.append("smoke inhalation respirators defensible space")
        if "slope" in inst_lower or "mud" in inst_lower or "crack" in inst_lower or "landslide" in inst_lower:
            query_terms.append("slope failure debris flow runoff avoidance")
        if "heat" in inst_lower or "sun" in inst_lower or "hydrat" in inst_lower or "ors" in inst_lower:
            query_terms.append("heatstroke symptoms ORS hydration cooling")
        if "chemical" in inst_lower or "gas" in inst_lower or "toxic" in inst_lower or "vapor" in inst_lower:
            query_terms.append("shelter-in-place HVAC shutoff upwind evacuation")

        if description:
            # Add up to 10 descriptive words
            words = [w for w in re.findall(r"\b\w+\b", description.lower()) if len(w) > 3][:10]
            query_terms.extend(words)

        constructed_query = " ".join(query_terms)
        return constructed_query

    def retrieve_grounding_knowledge(
        self,
        query: str,
        disaster_type: str,
        top_k: int = 3,
        min_score: float = 0.22
    ) -> Tuple[List[Dict[str, Any]], str]:
        """
        Retrieves top relevant trusted knowledge chunks from the VectorStore.
        Returns:
          - retrieved_sources (list of metadata dicts)
          - formatted_context_text (clean prompt-ready string)
        """
        try:
            chunks = vector_store.search(
                query=query,
                disaster_type_filter=disaster_type,
                top_k=top_k,
                min_score=min_score
            )
        except Exception as e:
            logger.error(f"Error executing vector search: {e}")
            return [], ""

        if not chunks:
            # Fallback: search without disaster type filter for general preparedness
            try:
                chunks = vector_store.search(
                    query=query,
                    disaster_type_filter=None,
                    top_k=2,
                    min_score=min_score
                )
            except Exception:
                chunks = []

        if not chunks:
            return [], ""

        # Format retrieved chunks for AI prompt
        context_blocks = []
        for i, ch in enumerate(chunks, 1):
            block = (
                f"--- [TRUSTED SOURCE {i}: {ch['doc_title']} ({ch['source_agency']})] ---\n"
                f"Topic: {ch['topic']} | Chunk ID: {ch['chunk_id']} | Relevance: {int(ch['score']*100)}%\n"
                f"{ch['text'].strip()}"
            )
            context_blocks.append(block)

        formatted_text = "\n\n".join(context_blocks)
        return chunks, formatted_text

    def analyze_conflicting_report(
        self,
        claim_title: str,
        claim_content: str,
        reported_location: Optional[str],
        active_warnings: List[Any]
    ) -> Dict[str, Any]:
        """
        Second-Stage RAG Application:
        Compares citizen reports/rumors against active CAP warnings and trusted knowledge base.
        Returns structured verification analysis without auto-dismissing community reports.
        """
        combined_claim = f"{claim_title} {claim_content}".lower()
        
        # 1. Match against active authoritative warnings
        matched_warnings = []
        is_direct_conflict = False
        conflict_reasons = []

        for warn in active_warnings:
            # Location or disaster match
            area_match = bool(reported_location and reported_location.lower() in warn.area_name.lower())
            title_match = bool(warn.disaster_type.lower() in combined_claim)

            if area_match or title_match:
                matched_warnings.append(warn)
                
                # Check for cancellation / all-clear contradiction
                if any(w in combined_claim for w in ["cancel", "ended", "safe now", "all clear", "no flood", "fake", "over", "withdrawn", "divert", "lifted", "remain at home"]):
                    if warn.status in ["Active", "Approved", "Updated"] and warn.severity in ["Extreme", "Severe", "Moderate"]:
                        is_direct_conflict = True
                        conflict_reasons.append(
                            f"Citizen claim states alert is over/cancelled, but Official Warning #{warn.id} "
                            f"('{warn.title}') remains ACTIVE with {warn.severity} severity."
                        )

                # Check for conflicting shelter claims
                if "shelter" in combined_claim:
                    conflict_reasons.append(
                        f"Citizen reports alternate shelter location. Official warning directs citizens to: {warn.recommended_instructions[:100]}..."
                    )

        # 2. Retrieve trusted reference knowledge for the claim
        claim_sources, _ = self.retrieve_grounding_knowledge(
            query=f"{claim_title} {claim_content}",
            disaster_type=matched_warnings[0].disaster_type if matched_warnings else "General Disaster",
            top_k=2,
            min_score=0.15
        )

        # 3. Determine recommended classification
        if is_direct_conflict:
            classification = "Conflicting with Official Information"
            summary = "Potential conflict detected with active official disaster warning."
        elif "water" in combined_claim or "higher" in combined_claim or "rising" in combined_claim:
            classification = "Under Review"
            summary = "Community field observation: Flood/hazard observation submitted. Requires field verification."
        else:
            classification = "Unverified"
            summary = "Submitted claim recorded for authority investigation."

        return {
            "classification": classification,
            "summary": summary,
            "direct_conflict": is_direct_conflict,
            "conflict_reasons": conflict_reasons,
            "matched_active_warnings_count": len(matched_warnings),
            "retrieved_reference_sources": [s.get("doc_title") for s in claim_sources]
        }

rag_service = RAGService()
