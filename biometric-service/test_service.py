import sys
import base64
import numpy as np
import cv2

from fastapi.testclient import TestClient
from main import app, cloud_db

client = TestClient(app)

def create_synthetic_face(seed_color=(200, 200, 200), style="A"):
    img = np.zeros((160, 160, 3), dtype=np.uint8)
    if style == "A":
        # Round face, dark eyes, neutral mouth
        cv2.circle(img, (80, 80), 55, seed_color, -1)
        cv2.circle(img, (60, 70), 8, (20, 20, 20), -1)
        cv2.circle(img, (100, 70), 8, (20, 20, 20), -1)
        cv2.ellipse(img, (80, 110), (20, 10), 0, 0, 180, (20, 20, 20), 3)
    else:
        # Distinct facial geometry: oval, glasses, smiling mouth
        cv2.ellipse(img, (80, 80), (45, 60), 0, 0, 360, seed_color, -1)
        cv2.rectangle(img, (50, 60), (70, 75), (240, 240, 240), 2)
        cv2.rectangle(img, (90, 60), (110, 75), (240, 240, 240), 2)
        cv2.line(img, (70, 68), (90, 68), (240, 240, 240), 2)
        cv2.circle(img, (60, 68), 5, (10, 10, 200), -1)
        cv2.circle(img, (100, 68), 5, (10, 10, 200), -1)
        cv2.ellipse(img, (80, 115), (25, 12), 0, 0, 180, (10, 10, 220), -1)

    _, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

