import React, { useState, useEffect, useRef, useCallback } from "react";

const PALETTE = {
  paper: "#E7E2D6",
  ink: "#171512",
  phosphor: "#3F6F5E",
  gold: "#C89B3C",
  grid: "#B9AFA0",
};

const PAUSE_THRESHOLD = 1500;
const MIN_GAP = 20;
const MAX_GAP = 400;

function App() {
  const [typedText, setTypedText] = useState("");
  const [gaps, setGaps] = useState([]);
  const [timestamps, setTimestamps] = useState([]);
  const [state, setState] = useState("input");
  const [portraitText, setPortraitText] = useState("");
  const [portraitGaps, setPortraitGaps] = useState([]);
  const [footerData, setFooterData] = useState({ avgGap: 0, peakCount: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [fontLoaded, setFontLoaded] = useState(false);

  const inputRef = useRef(null);
  const canvasRef = useRef(null);
  const tracePoints = useRef([]);
  const pauseTimer = useRef(null);
  const replayTimer = useRef(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
    // Check if font loaded
    document.fonts.load('16px Recursive').then(() => setFontLoaded(true));
  }, []);

  const findPeaks = (points) => {
    if (points.length < 3) return [];
    const peaks = [];
    for (let i = 1; i < points.length - 1; i++) {
      if (points[i].y > points[i - 1].y && points[i].y > points[i + 1].y) {
        peaks.push(i);
      }
    }
    return peaks;
  };

  const drawTrace = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = PALETTE.grid;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;
    const gridSize = 20;
    for (let x = 0; x <= rect.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y <= rect.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (tracePoints.current.length < 2) return;

    const points = tracePoints.current;
    const padding = 20;
    const drawWidth = rect.width - padding * 2;
    const maxVal = Math.max(...points.map(p => p.y), 1);

    ctx.beginPath();
    ctx.strokeStyle = PALETTE.phosphor;
    ctx.lineWidth = 2;
    ctx.shadowColor = PALETTE.phosphor;
    ctx.shadowBlur = 6;

    points.forEach((p, i) => {
      const x = padding + (p.x / (points.length - 1 || 1)) * drawWidth;
      const y = rect.height - padding - (p.y / maxVal) * (rect.height - padding * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.shadowBlur = 0;
    const peaks = findPeaks(points);
    peaks.forEach((peakIdx) => {
      const p = points[peakIdx];
      const x = padding + (p.x / (points.length - 1 || 1)) * drawWidth;
      const y = rect.height - padding - (p.y / maxVal) * (rect.height - padding * 2);
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  const commitTyping = useCallback(() => {
    if (typedText.trim().length === 0) return;
    clearTimeout(pauseTimer.current);
    setPortraitText(typedText);
    setPortraitGaps([...gaps]);
    setState("portrait");

    const validGaps = gaps.filter(g => g > 0);
    const avgGap = validGaps.length > 0
      ? Math.round(validGaps.reduce((a, b) => a + b, 0) / validGaps.length)
      : 0;
    const peaks = findPeaks(tracePoints.current);
    setFooterData({ avgGap, peakCount: peaks.length });
  }, [typedText, gaps]);

  const resetAll = useCallback(() => {
    clearTimeout(pauseTimer.current);
    clearTimeout(replayTimer.current);
    setTypedText("");
    setGaps([]);
    setTimestamps([]);
    setState("input");
    setPortraitText("");
    setPortraitGaps([]);
    setFooterData({ avgGap: 0, peakCount: 0 });
    setIsReplaying(false);
    tracePoints.current = [];
    drawTrace();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [drawTrace]);

  const replaySession = useCallback(() => {
    if (portraitText.length === 0 || isReplaying) return;
    setIsReplaying(true);
    setState("replaying");

    const replayGaps = portraitGaps.slice(0, portraitText.length);
    const points = [];
    let currentX = 0;
    replayGaps.forEach((gap) => {
      const normalizedGap = Math.min(Math.max(gap, MIN_GAP), MAX_GAP);
      const normalizedY = (normalizedGap - MIN_GAP) / (MAX_GAP - MIN_GAP);
      points.push({ x: currentX, y: normalizedY });
      currentX++;
    });
    tracePoints.current = points;

    let step = 0;
    const totalSteps = points.length;

    const animateReplay = () => {
      if (step >= totalSteps) {
        setState("portrait");
        setIsReplaying(false);
        drawTrace();
        return;
      }
      const currentPoints = points.slice(0, step + 1);
      tracePoints.current = currentPoints;
      drawTrace();
      step++;
      const delay = Math.min(replayGaps[step] || 30, 150);
      replayTimer.current = setTimeout(animateReplay, delay);
    };

    animateReplay();
  }, [portraitText, portraitGaps, drawTrace, isReplaying]);

  const handleInputChange = useCallback((e) => {
    const newText = e.target.value;
    const now = performance.now();

    if (newText.length < typedText.length) {
      setTypedText(newText);
      setGaps(gaps.slice(0, newText.length));
      setTimestamps(timestamps.slice(0, newText.length));
      if (tracePoints.current.length > newText.length) {
        tracePoints.current = tracePoints.current.slice(0, newText.length);
      }
      drawTrace();
      return;
    }

    const lastTimestamp = timestamps[timestamps.length - 1] || 0;
    const gap = lastTimestamp > 0 ? now - lastTimestamp : 0;

    setTypedText(newText);
    setGaps([...gaps, gap]);
    setTimestamps([...timestamps, now]);

    const normalizedGap = Math.min(Math.max(gap, MIN_GAP), MAX_GAP);
    const normalizedY = (normalizedGap - MIN_GAP) / (MAX_GAP - MIN_GAP);
    tracePoints.current.push({ x: tracePoints.current.length, y: normalizedY });

    drawTrace();

    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(commitTyping, PAUSE_THRESHOLD);
  }, [typedText, gaps, timestamps, commitTyping, drawTrace]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && typedText.trim().length > 0) {
      e.preventDefault();
      commitTyping();
    }
  }, [typedText, commitTyping]);

  const renderPortrait = () => {
    if (state !== "portrait" && state !== "replaying") return null;

    const text = portraitText;
    const gapData = portraitGaps;

    if (text.length === 0) return null;

    const chars = text.split("");
    const validGaps = gapData.filter(g => g > 0);
    const minGap = Math.min(...validGaps, 20);
    const maxGap = Math.max(...validGaps, 200);

    const getTransform = (index) => {
      const gap = gapData[index] || 30;
      const normalized = Math.max(0, Math.min(1, (gap - minGap) / (maxGap - minGap + 1)));
      const weight = 300 + normalized * 500;
      const width = 50 + normalized * 100;
      const slant = normalized * 15;
      return { weight, width, slant };
    };

    const isReduced = reducedMotion;

    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          background: PALETTE.paper,
          width: "100%",
        }}
      >
        <div
          style={{
            fontFamily: "'Recursive', sans-serif",
            fontSize: "clamp(28px, 7vw, 64px)",
            lineHeight: 1.3,
            color: PALETTE.ink,
            maxWidth: "800px",
            width: "100%",
            textAlign: "center",
            wordBreak: "break-word",
          }}
        >
          {chars.map((char, i) => {
            const t = getTransform(i);
            const delay = isReduced ? 0 : i * 20;
            return (
              <span
                key={i}
                style={{
                  fontVariationSettings: `'wght' ${t.weight}, 'wdth' ${t.width}, 'slnt' ${t.slant}`,
                  display: "inline-block",
                  transition: isReduced
                    ? "none"
                    : `font-variation-settings 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
                  marginRight: "2px",
                }}
              >
                {char}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  useEffect(() => {
    const handleResize = () => {
      if (state === "input" || state === "replaying") {
        drawTrace();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [state, drawTrace]);

  useEffect(() => {
    return () => {
      clearTimeout(pauseTimer.current);
      clearTimeout(replayTimer.current);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PALETTE.paper,
        fontFamily: "'IBM Plex Mono', monospace",
        color: PALETTE.ink,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: `1px solid ${PALETTE.grid}`,
          background: PALETTE.paper,
          zIndex: 20,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.1em", fontWeight: 600 }}>
            cadence
          </span>
          <span style={{ fontSize: 10, color: PALETTE.grid }}>
            by ace
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {(state === "portrait" || state === "replaying") && (
            <button
              onClick={replaySession}
              disabled={isReplaying}
              style={{
                background: "none",
                border: `1px solid ${PALETTE.grid}`,
                color: PALETTE.ink,
                padding: "4px 16px",
                fontSize: 10,
                cursor: isReplaying ? "not-allowed" : "pointer",
                opacity: isReplaying ? 0.5 : 1,
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: "0.08em",
                borderRadius: 0,
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
                textTransform: "uppercase",
              }}
              onMouseEnter={(e) => {
                if (!isReplaying) {
                  e.target.style.background = PALETTE.ink;
                  e.target.style.color = PALETTE.paper;
                  e.target.style.borderColor = PALETTE.ink;
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "none";
                e.target.style.color = PALETTE.ink;
                e.target.style.borderColor = PALETTE.grid;
              }}
            >
              {isReplaying ? "replaying…" : "replay"}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {state === "input" && (
          <div
            style={{
              flex: 1,
              padding: "20px 20px 10px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              minHeight: "60vh",
            }}
          >
            <div
              style={{
                flex: 1,
                position: "relative",
                background: PALETTE.paper,
                border: `1px solid ${PALETTE.grid}`,
                borderRadius: 0,
                overflow: "hidden",
                minHeight: 200,
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  background: PALETTE.paper,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: "none",
                  backgroundImage: `
                    linear-gradient(rgba(185, 175, 160, 0.05) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(185, 175, 160, 0.05) 1px, transparent 1px)
                  `,
                  backgroundSize: "20px 20px",
                  zIndex: 1,
                }}
              />
            </div>

            <div
              style={{
                paddingTop: "16px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                borderTop: `1px solid ${PALETTE.grid}`,
                marginTop: "auto",
              }}
            >
              <span style={{ fontSize: 12, color: PALETTE.grid, userSelect: "none" }}>
                {">"}
              </span>
              <input
                ref={inputRef}
                type="text"
                value={typedText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="type something…"
                style={{
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: PALETTE.ink,
                  fontSize: "16px",
                  fontFamily: "'IBM Plex Mono', monospace",
                  flex: 1,
                  padding: "4px 0",
                  caretColor: PALETTE.gold,
                  width: "100%",
                }}
                autoFocus
              />
              {typedText.length > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    color: PALETTE.grid,
                    fontFamily: "'IBM Plex Mono', monospace",
                  }}
                >
                  {typedText.length} chars
                </span>
              )}
            </div>
          </div>
        )}

        {(state === "portrait" || state === "replaying") && renderPortrait()}
      </div>

      <div
        style={{
          padding: "8px 20px",
          borderTop: `1px solid ${PALETTE.grid}`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: PALETTE.paper,
          zIndex: 20,
          position: "relative",
          fontSize: 9,
          color: PALETTE.grid,
          fontFamily: "'IBM Plex Mono', monospace",
          letterSpacing: "0.04em",
        }}
      >
        <span>
          avg gap: {footerData.avgGap}ms &nbsp;&bull;&nbsp; peaks: {footerData.peakCount}
          {state === "portrait" && " &bull; portrait"}
          {state === "replaying" && " &bull; replaying…"}
        </span>
      </div>

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: "none",
          zIndex: 0,
          backgroundImage: `
            linear-gradient(rgba(185, 175, 160, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(185, 175, 160, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  );
}

export default App;
