import base64
import hashlib
import uuid
import datetime
from typing import Dict, List, Optional
import numpy as np
import cv2
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/signatures", tags=["Signature Intelligence"])

# In-memory registry for enrolled baseline signatures
SIGNATURE_REGISTRY: Dict[str, Dict] = {}
SIGNATURE_AUDIT_LOGS: List[Dict] = []

GRID_SIZE = 48
SELF_MATCH_THRESHOLD = 68.0       # Minimum score to pass authentic self-verification
COLLISION_THRESHOLD = 75.0        # Score above which a cross-user duplicate is flagged


class EnrollSignatureRequest(BaseModel):
    voter_id: str
    name: str
    signature_base64: str


class VerifySignatureRequest(BaseModel):
    voter_id: str
    signature_base64: str


class SignatureVerificationResponse(BaseModel):
    status: str                         # "VERIFIED" | "MISMATCH" | "COLLISION"
    self_match_score: float
    collision_match_score: float
    collided_with_voter_id: Optional[str] = None
    collided_with_name: Optional[str] = None
    verdict_badge: str
    reason: str
    requires_human_review: bool
    audit_id: str
    timestamp: str


def decode_signature_to_grid(sig_base64: str) -> np.ndarray:
    """
    Decodes a base64 signature image, crops whitespace bounding-box, 
    and normalizes to a fixed 48x48 stroke-density matrix strictly in RAM.
    """
    if "," in sig_base64:
        sig_base64 = sig_base64.split(",", 1)[1]

    raw_bytes = base64.b64decode(sig_base64)
    np_arr = np.frombuffer(raw_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_UNCHANGED)

    if img is None:
        raise ValueError("Invalid image payload for signature processing.")

    # Handle transparent PNG vs Grayscale vs RGB
    if len(img.shape) == 3 and img.shape[2] == 4:
        # Transparent PNG: alpha channel is the stroke mask
        alpha = img[:, :, 3]
        mask = alpha > 20
    else:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        # Dark strokes on light background
        mask = gray < 235

    coords = cv2.findNonZero(mask.astype(np.uint8))
    if coords is None:
        # Empty canvas
        return np.zeros((GRID_SIZE, GRID_SIZE), dtype=np.float32)

    x, y, w, h = cv2.boundingRect(coords)
    cropped = mask[y:y+h, x:x+w].astype(np.float32)

    # Resize to fixed grid
    resized = cv2.resize(cropped, (GRID_SIZE, GRID_SIZE), interpolation=cv2.INTER_AREA)
    norm = np.linalg.norm(resized)
    if norm > 0:
        resized = resized / norm

    return resized


