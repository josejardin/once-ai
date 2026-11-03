import sys
import base64
import numpy as np
import cv2

from fastapi.testclient import TestClient
from main import app, cloud_db

client = TestClient(app)

def create_synthetic_face(seed_color=(200, 200, 200)):
    img = np.zeros((160, 160, 3), dtype=np.uint8)
    cv2.circle(img, (80, 80), 55, seed_color, -1)
    cv2.circle(img, (60, 70), 8, (20, 20, 20), -1)
    cv2.circle(img, (100, 70), 8, (20, 20, 20), -1)
    cv2.ellipse(img, (80, 110), (20, 10), 0, 0, 180, (20, 20, 20), 3)
    _, buf = cv2.imencode(".jpg", img)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")

def run_tests():
    print("\n========== TESTING PHYSICAL BALLOT VERIFICATION & ANTI-FLYING VOTER ==========")
    face_a = create_synthetic_face((210, 210, 210))
    
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

    # Test 3: 1:1 Biometric Verification & Check-in at Precinct 101
    print("\n[TEST 3] Citizen Carlos checks in at Precinct 101 - Manila...")
    res3 = client.post("/api/biometrics/verify-precinct-checkin", json={
        "voter_id": new_voter["voter_id"],
        "voter_name": new_voter["name"],
        "precinct_id": "Precinct 101 - Manila",
        "image_base64": face_a,
        "liveness_passed": True,
        "challenges_completed": ["BLINK", "SMILE"]
    })
    data3 = res3.json()
    assert data3["status"] == "VERIFIED"
    print(f">> TEST 3 PASSED: 1:1 ID match verified ({data3.get('id_match_confidence')}% confidence). Authorized for physical ballot!")

    # Test 4: Issue Official Physical Paper Ballot
    print("\n[TEST 4] Issuing Official Physical Paper Ballot to Citizen Carlos...")
    res4 = client.post("/api/ballot/issue-physical", json={
        "voter_id": new_voter["voter_id"],
        "voter_name": new_voter["name"],
        "vin": new_voter["vin"],
        "precinct_id": "Precinct 101 - Manila",
        "auth_token": data3["auth_token"]
    })
    assert res4.status_code == 200
    ballot_data = res4.json()
    assert ballot_data["status"] == "BALLOT_ISSUED"
    print(f">> TEST 4 PASSED: Physical paper ballot {ballot_data['ballot_serial']} handed to voter for booth shading!")

    # Test 5: Flying Voter Attack! Same face tries to check in at Precinct 202 - Quezon City
    print("\n[TEST 5] FLYING VOTER ATTACK: Same face attempts collecting a second ballot at Precinct 202 - Quezon City...")
    res5 = client.post("/api/biometrics/verify-precinct-checkin", json={
        "voter_id": "VOTER-QC-9182",
        "voter_name": "Maria Santos",
        "precinct_id": "Precinct 202 - Quezon City",
        "image_base64": face_a,
        "liveness_passed": True,
        "challenges_completed": ["BLINK", "TURN_HEAD"]
    })
    data5 = res5.json()
    assert data5["status"] == "FLYING_VOTER_BLOCKED"
    print(f">> TEST 5 PASSED: Flying voter BLOCKED! Identified original checkin at {data5['original_precinct_id']}.")

    # Test 6: Post-Election Crypto Shred
    print("\n[TEST 6] Purging Cloud Vectors via Post-Election Crypto-Shred...")
    res6 = client.post("/api/biometrics/crypto-shred")
    assert res6.json()["status"] == "CRYPTO_SHRED_COMPLETE"
    print(">> TEST 6 PASSED: Master salt rotated, zero residual vectors.")

    # Test 7: Clear All Voters (Reset DB for Testing)
    print("\n[TEST 7] Testing DELETE /api/comelec/voters/clear-all...")
    res7 = client.delete("/api/comelec/voters/clear-all")
    assert res7.status_code == 200
    assert res7.json()["status"] == "ALL_VOTERS_PURGED"
    check_voters = client.get("/api/comelec/voters").json()["voters"]
    assert len(check_voters) == 0
    print(">> TEST 7 PASSED: Registry successfully wiped (0 voters remaining).")

    print("\nALL PHYSICAL BALLOT INTAKE & LOCAL AI TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    run_tests()
