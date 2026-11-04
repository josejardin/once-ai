const API_BASE = 'http://127.0.0.1:8000';

export async function getComelecVoters() {
  const res = await fetch(`${API_BASE}/api/comelec/voters`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function registerComelecVoter(payload) {
  const res = await fetch(`${API_BASE}/api/comelec/register-voter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function verifyFaceIn(payload) {
  const res = await fetch(`${API_BASE}/api/biometrics/verify-face-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function compareFaces(referenceBase64, liveBase64, voterName = 'Applicant') {
  const res = await fetch(`${API_BASE}/api/biometrics/compare-faces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference_image_base64: referenceBase64,
      live_image_base64: liveBase64,
      voter_name: voterName
    })
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function verifyFaceOut(payload) {
  const res = await fetch(`${API_BASE}/api/biometrics/verify-face-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function getDurationAnalytics() {
  const res = await fetch(`${API_BASE}/api/ballot/duration-analytics`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function getAllAttendance() {
  const res = await fetch(`${API_BASE}/api/ballot/attendance`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function getVoterDossier(voterId) {
  const res = await fetch(`${API_BASE}/api/voters/dossier/${encodeURIComponent(voterId)}`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function deleteComelecVoter(voterId) {
  const res = await fetch(`${API_BASE}/api/comelec/voters/${encodeURIComponent(voterId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function clearAllComelecVoters() {
  const res = await fetch(`${API_BASE}/api/comelec/voters/clear-all`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}

export async function getCloudStatus() {
  const res = await fetch(`${API_BASE}/api/biometrics/cloud-status`);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  return res.json();
}