def compute_signature_similarity(grid_a: np.ndarray, grid_b: np.ndarray) -> float:
    """
    Computes cosine similarity between two normalized stroke grids,
    returning a score between 0.0 and 100.0%.
    """
    flat_a = grid_a.flatten()
    flat_b = grid_b.flatten()

    norm_a = np.linalg.norm(flat_a)
    norm_b = np.linalg.norm(flat_b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    similarity = np.dot(flat_a, flat_b) / (norm_a * norm_b)
    # Clamp between 0.0 and 1.0, scale to percentage
    clamped = max(0.0, min(1.0, float(similarity)))
    return round(clamped * 100.0, 1)


@router.post("/enroll")
def enroll_signature(req: EnrollSignatureRequest):
    """Enrolls a baseline signature for a citizen."""
    try:
        grid = decode_signature_to_grid(req.signature_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process signature: {str(e)}")

    record = {
        "voter_id": req.voter_id,
        "name": req.name,
        "signature_base64": req.signature_base64,
        "grid": grid,
        "enrolled_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    SIGNATURE_REGISTRY[req.voter_id] = record

    return {
        "status": "SUCCESS",
        "message": f"Baseline signature for {req.name} ({req.voter_id}) successfully enrolled.",
        "voter_id": req.voter_id,
        "total_enrolled": len(SIGNATURE_REGISTRY)
    }


@router.post("/verify", response_model=SignatureVerificationResponse)
def verify_signature(req: VerifySignatureRequest):
    """
    Validates a signature through the dual-layer forensic check:
    1. Self-Consistency (1:1 against current user's baseline)
    2. Cross-Registry Collision (1:N against all other voters)
    """
    if req.voter_id not in SIGNATURE_REGISTRY:
        raise HTTPException(
            status_code=404, 
            detail=f"Voter ID '{req.voter_id}' does not have an enrolled baseline signature in the system."
        )

    try:
        test_grid = decode_signature_to_grid(req.signature_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode test signature: {str(e)}")

    user_baseline = SIGNATURE_REGISTRY[req.voter_id]
    self_score = compute_signature_similarity(test_grid, user_baseline["grid"])

    # 1:N Cross-user collision check against all OTHER enrolled voters
    max_collision_score = 0.0
    collided_voter_id = None
    collided_voter_name = None

    for other_id, other_record in SIGNATURE_REGISTRY.items():
        if other_id == req.voter_id:
            continue
        sim = compute_signature_similarity(test_grid, other_record["grid"])
        if sim > max_collision_score:
            max_collision_score = sim
            collided_voter_id = other_id
            collided_voter_name = other_record["name"]

    audit_id = f"SIG-{uuid.uuid4().hex[:8].upper()}"
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Evaluation logic
    if max_collision_score >= COLLISION_THRESHOLD:
        status = "COLLISION"
        verdict_badge = "FLAGGED: CROSS-USER DUPLICATE"
        reason = (
            f"ALERT: Potential proxy/batch signing detected. "
            f"Signature matches {collided_voter_name} ({collided_voter_id}) with {max_collision_score}% similarity "
            f"(Threshold: {COLLISION_THRESHOLD}%). Routed to ERB manual investigation."
        )
        requires_human_review = True
    elif self_score < SELF_MATCH_THRESHOLD:
        status = "MISMATCH"
        verdict_badge = "FLAGGED: SIGNATURE INCONSISTENCY"
        reason = (
            f"WARNING: Inconsistent handwriting. Match with {user_baseline['name']}'s baseline is only {self_score}% "
            f"(Required: {SELF_MATCH_THRESHOLD}%). Routed to ERB manual investigation."
        )
        requires_human_review = True
    else:
        status = "VERIFIED"
        verdict_badge = "VERIFIED: AUTHENTIC SIGNATURE"
        reason = (
            f"Passed forensic validation. Authenticity confidence: {self_score}%. "
            f"Cross-user collision risk clean ({max_collision_score}%)."
        )
        requires_human_review = False

    audit_entry = {
        "audit_id": audit_id,
        "voter_id": req.voter_id,
        "voter_name": user_baseline["name"],
        "status": status,
        "self_match_score": self_score,
        "collision_match_score": max_collision_score,
        "collided_with": collided_voter_id,
        "timestamp": timestamp,
        "requires_human_review": requires_human_review
    }
    SIGNATURE_AUDIT_LOGS.append(audit_entry)

    return SignatureVerificationResponse(
        status=status,
        self_match_score=self_score,
        collision_match_score=max_collision_score,
        collided_with_voter_id=collided_voter_id,
        collided_with_name=collided_voter_name,
        verdict_badge=verdict_badge,
        reason=reason,
        requires_human_review=requires_human_review,
        audit_id=audit_id,
        timestamp=timestamp
    )


@router.get("/registry")
def get_signature_registry():
    """Returns all enrolled voters with signatures (without the raw numpy arrays)."""
    return {
        "total": len(SIGNATURE_REGISTRY),
        "voters": [
            {
                "voter_id": rec["voter_id"],
                "name": rec["name"],
                "signature_base64": rec["signature_base64"],
                "enrolled_at": rec["enrolled_at"]
            }
            for rec in SIGNATURE_REGISTRY.values()
        ]
    }


@router.get("/audit")
def get_signature_audit_logs():
    """Returns forensic audit logs for signature validations."""
    return {"logs": SIGNATURE_AUDIT_LOGS}
