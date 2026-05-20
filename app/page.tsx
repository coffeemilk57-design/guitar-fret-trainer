"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const bgmGainLevels = [0.04, 0.12, 0.32, 0.52, 0.78];
const strings = [
  { label: "6E", root: 4, octave: 2 },
  { label: "5A", root: 9, octave: 2 },
  { label: "4D", root: 2, octave: 3 },
  { label: "3G", root: 7, octave: 3 },
  { label: "2B", root: 11, octave: 3 },
  { label: "1E", root: 4, octave: 4 },
];
const positionMarkers = new Set([3, 5, 7, 9, 12]);
const stringButtonOrder = [5, 4, 3, 2, 1, 0];

function getNoteName(root: number, fret: number) {
  return noteNames[(root + fret) % 12];
}

function getFrequency(root: number, octave: number, fret: number) {
  const semitone = root + fret + octave * 12 - 9; // A4 = 440Hz, A = 9
  return 440 * Math.pow(2, semitone / 12);
}

function randomQuestion(availableStrings: number[]) {
  const stringIndex = availableStrings[Math.floor(Math.random() * availableStrings.length)];
  const fret = Math.floor(Math.random() * 13);
  return { stringIndex, fret };
}

function getBgmGainForLevel(level: number) {
  return bgmGainLevels[Math.min(Math.max(level, 1), 5) - 1];
}

