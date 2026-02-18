import React, { useState, useRef, useEffect } from 'react';
import { Camera, AlertTriangle, Settings, Power, Volume2, VolumeX, Info, ShieldCheck } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as tf from '@tensorflow/tfjs';
import '../App.css';

// Eye Aspect Ratio Calculator
const calculateEAR = (eye) => {
    if (!eye || eye.length !== 6) return 0;

    const euclidean = (p1, p2) => {
        return Math.sqrt(
            Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
        );
    };

    const A = euclidean(eye[1], eye[5]);
    const B = euclidean(eye[2], eye[4]);
    const C = euclidean(eye[0], eye[3]);

    const ear = (A + B) / (2.0 * C);
    return ear;
};

const getEyeLandmarks = (landmarks, eyeIndices) => {
    return eyeIndices.map(idx => landmarks[idx]);
};

const DrowsinessDetector = ({ user, onLogout }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [isActive, setIsActive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [alertActive, setAlertActive] = useState(false);
    const [earValue, setEarValue] = useState(0);
    const [closedFrames, setClosedFrames] = useState(0);
    const [threshold, setThreshold] = useState(0.25);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [lowLightMode, setLowLightMode] = useState(false);
    const [brightness, setBrightness] = useState(0.08); // additive [-1..1]
    const [contrast, setContrast] = useState(1.2); // multiplicative
    const [gamma, setGamma] = useState(0.9); // gamma correction
    const [fps, setFps] = useState(0);
    const [error, setError] = useState('');
    const [remoteModelUrl, setRemoteModelUrl] = useState('');
    const [emergencyContacts, setEmergencyContacts] = useState(user.emergencyContacts || '+91 9941080817');
    const [policeNumber, setPoliceNumber] = useState(user.policeNumber || '100'); // Indian police emergency number
    const [autoSendAlerts, setAutoSendAlerts] = useState(true);
    const lastAlertSentRef = useRef(0);
    const [cameraSource, setCameraSource] = useState('webcam'); // 'webcam' or 'ip'
    const [ipCameraUrl, setIpCameraUrl] = useState('');

    const faceLandmarkerRef = useRef(null);
    const audioContextRef = useRef(null);
    const animationFrameRef = useRef(null);
    const lastFrameTimeRef = useRef(0);
    const frameCountRef = useRef(0);
    const closedFrameCountRef = useRef(0);
    const closedStartRef = useRef(null); // timestamp when eyes first detected closed
    const oscillatorRef = useRef(null);
    const gainNodeRef = useRef(null);
    const modelRef = useRef(null);
    const enhanceCanvasRef = useRef(null);
    const faceNotDetectedStartRef = useRef(null); // timestamp when face detection was lost
    const faceNotDetectedAlertSentRef = useRef(false); // track if alert already sent for current no-face session

    const CONSEC_FRAMES = 45;
    const [alertMs, setAlertMs] = useState(1000); // alert duration in ms (adjustable)
    const [faceNotDetectedDuration, setFaceNotDetectedDuration] = useState(0); // duration in ms when face not detected
    const [faintThreshold, setFaintThreshold] = useState(15000); // 15 seconds of no face = faint
    const [alertStatus, setAlertStatus] = useState(null); // { status: 'sending' | 'sent' | 'error', details: string }
    const [lastAlertTime, setLastAlertTime] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    const LEFT_EYE = [362, 385, 387, 263, 373, 380];
    const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

    useEffect(() => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioContextRef.current = new AudioContextClass();
        }
        return () => {
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const initializeFaceLandmarker = async () => {
        try {
            setIsLoading(true);
            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
            );

            faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "GPU"
                },
                numFaces: 1,
                runningMode: "VIDEO",
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            await loadCNNModel();

            setIsLoading(false);
            return true;
        } catch (err) {
            console.error("Error initializing Face Landmarker:", err);
            setError("Failed to load face detection model. Please refresh and try again.");
            setIsLoading(false);
            return false;
        }
    };

    const loadCNNModel = async () => {
        // MediaPipe Face Mesh provides 478 landmarks, including high-fidelity eye tracking.
        // We use the refined EAR (Eye Aspect Ratio) metric computed from these AI landmarks
        // which is highly robust and lighting-independent.
        console.log("MediaPipe high-fidelity tracking active.");
        return true;
    };

    const cropEye = (ctx, eyeLandmarks, canvasWidth, canvasHeight) => {
        const xs = eyeLandmarks.map(p => p.x * canvasWidth);
        const ys = eyeLandmarks.map(p => p.y * canvasHeight);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const width = maxX - minX;
        const height = maxY - minY;
        const padding = 0.1;
        const paddedMinX = Math.max(0, minX - width * padding);
        const paddedMaxX = Math.min(canvasWidth, maxX + width * padding);
        const paddedMinY = Math.max(0, minY - height * padding);
        const paddedMaxY = Math.min(canvasHeight, maxY + height * padding);
        const eyeImageData = ctx.getImageData(paddedMinX, paddedMinY, paddedMaxX - paddedMinX, paddedMaxY - paddedMinY);
        return eyeImageData;
    };

    const enhanceImageData = (imageData, brightness = 0.08, contrast = 1.2, gamma = 0.9) => {
        const data = imageData.data;
        // Precompute gamma LUT for performance
        const lut = new Uint8ClampedArray(256);
        const invGamma = 1.0 / Math.max(0.01, gamma);
        for (let i = 0; i < 256; i++) {
            // normalize, apply contrast and brightness, then gamma
            let v = i / 255;
            v = (v - 0.5) * contrast + 0.5 + brightness;
            v = Math.max(0, Math.min(1, v));
            v = Math.pow(v, invGamma);
            lut[i] = Math.round(v * 255);
        }

        for (let i = 0; i < data.length; i += 4) {
            data[i] = lut[data[i]];       // R
            data[i + 1] = lut[data[i + 1]]; // G
            data[i + 2] = lut[data[i + 2]]; // B
            // keep alpha
        }

        return imageData;
    };

    const preprocessEye = (imageData) => {
        return tf.tidy(() => {
            let tensor = tf.browser.fromPixels(imageData);
            tensor = tf.image.resizeBilinear(tensor, [24, 24]);
            tensor = tf.mean(tensor, -1, true);
            tensor = tf.div(tensor, 255.0);
            tensor = tf.expandDims(tensor, 0);
            return tensor;
        });
    };

    const classifyEye = async (preprocessed) => {
        if (!modelRef.current) return null;
        const prediction = modelRef.current.predict(preprocessed);
        const result = await prediction.data();
        prediction.dispose();
        return result[0] > 0.5; // assuming result[0] is prob closed
    };

    const startCamera = async () => {
        try {
            setError('');
            console.log("Starting camera...");

            if (!faceLandmarkerRef.current) {
                console.log("Initializing face landmarker...");
                const initialized = await initializeFaceLandmarker();
                if (!initialized) return;
                console.log("Face landmarker initialized successfully!");
            }

            if (cameraSource === 'ip' && ipCameraUrl) {
                // IP Camera Mode
                console.log("Connecting to IP camera:", ipCameraUrl);
                if (videoRef.current) {
                    videoRef.current.src = ipCameraUrl;
                    videoRef.current.onloadedmetadata = () => {
                        console.log("IP camera loaded, starting playback...");
                        videoRef.current.play();
                        setIsActive(true);
                        console.log("Starting detection...");
                        detectDrowsiness();
                    };
                    videoRef.current.onerror = (e) => {
                        console.error("IP camera error:", e);
                        setError("Failed to connect to IP camera. Check the URL and CORS settings.");
                    };
                }
            } else {
                // Webcam Mode
                console.log("Requesting camera access...");
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                });

                console.log("Camera stream obtained!");

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        console.log("Video loaded, starting playback...");
                        videoRef.current.play();
                        setIsActive(true);
                        console.log("Starting detection...");
                        detectDrowsiness();
                    };
                }
            }
        } catch (err) {
            console.error("Camera error:", err);
            setError(`Cannot access camera: ${err.message}. Please grant camera permissions.`);
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }

        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }

        stopAlarm();
        setIsActive(false);
        setAlertActive(false);
        setClosedFrames(0);
        closedFrameCountRef.current = 0;
        closedStartRef.current = null;
        faceNotDetectedStartRef.current = null;
        faceNotDetectedAlertSentRef.current = false;
        setFaceNotDetectedDuration(0);
    };

    const playAlarm = () => {
        if (!soundEnabled || !audioContextRef.current) return;

        if (oscillatorRef.current) return; // Already playing

        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // High-pitched urgent siren
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();

        // Siren wobble effect
        const sirenInterval = setInterval(() => {
            if (oscillatorRef.current === osc) {
                const freq = osc.frequency.value > 1000 ? 880 : 1760;
                osc.frequency.exponentialRampToValueAtTime(freq, ctx.currentTime + 0.15);
            } else {
                clearInterval(sirenInterval);
            }
        }, 200);

        oscillatorRef.current = osc;
        gainNodeRef.current = gain;
    };

    const stopAlarm = () => {
        if (oscillatorRef.current) {
            try {
                oscillatorRef.current.stop();
                oscillatorRef.current.disconnect();
            } catch (e) {
                console.warn('Error stopping oscillator', e);
            }
            oscillatorRef.current = null;
        }
        if (gainNodeRef.current) {
            try {
                gainNodeRef.current.disconnect();
            } catch (e) { }
            gainNodeRef.current = null;
        }
    };

    const saveProfile = async () => {
        try {
            setIsSaving(true);
            const res = await fetch(`/api/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: user.id,
                    emergencyContacts,
                    policeNumber
                })
            });
            if (res.ok) {
                setAlertStatus({ status: 'sent', details: 'Profile settings saved successfully!' });
                setTimeout(() => setAlertStatus(null), 3000);
            }
        } catch (err) {
            console.error('Failed to save profile:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const sendAlert = async (metadata = {}, type = 'Emergency') => {
        try {
            const nowTs = Date.now();
            // avoid spamming: one alert per 2 minutes for different types
            if (lastAlertSentRef.current && (nowTs - lastAlertSentRef.current) < 2 * 60 * 1000) {
                console.log('Alert recently sent; skipping duplicate');
                return;
            }

            setAlertStatus({ status: 'sending', details: `Dispatching ${type} Alert...` });

            // build contacts array
            const contacts = emergencyContacts
                .split(/[,\n;]+/) // split by comma/newline/semicolon
                .map(s => s.trim())
                .filter(Boolean);

            const payload = {
                type,
                contacts,
                policeNumber: policeNumber || '100',
                message: type === 'Faint'
                    ? `CRITICAL FAINT ALERT: Driver appears to have fainted or lost consciousness. Immediate emergency response required.`
                    : `DROWSINESS ALERT: Driver is showing signs of extreme fatigue or eyes remain closed for too long.`,
                metadata,
                timestamp: new Date().toISOString()
            };

            // attempt to get geolocation
            let locStr = 'Unknown Location';
            if (navigator && navigator.geolocation) {
                try {
                    const pos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                    });
                    payload.location = {
                        lat: pos.coords.latitude,
                        lon: pos.coords.longitude,
                        accuracy: pos.coords.accuracy
                    };
                    locStr = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
                } catch (e) {
                    console.warn('Geolocation not available', e);
                }
            }

            payload.message += ` Location: ${locStr}.`;

            // call backend endpoint
            const res = await fetch(`/api/alert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            console.log('Alert API result', result);

            if (result.success) {
                setAlertStatus({
                    status: 'sent',
                    details: `${type} Alert sent! Notified ${result.details.policeStation}.`
                });
                lastAlertSentRef.current = nowTs;
                setLastAlertTime(new Date().toLocaleTimeString());
                faceNotDetectedAlertSentRef.current = true;
            } else {
                setAlertStatus({ status: 'error', details: 'Failed to dispatch alert.' });
            }
        } catch (err) {
            console.error('Failed to send alert:', err);
            setAlertStatus({ status: 'error', details: 'Network error sending alert.' });
        }
    };

    const detectDrowsiness = () => {
        const detect = async () => {
            if (!videoRef.current || !faceLandmarkerRef.current) {
                console.log("Detection stopped - missing refs");
                return;
            }

            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (video.readyState === video.HAVE_ENOUGH_DATA) {
                const now = performance.now();
                frameCountRef.current++;
                if (now - lastFrameTimeRef.current >= 1000) {
                    setFps(frameCountRef.current);
                    frameCountRef.current = 0;
                    lastFrameTimeRef.current = now;
                }

                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                let sourceForDetection = video;

                if (lowLightMode) {
                    // create or resize offscreen enhancement canvas
                    if (!enhanceCanvasRef.current) {
                        enhanceCanvasRef.current = document.createElement('canvas');
                    }
                    const eCanvas = enhanceCanvasRef.current;
                    eCanvas.width = canvas.width;
                    eCanvas.height = canvas.height;
                    const eCtx = eCanvas.getContext('2d');

                    // draw video into enhancement canvas, get pixels, enhance, and use as source
                    eCtx.drawImage(video, 0, 0, eCanvas.width, eCanvas.height);
                    try {
                        const imgData = eCtx.getImageData(0, 0, eCanvas.width, eCanvas.height);
                        enhanceImageData(imgData, brightness, contrast, gamma);
                        eCtx.putImageData(imgData, 0, 0);
                        sourceForDetection = eCanvas;
                    } catch (errEnh) {
                        // getImageData may throw on cross-origin streams; fallback to raw video
                        console.warn('Enhancement failed, using raw video frame:', errEnh);
                        sourceForDetection = video;
                    }
                } else {
                    // plain draw the video frame
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                }

                // If lowLightMode, draw enhanced frame to visible canvas so user sees improvement
                if (lowLightMode && enhanceCanvasRef.current) {
                    ctx.drawImage(enhanceCanvasRef.current, 0, 0, canvas.width, canvas.height);
                }

                try {
                    const results = faceLandmarkerRef.current.detectForVideo(sourceForDetection, now);

                    // Check if face was detected
                    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
                        // Face not detected
                        if (!faceNotDetectedStartRef.current) {
                            faceNotDetectedStartRef.current = now;
                            faceNotDetectedAlertSentRef.current = false;
                        }
                        const noFaceDuration = now - faceNotDetectedStartRef.current;
                        setFaceNotDetectedDuration(Math.floor(noFaceDuration));

                        // Faint detection: if face lost for X seconds (default 15s)
                        if (noFaceDuration >= faintThreshold && !faceNotDetectedAlertSentRef.current) {
                            if (!alertActive) {
                                setAlertActive(true);
                                playAlarm();
                            }
                            if (autoSendAlerts) {
                                sendAlert({ noFaceDetectedForMs: noFaceDuration }, 'Faint');
                            }
                        }

                        if (alertActive) {
                            // Draw red alert overlay even when no face is detected
                            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.strokeStyle = '#ff0000';
                            ctx.lineWidth = 10;
                            ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
                            ctx.fillStyle = '#ff0000';
                            ctx.font = 'bold 40px Arial';
                            ctx.textAlign = 'center';
                            ctx.fillText('⚠️ CRITICAL ALERT: NO FACE', canvas.width / 2, 60);
                        }

                        // Also keep old 5-min long-term alert logic if needed, but 15s is better for faints
                        // Reset eye tracking
                        closedFrameCountRef.current = 0;
                        closedStartRef.current = null;
                        setClosedFrames(0);
                        setEarValue(0);
                        if (alertActive) {
                            setAlertActive(false);
                            stopAlarm();
                        }
                    } else if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                        // Face detected - reset no-face counter
                        faceNotDetectedStartRef.current = null;
                        faceNotDetectedAlertSentRef.current = false;
                        setFaceNotDetectedDuration(0);

                        const landmarks = results.faceLandmarks[0];

                        const leftEye = getEyeLandmarks(landmarks, LEFT_EYE);
                        const rightEye = getEyeLandmarks(landmarks, RIGHT_EYE);

                        const leftEAR = calculateEAR(leftEye);
                        const rightEAR = calculateEAR(rightEye);
                        const ear = (leftEAR + rightEAR) / 2.0;

                        setEarValue(ear);

                        drawEyeContour(ctx, leftEye, canvas.width, canvas.height);
                        drawEyeContour(ctx, rightEye, canvas.width, canvas.height);

                        const bothEyesClosed = ear < threshold;

                        if (bothEyesClosed) {
                            // start timer on first closed detection
                            if (!closedStartRef.current) {
                                closedStartRef.current = now;
                            }
                            const elapsed = now - closedStartRef.current;
                            // store elapsed ms in closedFrames for UI/progress
                            setClosedFrames(Math.floor(elapsed));

                            if (elapsed >= alertMs) {
                                if (!alertActive) {
                                    setAlertActive(true);
                                    playAlarm();
                                    // send alerts instead of playing sound
                                    if (autoSendAlerts) sendAlert({ ear: ear, closedForMs: elapsed }, 'Drowsiness');
                                }
                            }
                        } else {
                            closedFrameCountRef.current = 0;
                            closedStartRef.current = null;
                            setClosedFrames(0);
                            if (alertActive) {
                                setAlertActive(false);
                                stopAlarm();
                            }
                        }

                        if (alertActive) {
                            ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            ctx.strokeStyle = '#ff0000';
                            ctx.lineWidth = 10;
                            ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

                            ctx.fillStyle = '#ff0000';
                            ctx.font = 'bold 40px Arial';
                            ctx.textAlign = 'center';
                            ctx.fillText('⚠️ DROWSINESS ALERT!', canvas.width / 2, 60);
                        }
                    }
                } catch (err) {
                    console.error("Detection error:", err);
                }
            }

            animationFrameRef.current = requestAnimationFrame(detect);
        };

        detect();
    };

    const drawEyeContour = (ctx, eye, width, height) => {
        ctx.beginPath();
        eye.forEach((point, i) => {
            const x = point.x * width;
            const y = point.y * height;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.closePath();
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.stroke();
    };

    useEffect(() => {
        const video = videoRef.current;
        const animationFrame = animationFrameRef.current;
        const oscillator = oscillatorRef.current;
        const gainNode = gainNodeRef.current;

        return () => {
            if (video && video.srcObject) {
                const tracks = video.srcObject.getTracks();
                tracks.forEach(track => track.stop());
            }
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
            if (oscillator) {
                try {
                    oscillator.stop();
                    oscillator.disconnect();
                } catch {
                    // Already stopped
                }
            }
            if (gainNode) {
                gainNode.disconnect();
            }
            if (modelRef.current) {
                modelRef.current.dispose();
            }
        };
    }, []);

    const progressValue = Math.min(100, (closedFrames / alertMs) * 100);

    return (
        <div className="detector-container">
            <div className="content-wrapper">
                {/* Header */}
                <div className="header">
                    <h1 className="title">
                        <Camera className="icon-large" />
                        Drowsiness Detector
                    </h1>
                    <p className="subtitle">Real-time driver alertness monitoring • Logged in as <strong>{user.name}</strong></p>
                </div>

                <div className="user-actions">
                    <button onClick={onLogout} className="btn-logout">Logout</button>
                </div>

                {/* Detection info removal of modelWarning */}

                {error && (
                    <div className="error-message">
                        <AlertTriangle className="icon-small" />
                        {error}
                    </div>
                )}

                {/* Alert Dispatch Status */}
                {alertStatus && (
                    <div className={`status-banner ${alertStatus.status}`}>
                        <ShieldCheck className="icon-small" />
                        <div className="banner-content">
                            <span className="banner-title">{alertStatus.details}</span>
                            {lastAlertTime && <span className="banner-time">Last alert: {lastAlertTime}</span>}
                        </div>
                        <button className="banner-close" onClick={() => setAlertStatus(null)}>×</button>
                    </div>
                )}

                {/* Main Content */}
                <div className="main-card">
                    {/* Video Container */}
                    <div className="video-container">
                        <video
                            ref={videoRef}
                            className="video-element"
                            playsInline
                            muted
                            style={{ display: isActive ? 'block' : 'none' }}
                        />
                        <canvas
                            ref={canvasRef}
                            className="canvas-element"
                            style={{ display: isActive ? 'block' : 'none' }}
                        />

                        {!isActive && (
                            <div className="camera-off">
                                <div className="camera-off-content">
                                    <Camera className="icon-xlarge" />
                                    <p className="camera-off-text">Camera Off</p>
                                </div>
                            </div>
                        )}

                        {/* FPS Counter */}
                        {isActive && (
                            <div className="fps-counter">
                                <span>FPS: {fps}</span>
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="controls-section">
                        {/* Stats */}
                        {isActive && (
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-label">Face Detection Status</div>
                                    <div className="stat-value">{faceNotDetectedDuration > 0 ? 'Not Detected' : 'Detected'}</div>
                                    <div className="stat-sublabel">No Face: {(faceNotDetectedDuration / 1000).toFixed(1)}s / 300s</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-label">Faint Alert Progress</div>
                                    <div className="stat-value">{Math.min(100, (faceNotDetectedDuration / faintThreshold) * 100).toFixed(0)}%</div>
                                    <div className="progress-bar">
                                        <div
                                            className={`progress-fill ${Math.min(100, (faceNotDetectedDuration / faintThreshold) * 100) >= 100 ? 'progress-danger' : 'progress-warning'}`}
                                            style={{ width: `${Math.min(100, (faceNotDetectedDuration / faintThreshold) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="stat-sublabel">Alert triggers in {Math.max(0, ((faintThreshold - faceNotDetectedDuration) / 1000)).toFixed(1)}s</div>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="button-group">
                            <button
                                onClick={isActive ? stopCamera : startCamera}
                                disabled={isLoading}
                                className={`btn btn-primary ${isActive ? 'btn-stop' : 'btn-start'}`}
                            >
                                <Power className="icon-small" />
                                {isLoading ? 'Loading...' : isActive ? 'Stop Detection' : 'Start Detection'}
                            </button>

                            {alertActive && (
                                <button
                                    onClick={() => {
                                        setAlertActive(false);
                                        stopAlarm();
                                        closedFrameCountRef.current = 0;
                                        closedStartRef.current = null;
                                        setClosedFrames(0);
                                    }}
                                    className="btn btn-awake"
                                >
                                    <AlertTriangle className="icon-small" />
                                    I'm Awake!
                                </button>
                            )}

                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className="btn btn-secondary"
                            >
                                <Settings className="icon-small" />
                            </button>

                            <button
                                onClick={() => setSoundEnabled(!soundEnabled)}
                                className="btn btn-secondary"
                            >
                                {soundEnabled ? <Volume2 className="icon-small" /> : <VolumeX className="icon-small" />}
                            </button>
                        </div>

                        {/* Settings Panel */}
                        {showSettings && (
                            <div className="settings-panel">
                                <h3 className="settings-title">Settings</h3>

                                <div className="setting-item">
                                    <label className="setting-label">Camera Source</label>
                                    <div className="camera-source-buttons">
                                        <button
                                            onClick={() => setCameraSource('webcam')}
                                            className={`camera-btn ${cameraSource === 'webcam' ? 'active' : ''}`}
                                        >
                                            Webcam
                                        </button>
                                        <button
                                            onClick={() => setCameraSource('ip')}
                                            className={`camera-btn ${cameraSource === 'ip' ? 'active' : ''}`}
                                        >
                                            IP Camera
                                        </button>
                                    </div>
                                </div>

                                {cameraSource === 'ip' && (
                                    <div className="setting-item">
                                        <label className="setting-label">IP Camera URL</label>
                                        <input
                                            type="text"
                                            value={ipCameraUrl}
                                            onChange={(e) => setIpCameraUrl(e.target.value)}
                                            placeholder="http://192.168.1.100:8080/video"
                                            className="ip-input"
                                            disabled={isActive}
                                        />
                                        <div className="ip-examples">
                                            <p>Examples:</p>
                                            <ul>
                                                <li>MJPEG: http://IP:PORT/video</li>
                                                <li>IP Webcam (Android): http://IP:8080/video</li>
                                                <li>DroidCam: http://IP:4747/video</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                <div className="setting-item">
                                    <label className="setting-label">Remote Model URL (optional)</label>
                                    <input
                                        type="text"
                                        value={remoteModelUrl}
                                        onChange={(e) => setRemoteModelUrl(e.target.value)}
                                        placeholder="https://example.com/model/model.json"
                                        className="ip-input"
                                        disabled={isActive}
                                    />
                                    <div style={{ marginTop: '8px' }}>
                                        <button
                                            onClick={async () => {
                                                setIsLoading(true);
                                                setModelWarning('');
                                                await loadCNNModel();
                                                setIsLoading(false);
                                            }}
                                            className="btn btn-primary"
                                            disabled={isLoading || isActive}
                                        >
                                            Load Model
                                        </button>
                                    </div>
                                </div>

                                <div className="setting-item">
                                    <label className="setting-label">
                                        Sensitivity Threshold: {threshold.toFixed(2)}
                                    </label>
                                    <input
                                        type="range"
                                        min="0.15"
                                        max="0.35"
                                        step="0.01"
                                        value={threshold}
                                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                                        className="slider"
                                    />
                                    <div className="slider-labels">
                                        <span>More Sensitive</span>
                                        <span>Less Sensitive</span>
                                    </div>
                                </div>

                                <div className="setting-item">
                                    <label className="setting-label">Low Light Mode</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => setLowLightMode(!lowLightMode)}
                                            className={`camera-btn ${lowLightMode ? 'active' : ''}`}
                                        >
                                            {lowLightMode ? 'Enabled' : 'Disabled'}
                                        </button>
                                        <span style={{ color: '#888' }}>Enhances frames for darker scenes</span>
                                    </div>

                                    <div style={{ marginTop: '8px' }}>
                                        <label className="setting-label">Brightness</label>
                                        <input
                                            type="range"
                                            min="-0.3"
                                            max="0.4"
                                            step="0.01"
                                            value={brightness}
                                            onChange={(e) => setBrightness(parseFloat(e.target.value))}
                                            className="slider"
                                            disabled={isActive}
                                        />
                                        <label className="setting-label">Contrast</label>
                                        <input
                                            type="range"
                                            min="0.6"
                                            max="1.8"
                                            step="0.05"
                                            value={contrast}
                                            onChange={(e) => setContrast(parseFloat(e.target.value))}
                                            className="slider"
                                            disabled={isActive}
                                        />
                                        <label className="setting-label">Gamma</label>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="1.6"
                                            step="0.05"
                                            value={gamma}
                                            onChange={(e) => setGamma(parseFloat(e.target.value))}
                                            className="slider"
                                            disabled={isActive}
                                        />
                                    </div>
                                    <div className="setting-item">
                                        <label className="setting-label">Drowsiness Alert Delay: {(alertMs / 1000).toFixed(2)}s</label>
                                        <input
                                            type="range"
                                            min="500"
                                            max="3000"
                                            step="100"
                                            value={alertMs}
                                            onChange={(e) => setAlertMs(parseInt(e.target.value, 10))}
                                            className="slider"
                                            disabled={isActive}
                                        />
                                    </div>

                                    <div className="setting-item">
                                        <label className="setting-label">Faint Detection Timeout: {(faintThreshold / 1000).toFixed(0)}s</label>
                                        <input
                                            type="range"
                                            min="5000"
                                            max="60000"
                                            step="5000"
                                            value={faintThreshold}
                                            onChange={(e) => setFaintThreshold(parseInt(e.target.value, 10))}
                                            className="slider"
                                            disabled={isActive}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: '11px', marginTop: '4px' }}>
                                            <span>Fast (5s)</span>
                                            <span>Slow (60s)</span>
                                        </div>
                                    </div>
                                    <div className="setting-item">
                                        <label className="setting-label">Auto-send Alerts</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                onClick={() => setAutoSendAlerts(!autoSendAlerts)}
                                                className={`camera-btn ${autoSendAlerts ? 'active' : ''}`}
                                                disabled={isActive}
                                            >
                                                {autoSendAlerts ? 'Enabled' : 'Disabled'}
                                            </button>
                                            <span style={{ color: '#888' }}>Automatically send SMS alerts when drowsiness detected</span>
                                        </div>
                                    </div>

                                    <div className="setting-item">
                                        <label className="setting-label">Emergency Contacts (comma or newline separated)</label>
                                        <textarea
                                            value={emergencyContacts}
                                            onChange={(e) => setEmergencyContacts(e.target.value)}
                                            placeholder="+15551234567, +15557654321"
                                            rows={3}
                                            className="ip-input"
                                            disabled={isActive}
                                        />
                                    </div>

                                    <div className="setting-item">
                                        <label className="setting-label">Police Contact Number</label>
                                        <input
                                            type="text"
                                            value={policeNumber}
                                            onChange={(e) => setPoliceNumber(e.target.value)}
                                            placeholder="100"
                                            className="ip-input"
                                            disabled={isActive}
                                        />
                                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                                            <p><strong>India:</strong> Default is 100 (National Police Emergency)</p>
                                            <p>For SMS alerts to nearby police station, update with local police station number</p>
                                        </div>
                                    </div>

                                    <div className="setting-item">
                                        <button
                                            onClick={saveProfile}
                                            className="btn btn-save"
                                            disabled={isSaving || isActive}
                                        >
                                            {isSaving ? 'Saving...' : 'Save and Update Profile'}
                                        </button>
                                        <button
                                            onClick={() => sendAlert({ test: true })}
                                            className="btn btn-primary"
                                            style={{ marginTop: '10px' }}
                                            disabled={isActive}
                                        >
                                            Send Test Alert
                                        </button>
                                    </div>
                                </div>

                                <div className="info-box">
                                    <Info className="icon-small" />
                                    <div className="info-content">
                                        <p className="info-title">How it works:</p>
                                        <ul className="info-list">
                                            <li>Keep your face visible to the camera at all times</li>
                                            <li>Alert triggers if face not detected for more than {faintThreshold / 1000} seconds</li>
                                            <li>Indicates driver may have fainted or left vehicle</li>
                                            <li>Emergency contacts and nearby police notified automatically</li>
                                            <li>Live GPS location sent with every alert</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="footer">
                    <p>⚠️ This is a safety assistance tool. Stay alert while driving.</p>
                </div>
            </div>
        </div>
    );
};

export default DrowsinessDetector;
