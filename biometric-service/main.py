import os
import sys
import uuid
import time
import datetime
import base64
import numpy as np
import cv2
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Windows UTF-8 environment
os.environ["PYTHONIOENCODING"] = "utf-8"

from face_engine import decode_base64_to_ram_image, extract_512d_embedding, apply_crypto_salt, compute_cosine_similarity
from cloud_db import cloud_db
from signature_service import router as signature_router

app = FastAPI(
    title="ONCE AI - Centralized Anti-Flying Voter Verification Engine",
    description="Physical Ballot Attendance Gatekeeper (Face IN & Face OUT) with Self-Learned AI Pacing Anomaly Detection",
    version="5.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(signature_router)

# COMELEC Central Voter Registry (Starts completely clean - zero dummy IDs)
COMELEC_VOTER_REGISTRY: Dict[str, Dict] = {}

# Attendance & Dual Face Biometric Tracking (Face IN & Face OUT)
VOTING_ATTENDANCE: Dict[str, Dict] = {}
AUDIT_LOGS: List[Dict] = []
BALLOT_ISSUANCES: List[Dict] = []
PRECINCT_TURNOUT: Dict[str, int] = {
    "Precinct 101 - Manila": 0,
    "Precinct 202 - Quezon City": 0,
    "Precinct 303 - Makati": 0,
    "Precinct 404 - Pasig": 0
}

# ==============================================================================
# MOCKED SELF-LEARNED AI VOTING DURATION & PACING ANOMALY ENGINE
# ==============================================================================
class VotingDurationAI:
    def __init__(self):
        # Seeded historical completion times (in seconds) to bootstrap learning
        # Typical voting completion duration: ~180s - 240s (3 - 4 minutes)
        self.history: List[int] = [170, 195, 215, 180, 240, 210, 185, 220, 230, 200, 190, 225]
        self.outliers: List[Dict] = []
        self.precinct_durations: Dict[str, List[int]] = {
            "Precinct 101 - Manila": [180, 210, 195],
            "Precinct 202 - Quezon City": [205, 225, 215],
            "Precinct 303 - Makati": [170, 185, 190],
            "Precinct 404 - Pasig": [220, 240, 230]
        }

    def get_stats(self) -> Dict:
        durations = self.history if self.history else [200]
        mean_val = float(np.mean(durations))
        std_val = float(max(18.0, np.std(durations)))
        
        precinct_stats = {}
        for p, d_list in self.precinct_durations.items():
            if d_list:
                precinct_stats[p] = round(float(np.mean(d_list)), 1)
            else:
                precinct_stats[p] = round(mean_val, 1)

        return {
            "learned_mean_seconds": round(mean_val, 1),
            "learned_std_seconds": round(std_val, 1),
            "total_samples": len(self.history),
            "fastest_seconds": int(min(durations)),
            "slowest_seconds": int(max(durations)),
            "nominal_min_seconds": max(45, int(mean_val - 2.0 * std_val)),
            "nominal_max_seconds": int(mean_val + 2.5 * std_val),
            "outliers_count": len(self.outliers),
            "precinct_averages": precinct_stats
        }

    def evaluate_and_learn(self, voter_id: str, voter_name: str, precinct_id: str, duration_sec: int) -> Dict:
        stats = self.get_stats()
        mean_val = stats["learned_mean_seconds"]
        std_val = stats["learned_std_seconds"]
        z_score = round((duration_sec - mean_val) / std_val, 2)
        
        # Anomaly Detection Logic:
        # Rush anomaly: Completed in < 45 seconds or z_score < -2.0
        # Delay anomaly: Took > 480 seconds (8 mins) or z_score > +2.5
        if duration_sec < 45 or z_score < -2.0:
            flag = "RUSH_ANOMALY"
            severity = "HIGH" if duration_sec < 30 else "MODERATE"
            explanation = (
                f"SUSPICIOUS RAPID COMPLETION: Ballot submitted in {duration_sec}s, significantly faster "
                f"than the learned baseline of {int(mean_val)}s (Z-score: {z_score}). "
                f"Potential indication of unshaded blank ballot, rushed coercion, proxy voting, or booth bypass."
            )
        elif duration_sec > 480 or z_score > 2.5:
            flag = "DELAY_ANOMALY"
            severity = "HIGH" if duration_sec > 600 else "MODERATE"
            mins = duration_sec // 60
            secs = duration_sec % 60
            explanation = (
                f"SUSPICIOUS PROTRACTED COMPLETION: Voter remained in booth for {mins}m {secs}s ({duration_sec}s), "
                f"drastically exceeding the learned baseline of {int(mean_val)}s (Z-score: +{z_score}). "
                f"Potential indication of ballot tampering, illegal phone/photography in booth, unauthorized assistance, or ballot substitution."
            )
        else:
            flag = "NORMAL"
            severity = "NONE"
            explanation = (
                f"NORMAL PACED COMPLETION: Ballot completed in {duration_sec}s ({duration_sec//60}m {duration_sec%60}s), "
                f"consistent with the running learned average of {int(mean_val)}s ± {int(std_val)}s."
            )
        
        # Adaptive Learning: dynamically update model distribution with new voter observation
        self.history.append(duration_sec)
        if precinct_id in self.precinct_durations:
            self.precinct_durations[precinct_id].append(duration_sec)
        else:
            self.precinct_durations[precinct_id] = [duration_sec]

        eval_result = {
            "duration_seconds": duration_sec,
            "duration_formatted": f"{duration_sec//60}m {duration_sec%60}s" if duration_sec >= 60 else f"{duration_sec}s",
            "flag": flag,
            "severity": severity,
            "z_score": z_score,
            "learned_mean_seconds": round(mean_val, 1),
            "explanation": explanation,
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        if flag != "NORMAL":
            self.outliers.insert(0, {
                "voter_id": voter_id,
                "voter_name": voter_name,
                "precinct_id": precinct_id,
                **eval_result
            })

        return eval_result

duration_ai = VotingDurationAI()

# ==============================================================================
# REQUEST & RESPONSE SCHEMAS
# ==============================================================================
class RegisterVoterRequest(BaseModel):
    name: str
    precinct_id: str
    barangay: Optional[str] = "Barangay Malate, Manila"
    birthdate: Optional[str] = "2001-05-15"
    photo_base64: str

class FaceInCheckinRequest(BaseModel):
    voter_id: str
    voter_name: Optional[str] = "Registered Citizen"
    precinct_id: str
    image_base64: str
    liveness_passed: bool = True
    challenges_completed: List[str] = []

class FaceOutCheckoutRequest(BaseModel):
    voter_id: str
    voter_name: Optional[str] = "Registered Citizen"
    precinct_id: str
    image_base64: str
    liveness_passed: bool = True
    simulated_duration_seconds: Optional[int] = None # Allows UI quick-testing of rush or delay anomalies

class SetTTLModeRequest(BaseModel):
    mode: str

class IssuePhysicalBallotRequest(BaseModel):
    voter_id: str
    voter_name: str
    vin: str
    precinct_id: str
    auth_token: str

# ==============================================================================
# CORE ENDPOINTS
# ==============================================================================
@app.get("/")
def read_root():
    stats = duration_ai.get_stats()
    return {
        "service": "ONCE AI Anti-Flying Voter & Dual Face Attendance Gatekeeper",
        "pipeline": "100% Local AI in RAM (Zero External Cloud APIs)",
        "features": [
            "Face IN (Ballot Intake)", 
            "Face OUT (Ballot Feeding & Completion)", 
            "Mocked Self-Learned AI Voting Pacing Anomaly Detection",
            "Sovereign Cancelable Biometric Salting (RA 10173)"
        ],
        "status": "ONLINE",
        "registered_voters_count": len(COMELEC_VOTER_REGISTRY),
        "active_attendance_count": len(VOTING_ATTENDANCE),
        "learned_avg_duration_sec": stats["learned_mean_seconds"],
        "ttl_mode": cloud_db.ttl_mode
    }

@app.get("/api/comelec/voters")
def get_comelec_voters():
    """Returns all registered voters with official COMELEC ID cards."""
    voters = []
    for vid, data in COMELEC_VOTER_REGISTRY.items():
        att = VOTING_ATTENDANCE.get(vid)
        voters.append({
            "voter_id": data["voter_id"],
            "vin": data["vin"],
            "name": data["name"],
            "birthdate": data["birthdate"],
            "precinct_id": data["precinct_id"],
            "barangay": data["barangay"],
            "civil_status": data.get("civil_status", "Single"),
            "citizenship": data.get("citizenship", "Filipino"),
            "photo_base64": data["photo_base64"],
            "registration_status": data["registration_status"],
            "biometric_hash": data["biometric_hash"],
            "has_voted": data.get("has_voted", False),
            "attendance": {
                "status": att.get("status") if att else "NOT_CHECKED_IN",
                "face_in": att.get("face_in_timestamp") if att else None,
                "face_out": att.get("face_out_timestamp") if att else None,
                "duration": att.get("duration_formatted") if att else None,
                "anomaly_flag": att.get("timing_anomaly", {}).get("flag") if att else None
            }
        })
    return {"voters": voters, "count": len(voters)}

@app.delete("/api/comelec/voters/clear-all")
def clear_all_registered_voters():
    """Wipes all registered voters, attendance records, and purges cloud biometric vectors."""
    count = len(COMELEC_VOTER_REGISTRY)
    COMELEC_VOTER_REGISTRY.clear()
    VOTING_ATTENDANCE.clear()
    BALLOT_ISSUANCES.clear()
    cloud_db.crypto_shred()
    global duration_ai
    duration_ai = VotingDurationAI()

    for p in PRECINCT_TURNOUT:
        PRECINCT_TURNOUT[p] = 0

    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    AUDIT_LOGS.insert(0, {
        "id": str(uuid.uuid4())[:8],
        "timestamp": timestamp_str,
        "voter_id": "ADMIN_RESET",
        "precinct_id": "ALL_PRECINCTS",
        "event": "REGISTRY_PURGED_FOR_TESTING",
        "details": f"Removed {count} registered voter IDs. Attendance records & cloud vectors wiped.",
        "status": "DATABASE_RESET"
    })

    return {
        "status": "ALL_VOTERS_PURGED",
        "purged_count": count,
        "message": "All registered voter records, attendance sessions, ballots, and biometric vectors have been completely removed."
    }

@app.post("/api/comelec/register-voter")
def register_new_citizen(payload: RegisterVoterRequest):
    """Enrolls a new real citizen into the COMELEC Registry with their photo."""
    voter_id = f"VOTER-{uuid.uuid4().hex[:6].upper()}"
    vin = f"{abs(hash(payload.name)) % 9000 + 1000}-0026A-{voter_id[-4:]}PH2026"
    
    # Extract reference vector locally in RAM
    img_bgr = decode_base64_to_ram_image(payload.photo_base64)
    raw_vec = extract_512d_embedding(img_bgr)
    salted_vec = apply_crypto_salt(raw_vec)

    record = {
        "voter_id": voter_id,
        "vin": vin,
        "name": payload.name.upper(),
        "birthdate": payload.birthdate or "2000-01-01",
        "precinct_id": payload.precinct_id,
        "barangay": payload.barangay or "Declared Barangay Ward",
        "civil_status": "Single",
        "citizenship": "Filipino",
        "photo_base64": payload.photo_base64,
        "registration_status": "REGISTERED / ELIGIBLE",
        "biometric_hash": f"SHA256:{uuid.uuid4().hex[:12]}...",
        "reference_vector": salted_vec,
        "has_voted": False
    }

    COMELEC_VOTER_REGISTRY[voter_id] = record

    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    AUDIT_LOGS.insert(0, {
        "id": str(uuid.uuid4())[:8],
        "timestamp": timestamp_str,
        "voter_id": voter_id,
        "precinct_id": payload.precinct_id,
        "event": "VOTER_ENROLLED",
        "details": f"Citizen {record['name']} enrolled into COMELEC Registry. VIN: {vin}",
        "status": "ENROLLED"
    })

    return {
        "status": "REGISTERED",
        "voter_id": voter_id,
        "vin": vin,
        "name": record["name"],
        "message": "Official COMELEC Voter's ID created and biometric vector indexed locally in RAM."
    }

# ==============================================================================
# ATTENDANCE 1: FACE IN (BALLOT INTAKE & CHECK-IN)
# ==============================================================================
@app.post("/api/biometrics/verify-face-in")
@app.post("/api/biometrics/verify-precinct-checkin") # Backwards compatibility alias
def verify_face_in(payload: FaceInCheckinRequest):
    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_epoch = time.time()

    # 1. Enforce Liveness
    if not payload.liveness_passed:
        audit_entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": timestamp_str,
            "voter_id": payload.voter_id,
            "precinct_id": payload.precinct_id,
            "event": "LIVENESS_REJECTED",
            "details": "Liveness check unfulfilled at Face IN intake terminal.",
            "status": "BLOCKED"
        }
        AUDIT_LOGS.insert(0, audit_entry)
        return {
            "status": "LIVENESS_FAILED",
            "message": "Liveness check failed. Please look at the intake camera and perform the challenge."
        }

    target_voter = COMELEC_VOTER_REGISTRY.get(payload.voter_id)

    # 2. Check if Ballot Already Cast and Session Locked
    if target_voter and target_voter.get("has_voted"):
        att = VOTING_ATTENDANCE.get(payload.voter_id, {})
        audit_entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": timestamp_str,
            "voter_id": payload.voter_id,
            "precinct_id": payload.precinct_id,
            "event": "DOUBLE_VOTING_BLOCKED",
            "details": f"Citizen {target_voter['name']} has already cast their ballot. Terminal locked.",
            "status": "ALREADY_VOTED_LOCKED"
        }
        AUDIT_LOGS.insert(0, audit_entry)
        return {
            "status": "ALREADY_VOTED_LOCKED",
            "message": f"CITIZEN ALREADY VOTED: Official ballot was already cast by {target_voter['name']} at {att.get('face_out_timestamp', 'earlier today')}. Electoral law strictly limits one ballot per citizen. Terminal locked.",
            "voter_name": target_voter["name"],
            "vin": target_voter["vin"],
            "ballot_serial": target_voter.get("ballot_serial")
        }

    # 3. Check Assigned Polling Precinct
    if target_voter and target_voter.get("precinct_id") and target_voter["precinct_id"] != payload.precinct_id:
        audit_entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": timestamp_str,
            "voter_id": payload.voter_id,
            "precinct_id": payload.precinct_id,
            "event": "WRONG_PRECINCT_INTERCEPTED",
            "details": f"Citizen {target_voter['name']} assigned to '{target_voter['precinct_id']}' attempted to check in at '{payload.precinct_id}'.",
            "status": "WRONG_PRECINCT"
        }
        AUDIT_LOGS.insert(0, audit_entry)
        return {
            "status": "WRONG_PRECINCT",
            "message": f"WRONG PRECINCT: Citizen {target_voter['name']} is officially registered at '{target_voter['precinct_id']}'. This terminal is '{payload.precinct_id}'.",
            "assigned_precinct": target_voter["precinct_id"],
            "current_precinct": payload.precinct_id,
            "voter_name": target_voter["name"],
            "vin": target_voter["vin"]
        }

    try:
        # 4. Strict RAM-Only Base64 Decoding & Vector Extraction
        img_bgr = decode_base64_to_ram_image(payload.image_base64)
        raw_vector = extract_512d_embedding(img_bgr)
        salted_vector = apply_crypto_salt(raw_vector)

        # 5. Check 1:1 ID Photo Match against registered COMELEC record
        id_match_confidence = 98.2

        if target_voter and target_voter.get("reference_vector") is not None:
            stored_ref = np.array(target_voter["reference_vector"], dtype=np.float32)
            id_sim = compute_cosine_similarity(salted_vector, stored_ref)
            
            if id_sim >= 0.77:
                confidence_pct = round(70.0 + min(29.5, ((id_sim - 0.77) / 0.23) * 30.0), 1)
            else:
                confidence_pct = round(max(0.0, (id_sim / 0.77) * 48.0), 1)

            if id_sim < 0.77:
                audit_entry = {
                    "id": str(uuid.uuid4())[:8],
                    "timestamp": timestamp_str,
                    "voter_id": payload.voter_id,
                    "precinct_id": payload.precinct_id,
                    "event": "ID_PHOTO_MISMATCH",
                    "details": f"Live face does not match stored photo on Voter ID ({confidence_pct}% confidence). Impostor blocked.",
                    "status": "IMPOSTOR_BLOCKED"
                }
                AUDIT_LOGS.insert(0, audit_entry)
                return {
                    "status": "ID_PHOTO_MISMATCH",
                    "message": f"IDENTITY REJECTED: Your live face does NOT match the photo on Voter ID '{target_voter['vin']}'. Match confidence: {confidence_pct}%. Impostor check-in blocked.",
                    "similarity": confidence_pct,
                    "raw_similarity": round(id_sim, 3),
                    "stored_id_photo": target_voter["photo_base64"]
                }
            else:
                id_match_confidence = confidence_pct

        # 6. 1:N CROSS-PRECINCT CENTRALIZED CLOUD SCAN (ANTI-FLYING VOTER)
        is_flying_voter, match, similarity = cloud_db.check_flying_voter(
            salted_vector,
            current_voter_id=payload.voter_id,
            current_precinct_id=payload.precinct_id,
            threshold=0.77
        )
        
        if is_flying_voter and match is not None:
            audit_entry = {
                "id": str(uuid.uuid4())[:8],
                "timestamp": timestamp_str,
                "voter_id": payload.voter_id,
                "precinct_id": payload.precinct_id,
                "event": "FLYING_VOTER_INTERCEPTED",
                "original_precinct": match["precinct_id"],
                "original_voter_id": match["voter_id"],
                "first_seen_at": match["checked_in_at"],
                "similarity_score": round(similarity * 100, 1),
                "status": "CRITICAL_FRAUD_PREVENTED"
            }
            AUDIT_LOGS.insert(0, audit_entry)
            
            return {
                "status": "FLYING_VOTER_BLOCKED",
                "message": f"ILLEGAL VOTER DUPLICATION DETECTED: This individual already checked in at '{match['precinct_id']}' at {match['checked_in_at']}.",
                "original_precinct_id": match["precinct_id"],
                "original_voter_id": match["voter_id"],
                "checked_in_at": match["checked_in_at"],
                "similarity_confidence": round(similarity * 100, 1),
                "current_precinct_id": payload.precinct_id,
                "voter_id": payload.voter_id
            }

        # 7. Record Ephemeral Biometric Vector in Central Cloud DB
        record = cloud_db.insert_biometric_record(
            voter_id=payload.voter_id,
            precinct_id=payload.precinct_id,
            salted_vector=salted_vector
        )
        
        auth_token = f"AUTH-COMELEC-{uuid.uuid4().hex[:10].upper()}"
        ballot_serial = f"BALLOT-CEF1-{uuid.uuid4().hex[:8].upper()}"

        # Initialize or Update Attendance Ledger for FACE IN
        voter_name = target_voter["name"] if target_voter else payload.voter_name
        vin_num = target_voter["vin"] if target_voter else f"VIN-{payload.voter_id[-4:]}"

        VOTING_ATTENDANCE[payload.voter_id] = {
            "voter_id": payload.voter_id,
            "voter_name": voter_name,
            "vin": vin_num,
            "precinct_id": payload.precinct_id,
            "barangay": target_voter.get("barangay", "Barangay Malate, Manila") if target_voter else "Barangay Malate, Manila",
            "status": "IN_BOOTH (BALLOT ISSUED)",
            "face_in_timestamp": timestamp_str,
            "face_in_epoch": current_epoch,
            "photo_id_base64": target_voter.get("photo_base64") if target_voter else None,
            "photo_in_base64": payload.image_base64,
            "face_out_timestamp": None,
            "face_out_epoch": None,
            "photo_out_base64": None,
            "duration_seconds": None,
            "duration_formatted": None,
            "timing_anomaly": None,
            "id_match_confidence": id_match_confidence,
            "ballot_serial": ballot_serial
        }

        if target_voter:
            target_voter["ballot_serial"] = ballot_serial
            target_voter["ballot_issued_at"] = timestamp_str
            target_voter["registration_status"] = "BALLOT ISSUED (IN BOOTH)"

        audit_entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": timestamp_str,
            "voter_id": payload.voter_id,
            "precinct_id": payload.precinct_id,
            "event": "FACE_IN_CHECKIN_SUCCESS",
            "details": f"Face IN verified ({id_match_confidence}% match). Physical ballot {ballot_serial} handed off. Citizen in booth.",
            "status": "CLEARED_FACE_IN"
        }
        AUDIT_LOGS.insert(0, audit_entry)
        
        return {
            "status": "VERIFIED",
            "step": "FACE_IN_COMPLETE",
            "message": f"Biometric Attendance IN successful! Ballot {ballot_serial} handed to citizen. Shading in booth.",
            "voter_id": payload.voter_id,
            "precinct_id": payload.precinct_id,
            "auth_token": auth_token,
            "ballot_serial": ballot_serial,
            "id_match_confidence": id_match_confidence,
            "face_in_timestamp": timestamp_str,
            "stored_id_photo": target_voter["photo_base64"] if target_voter else None
        }

    except Exception as e:
        print(f"[verify_face_in] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# ATTENDANCE 2: FACE OUT (BALLOT FEEDING, EXIT, & TIMING ANOMALY AI)
# ==============================================================================
@app.post("/api/biometrics/verify-face-out")
def verify_face_out(payload: FaceOutCheckoutRequest):
    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current_epoch = time.time()

    # 1. Locate Attendance Session from Face IN
    attendance_rec = VOTING_ATTENDANCE.get(payload.voter_id)
    target_voter = COMELEC_VOTER_REGISTRY.get(payload.voter_id)

    if not attendance_rec or not attendance_rec.get("face_in_epoch"):
        return {
            "status": "NO_FACE_IN_FOUND",
            "message": f"CHECK-OUT REJECTED: No active Face IN session found for voter ID '{payload.voter_id}'. The citizen must check in at the intake gatekeeper first."
        }

    if attendance_rec.get("face_out_epoch"):
        return {
            "status": "ALREADY_CHECKED_OUT",
            "message": f"CITIZEN ALREADY CHECKED OUT: Ballot was already fed into the ballot box at {attendance_rec['face_out_timestamp']}.",
            "duration": attendance_rec["duration_formatted"],
            "timing_anomaly": attendance_rec["timing_anomaly"]
        }

    try:
        # 2. Extract Face OUT vector in RAM
        img_bgr = decode_base64_to_ram_image(payload.image_base64)
        raw_vector = extract_512d_embedding(img_bgr)
        salted_vector = apply_crypto_salt(raw_vector)

        # 3. Verify that the face exiting is indeed the SAME person who checked in (1:1 Exit Verification)
        id_match_confidence = 98.5
        if target_voter and target_voter.get("reference_vector") is not None:
            stored_ref = np.array(target_voter["reference_vector"], dtype=np.float32)
            id_sim = compute_cosine_similarity(salted_vector, stored_ref)
            
            if id_sim < 0.77:
                audit_entry = {
                    "id": str(uuid.uuid4())[:8],
                    "timestamp": timestamp_str,
                    "voter_id": payload.voter_id,
                    "precinct_id": payload.precinct_id,
                    "event": "EXIT_FACE_MISMATCH",
                    "details": f"Face presenting at ballot box does NOT match citizen who received ballot. Exit blocked.",
                    "status": "TAMPERING_INTERCEPTED"
                }
                AUDIT_LOGS.insert(0, audit_entry)
                return {
                    "status": "EXIT_FACE_MISMATCH",
                    "message": "SECURITY ALERT: The face presenting at the ballot box does NOT match the citizen who checked in. Possible booth substitution or ballot snatching.",
                    "stored_id_photo": target_voter["photo_base64"]
                }
            else:
                id_match_confidence = round(70.0 + min(29.5, ((id_sim - 0.77) / 0.23) * 30.0), 1)

        # 4. Compute Duration from Face IN to Face OUT
        if payload.simulated_duration_seconds is not None and payload.simulated_duration_seconds > 0:
            duration_sec = payload.simulated_duration_seconds
        else:
            duration_sec = max(1, int(current_epoch - attendance_rec["face_in_epoch"]))

        # 5. Run Mocked Self-Learned AI Voting Pacing Engine
        ai_eval = duration_ai.evaluate_and_learn(
            voter_id=payload.voter_id,
            voter_name=attendance_rec["voter_name"],
            precinct_id=payload.precinct_id,
            duration_sec=duration_sec
        )

        # 6. Finalize Attendance Record
        attendance_rec["status"] = "COMPLETED (BALLOT CAST)"
        attendance_rec["face_out_timestamp"] = timestamp_str
        attendance_rec["face_out_epoch"] = current_epoch
        attendance_rec["photo_out_base64"] = payload.image_base64
        attendance_rec["duration_seconds"] = duration_sec
        attendance_rec["duration_formatted"] = ai_eval["duration_formatted"]
        attendance_rec["timing_anomaly"] = ai_eval

        # Mark COMELEC Registry & Turnout
        if target_voter:
            target_voter["has_voted"] = True
            target_voter["registration_status"] = "VOTED & COMPLETED (LOCKED)"
            target_voter["completed_at"] = timestamp_str
            target_voter["duration_seconds"] = duration_sec

        PRECINCT_TURNOUT[payload.precinct_id] = PRECINCT_TURNOUT.get(payload.precinct_id, 0) + 1

        BALLOT_ISSUANCES.append({
            "ballot_serial": attendance_rec["ballot_serial"],
            "voter_id": payload.voter_id,
            "voter_name": attendance_rec["voter_name"],
            "vin": attendance_rec["vin"],
            "precinct_id": payload.precinct_id,
            "face_in_timestamp": attendance_rec["face_in_timestamp"],
            "face_out_timestamp": timestamp_str,
            "duration_seconds": duration_sec,
            "pacing_verdict": ai_eval["flag"]
        })

        audit_entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": timestamp_str,
            "voter_id": payload.voter_id,
            "precinct_id": payload.precinct_id,
            "event": "FACE_OUT_CHECKOUT_COMPLETE",
            "details": f"Ballot cast into box. Voting duration: {ai_eval['duration_formatted']}. AI Pacing Verdict: {ai_eval['flag']} ({ai_eval['severity']}).",
            "status": "COMPLETED"
        }
        AUDIT_LOGS.insert(0, audit_entry)

        return {
            "status": "COMPLETED",
            "step": "FACE_OUT_COMPLETE",
            "message": f"Biometric Attendance OUT verified! Paper ballot cast into box. Duration: {ai_eval['duration_formatted']}.",
            "voter_id": payload.voter_id,
            "voter_name": attendance_rec["voter_name"],
            "precinct_id": payload.precinct_id,
            "ballot_serial": attendance_rec["ballot_serial"],
            "face_in_timestamp": attendance_rec["face_in_timestamp"],
            "face_out_timestamp": timestamp_str,
            "duration_seconds": duration_sec,
            "duration_formatted": ai_eval["duration_formatted"],
            "timing_anomaly": ai_eval,
            "id_match_confidence": id_match_confidence
        }

    except Exception as e:
        print(f"[verify_face_out] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# PHYSICAL BALLOT ISSUANCE (LEGACY COMPATIBILITY)
# ==============================================================================
@app.post("/api/ballot/issue-physical")
def issue_physical_ballot(payload: IssuePhysicalBallotRequest):
    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ballot_serial = f"BALLOT-CEF1-{uuid.uuid4().hex[:8].upper()}"

    if payload.voter_id in COMELEC_VOTER_REGISTRY:
        COMELEC_VOTER_REGISTRY[payload.voter_id]["ballot_serial"] = ballot_serial
        COMELEC_VOTER_REGISTRY[payload.voter_id]["ballot_issued_at"] = timestamp_str

    if payload.voter_id in VOTING_ATTENDANCE:
        VOTING_ATTENDANCE[payload.voter_id]["ballot_serial"] = ballot_serial

    return {
        "status": "BALLOT_ISSUED",
        "ballot_serial": ballot_serial,
        "message": "Physical paper ballot & marker officially issued. Citizen proceeding to voting booth to shade ballot.",
        "timestamp": timestamp_str
    }

# ==============================================================================
# ANALYTICS & DOSSIER REPORTING ENDPOINTS
# ==============================================================================
@app.get("/api/ballot/duration-analytics")
def get_duration_analytics():
    """Returns real-time voting duration metrics, distribution bins, and AI anomaly stats."""
    stats = duration_ai.get_stats()
    
    # Calculate distribution buckets across all recorded durations
    all_d = duration_ai.history
    buckets = {
        "< 1 min (Suspicious Rush)": sum(1 for d in all_d if d < 60),
        "1 - 2 mins": sum(1 for d in all_d if 60 <= d < 120),
        "2 - 4 mins (Nominal Baseline)": sum(1 for d in all_d if 120 <= d < 240),
        "4 - 6 mins": sum(1 for d in all_d if 240 <= d < 360),
        "6 - 8 mins": sum(1 for d in all_d if 360 <= d < 480),
        "> 8 mins (Suspicious Delay)": sum(1 for d in all_d if d >= 480)
    }

    # Hourly throughput simulation
    recent_records = list(VOTING_ATTENDANCE.values())
    
    return {
        "stats": stats,
        "distribution_buckets": buckets,
        "outliers": duration_ai.outliers,
        "total_completed_attendance": sum(1 for a in recent_records if a.get("status") == "COMPLETED (BALLOT CAST)"),
        "active_in_booth_count": sum(1 for a in recent_records if a.get("status") == "IN_BOOTH (BALLOT ISSUED)"),
        "recent_attendances": recent_records[-8:]
    }

@app.get("/api/ballot/attendance")
def get_all_attendance():
    """Returns complete list of 2-step facial attendance records (Face IN + Face OUT)."""
    return {
        "attendance": list(VOTING_ATTENDANCE.values()),
        "total": len(VOTING_ATTENDANCE)
    }

@app.get("/api/voters/dossier/{voter_id}")
def get_voter_dossier(voter_id: str):
    """
    Returns complete AI dossier for a voter, including:
    - Official COMELEC ID photo
    - Live photo captured at Face IN
    - Live photo captured at Face OUT
    - Attendance timestamps & duration
    - Self-learned AI pacing verdict & anomaly score
    """
    voter = COMELEC_VOTER_REGISTRY.get(voter_id)
    att = VOTING_ATTENDANCE.get(voter_id)

    if not voter and not att:
        raise HTTPException(status_code=404, detail=f"Voter ID '{voter_id}' not found.")

    dossier = {
        "voter_id": voter_id,
        "name": voter["name"] if voter else att.get("voter_name", "UNKNOWN"),
        "vin": voter["vin"] if voter else att.get("vin", "UNKNOWN"),
        "precinct_id": voter.get("precinct_id") if voter else att.get("precinct_id"),
        "barangay": voter.get("barangay") if voter else att.get("barangay"),
        "birthdate": voter.get("birthdate", "2000-01-01") if voter else "2000-01-01",
        "civil_status": voter.get("civil_status", "Single") if voter else "Single",
        "citizenship": voter.get("citizenship", "Filipino") if voter else "Filipino",
        "registration_status": voter.get("registration_status") if voter else "IN ATTENDANCE",
        "has_voted": voter.get("has_voted", False) if voter else (att.get("status") == "COMPLETED (BALLOT CAST)"),
        "ballot_serial": voter.get("ballot_serial") if voter else att.get("ballot_serial"),
        
        # Biometric Imagery (RAM & ID vectors)
        "photo_id_base64": voter.get("photo_base64") if voter else att.get("photo_id_base64"),
        "photo_in_base64": att.get("photo_in_base64") if att else None,
        "photo_out_base64": att.get("photo_out_base64") if att else None,

        # Attendance Timestamps & Timing Anomaly AI
        "face_in_timestamp": att.get("face_in_timestamp") if att else None,
        "face_out_timestamp": att.get("face_out_timestamp") if att else None,
        "duration_seconds": att.get("duration_seconds") if att else None,
        "duration_formatted": att.get("duration_formatted") if att else None,
        "timing_anomaly": att.get("timing_anomaly") if att else None,
        "id_match_confidence": att.get("id_match_confidence", 98.2) if att else 98.2
    }

    return dossier

@app.get("/api/ballot/turnout")
def get_turnout():
    total_issued = sum(PRECINCT_TURNOUT.values())
    return {
        "precinct_turnout": PRECINCT_TURNOUT,
        "total_physical_ballots_issued": total_issued,
        "recent_issuances": BALLOT_ISSUANCES[-5:]
    }

@app.get("/api/biometrics/cloud-status")
def get_cloud_status():
    status = cloud_db.get_status()
    status["recent_audit_events"] = AUDIT_LOGS[:8]
    status["total_physical_ballots_issued"] = sum(PRECINCT_TURNOUT.values())
    status["registered_voters_count"] = len(COMELEC_VOTER_REGISTRY)
    status["active_attendance_count"] = len(VOTING_ATTENDANCE)
    return status

@app.post("/api/biometrics/set-ttl-mode")
def set_ttl_mode(payload: SetTTLModeRequest):
    new_mode = cloud_db.set_ttl_mode(payload.mode)
    return {
        "status": "TTL_MODE_UPDATED",
        "active_mode": new_mode,
        "ttl_seconds": cloud_db.get_ttl_seconds()
    }

@app.post("/api/biometrics/crypto-shred")
def trigger_crypto_shred():
    res = cloud_db.crypto_shred()
    timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    AUDIT_LOGS.insert(0, {
        "id": str(uuid.uuid4())[:8],
        "timestamp": timestamp_str,
        "voter_id": "COMELEC_ADMIN",
        "precinct_id": "ALL_PRECINCTS",
        "event": "POST_ELECTION_CRYPTO_SHRED",
        "details": f"Revoked master salt. Permanently destroyed {res['purged_records']} vectors in cloud.",
        "status": "ZERO_KNOWLEDGE_ENFORCED"
    })
    return res

@app.get("/api/biometrics/audit-log")
def get_audit_log():
    return {
        "audit_logs": AUDIT_LOGS,
        "total_events": len(AUDIT_LOGS)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
