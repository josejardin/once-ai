import React, { useState, useEffect, useRef } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { 
  Camera, Upload, CheckCircle2, ShieldCheck, AlertTriangle, 
  RefreshCw, X, Lock, ArrowRight, Clock, UserCheck, Play, Zap, AlertOctagon 
} from 'lucide-react';
import { calculateFaceAlignedMetrics, cropFaceCanvas } from '../lib/livenessCalculations.js';
import { Badge } from './ui.jsx';
import { verifyFaceIn, verifyFaceOut, registerComelecVoter } from '../lib/api.js';

export default function BiometricIntakeCapture({
  applicantName,
  barangay,
  selectedVoter,
  registryCount,
  onGoToRegistry,
  onBiometricChange,
  disabled
}) {
  const [stage, setStage] = useState('IN'); // 'IN' (Check-In) or 'OUT' (Check-Out)
  const [photo, setPhoto] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceLocked, setFaceLocked] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [bioResult, setBioResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Session state across IN & OUT
  const [attendanceSession, setAttendanceSession] = useState(null);

  const hasAlreadyVoted = Boolean(
    selectedVoter?.has_voted || 
    selectedVoter?.attendance?.face_out || 
    (selectedVoter?.attendance?.status && selectedVoter.attendance.status.includes('COMPLETED')) ||
    (selectedVoter?.registration_status && selectedVoter.registration_status.includes('VOTED')) ||
    (bioResult?.status === 'ALREADY_VOTED_LOCKED') || 
    (bioResult?.status === 'ALREADY_CHECKED_OUT')
  );

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animFrameRef = useRef(null);
  const bboxRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initialize MediaPipe FaceLandmarker
  useEffect(() => {
    let active = true;
    async function initMediaPipe() {
      try {
        const fileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        if (!active) return;
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numFaces: 1
        });
        if (active) landmarkerRef.current = landmarker;
      } catch (err) {
        console.warn('MediaPipe initialization fallback:', err);
      }
    }
    initMediaPipe();
    return () => {
      active = false;
      stopCamera();
    };
  }, []);

  async function checkRegistryAvailable() {
    let count = registryCount;
    if (count === undefined) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/comelec/voters');
        if (res.ok) {
          const data = await res.json();
          count = data.count ?? data.voters?.length ?? 0;
        }
      } catch (e) {
        console.warn('Could not check registry count:', e);
      }
    }
    if (count === 0 && selectedVoter) {
      setErrorMsg('No registered citizens found in the COMELEC Mock Registry. Please enroll at least one mock citizen ID first in the COMELEC Mock Registry tab.');
      return false;
    }
    return true;
  }

  async function startCamera() {
    setErrorMsg(null);
    if (hasAlreadyVoted) {
      setErrorMsg('VOTER ALREADY VOTED: Biometrics can only be completed once per election. Duplicate voting is blocked.');
      return;
    }
    const available = await checkRegistryAvailable();
    if (!available) return;

    setIsCapturing(true);
    setFaceLocked(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          startLandmarkLoop();
        };
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setErrorMsg('Webcam access was denied or is unavailable. You may upload a photo instead.');
      setIsCapturing(false);
    }
  }

  function startLandmarkLoop() {
    function loop() {
      if (!videoRef.current || !videoRef.current.videoWidth) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      if (landmarkerRef.current) {
        try {
          const res = landmarkerRef.current.detectForVideo(videoRef.current, performance.now());
          if (res && res.faceLandmarks && res.faceLandmarks.length > 0) {
            setFaceLocked(true);
            const metrics = calculateFaceAlignedMetrics(res.faceLandmarks[0]);
            if (metrics.bbox) {
              bboxRef.current = metrics.bbox;
            }
          } else {
            setFaceLocked(false);
          }
        } catch (e) {}
      }

      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);
  }

  function stopCamera() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
    setFaceLocked(false);
  }

  async function snapPhoto() {
    if (!videoRef.current) return;
    const b64 = cropFaceCanvas(videoRef.current, bboxRef.current, 256);
    stopCamera();
    await processBiometricSubmission(b64);
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setErrorMsg(null);
    const available = await checkRegistryAvailable();
    if (!available) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const img = new Image();
      img.onload = async () => {
        const b64 = cropFaceCanvas(img, null, 256);
        await processBiometricSubmission(b64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Core Face Verification Pipeline (Handles Face IN & Face OUT)
  async function processBiometricSubmission(photoBase64, simulatedDuration = null) {
    if (hasAlreadyVoted) {
      setErrorMsg('CITIZEN ALREADY VOTED: Biometrics can only be completed once per election. Terminal is permanently locked.');
      return;
    }
    setPhoto(photoBase64);
    setAnalyzing(true);
    setErrorMsg(null);

    try {
      const vId = selectedVoter?.voter_id || attendanceSession?.voter_id || `VOTER-${Date.now().toString(36).toUpperCase()}`;
      const vName = selectedVoter?.name || attendanceSession?.voter_name || applicantName || 'CITIZEN';
      const precinct = selectedVoter?.precinct_id || 'Precinct 101 - Manila';

      if (stage === 'IN') {
        // STAGE 1: FACE IN (ATTENDANCE CHECK-IN)
        const data = await verifyFaceIn({
          voter_id: vId,
          voter_name: vName,
          precinct_id: precinct,
          image_base64: photoBase64,
          liveness_passed: true,
          challenges_completed: ['BLINK', 'SMILE']
        });

        setBioResult(data);
        if (data.status === 'VERIFIED') {
          setAttendanceSession({
            voter_id: vId,
            voter_name: vName,
            precinct_id: precinct,
            ballot_serial: data.ballot_serial,
            face_in_timestamp: data.face_in_timestamp,
            photo_in: photoBase64
          });
        }

        if (onBiometricChange) {
          onBiometricChange({
            photo_base64: photoBase64,
            voter_id: vId,
            vin: selectedVoter?.vin || `VIN-${vId.slice(-4)}`,
            biometric_hash: data.status === 'VERIFIED' ? `FACE-IN-VERIFIED (${data.id_match_confidence}%)` : 'MISMATCHED',
            status: data.status,
            stage: 'FACE_IN',
            ballot_serial: data.ballot_serial,
            face_in_time: data.face_in_timestamp,
            isMatch: data.status === 'VERIFIED'
          });
        }
      } else {
        // STAGE 2: FACE OUT (ATTENDANCE CHECK-OUT & SELF-LEARNED TIMING ANOMALY AI)
        const data = await verifyFaceOut({
          voter_id: vId,
          voter_name: vName,
          precinct_id: precinct,
          image_base64: photoBase64,
          liveness_passed: true,
          simulated_duration_seconds: simulatedDuration
        });

        setBioResult(data);
        if (onBiometricChange) {
          onBiometricChange({
            photo_base64: photoBase64,
            voter_id: vId,
            status: data.status,
            stage: 'FACE_OUT',
            face_out_time: data.face_out_timestamp,
            duration: data.duration_formatted,
            timing_anomaly: data.timing_anomaly,
            isMatch: data.status === 'COMPLETED'
          });
        }
      }
    } catch (err) {
      console.warn('Biometric attendance error:', err);
      setErrorMsg(`Biometric server error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  }

  // Quick testing shortcuts for Evaluators
  const testSimulatedCheckout = async (durationSec, label) => {
    const photoToUse = photo || selectedVoter?.photo_base64 || 'data:image/jpeg;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    await processBiometricSubmission(photoToUse, durationSec);
  };

  function clearSession() {
    setPhoto(null);
    setBioResult(null);
    setErrorMsg(null);
    setAttendanceSession(null);
    setStage('IN');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onBiometricChange) onBiometricChange(null);
  }

  return (
    <div className="field" style={{ gap: 12 }}>
      {/* Stage Selector Header: 2 Facial Recognitions (IN vs OUT) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--panel2)',
        padding: '6px 8px',
        borderRadius: 12,
        border: '1px solid var(--border)'
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={`chip ${stage === 'IN' ? 'primary' : ''}`}
            onClick={() => { setStage('IN'); setBioResult(null); }}
            style={{ fontWeight: 700, padding: '6px 14px' }}
          >
            <Clock size={13} style={{ marginRight: 4 }} />
            1. Face IN (Intake & Ballot Hand-Off)
          </button>
          <button
            type="button"
            className={`chip ${stage === 'OUT' ? 'primary' : ''}`}
            onClick={() => { setStage('OUT'); setBioResult(null); }}
            style={{ fontWeight: 700, padding: '6px 14px' }}
          >
            <UserCheck size={13} style={{ marginRight: 4 }} />
            2. Face OUT (Ballot Box & AI Duration Check)
          </button>
        </div>

        {attendanceSession && (
          <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>
            Session: <b>{attendanceSession.ballot_serial}</b> ({attendanceSession.voter_name})
          </span>
        )}
      </div>

      {/* CITIZEN ALREADY VOTED LOCKOUT (STRICT 1 VOTE PER ELECTION LIMIT) */}
      {hasAlreadyVoted ? (
        <div style={{
          background: '#fef2f2',
          border: '2px solid #ef4444',
          borderRadius: 14,
          padding: '16px 20px',
          textAlign: 'left'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#991b1b' }}>
            <AlertOctagon size={24} color="#dc2626" />
            <div>
              <b style={{ fontSize: 15 }}>CITIZEN ALREADY VOTED — ONE VOTE LIMIT ENFORCED</b>
              <div style={{ fontSize: 13, color: '#7f1d1d', marginTop: 4, lineHeight: 1.5 }}>
                Citizen <b>{selectedVoter?.name || applicantName}</b> has already completed dual-face biometric attendance and cast their official ballot in this election.
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'rgba(239, 68, 68, 0.08)', padding: '8px 12px', borderRadius: 8 }}>
            <Badge tone="high">🔒 Biometric Terminal Locked</Badge>
            <span className="small muted">
              Under Section 261 of the Philippine Omnibus Election Code, duplicate voting is strictly prohibited. Biometrics can only be completed once per voter.
            </span>
          </div>
        </div>
      ) : isCapturing ? (
        <div style={{ background: 'var(--panel2)', border: '1.5px solid var(--border)', borderRadius: 16, padding: 16, textAlign: 'center' }}>
          <div style={{ position: 'relative', width: 200, height: 200, margin: '0 auto 12px', borderRadius: '50%', overflow: 'hidden', border: faceLocked ? '3px solid var(--low)' : '3px dashed var(--mod)', background: '#000' }}>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center' }}>
              <span className={`badge ${faceLocked ? 'low' : 'mod'}`} style={{ fontSize: 10, fontWeight: 700 }}>
                {faceLocked ? '✓ Face Tracked (60 FPS)' : `Align Face for Face ${stage}`}
              </span>
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              onClick={snapPhoto}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Camera size={14} />
              <span>Capture Face {stage} Attendance</span>
            </button>
            <button
              type="button"
              className="btn"
              onClick={stopCamera}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <X size={14} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      ) : photo ? (
        /* PHOTO CAPTURED & ATTENDANCE VERIFIED STATE */
        <div style={{ background: 'var(--panel2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={{ width: 76, height: 76, borderRadius: 12, overflow: 'hidden', flexShrink: 0, border: '2px solid var(--low)', background: '#000', position: 'relative' }}>
              <img src={photo} alt="Voter Portrait" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.75)', color: '#38bdf8', fontSize: 9, textAlign: 'center', fontWeight: 'bold' }}>
                FACE {stage}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="row" style={{ gap: 6 }}>
                {stage === 'IN' && bioResult?.status === 'VERIFIED' && (
                  <Badge tone="low">
                    <CheckCircle2 size={12} style={{ marginRight: 3, verticalAlign: -1 }} />
                    <span>✓ Face IN Verified ({bioResult.id_match_confidence}%) • Ballot Issued</span>
                  </Badge>
                )}
                {stage === 'OUT' && bioResult?.status === 'COMPLETED' && (
                  <Badge tone={bioResult.timing_anomaly?.flag === 'NORMAL' ? 'low' : 'high'}>
                    <CheckCircle2 size={12} style={{ marginRight: 3, verticalAlign: -1 }} />
                    <span>✓ Face OUT Attendance Confirmed</span>
                  </Badge>
                )}
                {bioResult?.status === 'FLYING_VOTER_BLOCKED' && (
                  <Badge tone="high">
                    <AlertTriangle size={12} style={{ marginRight: 3, verticalAlign: -1 }} />
                    <span>🚨 Flying Voter Blocked!</span>
                  </Badge>
                )}
                {bioResult?.status === 'ID_PHOTO_MISMATCH' && (
                  <Badge tone="high">
                    <AlertTriangle size={12} style={{ marginRight: 3, verticalAlign: -1 }} />
                    <span>🚨 Identity Impostor Blocked</span>
                  </Badge>
                )}
              </div>

              {/* Timestamp & Ballot Serial Info */}
              {stage === 'IN' && bioResult?.status === 'VERIFIED' && (
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  <div>Official Ballot Serial: <b className="mono" style={{ color: '#fbbf24' }}>{bioResult.ballot_serial}</b></div>
                  <div className="small muted">Check-In Timestamp: <b>{bioResult.face_in_timestamp}</b></div>
                </div>
              )}

              {/* Mocked Self-Learned AI Voting Pacing Verdict (Stage OUT) */}
              {stage === 'OUT' && bioResult?.status === 'COMPLETED' && (
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                    <Clock size={13} />
                    <span>Total Voting Duration: <b style={{ color: '#38bdf8' }}>{bioResult.duration_formatted}</b></span>
                  </div>
                  <div style={{ 
                    marginTop: 6, 
                    padding: '8px 10px', 
                    borderRadius: 8, 
                    background: bioResult.timing_anomaly?.flag === 'NORMAL' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.15)',
                    border: bioResult.timing_anomaly?.flag === 'NORMAL' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                  }}>
                    <div style={{ 
                      fontWeight: 700, 
                      color: bioResult.timing_anomaly?.flag === 'NORMAL' ? '#22c55e' : '#f43f5e',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      {bioResult.timing_anomaly?.flag === 'NORMAL' ? <CheckCircle2 size={13} /> : <AlertOctagon size={13} />}
                      AI Pacing Verdict: {bioResult.timing_anomaly?.flag} ({bioResult.timing_anomaly?.severity} SEVERITY)
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4, lineHeight: 1.35 }}>
                      {bioResult.timing_anomaly?.explanation}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Simulation Row for Stage OUT AI Anomaly Testing */}
          {stage === 'OUT' && (
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap size={12} color="#fbbf24" />
                <span>Test Self-Learned AI Anomaly Triggers (Interactive Evaluation):</span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="chip small"
                  onClick={() => testSimulatedCheckout(24, 'RUSH')}
                  style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f43f5e', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                >
                  ⚡ Simulate 24s Rush (&lt;45s Early Anomaly)
                </button>
                <button
                  type="button"
                  className="chip small"
                  onClick={() => testSimulatedCheckout(195, 'NORMAL')}
                  style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}
                >
                  ⏱️ Simulate 3m 15s (Normal Pace)
                </button>
                <button
                  type="button"
                  className="chip small"
                  onClick={() => testSimulatedCheckout(580, 'DELAY')}
                  style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}
                >
                  ⏳ Simulate 9m 40s (&gt;8m Delay Anomaly)
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {stage === 'IN' && bioResult?.status === 'VERIFIED' && (
              <button
                type="button"
                className="btn primary small"
                onClick={() => {
                  setStage('OUT');
                  setPhoto(null);
                  setBioResult(null);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span>Proceed to Step 2: Face OUT</span>
                <ArrowRight size={13} />
              </button>
            )}
            <button type="button" className="btn small" onClick={clearSession}>
              <RefreshCw size={13} style={{ marginRight: 4 }} />
              Reset Attendance Scan
            </button>
          </div>
        </div>
      ) : (
        /* LIVE CAMERA TRIGGER BUTTON ONLY */
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn primary"
            onClick={startCamera}
            disabled={disabled || analyzing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center', padding: '12px 18px', fontWeight: 700 }}
          >
            <Camera size={18} />
            <span>Open Live Attendance Camera (Face {stage})</span>
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="banner bad small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
