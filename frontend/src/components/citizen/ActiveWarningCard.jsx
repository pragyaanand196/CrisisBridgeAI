import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../common/Badge';
import { AudioReadAloud } from './AudioReadAloud';
import { AssistanceModal } from './AssistanceModal';
import {
  ShieldAlert, CheckCircle2, ShieldCheck, HelpCircle, AlertOctagon,
  MapPin, Globe, ChevronDown, ChevronUp, Clock, RefreshCw
} from 'lucide-react';
import { api } from '../../services/api';

/**
 * ActiveWarningCard
 *
 * Displays a single active disaster warning to a citizen.
 * Key improvements:
 *  - Fetches the COMPLETE translated warning from the backend
 *    via /citizen/instructions/{id}?language={lang} to ensure
 *    the displayed and spoken text is ALWAYS the full backend-approved
 *    translation — not just the summary fields on the warning object.
 *  - Falls back to warning.ai_simplified_hi / ai_simplified_en if the
 *    fetch fails (graceful degradation).
 *  - AudioReadAloud receives the complete translated text.
 *  - Separate actions for 'I Understand the Warning' and 'I Am Safe Right Now'.
 */
export function ActiveWarningCard({
  warning,
  onRespond,
  onSubmitAssistance,
  onLanguageChange,
  defaultLanguage = 'en',
  userResponseState = null,
  loading = false
}) {
  const [language, setLanguage]             = useState(defaultLanguage || 'en');
  const [showSimplifiedHelp, setShowSimplifiedHelp] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen]       = useState(false);

  // Full translated instruction data fetched from backend
  const [instructionData, setInstructionData]   = useState(null);
  const [instructionLoading, setInstructionLoading] = useState(false);
  const [instructionError, setInstructionError]    = useState(null);

  // Sync language from parent prop (e.g. user's stored preference)
  useEffect(() => {
    if (defaultLanguage) setLanguage(defaultLanguage);
  }, [defaultLanguage]);

  // ── Fetch full translated instruction from backend ─────────────────────────
  const fetchInstruction = useCallback(async (lang) => {
    if (!warning?.id) return;
    setInstructionLoading(true);
    setInstructionError(null);
    try {
      const data = await api.getSimplifiedInstruction(warning.id, lang);
      setInstructionData(data);
    } catch (err) {
      console.warn('Could not fetch instruction from backend, using fallback:', err);
      setInstructionError(err?.message || 'Could not load translated content.');
      setInstructionData(null);
    } finally {
      setInstructionLoading(false);
    }
  }, [warning?.id]);

  useEffect(() => {
    fetchInstruction(language);
  }, [language, fetchInstruction]);

  if (!warning) return null;

  // ── Compute displayed text ─────────────────────────────────────────────────
  // Priority: backend instruction API → warning object fields → raw instructions
  const textToShow = instructionData?.simplified_text
    || (language === 'hi' && warning.ai_simplified_hi
        ? warning.ai_simplified_hi
        : (warning.ai_simplified_en || warning.recommended_instructions));

  // Read-aloud text: use backend's read_aloud_text if available (already clean)
  const readAloudText = instructionData?.read_aloud_text || textToShow;

  // Display title
  const displayTitle = language === 'hi'
    ? `${warning.area_name} में ${warning.disaster_type === 'Flood' ? 'बाढ़' : warning.disaster_type} चेतावनी (${warning.severity} स्तर)`
    : warning.title;

  const displayDisasterType = language === 'hi'
    ? (warning.disaster_type === 'Flood' ? 'बाढ़ (Flood)' : `${warning.disaster_type}`)
    : warning.disaster_type;

  const severityClass = (warning.severity || 'Moderate').toLowerCase();

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLanguageSwitch = (newLang) => {
    setLanguage(newLang);
    if (onLanguageChange) onLanguageChange(newLang);
  };

  const handleUnderstand = () => {
    onRespond({ warning_id: warning.id, response_type: 'understand', language_used: language });
  };
  const handleSafe = () => {
    onRespond({ warning_id: warning.id, response_type: 'safe', language_used: language });
  };
  const handleDontUnderstand = () => {
    setShowSimplifiedHelp(true);
    onRespond({ warning_id: warning.id, response_type: 'dont_understand', language_used: language });
  };
  const handleNotInArea = () => {
    onRespond({ warning_id: warning.id, response_type: 'not_in_area', language_used: language });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`citizen-alert-hero ${severityClass}`}>
      {/* Area Targeting Context Banner */}
      <div style={{
        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
        padding: '0.65rem 1.15rem', marginBottom: '1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={18} color="#dc2626" />
          <strong style={{ fontSize: '0.92rem', color: '#991b1b' }}>
            {language === 'hi'
              ? `आपके क्षेत्र के लिए चेतावनी: ${warning.area_name}`
              : `Warning for your area: ${warning.area_name}`}
          </strong>
        </div>
        <span className="badge badge-extreme" style={{ fontSize: '0.72rem' }}>
          {language === 'hi' ? 'सक्रिय चेतावनी क्षेत्र' : 'Active Warning Zone'}
        </span>
      </div>

      {/* Header Banner */}
      <div className="citizen-alert-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '12px',
            background: severityClass === 'extreme' ? 'rgba(220, 38, 38, 0.12)' : 'rgba(217, 119, 6, 0.12)',
            border: `1.5px solid ${severityClass === 'extreme' ? '#dc2626' : '#d97706'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)'
          }}>
            <ShieldAlert size={26} color={severityClass === 'extreme' ? '#dc2626' : '#d97706'} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 2 }}>
              <Badge status={warning.severity} />
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b5a52' }}>
                {displayDisasterType} {language === 'hi' ? 'चेतावनी' : 'Warning'} • Ver. {warning.version}.0
              </span>
            </div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22120c', margin: 0 }}>
              {displayTitle}
            </h2>
          </div>
        </div>

        {/* Language Switcher */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          background: '#ede5da', padding: '4px', borderRadius: '10px', border: '1px solid #dcd3c8'
        }}>
          <Globe size={15} color="#6b5a52" style={{ marginLeft: 4 }} />
          <button
            type="button"
            className={`btn btn-sm ${language === 'en' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '2px 10px', fontSize: '0.78rem' }}
            onClick={() => handleLanguageSwitch('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`btn btn-sm ${language === 'hi' ? 'btn-primary' : 'btn-outline'}`}
            style={{ padding: '2px 10px', fontSize: '0.78rem' }}
            onClick={() => handleLanguageSwitch('hi')}
          >
            हिंदी (Hindi)
          </button>
        </div>
      </div>

      {/* Target Area and Issuing Authority */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.86rem', color: '#6b5a52', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <MapPin size={15} color="#8b3a2b" />
          <span>
            <strong style={{ color: '#22120c' }}>{language === 'hi' ? 'प्रभावित क्षेत्र:' : 'Area:'}</strong>{' '}
            {warning.area_name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Clock size={15} color="#8b3a2b" />
          <span>
            <strong style={{ color: '#22120c' }}>{language === 'hi' ? 'जारीकर्ता प्राधिकरण:' : 'Authority:'}</strong>{' '}
            {warning.issuing_authority_name}
          </span>
        </div>
      </div>

      {/* Audio Read-Aloud Bar — always uses full translated text */}
      <AudioReadAloud text={readAloudText} language={language} />

      {/* Full Translated Warning Content */}
      <div style={{
        background: '#ffffff', border: '1px solid #ede5da', borderRadius: '12px',
        padding: '1.35rem', marginBottom: '1.5rem', boxShadow: '0 2px 10px rgba(44, 26, 20, 0.05)'
      }}>
        <h4 style={{
          fontSize: '1.02rem', color: '#8b3a2b', marginBottom: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700
        }}>
          <span>{language === 'hi' ? 'सुरक्षा निर्देश:' : 'Safety Instructions:'}</span>
          {instructionLoading && (
            <RefreshCw size={14} color="#8b3a2b" style={{ animation: 'spin 1s linear infinite' }} />
          )}
        </h4>

        {instructionError && !instructionData && (
          <div style={{ fontSize: '0.82rem', color: '#92400e', marginBottom: '0.75rem', padding: '0.65rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
            ⚠️ {language === 'hi'
              ? 'अनुवाद लोड करने में समस्या हुई — मूल सामग्री दिखाई जा रही है।'
              : 'Could not load translated content — showing original.'}
          </div>
        )}

        <div style={{
          fontSize: '0.94rem', color: '#22120c', lineHeight: 1.75,
          whiteSpace: 'pre-wrap', fontFamily: language === 'hi' ? '"Noto Sans Devanagari", sans-serif' : 'inherit'
        }}>
          {textToShow}
        </div>
      </div>

      {/* User Response State Feedback Banner */}
      {userResponseState && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.18)', border: '1px solid #34d399', padding: '0.85rem 1.25rem',
          borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 0 16px rgba(16, 185, 129, 0.25)'
        }}>
          <CheckCircle2 size={20} color="#059669" />
          <span style={{ fontSize: '0.9rem', color: '#14532d', fontWeight: 700 }}>
            {language === 'hi'
              ? `आपकी प्रतिक्रिया (${userResponseState}) दर्ज कर ली गई है।`
              : `Your response (${userResponseState}) has been recorded.`}
          </span>
        </div>
      )}

      {/* Core Citizen Action Buttons */}
      <div>
        <h4 style={{
          fontSize: '0.95rem', fontWeight: 700, color: '#22120c', marginBottom: '0.75rem',
          textTransform: 'uppercase', letterSpacing: '0.04em'
        }}>
          {language === 'hi'
            ? 'अपनी स्थिति चुनें:'
            : 'Confirm Your Status:'}
        </h4>

        <div className="citizen-response-grid">
          {/* 1. I Understand the Warning */}
          <button
            type="button"
            className="citizen-action-btn btn-understand"
            onClick={handleUnderstand}
            disabled={loading}
          >
            <CheckCircle2 size={24} />
            <span>{language === 'hi' ? 'चेतावनी समझ ली' : 'I Understand the Warning'}</span>
            <small style={{ fontSize: '0.75rem' }}>
              {language === 'hi' ? 'निर्देश पढ़ और समझ लिए हैं' : 'I have read and understood instructions'}
            </small>
          </button>

          {/* 2. I Am Safe Right Now */}
          <button
            type="button"
            className="citizen-action-btn btn-safe"
            onClick={handleSafe}
            disabled={loading}
          >
            <ShieldCheck size={24} />
            <span>{language === 'hi' ? 'मैं अभी सुरक्षित हूँ' : 'I Am Safe Right Now'}</span>
            <small style={{ fontSize: '0.75rem' }}>
              {language === 'hi' ? 'सुरक्षित स्थान पर हूँ, सहायता की आवश्यकता नहीं' : 'Safe location, no emergency assistance needed'}
            </small>
          </button>

          {/* 3. I Don't Understand */}
          <button
            type="button"
            className="citizen-action-btn btn-dont-understand"
            onClick={handleDontUnderstand}
            disabled={loading}
          >
            <HelpCircle size={24} />
            <span>{language === 'hi' ? 'समझ में नहीं आया' : "I Don't Understand"}</span>
            <small style={{ fontSize: '0.75rem' }}>
              {language === 'hi' ? 'सरल निर्देश व सहायता देखें' : 'Show simpler instructions & FAQs'}
            </small>
          </button>

          {/* 4. I Need Help / Rescue */}
          <button
            type="button"
            className="citizen-action-btn btn-help"
            onClick={() => setIsHelpModalOpen(true)}
            disabled={loading}
          >
            <AlertOctagon size={24} />
            <span>{language === 'hi' ? 'मुझे सहायता चाहिए' : 'I Need Help / Rescue'}</span>
            <small style={{ fontSize: '0.75rem' }}>
              {language === 'hi' ? 'निकासी, चिकित्सा या आश्रय सहायता अनुरोध' : 'Request evacuation, medical, or shelter support'}
            </small>
          </button>

          {/* 5. I Am Not in This Area */}
          <button
            type="button"
            className="citizen-action-btn btn-not-in-area"
            onClick={handleNotInArea}
            disabled={loading}
          >
            <MapPin size={24} />
            <span>{language === 'hi' ? 'मैं इस क्षेत्र में नहीं हूँ' : 'I Am Not in This Area'}</span>
            <small style={{ fontSize: '0.75rem' }}>
              {language === 'hi' ? 'मैं वर्तमान में प्रभावित क्षेत्र से बाहर हूँ' : 'I am currently outside this warning area'}
            </small>
          </button>
        </div>
      </div>

      {/* Simplified Help Drawer */}
      {showSimplifiedHelp && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a',
          borderRadius: '10px', padding: '1.25rem', marginTop: '1rem'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem'
          }}>
            <strong style={{ color: '#92400e', fontSize: '0.95rem' }}>
              {language === 'hi' ? 'सरल निर्देश व अक्सर पूछे जाने वाले प्रश्न:' : 'Simpler Instructions & FAQs'}
            </strong>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => setShowSimplifiedHelp(false)}
            >
              {language === 'hi' ? 'बंद करें' : 'Close'}
            </button>
          </div>
          {language === 'hi' ? (
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.88rem', color: '#78350f', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>कहाँ जाएं:</strong> निचले इलाकों और नदी किनारों से दूर पक्के भवनों या आपातकालीन राहत शिविरों में जाएं।</li>
              <li><strong>पीने का पानी:</strong> पीने से पहले पानी उबालें या स्वच्छ स्रोत का उपयोग करें।</li>
              <li><strong>बिजली:</strong> यदि जलभराव हो तो मुख्य बिजली स्विच बंद करें। गिरे हुए तारों को न छूएं।</li>
              <li><strong>सहायता चाहिए?</strong> आपातकालीन सहायता के लिए 'मुझे सहायता चाहिए' बटन दबाएं।</li>
            </ul>
          ) : (
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.88rem', color: '#78350f', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li><strong>Where to go:</strong> Move away from low-lying areas or riverbanks to higher ground or emergency shelters.</li>
              <li><strong>Drinking Water:</strong> Boil water before drinking. Floodwaters carry hazardous contaminants.</li>
              <li><strong>Electricity:</strong> Turn off the main power switch if water enters. Do not touch fallen power lines.</li>
              <li><strong>Need Help?</strong> Click the "I Need Help" button above to request emergency assistance.</li>
            </ul>
          )}
        </div>
      )}

      {/* Assistance Request Modal */}
      <AssistanceModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        warningId={warning.id}
        onSubmitHelp={(data) => {
          onSubmitAssistance(data);
          setIsHelpModalOpen(false);
        }}
        loading={loading}
      />
    </div>
  );
}
