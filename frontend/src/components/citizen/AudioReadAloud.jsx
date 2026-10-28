import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Play, Square } from 'lucide-react';

/**
 * AudioReadAloud — plays the complete warning text using the browser's
 * Web Speech API.  Supports Hindi (hi-IN) and English (en-US/en-IN).
 *
 * Key behaviours:
 * - Cancels any ongoing speech before starting a new one (no overlaps)
 * - Picks the best available voice for the target locale
 * - Sanitises emojis, markdown bullets, header labels before speaking
 * - Gracefully degrades: returns null if speechSynthesis unsupported
 * - Handles browser bug: Chrome sometimes pauses TTS after ~15 s;
 *   we resume it automatically every 10 s while speaking.
 */
export function AudioReadAloud({ text, language = 'en' }) {
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [supported, setSupported]     = useState(false);
  const [voiceReady, setVoiceReady]   = useState(false);
  const resumeInterval                = useRef(null);
  const utteranceRef                  = useRef(null);

  // ── Support detection ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSupported(true);
      // Chrome loads voices asynchronously
      const loadVoices = () => setVoiceReady(true);
      if (window.speechSynthesis.getVoices().length > 0) {
        setVoiceReady(true);
      } else {
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
        return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      }
    }
    // Cleanup: cancel any speech when component unmounts
    return () => {
      _stopSpeech();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cancel if language / text changes while speaking ──────────────────────
  useEffect(() => {
    if (isSpeaking) {
      _stopSpeech();
    }
  }, [language, text]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Internal helpers ───────────────────────────────────────────────────────
  function _stopSpeech() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (resumeInterval.current) {
      clearInterval(resumeInterval.current);
      resumeInterval.current = null;
    }
    setIsSpeaking(false);
    utteranceRef.current = null;
  }

  function _getBestVoice(targetLang) {
    const voices = window.speechSynthesis.getVoices() || [];
    // Exact locale match first
    let voice = voices.find(v => v.lang === targetLang);
    if (!voice) {
      // Prefix match (e.g. "hi" matches "hi-IN", "hi-IN-x-hing" etc.)
      const prefix = targetLang.split('-')[0].toLowerCase();
      voice = voices.find(v => v.lang.toLowerCase().startsWith(prefix));
    }
    return voice || null;
  }

  function _cleanTextForSpeech(raw, lang) {
    // Remove emojis, markdown bullets, section-header symbols
    let clean = raw
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, ' ')   // emoji block
      .replace(/🚨|⚠️|🆘/g, ' ')
      .replace(/[•\-\*#_`]/g, ' ')                 // markdown
      .replace(/\r?\n/g, '. ')                      // newlines → spoken pauses
      .replace(/\s{2,}/g, ' ')
      .trim();

    // For Hindi, prepend a language cue so TTS engine is sure of the locale
    if (lang === 'hi') {
      clean = clean;   // already Devanagari; locale set on utterance is enough
    }
    return clean;
  }

  // ── Toggle handler ─────────────────────────────────────────────────────────
  const handleToggleSpeech = () => {
    if (!supported || !text) return;

    if (isSpeaking) {
      _stopSpeech();
      return;
    }

    // Cancel anything already playing (safety net)
    window.speechSynthesis.cancel();

    const targetLang = language === 'hi' ? 'hi-IN' : 'en-IN';
    const cleanText  = _cleanTextForSpeech(text, language);

    const utterance  = new SpeechSynthesisUtterance(cleanText);
    utterance.lang   = targetLang;
    utterance.rate   = language === 'hi' ? 0.88 : 0.92;  // slightly slower for Hindi
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    // Select best matching voice (delayed voice loading in Chrome)
    const voice = _getBestVoice(targetLang);
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      _stopSpeech();
    };
    utterance.onerror = (e) => {
      // 'interrupted' is not a real error — it's thrown when cancel() is called
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('TTS error:', e.error);
      }
      _stopSpeech();
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);

    // Workaround for Chrome bug: TTS silently pauses after ~14-15 s
    resumeInterval.current = setInterval(() => {
      if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else if (!window.speechSynthesis.speaking) {
        // Speech finished naturally
        _stopSpeech();
      }
    }, 10000);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!supported) {
    return (
      <div className="audio-speech-bar" style={{ opacity: 0.6 }}>
        <Volume2 size={18} color="#94a3b8" />
        <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
          Audio read-aloud is not supported in this browser.
        </span>
      </div>
    );
  }

  const label = language === 'hi'
    ? 'सुरक्षा निर्देश सुनें'
    : 'Listen to Safety Instructions';

  const playLabel = language === 'hi' ? 'चलाएं (Play)' : 'Play';
  const stopLabel = language === 'hi' ? 'रोकें (Stop)'  : 'Stop';

  return (
    <div className="audio-speech-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Volume2 size={18} color="#38bdf8" />
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
          {label}
        </span>
      </div>
      <button
        type="button"
        className={`btn btn-sm ${isSpeaking ? 'btn-danger' : 'btn-outline'}`}
        onClick={handleToggleSpeech}
        disabled={!text}
        aria-label={isSpeaking ? stopLabel : playLabel}
      >
        {isSpeaking ? (
          <>
            <Square size={14} />
            <span>{stopLabel}</span>
          </>
        ) : (
          <>
            <Play size={14} />
            <span>{playLabel}</span>
          </>
        )}
      </button>
    </div>
  );
}
