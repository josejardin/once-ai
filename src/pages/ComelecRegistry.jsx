import React, { useState, useEffect, useRef } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { 
  IdCard, Search, UserPlus, CheckCircle2, Camera, 
  Upload, Shield, Building2, MapPin, Calendar, ArrowRight, Sparkles,
  Trash2, RotateCcw, AlertCircle, ExternalLink, X
} from 'lucide-react';
import { getComelecVoters, registerComelecVoter, clearAllComelecVoters } from '../lib/api.js';
import { calculateFaceAlignedMetrics, cropFaceCanvas } from '../lib/livenessCalculations.js';
import { Badge, Card, PageHead } from '../components/ui.jsx';

const PRECINCTS = [
  'Precinct 101 - Manila',
  'Precinct 202 - Quezon City',
  'Precinct 303 - Makati',
  'Precinct 404 - Pasig'
];

export default function ComelecRegistry() {
  const [voters, setVoters] = useState([]);
  const [search, setSearch] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  // Enrollment form state
  const [enrollName, setEnrollName] = useState('');
  const [enrollPrecinct, setEnrollPrecinct] = useState(PRECINCTS[0]);
  const [enrollBarangay, setEnrollBarangay] = useState('Barangay Malate, Manila');
  const [enrollBirthdate, setEnrollBirthdate] = useState('2001-05-15');
  const [enrollPhoto, setEnrollPhoto] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [enrollFaceLocked, setEnrollFaceLocked] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const enrollLandmarkerRef = useRef(null);
  const enrollAnimFrameRef = useRef(null);
  const enrollBboxRef = useRef(null);

  async function fetchVoters() {
    try {
      const data = await getComelecVoters();
      setVoters(data.voters || []);
    } catch (err) {
      console.warn('Fetch voters notice:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchVoters();
  }, []);

  async function handleClearAll() {
    const confirmed = window.confirm(
      "⚠️ RESET REGISTRY DATABASE?\n\nThis will completely purge all registered voters and crypto-shred cloud biometric vectors for a clean testing session."
    );
    if (!confirmed) return;

    setClearing(true);
    try {
      await clearAllComelecVoters();
      await fetchVoters();
      alert("✓ Registry successfully cleared! All mock records wiped.");
    } catch (err) {
      alert("Failed to clear registry: " + err.message);
    } finally {
      setClearing(false);
    }
  }

  async function startEnrollCamera() {
    setIsCapturing(true);
    setEnrollFaceLocked(false);
    enrollBboxRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const fileset = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      const lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1
      });
      enrollLandmarkerRef.current = lm;

      function enrollLoop() {
        if (!videoRef.current || !videoRef.current.videoWidth) {
          enrollAnimFrameRef.current = requestAnimationFrame(enrollLoop);
          return;
        }
        try {
          const res = lm.detectForVideo(videoRef.current, performance.now());
          if (res && res.faceLandmarks && res.faceLandmarks.length > 0) {
            setEnrollFaceLocked(true);
            const metrics = calculateFaceAlignedMetrics(res.faceLandmarks[0]);
            if (metrics.bbox) {
              enrollBboxRef.current = metrics.bbox;
            }
          } else {
            setEnrollFaceLocked(false);
          }
        } catch (e) {}
        enrollAnimFrameRef.current = requestAnimationFrame(enrollLoop);
      }
      enrollAnimFrameRef.current = requestAnimationFrame(enrollLoop);
    } catch (err) {
      console.error('Enroll camera error:', err);
      alert('Camera access denied or unavailable. You can upload a photo instead.');
      setIsCapturing(false);
    }
  }

  function snapEnrollPhoto() {
    if (!videoRef.current) return;
    const b64 = cropFaceCanvas(videoRef.current, enrollBboxRef.current, 256);
    setEnrollPhoto(b64);
    stopEnrollCamera();
  }

  function stopEnrollCamera() {
    if (enrollAnimFrameRef.current) {
      cancelAnimationFrame(enrollAnimFrameRef.current);
      enrollAnimFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
    setEnrollFaceLocked(false);
  }

  function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const b64 = cropFaceCanvas(img, null, 256);
        setEnrollPhoto(b64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  async function handleEnrollSubmit(e) {
    e.preventDefault();
    if (!enrollName.trim() || !enrollPhoto) {
      alert('Please provide citizen full name and take/upload an ID photo.');
      return;
    }

    setEnrolling(true);
    try {
      const res = await registerComelecVoter({
        name: enrollName.trim(),
        precinct_id: enrollPrecinct,
        barangay: enrollBarangay,
        birthdate: enrollBirthdate,
        photo_base64: enrollPhoto
      });

      setSuccessMsg(`Official Voter ID ${res.vin} generated for ${res.name}!`);
      setEnrollName('');
      setEnrollPhoto(null);
      await fetchVoters();
      setTimeout(() => {
        setShowEnrollModal(false);
        setSuccessMsg(null);
      }, 1500);
    } catch (err) {
      alert('Enrollment error: ' + err.message);
    } finally {
      setEnrolling(false);
    }
  }

  const filteredVoters = voters.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.vin.toLowerCase().includes(search.toLowerCase()) ||
    v.precinct_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page">
      <PageHead title="COMELEC Central Voter Registry" feature="Live Mock Database | Republic Act 10173">
        Official COMELEC Mock Voter ID issuance system. Enrolls genuine and synthetic citizen records, generates standardized Voter Identification Numbers (VIN), and indexes 512-D local facial vectors in RAM.
      </PageHead>

      {/* Top Controls Bar */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowEnrollModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <UserPlus size={15} />
            <span>Enroll New Mock Citizen ID</span>
          </button>

          <button
            type="button"
            className="btn"
            onClick={handleClearAll}
            disabled={clearing || voters.length === 0}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--high)' }}
          >
            <Trash2 size={15} />
            <span>Clear All IDs (Reset DB)</span>
          </button>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noreferrer"
            className="btn sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
          >
            <ExternalLink size={13} />
            <span>Open Standalone Polling Terminal (:5173)</span>
          </a>
        </div>
      </div>

      {/* Search Input */}
      <div className="field">
        <input
          type="search"
          placeholder="Search by Citizen Name, VIN, or Precinct..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search registered voters"
        />
      </div>

      {/* Voter Cards Grid */}
      {loading ? (
        <Card title="Connecting to Central Sovereign Database">
          <div className="small muted">Loading enrolled voter records from port 8000...</div>
        </Card>
      ) : filteredVoters.length === 0 ? (
        <Card title="No Enrolled Mock Citizen IDs">
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: '50%', background: 'var(--panel2)', display: 'grid', placeItems: 'center' }}>
              <IdCard size={28} style={{ color: 'var(--muted)' }} />
            </div>
            <h3 style={{ margin: '0 0 6px' }}>Registry is currently empty</h3>
            <p className="small muted" style={{ maxWidth: 420, margin: '0 auto 16px' }}>
              Click <b>"Enroll New Mock Citizen ID"</b> above to register your face or test subjects. The system will generate an official Philippine Voter's ID with a 512-D local AI vector.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowEnrollModal(true)}
            >
              Enroll First Citizen ID
            </button>
          </div>
        </Card>
      ) : (
        <div className="grid g2">
          {filteredVoters.map((v) => (
            <div
              key={v.voter_id}
              style={{
                background: 'var(--panel)',
                border: '1.5px solid var(--border)',
                borderRadius: 18,
                padding: 16,
                boxShadow: 'var(--shadow)',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* ID Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#1d4ed8', color: '#fbbf24', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900 }}>
                    ★
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      Republic of the Philippines • COMELEC
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--gold2)' }}>
                      VOTER IDENTIFICATION CARD
                    </div>
                  </div>
                </div>
                <Badge tone={v.registration_status?.includes('LOCKED') ? 'high' : 'low'}>
                  {v.registration_status || 'ELIGIBLE'}
                </Badge>
              </div>

              {/* ID Card Body */}
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 84, height: 100, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: '1.5px solid var(--border)', background: '#000', position: 'relative' }}>
                  {v.photo_base64 ? (
                    <img src={v.photo_base64} alt={v.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#999', fontSize: 24, fontWeight: 'bold' }}>
                      ?
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.7)', color: '#34d399', fontSize: 8, textAlign: 'center', fontWeight: 'bold' }}>
                    STORED REF
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>
                    <span className="small muted" style={{ fontSize: 10 }}>VOTER IDENTIFICATION NO. (VIN):</span>
                    <div className="mono" style={{ fontWeight: 700, color: 'var(--gold2)', fontSize: 12 }}>
                      {v.vin}
                    </div>
                  </div>

                  <div>
                    <span className="small muted" style={{ fontSize: 10 }}>FULL NAME:</span>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>
                      {v.name}
                    </div>
                  </div>

                  <div className="row small" style={{ gap: 12, marginTop: 2 }}>
                    <div>
                      <span className="muted" style={{ fontSize: 10, display: 'block' }}>Precinct:</span>
                      <b>{v.precinct_id}</b>
                    </div>
                    <div>
                      <span className="muted" style={{ fontSize: 10, display: 'block' }}>Birthdate:</span>
                      <span className="mono">{v.birthdate}</span>
                    </div>
                  </div>

                  <div className="small muted" style={{ fontSize: 11 }}>
                    Residence: {v.barangay}
                  </div>
                </div>
              </div>

              {/* Card Footer: Local AI Proof */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="mono small muted" style={{ fontSize: 10 }}>
                  Vector: {v.biometric_hash}
                </span>
                <span className="small" style={{ color: 'var(--low)', fontWeight: 600 }}>
                  ✓ In-RAM Biometric Hash
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ENROLLMENT MODAL */}
      {showEnrollModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ background: 'var(--panel)', border: '1.5px solid var(--border)', borderRadius: 20, maxWidth: 500, width: '100%', padding: 22, boxShadow: 'var(--shadow)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserPlus size={18} />
                <span>Enroll New Mock Citizen ID</span>
              </h2>
              <button
                type="button"
                className="btn sm"
                onClick={() => { stopEnrollCamera(); setShowEnrollModal(false); }}
              >
                <X size={14} />
              </button>
            </div>

            <p className="small muted" style={{ marginBottom: 16 }}>
              Generates an official COMELEC Mock Voter ID and extracts a 512-D local biometric vector into sovereign RAM.
            </p>

            {successMsg ? (
              <div className="banner info" style={{ textAlign: 'center', padding: 20 }}>
                <CheckCircle2 size={32} style={{ color: 'var(--low)', margin: '0 auto 8px' }} />
                <h3 style={{ margin: '0 0 4px' }}>Citizen Enrolled!</h3>
                <div className="small">{successMsg}</div>
              </div>
            ) : (
              <form onSubmit={handleEnrollSubmit} className="grid" style={{ gap: 12 }}>
                <div className="field">
                  <label htmlFor="c-name">Full Legal Name</label>
                  <input
                    id="c-name"
                    type="text"
                    required
                    placeholder="e.g. DELA CRUZ, CARLOS"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                  />
                </div>

                <div className="grid g2">
                  <div className="field">
                    <label htmlFor="c-prec">Assigned Precinct</label>
                    <select
                      id="c-prec"
                      value={enrollPrecinct}
                      onChange={(e) => setEnrollPrecinct(e.target.value)}
                    >
                      {PRECINCTS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="c-bdate">Birthdate</label>
                    <input
                      id="c-bdate"
                      type="date"
                      value={enrollBirthdate}
                      onChange={(e) => setEnrollBirthdate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="c-brgy">Barangay Address</label>
                  <input
                    id="c-brgy"
                    type="text"
                    value={enrollBarangay}
                    onChange={(e) => setEnrollBarangay(e.target.value)}
                  />
                </div>

                {/* Photo Capture Section */}
                <div className="field">
                  <label>Official Voter's ID Photo</label>

                  {isCapturing ? (
                    <div style={{ background: 'var(--panel2)', borderRadius: 14, padding: 12, textAlign: 'center' }}>
                      <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto 10px', borderRadius: '50%', overflow: 'hidden', border: enrollFaceLocked ? '3px solid var(--low)' : '3px dashed var(--mod)', background: '#000' }}>
                        <video
                          ref={videoRef}
                          playsInline
                          autoPlay
                          muted
                          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                        />
                        <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0 }}>
                          <span className={`badge ${enrollFaceLocked ? 'low' : 'mod'}`} style={{ fontSize: 9 }}>
                            {enrollFaceLocked ? '✓ Face Tracked (60 FPS)' : 'Align Face in Circle'}
                          </span>
                        </div>
                      </div>

                      <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="btn primary"
                          onClick={snapEnrollPhoto}
                        >
                          <Camera size={14} />
                          <span>Capture Standardized Portrait</span>
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={stopEnrollCamera}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : enrollPhoto ? (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--panel2)', padding: 10, borderRadius: 12 }}>
                      <img src={enrollPhoto} alt="Captured" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1.5px solid var(--border)' }} />
                      <div>
                        <Badge tone="low">✓ Portrait Ready</Badge>
                        <div>
                          <button
                            type="button"
                            className="chip small"
                            style={{ marginTop: 4, cursor: 'pointer' }}
                            onClick={() => setEnrollPhoto(null)}
                          >
                            Retake / Change
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={startEnrollCamera}
                        style={{ flex: 1, justifyContent: 'center' }}
                      >
                        <Camera size={15} />
                        <span>Take Selfie with Webcam</span>
                      </button>
                      <label
                        className="btn"
                        style={{ flex: 1, justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <Upload size={15} />
                        <span>Upload Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => { stopEnrollCamera(); setShowEnrollModal(false); }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={enrolling || !enrollPhoto}
                  >
                    {enrolling ? 'Extracting Vector...' : 'Generate Official Voter ID'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
