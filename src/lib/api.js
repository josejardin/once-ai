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