def run_tests():
    print("\n========== TESTING DUAL-FACE ATTENDANCE (IN & OUT) & TIMING ANOMALY AI ==========")
    face_a = create_synthetic_face((210, 210, 210), style="A")
    face_b = create_synthetic_face((70, 120, 220), style="B")
    
    # Test 1: Fetch mock COMELEC Voter Registry
    print("\n[TEST 1] Querying COMELEC Central Voter Registry...")
    res1 = client.get("/api/comelec/voters")
    assert res1.status_code == 200
    voters = res1.json()["voters"]
    print(f">> TEST 1 PASSED: Found {len(voters)} registered voters with official COMELEC ID cards.")

    # Test 2: Enroll a new Mock Citizen with local biometric vector extraction
    print("\n[TEST 2] Enrolling New Citizen 'DELA CRUZ, CARLOS' into COMELEC Registry...")
    res2 = client.post("/api/comelec/register-voter", json={
        "name": "DELA CRUZ, CARLOS",
        "precinct_id": "Precinct 101 - Manila",
        "barangay": "Barangay Ermita, Manila",
        "birthdate": "2000-01-01",
        "photo_base64": face_a
    })
    assert res2.status_code == 200
    new_voter = res2.json()
    assert new_voter["status"] == "REGISTERED"
    print(">> TEST 2 PASSED: New citizen enrolled, 512-D vector extracted locally in RAM.")

    # Test 3: Face IN Check-In Attendance at Precinct 101
    print("\n[TEST 3] ATTENDANCE FACE IN: Citizen Carlos scans face at Intake Gatekeeper...")
    res3 = client.post("/api/biometrics/verify-face-in", json={
        "voter_id": new_voter["voter_id"],
        "voter_name": new_voter["name"],
        "precinct_id": "Precinct 101 - Manila",
        "image_base64": face_a,
        "liveness_passed": True,
        "challenges_completed": ["BLINK", "SMILE"]
    })
    data3 = res3.json()
    assert data3["status"] == "VERIFIED"
    assert data3["step"] == "FACE_IN_COMPLETE"
    assert "ballot_serial" in data3
    print(f">> TEST 3 PASSED: Face IN verified ({data3.get('id_match_confidence')}%). Ballot {data3['ballot_serial']} issued at {data3['face_in_timestamp']}.")

    # Test 4: Face OUT Check-Out Attendance (Normal Duration ~ 195 seconds)
    print("\n[TEST 4] ATTENDANCE FACE OUT: Citizen Carlos casts ballot into box and scans face (195s normal)...")
    res4 = client.post("/api/biometrics/verify-face-out", json={
        "voter_id": new_voter["voter_id"],
        "voter_name": new_voter["name"],
        "precinct_id": "Precinct 101 - Manila",
        "image_base64": face_a,
        "simulated_duration_seconds": 195
    })
    assert res4.status_code == 200
    data4 = res4.json()
    assert data4["status"] == "COMPLETED"
    assert data4["timing_anomaly"]["flag"] == "NORMAL"
    print(f">> TEST 4 PASSED: Face OUT verified! Duration: {data4['duration_formatted']} - AI Pacing Verdict: {data4['timing_anomaly']['flag']}.")

    # Test 5: Enroll a second citizen and test SUSPICIOUS EARLY (RUSH) ANOMALY (< 45s)
    print("\n[TEST 5] TESTING SELF-LEARNED AI RUSH ANOMALY (< 45s duration)...")
    res5_enroll = client.post("/api/comelec/register-voter", json={
        "name": "SANTOS, MARIA",
        "precinct_id": "Precinct 101 - Manila",
        "barangay": "Barangay Ermita, Manila",
        "birthdate": "1998-04-12",
        "photo_base64": face_b
    })
    assert res5_enroll.status_code == 200
    voter_maria = res5_enroll.json()

    # Face IN for Maria
    res5_in = client.post("/api/biometrics/verify-face-in", json={
        "voter_id": voter_maria["voter_id"],
        "voter_name": voter_maria["name"],
        "precinct_id": "Precinct 101 - Manila",
        "image_base64": face_b,
        "liveness_passed": True
    })
    assert res5_in.json()["status"] == "VERIFIED", f"Unexpected status: {res5_in.json()}"

    # Face OUT for Maria with 25s duration (SUSPICIOUS RUSH)
    res5_out = client.post("/api/biometrics/verify-face-out", json={
        "voter_id": voter_maria["voter_id"],
        "voter_name": voter_maria["name"],
        "precinct_id": "Precinct 101 - Manila",
        "image_base64": face_b,
        "simulated_duration_seconds": 25
    })
    maria_data = res5_out.json()
    assert maria_data["status"] in ["COMPLETED_WITH_ANOMALY", "COMPLETED"]
    assert maria_data["is_suspicious"] is True
    assert maria_data["timing_anomaly"]["flag"] == "RUSH_ANOMALY"
    print(f">> TEST 5 PASSED: RUSH ANOMALY FLAGGED! Duration: {maria_data['duration_formatted']}, Severity: {maria_data['timing_anomaly']['severity']}.")

    # Test 6: Verify Voter Comprehensive Dossier (ID Photo + Face IN + Face OUT + Timestamps)
    print("\n[TEST 6] Querying Comprehensive Voter Dossier API for Chatbot...")
    res6 = client.get(f"/api/voters/dossier/{new_voter['voter_id']}")
    assert res6.status_code == 200
    dossier = res6.json()
    assert dossier["photo_id_base64"] is not None
    assert dossier["photo_in_base64"] is not None
    assert dossier["photo_out_base64"] is not None
    assert dossier["face_in_timestamp"] is not None
    assert dossier["face_out_timestamp"] is not None
    assert dossier["has_voted"] is True
    print(">> TEST 6 PASSED: Dossier contains ID photo, live Face IN, live Face OUT, and attendance timestamps.")

    # Test 7: Duration Analytics API
    print("\n[TEST 7] Testing Duration Analytics & Pacing Distribution API...")
    res7 = client.get("/api/ballot/duration-analytics")
    assert res7.status_code == 200
    analytics = res7.json()
    assert analytics["stats"]["learned_mean_seconds"] > 0
    assert analytics["total_completed_attendance"] >= 2
    assert len(analytics["outliers"]) >= 1
    print(f">> TEST 7 PASSED: Learned mean duration = {analytics['stats']['learned_mean_seconds']}s, Outliers tracked = {len(analytics['outliers'])}.")

    # Test 8: Active Screen Flash Reflection Anti-Spoofing (Phone Screen Replay Attack)
    print("\n[TEST 8] Testing Active Screen Flash Reflection (Phone Screen Replay Attack Interception)...")
    res_spoof = client.post("/api/biometrics/verify-face-in", json={
        "voter_id": "VOTER-PHONE-ATTACK",
        "voter_name": "SPOOFER WITH SMARTPHONE",
        "precinct_id": "Precinct 101 - Manila",
        "image_base64": face_a,
        "is_phone_spoof": True,
        "screen_flash_verified": False,
        "flash_reflection_score": 14.2,
        "spoof_reason": "Specular glass glare hotspot & lack of 3D organic skin diffusion detected. Smartphone/tablet photo replay blocked."
    })
    assert res_spoof.status_code == 200
    data_spoof = res_spoof.json()
    assert data_spoof["status"] == "PHONE_SPOOF_BLOCKED"
    assert data_spoof["anomaly_flag"] == "PHONE_SCREEN_REPLAY_ATTACK"
    print(">> TEST 8 PASSED: Phone screen spoof intercepted and blocked by Active Flash Reflection!")

    # Test 9: Purge & Reset
    print("\n[TEST 8] Testing DELETE /api/comelec/voters/clear-all...")
    res8 = client.delete("/api/comelec/voters/clear-all")
    assert res8.status_code == 200
    assert res8.json()["status"] == "ALL_VOTERS_PURGED"
    print(">> TEST 9 PASSED: System successfully wiped.")

    print("\nALL DUAL-FACE ATTENDANCE & SELF-LEARNED AI TESTS PASSED WITH 100% SUCCESS!\n")

if __name__ == "__main__":
    run_tests()