export default function Home() {
  const [selectedStrings, setSelectedStrings] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const availableStringIndices = useMemo(() => (selectedStrings.length > 0 ? selectedStrings : [0, 1, 2, 3, 4, 5]), [selectedStrings]);
  const [question, setQuestion] = useState(() => randomQuestion(availableStringIndices));
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(5);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "playing" | "correct" | "wrong" | "timeout" | "stopped">("idle");
  const [selectedTap, setSelectedTap] = useState<{ stringIndex: number; fret: number; name: string } | null>(null);
  const [revealTarget, setRevealTarget] = useState<{ stringIndex: number; fret: number; name: string } | null>(null);
  const [bgmOn, setBgmOn] = useState(false);
  const [bgmVolumeLevel, setBgmVolumeLevel] = useState(3);
  const audioRef = useRef<AudioContext | null>(null);
  const bgmRef = useRef<{ oscillators: OscillatorNode[]; gain: GainNode; intervalId?: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextTimeoutRef = useRef<number | null>(null);

  const targetName = useMemo(() => {
    const stringData = strings[question.stringIndex];
    return getNoteName(stringData.root, question.fret);
  }, [question]);

  const questionToneClass = useMemo(() => {
    if (status === "correct") {
      return "bg-emerald-600/95 border-emerald-400/40 text-emerald-100 shadow-[0_0_28px_rgba(16,185,129,0.24)]";
    }
    if (status === "wrong" || status === "timeout") {
      return "bg-red-600/95 border-red-400/40 text-red-50 shadow-[0_0_28px_rgba(248,113,113,0.24)]";
    }
    if (status === "playing") {
      return "bg-slate-950/90 border-sky-400/30 text-sky-100 shadow-[0_0_30px_rgba(56,189,248,0.22)]";
    }
    return "bg-orange-500/12 border-orange-300/30 text-orange-100 shadow-[0_0_24px_rgba(251,191,36,0.16)]";
  }, [status]);

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    if (timeLeft <= 0) {
      playEffect("wrong");
      setStatus("timeout");
      setWrongCount((current) => current + 1);
      setRevealTarget({
        stringIndex: question.stringIndex,
        fret: question.fret,
        name: targetName,
      });
      return;
    }

    timerRef.current = window.setTimeout(() => {
      setTimeLeft((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [status, timeLeft, question, targetName]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (nextTimeoutRef.current) {
        clearTimeout(nextTimeoutRef.current);
      }
      stopBgm();
    };
  }, []);

  useEffect(() => {
    if (status === "correct" || status === "wrong" || status === "timeout") {
      if (nextTimeoutRef.current) {
        clearTimeout(nextTimeoutRef.current);
      }

      nextTimeoutRef.current = window.setTimeout(() => {
        advanceQuestion();
      }, 750);
    }

    return () => {
      if (nextTimeoutRef.current) {
        clearTimeout(nextTimeoutRef.current);
      }
    };
  }, [status]);

  const ensureAudioContext = () => {
    if (!audioRef.current) {
      audioRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioRef.current;
  };

  const playTone = (root: number, octave: number, fret: number) => {
    const context = ensureAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = getFrequency(root, octave, fret);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0.001, context.currentTime + 0.38);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
  };

  const playEffect = (type: "correct" | "wrong") => {
    const context = ensureAudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    if (type === "correct") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(660, now + 0.08);
      const toneFilter = context.createBiquadFilter();
      toneFilter.type = "lowpass";
      toneFilter.frequency.setValueAtTime(4200, now);
      toneFilter.Q.value = 1;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(toneFilter);
      toneFilter.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(210, now + 0.04);
      const notchFilter = context.createBiquadFilter();
      notchFilter.type = "peaking";
      notchFilter.frequency.setValueAtTime(800, now);
      notchFilter.gain.value = -2;
      notchFilter.Q.value = 1;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(3000, now);
      lowpass.Q.value = 1;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.035, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(notchFilter);
      notchFilter.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(context.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    }

    osc.onended = () => {
      try {
        gain.disconnect();
      } catch {}
      try {
        osc.disconnect();
      } catch {}
    };
  };

  const startBgm = () => {
    const context = ensureAudioContext();
    if (bgmRef.current) {
      return;
    }

    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, context.currentTime);
    masterGain.connect(context.destination);

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 0.1, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) {
      noiseData[i] = Math.random() * 2 - 1;
    }

    const playKick = (time: number) => {
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
      const gainNode = context.createGain();
      gainNode.gain.setValueAtTime(0.0001, time);
      gainNode.gain.exponentialRampToValueAtTime(0.12, time + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      osc.connect(gainNode);
      gainNode.connect(masterGain);
      osc.start(time);
      osc.stop(time + 0.22);
      osc.onended = () => {
        try {
          gainNode.disconnect();
          osc.disconnect();
        } catch {}
      };
    };

    const playHat = (time: number) => {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 7000;
      const gainNode = context.createGain();
      gainNode.gain.setValueAtTime(0.0001, time);
      gainNode.gain.linearRampToValueAtTime(0.04, time + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(masterGain);
      source.start(time);
      source.stop(time + 0.08);
      source.onended = () => {
        try {
          filter.disconnect();
          gainNode.disconnect();
          source.disconnect();
        } catch {}
      };
    };

    const playSnare = (time: number) => {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1800;
      const gainNode = context.createGain();
      gainNode.gain.setValueAtTime(0.0001, time);
      gainNode.gain.linearRampToValueAtTime(0.08, time + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(masterGain);
      source.start(time);
      source.stop(time + 0.12);
      source.onended = () => {
        try {
          filter.disconnect();
          gainNode.disconnect();
          source.disconnect();
        } catch {}
      };
    };

    let step = 0;
    const intervalId = window.setInterval(() => {
      const now = context.currentTime + 0.02;
      if (step % 4 === 0) {
        playKick(now);
      }
      if (step % 2 === 0) {
        playHat(now);
      }
      if (step === 2) {
        playSnare(now);
      }
      step = (step + 1) % 4;
    }, 300);

    const targetGain = getBgmGainForLevel(bgmVolumeLevel);
    masterGain.gain.setTargetAtTime(targetGain, context.currentTime, 0.08);
    bgmRef.current = { oscillators: [], gain: masterGain, intervalId };
  };

  const stopBgm = () => {
    if (!bgmRef.current) {
      return;
    }

    const { gain, intervalId } = bgmRef.current;
    if (intervalId) {
      window.clearInterval(intervalId);
    }
    gain.gain.cancelScheduledValues(gain.context.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, gain.context.currentTime);
    gain.gain.linearRampToValueAtTime(0.0001, gain.context.currentTime + 0.08);

    window.setTimeout(() => {
      try {
        gain.disconnect();
      } catch {}
    }, 140);

    bgmRef.current = null;
  };

  const setBgmVolume = (level: number) => {
    setBgmVolumeLevel(level);
    if (bgmRef.current) {
      const now = bgmRef.current.gain.context.currentTime;
      const gainNode = bgmRef.current.gain.gain;
      const targetGain = getBgmGainForLevel(level);
      gainNode.cancelScheduledValues(now);
      gainNode.setValueAtTime(gainNode.value, now);
      gainNode.setTargetAtTime(targetGain, now, 0.08);
    }
  };

  const toggleBgm = async () => {
    const context = ensureAudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    if (bgmOn) {
      stopBgm();
      setBgmOn(false);
      return;
    }

    startBgm();
    setBgmOn(true);
  };

  const toggleStringSelection = (index: number) => {
    setSelectedStrings((current) => {
      if (current.includes(index)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((value) => value !== index);
      }
      return [...current, index].sort((a, b) => a - b);
    });
  };

  const handleStart = () => {
    setScore(0);
    setRound(1);
    setCorrectCount(0);
    setWrongCount(0);
    setQuestion(randomQuestion(availableStringIndices));
    setTimeLeft(5);
    setStatus("playing");
    setSelectedTap(null);
    setRevealTarget(null);
    if (!bgmOn) {
      startBgm();
      setBgmOn(true);
    }
  };

  const handleStop = () => {
    setStatus("stopped");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (nextTimeoutRef.current) {
      clearTimeout(nextTimeoutRef.current);
    }
    stopBgm();
    setBgmOn(false);
    setSelectedTap(null);
    setRevealTarget(null);
  };

  const advanceQuestion = () => {
    setQuestion(randomQuestion(availableStringIndices));
    setTimeLeft(5);
    setStatus("playing");
    setRound((value) => value + 1);
    setSelectedTap(null);
    setRevealTarget(null);
  };

  const handleTap = (stringIndex: number, fret: number) => {
    if (status !== "playing") {
      return;
    }

    const stringData = strings[stringIndex];
    const tappedName = getNoteName(stringData.root, fret);
    setSelectedTap({ stringIndex, fret, name: tappedName });
    playTone(stringData.root, stringData.octave, fret);

    if (tappedName === targetName) {
      setScore((value) => value + 1);
      setCorrectCount((value) => value + 1);
      playEffect("correct");
      setStatus("correct");
    } else {
      setWrongCount((value) => value + 1);
      setRevealTarget({ stringIndex: question.stringIndex, fret: question.fret, name: targetName });
      playEffect("wrong");
      setStatus("wrong");
    }
  };

  return (
    <div className="page-shell">
      <main className="content">
        <section className="hero-card">
          <div>
            <p className="eyebrow">ギター指板の音名クイズ</p>
            <h1>6弦レギュラーチューニング / 0〜12フレット</h1>
            <p>
              表示された指板をタップして、表示された音名を探しましょう。タップ時に音が鳴り、5秒以内に答えを選んでください。
            </p>
          </div>
          <div className="status-card">
            <div className={`status-item ${questionToneClass} ${status === "playing" ? "animate-pulse" : ""}`}>
              <span>問題</span>
              <strong>{targetName}</strong>
            </div>
            <div className="status-item">
              <span>残り時間</span>
              <strong>{timeLeft}s</strong>
            </div>
            <div className="status-item">
              <span>スコア</span>
              <strong>{score}</strong>
              <div className="accuracy">正解率：{((correctCount + wrongCount) === 0 ? 0 : ((correctCount / (correctCount + wrongCount)) * 100)).toFixed(1)}%</div>
            </div>
            <div className="status-item">
              <span>ラウンド</span>
              <strong>{round}</strong>
            </div>
          </div>
          <div className="string-selector">
            {stringButtonOrder.map((index, display) => (
              <button
                key={index}
                type="button"
                className={`string-toggle ${selectedStrings.includes(index) ? "active" : ""}`}
                onClick={() => toggleStringSelection(index)}
              >
                {6 - index}弦
              </button>
            ))}
          </div>
          <div className="button-row">
            <button className="primary-button" onClick={handleStart}>
              {status === "idle" || status === "stopped" ? "クイズを始める" : "リスタート"}
            </button>
            <button className="secondary-button" onClick={toggleBgm} type="button">
              {bgmOn ? "BGM OFF" : "BGM ON"}
            </button>
            <button className="secondary-button" onClick={handleStop} type="button" disabled={status === "idle" || status === "stopped"}>
              停止
            </button>
          </div>
          <div className="volume-controls">
            <span className="volume-label">BGM音量</span>
            <div className="volume-buttons">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`volume-step ${level === bgmVolumeLevel ? "active" : ""}`}
                  onClick={() => setBgmVolume(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <div className="feedback-bar">
            {status === "correct" && <span className="correct">正解！</span>}
            {status === "wrong" && <span className="wrong">違います…</span>}
            {status === "timeout" && <span className="timeout">時間切れです！</span>}
            {status === "stopped" && <span className="timeout">停止中</span>}
          </div>
        </section>

        <section className="fretboard-card">
          <div className="fretboard-shell">
            <div className="fret-labels">
              <div className="string-label" />
              {Array.from({ length: 13 }, (_, fret) => (
                <div key={`fret-label-${fret}`} className="fret-number">
                  <span className="fret-title">
                    {fret === 0 ? "0 (Open)" : fret}
                  </span>
                  {positionMarkers.has(fret) ? (
                    <span className={`position-mark ${fret === 12 ? "double" : ""}`}>
                      <span />
                      {fret === 12 ? <span /> : null}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="fretboard">
              {strings
                .map((data, index) => ({ data, originalIndex: index }))
                .reverse()
                .map(({ data: stringData, originalIndex }) => (
                  <div key={stringData.label} className="string-row">
                    <div className="string-label">{stringData.label}</div>
                    {Array.from({ length: 13 }, (_, fret) => {
                      const name = getNoteName(stringData.root, fret);
                      const isSelected = selectedTap?.stringIndex === originalIndex && selectedTap?.fret === fret;
                      const isRevealTarget = revealTarget?.stringIndex === originalIndex && revealTarget?.fret === fret;
                      const showNote = isSelected || isRevealTarget;
                      const pointClass = [
                        "fret-point",
                        showNote ? "revealed" : "",
                        isSelected && status === "correct" ? "correct" : "",
                        isSelected && status === "wrong" ? "wrong" : "",
                        isRevealTarget && status !== "correct" ? "correct" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");

                      return (
                        <button
                          key={`${originalIndex}-${fret}`}
                          className={`fret-cell ${fret === 0 ? "nut-cell" : ""}`}
                          onClick={() => handleTap(originalIndex, fret)}
                          type="button"
                        >
                          <span className={pointClass}>
                            {showNote ? <span className="note-label">{name}</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .page-shell {
          min-height: 100vh;
          background: #2f1e0f;
          color: #f8fafc;
          display: flex;
          justify-content: center;
          padding: 24px 16px;
          background-image: radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 28%), linear-gradient(180deg, #4e2f13 0%, #2f1e0f 45%, #1d1208 100%);
        }

        .content {
          width: min(1200px, 100%);
          display: grid;
          gap: 20px;
        }

        .hero-card,
        .fretboard-card {
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
        }

        .hero-card {
          background: rgba(22, 10, 5, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .fretboard-card {
          background: linear-gradient(180deg, #6b4428 0%, #4b2c18 48%, #3b2314 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow-x: auto;
        }

        .fretboard-shell {
          min-width: 900px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 60%), repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.04) 1px, transparent 1px, transparent 8px), linear-gradient(90deg, #6f4227, #58311c 24%, #6f4227);
          border-radius: 24px;
          padding: 18px;
        }

        .hero-card p,
        .status-item span {
          color: #cbd5e1;
        }

        h1 {
          margin: 0.6rem 0 1rem;
          font-size: clamp(2rem, 4vw, 3rem);
          line-height: 1.05;
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.78rem;
          color: #7dd3fc;
          margin-bottom: 0.75rem;
        }

        .status-card {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 20px;
        }

        .status-item {
          background: rgba(148, 163, 184, 0.08);
          border-radius: 16px;
          padding: 16px;
          text-align: center;
        }

        .string-selector {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 16px;
          justify-content: center;
        }

        .string-toggle {
          border: none;
          border-radius: 999px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
          cursor: pointer;
          transition: background-color 0.2s ease, transform 0.2s ease;
        }

        .string-toggle.active {
          background: rgba(56, 189, 248, 0.32);
          color: #e0f2fe;
        }

        .string-toggle:hover {
          transform: translateY(-1px);
        }

        .volume-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
          color: #cbd5e1;
        }

        .volume-label {
          font-size: 0.95rem;
          color: #e2e8f0;
        }

        .volume-buttons {
          display: flex;
          gap: 8px;
        }

        .volume-step {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.06);
          color: #f8fafc;
          cursor: pointer;
          transition: background-color 0.2s ease, transform 0.2s ease;
        }

        .volume-step.active {
          background: rgba(56, 189, 248, 0.4);
          color: #e0f2fe;
          border-color: rgba(56, 189, 248, 0.6);
        }

        .volume-step:hover {
          transform: translateY(-1px);
        }

        .status-item strong {
          display: block;
          margin-top: 8px;
          font-size: 1.45rem;
          color: #e2e8f0;
        }

        .accuracy {
          margin-top: 6px;
          font-size: 0.95rem;
          color: #cbd5e1;
          letter-spacing: 0.02em;
        }

        .button-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 20px;
        }

        .primary-button,
        .secondary-button {
          border: none;
          border-radius: 14px;
          padding: 14px 20px;
          font-size: 1rem;
          cursor: pointer;
          transition: transform 0.16s ease, background-color 0.16s ease;
        }

        .primary-button {
          background: #38bdf8;
          color: #020617;
        }

        .secondary-button {
          background: rgba(148, 163, 184, 0.14);
          color: #e2e8f0;
        }

        .primary-button:hover,
        .secondary-button:hover {
          transform: translateY(-1px);
        }

        .secondary-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .feedback-bar {
          min-height: 1.5rem;
          margin-top: 14px;
          color: #f8fafc;
          font-weight: 600;
        }

        .correct {
          color: #86efac;
        }

        .wrong {
          color: #fca5a5;
        }

        .timeout {
          color: #fbbf24;
        }

        .fretboard-card {
          overflow-x: auto;
        }

        .fret-labels {
          display: grid;
          grid-template-columns: 80px repeat(13, minmax(60px, 1fr));
          align-items: center;
          gap: 0;
          padding-top: 16px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          margin-top: 16px;
        }

        .fret-number,
        .string-label {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 14px 8px;
          font-size: 0.95rem;
          color: #f8fafc;
        }

        .fret-title {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 0.88rem;
          line-height: 1.1;
          color: rgba(248, 250, 252, 0.9);
        }

        .fret-title::after {
          content: "";
          display: block;
          width: 28px;
          height: 2px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 999px;
        }

        .fret-number {
          color: rgba(248, 250, 252, 0.8);
        }

        .position-mark {
          position: absolute;
          bottom: 6px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 6px;
          align-items: center;
          justify-content: center;
        }

        .position-mark span {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: rgba(248, 250, 252, 0.9);
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
        }

        .position-mark.double span {
          width: 9px;
          height: 9px;
        }

        .fretboard {
          display: grid;
          gap: 8px;
        }

        .string-row {
          display: grid;
          grid-template-columns: 80px repeat(13, minmax(60px, 1fr));
          gap: 0;
          align-items: center;
          position: relative;
        }

        .string-row::before {
          content: "";
          position: absolute;
          left: 80px;
          right: 0;
          top: 50%;
          height: 2px;
          background: linear-gradient(90deg, rgba(248, 250, 252, 0.18), rgba(248, 250, 252, 0.06) 50%, rgba(248, 250, 252, 0.18));
          z-index: 0;
        }

        .fret-cell {
          border-left: 1px solid rgba(255, 255, 255, 0.12);
          background: transparent;
          min-height: 62px;
          border-radius: 0;
          position: relative;
          overflow: hidden;
          transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 1;
        }

        .string-row > .fret-cell:first-of-type {
          border-left: none;
        }

        .fret-cell:hover .fret-point {
          transform: scale(1.1);
          box-shadow: 0 0 18px rgba(255, 255, 255, 0.12);
        }

        .fret-point {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          color: transparent;
          font-size: 0.8rem;
          font-weight: 700;
          transition: transform 0.16s ease, background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease;
          z-index: 2;
        }

        .fret-point.revealed {
          width: 40px;
          height: 40px;
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(56, 189, 248, 0.55);
          color: #f8fafc;
        }

        .nut-cell {
          background: rgba(255, 255, 255, 0.08);
          border-left: 6px solid rgba(255, 255, 255, 0.35);
        }

        .fret-point.correct {
          background: #22c55e;
          border-color: #4ade80;
          color: #020617;
          box-shadow: 0 0 16px rgba(34, 197, 94, 0.55);
        }

        .fret-point.wrong {
          background: #ef4444;
          border-color: #fca5a5;
          color: #f8fafc;
          box-shadow: 0 0 16px rgba(239, 68, 68, 0.55);
        }

        .note-label {
          font-size: 0.88rem;
          font-weight: 700;
          line-height: 1;
          color: inherit;
        }

        @media (max-width: 900px) {
          .status-card {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .fretboard-card,
          .hero-card {
            padding: 18px;
          }

          .fret-labels,
          .string-row {
            grid-template-columns: 60px repeat(13, minmax(44px, 1fr));
          }

          .fret-cell {
            min-height: 44px;
          }
        }

        @media (max-width: 640px) {
          .page-shell {
            padding: 16px 12px;
          }

          .button-row {
            flex-direction: column;
          }

          .status-card {
            grid-template-columns: 1fr;
          }

          .fret-labels,
          .string-row {
            grid-template-columns: 52px repeat(13, minmax(36px, 1fr));
          }

          .note-label {
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
}
