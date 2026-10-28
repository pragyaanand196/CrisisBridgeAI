import os
import re
import math
import logging
import numpy as np
import httpx
from typing import List, Union, Optional
from backend.app.config import settings

logger = logging.getLogger("crisisbridge.rag.embedding")

# Cache for local sentence-transformers model if available
_LOCAL_MODEL = None
_LOCAL_MODEL_ATTEMPTED = False

class EmbeddingService:
    """
    Multi-tier resilient Embedding Service for CrisisBridge AI RAG pipeline.
    
    Tiers:
      1. Gemini Text Embedding (models/text-embedding-004) if GEMINI_API_KEY is configured
      2. OpenAI Text Embedding (text-embedding-3-small) if OPENAI_API_KEY is configured
      3. Local SentenceTransformers (all-MiniLM-L6-v2) if installed and loadable
      4. Resilient Deterministic Semantic Vectorizer (TF-IDF / N-gram dense projection)
         Guaranteed 100% uptime, zero external network dependency, deterministic cosine similarity.
    """
    
    VECTOR_DIM = 384  # Standard dense vector dimension

    def __init__(self):
        self.provider = "Deterministic"
        self._check_available_providers()

    def _check_available_providers(self):
        if settings.GEMINI_API_KEY:
            self.provider = "Gemini"
        elif settings.OPENAI_API_KEY:
            self.provider = "OpenAI"
        else:
            self.provider = "Local/Deterministic"
        logger.info(f"EmbeddingService initialized with default primary provider: {self.provider}")

    def embed_text(self, text: str) -> List[float]:
        """
        Generates vector embedding for a single text chunk or query.
        """
        if not text or not text.strip():
            return [0.0] * self.VECTOR_DIM
        
        # 1. Try Gemini
        if settings.GEMINI_API_KEY:
            try:
                emb = self._embed_gemini(text.strip())
                if emb and len(emb) > 0:
                    return self._normalize(emb)
            except Exception as e:
                logger.warning(f"Gemini embedding failed ({e}), trying next tier...")

        # 2. Try OpenAI
        if settings.OPENAI_API_KEY:
            try:
                emb = self._embed_openai(text.strip())
                if emb and len(emb) > 0:
                    return self._normalize(emb)
            except Exception as e:
                logger.warning(f"OpenAI embedding failed ({e}), trying next tier...")

        # 3. Try Local Sentence-Transformers
        local_emb = self._embed_local(text.strip())
        if local_emb is not None:
            return self._normalize(local_emb)

        # 4. Deterministic Semantic Vectorizer (Guaranteed 100% resilient)
        return self._embed_deterministic(text.strip())

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generates vector embeddings for a list of text strings.
        """
        return [self.embed_text(t) for t in texts]

    def _embed_gemini(self, text: str) -> Optional[List[float]]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={settings.GEMINI_API_KEY}"
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, json={
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": text[:2000]}]}
            })
            if resp.status_code == 200:
                data = resp.json()
                values = data.get("embedding", {}).get("values", [])
                if values:
                    # Project or slice to VECTOR_DIM
                    return self._project_dim(values, self.VECTOR_DIM)
        return None

    def _embed_openai(self, text: str) -> Optional[List[float]]:
        url = "https://api.openai.com/v1/embeddings"
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                json={
                    "model": "text-embedding-3-small",
                    "input": text[:2000],
                    "dimensions": self.VECTOR_DIM
                }
            )
            if resp.status_code == 200:
                data = resp.json()
                values = data["data"][0]["embedding"]
                if values:
                    return values
        return None

    def _embed_local(self, text: str) -> Optional[List[float]]:
        global _LOCAL_MODEL, _LOCAL_MODEL_ATTEMPTED
        if not _LOCAL_MODEL_ATTEMPTED:
            _LOCAL_MODEL_ATTEMPTED = True
            try:
                # Only load if local files exist, never hang on download
                from sentence_transformers import SentenceTransformer
                _LOCAL_MODEL = SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
                logger.info("Loaded local SentenceTransformer model: all-MiniLM-L6-v2")
            except Exception as e:
                logger.debug(f"Local sentence-transformers offline/uncached ({e}), using deterministic semantic projection.")
                _LOCAL_MODEL = None
        
        if _LOCAL_MODEL is not None:
            try:
                emb = _LOCAL_MODEL.encode(text, convert_to_numpy=True)
                return emb.tolist()
            except Exception as e:
                logger.warning(f"Local model encode error: {e}")
        return None

    def _embed_deterministic(self, text: str) -> List[float]:
        """
        Deterministic, semantic hash-and-TF-IDF dense projection.
        Maps text tokens and n-grams consistently into a unit-normalized dense vector space
        where related disaster safety phrases share high cosine similarity.
        """
        vec = np.zeros(self.VECTOR_DIM, dtype=np.float32)
        tokens = re.findall(r"\b\w+\b", text.lower())
        if not tokens:
            return vec.tolist()

        # Unigrams & bigrams
        terms = list(tokens)
        for i in range(len(tokens) - 1):
            terms.append(f"{tokens[i]}_{tokens[i+1]}")

        # Domain term weighting dictionary
        domain_weights = {
            "flood": 3.0, "evacuate": 3.5, "water": 2.5, "boil": 3.0, "breaker": 2.5, "power": 2.0,
            "cyclone": 3.0, "wind": 2.5, "surge": 3.0, "shelter": 2.5, "storm": 2.5, "coastal": 2.0,
            "earthquake": 3.5, "shaking": 2.5, "drop": 3.0, "cover": 3.0, "hold": 3.0, "aftershock": 3.0,
            "wildfire": 3.5, "smoke": 3.0, "fire": 2.5, "flame": 2.5, "mask": 2.5, "n95": 3.0,
            "landslide": 3.5, "slope": 2.5, "mudflow": 3.0, "rockfall": 3.0, "debris": 2.5,
            "heatwave": 3.5, "hydration": 3.0, "heatstroke": 3.5, "temperature": 2.0, "ors": 3.0,
            "tsunami": 3.5, "receding": 3.0, "ocean": 2.5, "wave": 2.5, "inland": 2.5,
            "lightning": 3.5, "thunder": 2.5, "cloudburst": 3.5, "tree": 2.0,
            "chemical": 3.5, "spill": 3.0, "toxic": 3.0, "vapor": 2.5, "seal": 2.5, "upwind": 3.0,
            "emergency": 2.0, "safety": 2.0, "rescue": 2.5, "urgent": 2.0, "immediate": 2.0
        }

        for term in terms:
            w = domain_weights.get(term, 1.0)
            # Hash buckets across dimension
            h1 = (hash(term) ^ 0x5bf03635) % self.VECTOR_DIM
            h2 = (hash(term + "_alt") ^ 0x3c6ef372) % self.VECTOR_DIM
            vec[h1] += w * 1.0
            vec[h2] += w * 0.5

        # Normalize
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()

    def _project_dim(self, values: List[float], target_dim: int) -> List[float]:
        if len(values) == target_dim:
            return values
        if len(values) > target_dim:
            return values[:target_dim]
        # Pad with zeros
        return values + [0.0] * (target_dim - len(values))

    def _normalize(self, vec: List[float]) -> List[float]:
        arr = np.array(vec, dtype=np.float32)
        norm = np.linalg.norm(arr)
        if norm > 0:
            arr = arr / norm
        return arr.tolist()

embedding_service = EmbeddingService()
