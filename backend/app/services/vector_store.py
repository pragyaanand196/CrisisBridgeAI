import os
import json
import logging
import numpy as np
from typing import List, Dict, Any, Optional
from backend.app.services.embedding_service import embedding_service

logger = logging.getLogger("crisisbridge.rag.vector_store")

_BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_INDEX_PATH = os.path.join(_BASE_DIR, "knowledge", "vector_index.json")

class KnowledgeChunk:
    def __init__(
        self,
        chunk_id: str,
        doc_id: str,
        doc_title: str,
        source_agency: str,
        disaster_type: str,
        topic: str,
        applicable_environment: str,
        text: str,
        embedding: Optional[List[float]] = None
    ):
        self.chunk_id = chunk_id
        self.doc_id = doc_id
        self.doc_title = doc_title
        self.source_agency = source_agency
        self.disaster_type = disaster_type
        self.topic = topic
        self.applicable_environment = applicable_environment
        self.text = text
        self.embedding = embedding or []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "doc_id": self.doc_id,
            "doc_title": self.doc_title,
            "source_agency": self.source_agency,
            "disaster_type": self.disaster_type,
            "topic": self.topic,
            "applicable_environment": self.applicable_environment,
            "text": self.text,
            "embedding": self.embedding
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "KnowledgeChunk":
        return cls(
            chunk_id=data["chunk_id"],
            doc_id=data["doc_id"],
            doc_title=data["doc_title"],
            source_agency=data["source_agency"],
            disaster_type=data["disaster_type"],
            topic=data.get("topic", ""),
            applicable_environment=data.get("applicable_environment", ""),
            text=data["text"],
            embedding=data.get("embedding", [])
        )

class VectorStore:
    """
    Dedicated Vector Store for trusted disaster management knowledge.
    Provides vector cosine similarity search with lexical/keyword boosting and source traceability.
    """

    def __init__(self, index_file_path: str = DEFAULT_INDEX_PATH):
        self.index_file_path = index_file_path
        self.chunks: List[KnowledgeChunk] = []
        self._matrix: Optional[np.ndarray] = None
        self._load_or_initialize()

    def _load_or_initialize(self):
        if os.path.exists(self.index_file_path):
            try:
                with open(self.index_file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.chunks = [KnowledgeChunk.from_dict(item) for item in data.get("chunks", [])]
                self._rebuild_matrix()
                logger.info(f"Loaded {len(self.chunks)} knowledge chunks from index file: {self.index_file_path}")
                return
            except Exception as e:
                logger.warning(f"Could not load vector index file ({e}), initializing empty store.")
        
        self.chunks = []
        self._matrix = None

    def _rebuild_matrix(self):
        if not self.chunks:
            self._matrix = None
            return
        embeddings = [c.embedding for c in self.chunks]
        self._matrix = np.array(embeddings, dtype=np.float32)

    def add_chunks(self, new_chunks: List[KnowledgeChunk]):
        """
        Adds new knowledge chunks and saves to disk index.
        """
        existing_ids = {c.chunk_id for c in self.chunks}
        for chunk in new_chunks:
            if not chunk.embedding:
                chunk.embedding = embedding_service.embed_text(chunk.text)
            if chunk.chunk_id in existing_ids:
                # Replace existing
                self.chunks = [c if c.chunk_id != chunk.chunk_id else chunk for c in self.chunks]
            else:
                self.chunks.append(chunk)
                existing_ids.add(chunk.chunk_id)

        self._rebuild_matrix()
        self.save_to_disk()
        logger.info(f"VectorStore now contains {len(self.chunks)} indexed chunks.")

    def save_to_disk(self):
        os.makedirs(os.path.dirname(self.index_file_path), exist_ok=True)
        data = {
            "version": "1.0",
            "count": len(self.chunks),
            "chunks": [c.to_dict() for c in self.chunks]
        }
        with open(self.index_file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def search(
        self,
        query: str,
        disaster_type_filter: Optional[str] = None,
        top_k: int = 4,
        min_score: float = 0.20
    ) -> List[Dict[str, Any]]:
        """
        Performs hybrid semantic vector and keyword search.
        Returns top-k matching chunks with similarity score and full source metadata.
        """
        if not self.chunks or self._matrix is None:
            logger.warning("VectorStore search called on empty index.")
            return []

        query_emb = np.array(embedding_service.embed_text(query), dtype=np.float32)
        q_norm = np.linalg.norm(query_emb)
        if q_norm > 0:
            query_emb = query_emb / q_norm

        # 1. Cosine similarity
        dot_products = np.dot(self._matrix, query_emb)
        matrix_norms = np.linalg.norm(self._matrix, axis=1)
        matrix_norms[matrix_norms == 0] = 1.0
        cosine_sims = dot_products / matrix_norms

        # 2. Hybrid scoring with disaster-type and keyword alignment
        query_lower = query.lower()
        query_words = set(query_lower.split())

        results = []
        for idx, chunk in enumerate(self.chunks):
            cos_score = float(cosine_sims[idx])
            
            # Disaster type match boost
            type_boost = 0.0
            if disaster_type_filter:
                dt_clean = disaster_type_filter.lower()
                chunk_dt = chunk.disaster_type.lower()
                if dt_clean in chunk_dt or chunk_dt in dt_clean:
                    type_boost = 0.30
                elif any(w in chunk_dt for w in dt_clean.split()):
                    type_boost = 0.15

            # Lexical keyword overlap score
            chunk_words = set(chunk.text.lower().split())
            overlap = len(query_words.intersection(chunk_words))
            lex_score = min(0.3, overlap * 0.05)

            final_score = (0.65 * cos_score) + type_boost + (0.35 * lex_score)
            # Clip between 0 and 1
            final_score = max(0.0, min(1.0, final_score))

            if final_score >= min_score:
                results.append({
                    "chunk_id": chunk.chunk_id,
                    "doc_id": chunk.doc_id,
                    "doc_title": chunk.doc_title,
                    "source_agency": chunk.source_agency,
                    "disaster_type": chunk.disaster_type,
                    "topic": chunk.topic,
                    "applicable_environment": chunk.applicable_environment,
                    "text": chunk.text,
                    "score": round(final_score, 4),
                    "cosine_similarity": round(cos_score, 4)
                })

        # Sort descending by score
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

vector_store = VectorStore()
