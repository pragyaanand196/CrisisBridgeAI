import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { HelpCircle, HeartPulse, Home, Droplets, Users, Send, AlertTriangle } from 'lucide-react';

export function AssistanceModal({ isOpen, onClose, warningId, zoneId, onSubmitHelp, loading = false }) {
  const [category, setCategory] = useState('evacuation');
  const [urgencyLevel, setUrgencyLevel] = useState('High');
  const [headcount, setHeadcount] = useState(1);
  const [locationDesc, setLocationDesc] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);

  const assistanceCategories = [
    { id: 'evacuation', label: 'Evacuation & Rescue', icon: <Users size={18} />, desc: 'Trapped or need safe extraction to elevated shelter' },
    { id: 'medical', label: 'Medical Emergency', icon: <HeartPulse size={18} />, desc: 'Urgent injury, illness, prescription or ambulance needed' },
    { id: 'shelter', label: 'Shelter Placement', icon: <Home size={18} />, desc: 'Need temporary accommodation or relief camp space' },
    { id: 'food_water', label: 'Food & Clean Water', icon: <Droplets size={18} />, desc: 'Critical shortage of safe drinking water or ration' },
    { id: 'special_needs', label: 'Elderly / Special Needs', icon: <HelpCircle size={18} />, desc: 'Mobility support, infant care, or specialized equipment' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!locationDesc.trim()) {
      setErrorMessage('Please provide your approximate location or landmark so rescue teams can reach you.');
      return;
    }

    setErrorMessage(null);
    onSubmitHelp({
      warning_id: warningId,
      response_zone_id: zoneId || null,
      category,
      urgency_level: urgencyLevel,
      headcount: parseInt(headcount, 10) || 1,
      location_description: locationDesc.trim(),
      contact_phone: contactPhone.trim() || null,
      special_notes: specialNotes.trim() || null
    });
  };

  const handleClose = () => {
    setErrorMessage(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Request Emergency Assistance"
      overlayClassName="citizen-assistance-modal-overlay"
      contentClassName="citizen-assistance-modal-dialog"
      headerClassName="citizen-assistance-modal-header"
      bodyClassName="citizen-assistance-modal-body"
      actionsClassName="citizen-assistance-modal-actions"
      actions={
        <>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleClose}
            disabled={loading}
            id="btn-cancel-assistance"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="emergency-assistance-form"
            className="btn btn-primary"
            disabled={loading}
            id="btn-submit-assistance"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <Send size={15} />
            <span>{loading ? 'Submitting...' : 'Send Help Request'}</span>
          </button>
        </>
      }
    >
      <form
        id="emergency-assistance-form"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        <p className="citizen-assistance-subtitle">
          Tell emergency response teams what help you need. Your request will be directly prioritized by disaster authorities in your response zone.
        </p>

        {errorMessage && (
          <div className="citizen-assistance-error-banner" role="alert">
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Section A — Category Selector */}
        <div className="citizen-assistance-section">
          <div className="citizen-assistance-section-title">
            A. Type of Assistance Needed <span className="req">*</span>
          </div>
          <div className="citizen-assistance-cat-list" role="radiogroup" aria-label="Type of Assistance Needed">
            {assistanceCategories.map((cat) => {
              const isSelected = category === cat.id;
              return (
                <label
                  key={cat.id}
                  className={`citizen-assistance-cat-card${isSelected ? ' is-selected' : ''}`}
                  htmlFor={`assistance-cat-${cat.id}`}
                >
                  <input
                    type="radio"
                    id={`assistance-cat-${cat.id}`}
                    name="assistance_category"
                    value={cat.id}
                    checked={isSelected}
                    onChange={() => setCategory(cat.id)}
                  />
                  <div className="citizen-assistance-cat-content">
                    <span className="citizen-assistance-cat-title">
                      <span className="citizen-assistance-cat-icon">{cat.icon}</span>
                      <span>{cat.label}</span>
                    </span>
                    <span className="citizen-assistance-cat-desc">{cat.desc}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Section B — Headcount & Urgency Level */}
        <div className="citizen-assistance-section">
          <div className="citizen-assistance-section-title">B. Urgency &amp; Group Size</div>
          <div className="citizen-assistance-grid-2">
            <div className="citizen-assistance-group no-mb">
              <label className="citizen-assistance-label" htmlFor="assistance-headcount-input">
                Number of People <span className="hint">(headcount)</span>
              </label>
              <input
                type="number"
                min="1"
                max="100"
                id="assistance-headcount-input"
                className="form-input"
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value)}
                required
              />
            </div>

            <div className="citizen-assistance-group no-mb">
              <label className="citizen-assistance-label" htmlFor="assistance-urgency-select">
                Urgency Level
              </label>
              <select
                id="assistance-urgency-select"
                className="form-select"
                value={urgencyLevel}
                onChange={(e) => setUrgencyLevel(e.target.value)}
              >
                <option value="Critical">Critical (Immediate Danger)</option>
                <option value="High">High (Urgent Response)</option>
                <option value="Medium">Medium (Non-life-threatening)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section C — Location & Contact */}
        <div className="citizen-assistance-section">
          <div className="citizen-assistance-section-title">C. Location &amp; Contact Details</div>

          {/* Location Landmark */}
          <div className="citizen-assistance-group">
            <label className="citizen-assistance-label" htmlFor="assistance-location-input">
              Your Current Location or Landmark <span className="req">*</span>
            </label>
            <input
              type="text"
              id="assistance-location-input"
              className={`form-input${errorMessage && !locationDesc.trim() ? ' input-error' : ''}`}
              placeholder="e.g. 2nd Floor, Apt 4B, Near Market Bridge"
              value={locationDesc}
              onChange={(e) => {
                setLocationDesc(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              required
            />
            <small className="citizen-assistance-field-helper">
              Provide cross streets, building names, or visible landmarks to help responders reach you.
            </small>
          </div>

          {/* Phone Number */}
          <div className="citizen-assistance-group no-mb">
            <label className="citizen-assistance-label" htmlFor="assistance-phone-input">
              Contact Phone Number <span className="hint">(optional)</span>
            </label>
            <input
              type="tel"
              id="assistance-phone-input"
              className="form-input"
              placeholder="e.g. +91 98765 43210"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
        </div>

        {/* Section D — Special Notes */}
        <div className="citizen-assistance-section" style={{ marginBottom: 0 }}>
          <div className="citizen-assistance-section-title">
            D. Additional Specifics <span className="hint">(optional)</span>
          </div>
          <div className="citizen-assistance-group no-mb">
            <label className="citizen-assistance-label" htmlFor="assistance-notes-input">
              Special Medical, Mobility, or Child Needs
            </label>
            <textarea
              id="assistance-notes-input"
              className="form-textarea"
              rows={3}
              placeholder="Any specific medical condition, required prescriptions, mobility limits, infants, elderly, or pregnant individuals..."
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}


