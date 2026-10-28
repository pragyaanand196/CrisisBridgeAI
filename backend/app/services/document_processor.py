import os
import re
import json
import glob
import logging
from typing import List, Dict, Any, Tuple
from backend.app.services.vector_store import KnowledgeChunk, vector_store

logger = logging.getLogger("crisisbridge.rag.processor")

_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DOCS_DIR = os.path.join(_BASE_DIR, "knowledge", "documents")
STRUCTURED_BULLETS_FILE = os.path.join(_BASE_DIR, "knowledge", "structured_sop_bullets.json")

def parse_markdown_document(file_path: str) -> Tuple[Dict[str, str], List[Dict[str, str]]]:
    """
    Parses an official disaster reference markdown document.
    Extracts frontmatter metadata and discrete numbered/bulleted safety instructions.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Extract Title (H1)
    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else os.path.basename(file_path)

    # Extract metadata fields
    doc_id_match = re.search(r"\*\*Document ID:\*\*\s*(.+)$", content, re.MULTILINE)
    doc_id = doc_id_match.group(1).strip() if doc_id_match else os.path.splitext(os.path.basename(file_path))[0]

    agency_match = re.search(r"\*\*Source Agency:\*\*\s*(.+)$", content, re.MULTILINE)
    agency = agency_match.group(1).strip() if agency_match else "Official Disaster Authority"

    category_match = re.search(r"\*\*Disaster Category:\*\*\s*(.+)$", content, re.MULTILINE)
    category = category_match.group(1).strip() if category_match else "General Disaster"

    env_match = re.search(r"\*\*Applicable Environment:\*\*\s*(.+)$", content, re.MULTILINE)
    env = env_match.group(1).strip() if env_match else "All Regions"

    metadata = {
        "title": title,
        "doc_id": doc_id,
        "source_agency": agency,
        "disaster_type": category,
        "applicable_environment": env
    }

    # Split by ### Section
    sections = re.split(r"(?=###\s+Section\s+\d+:)", content)
    chunks_data = []

    for s_idx, sec in enumerate(sections):
        sec = sec.strip()
        if not sec or sec.startswith("# "):
            continue
        
        # Get section heading
        sec_head_match = re.search(r"^###\s+(Section\s+\d+:[^\n]+)", sec)
        sec_topic = sec_head_match.group(1).strip() if sec_head_match else f"Section {s_idx}"
        
        # Parse individual numbered items if present for discrete bullet retrieval
        numbered_items = re.findall(r"^\d+\.\s+\*\*([^*]+):\*\*\s*(.+)$", sec, re.MULTILINE)
        if numbered_items:
            for b_idx, (b_title, b_body) in enumerate(numbered_items, 1):
                clean_item = f"**{b_title.strip()}:** {b_body.strip()}"
                chunks_data.append({
                    "chunk_id": f"{doc_id}-SEC{s_idx}-B{b_idx}",
                    "topic": f"{sec_topic} — {b_title.strip()}",
                    "text": clean_item
                })
        else:
            # Whole section as fallback chunk
            chunks_data.append({
                "chunk_id": f"{doc_id}-SEC{s_idx}",
                "topic": sec_topic,
                "text": sec
            })

    return metadata, chunks_data

def ingest_structured_bullets(bullets_file: str = STRUCTURED_BULLETS_FILE) -> List[KnowledgeChunk]:
    """
    Ingests discrete, structured SOP bullet-point records with full metadata.
    """
    if not os.path.exists(bullets_file):
        return []
    try:
        with open(bullets_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        chunks = []
        for item in data:
            c = KnowledgeChunk(
                chunk_id=item.get("bullet_id", f"BULLET-{len(chunks)+1}"),
                doc_id=item.get("bullet_id", "NDMA-SOP"),
                doc_title=item.get("source_title", "Official Disaster Management Guidance"),
                source_agency=item.get("source_agency", "Disaster Management Authority"),
                disaster_type=item.get("disaster_type", "General Disaster"),
                topic=item.get("topic", "Safety Guidance"),
                applicable_environment=item.get("applicable_environment", "All Regions"),
                text=item.get("instruction_text", "")
            )
            chunks.append(c)
        return chunks
    except Exception as e:
        logger.error(f"Failed to load structured bullets: {e}")
        return []

def ingest_all_documents(docs_dir: str = DOCS_DIR) -> int:
    """
    Ingests all trusted knowledge documents & structured bullet points into the Vector Store.
    """
    all_chunks: List[KnowledgeChunk] = []

    # 1. Ingest discrete structured bullets
    bullet_chunks = ingest_structured_bullets()
    all_chunks.extend(bullet_chunks)
    logger.info(f"Loaded {len(bullet_chunks)} discrete structured SOP bullet points.")

    # 2. Ingest markdown documents
    md_files = glob.glob(os.path.join(docs_dir, "*.md"))
    for file_path in md_files:
        try:
            metadata, chunks_data = parse_markdown_document(file_path)
            for c_info in chunks_data:
                chunk = KnowledgeChunk(
                    chunk_id=c_info["chunk_id"],
                    doc_id=metadata["doc_id"],
                    doc_title=metadata["title"],
                    source_agency=metadata["source_agency"],
                    disaster_type=metadata["disaster_type"],
                    topic=c_info["topic"],
                    applicable_environment=metadata["applicable_environment"],
                    text=c_info["text"]
                )
                all_chunks.append(chunk)
        except Exception as e:
            logger.error(f"Error parsing knowledge file {file_path}: {e}")

    vector_store.add_chunks(all_chunks)
    logger.info(f"Successfully ingested {len(all_chunks)} chunks into VectorStore.")
    return len(all_chunks)
