import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { HelpCircle, HeartPulse, Home, Droplets, Users, Send } from 'lucide-react';

export function AssistanceModal({ isOpen, onClose, warningId, zoneId, onSubmitHelp, loading = false }) {
  const [category, setCategory] = useState('evacuation');
  const [urgencyLevel, setUrgencyLevel] = useState('High');
  const [headcount, setHeadcount] = useState(1);
  const [locationDesc, setLocationDesc] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [specialNotes, setSpecialNotes] = useState('');

  const assistanceCategories = [
    { id: 'evacuation', label: 'Evacuation & Rescue', icon: <Users size={16} />, desc: 'Trapped or need safe extraction to elevated shelter' },
    { id: 'medical', label: 'Medical Emergency', icon: <HeartPulse size={16} />, desc: 'Urgent injury, illness, prescription or ambulance needed' },
    { id: 'shelter', label: 'Shelter Placement', icon: <Home size={16} />, desc: 'Need temporary accommodation or relief camp space' },
    { id: 'food_water', label: 'Food & Clean Water', icon: <Droplets size={16} />, desc: 'Critical shortage of safe drinking water or ration' },
    { id: 'special_needs', label: 'Elderly / Special Needs', icon: <HelpCircle size={16} />, desc: 'Mobility support, infant care, or specialized equipment' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!locationDesc.trim()) {
      alert('Please provide your approximate location or landmark.');
      return;
    }

    onSubmitHelp({
      warning_id: warningId,
      response_zone_id: zoneId,
      category,
      urgency_level: urgencyLevel,
      headcount: parseInt(headcount, 10) || 1,
      location_description: locationDesc,
      contact_phone: contactPhone || null,
      special_notes: specialNotes || null
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Emergency Assistance"
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
          Tell emergency teams what help you need.
        </p>

        {/* Category Selector */}
        <div className="form-group">
          <label className="form-label">Type of Assistance Needed *</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {assistanceCategories.map((cat) => (
              <label
                key={cat.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: category === cat.id ? '2px solid #f43f5e' : '1px solid rgba(168, 85, 247, 0.3)',
                  background: category === cat.id ? 'rgba(244, 63, 94, 0.18)' : 'rgba(20, 11, 42, 0.75)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <input
                  type="radio"
                  name="assistance_category"
                  value={cat.id}
                  checked={category === cat.id}
                  onChange={() => setCategory(cat.id)}
                  style={{ accentColor: '#f43f5e' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {cat.icon}
                    {cat.label}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>{cat.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Headcount & Urgency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Number of People</label>
            <input
              type="number"
              min="1"
              max="100"
              className="form-input"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Urgency Level</label>
            <select
              className="form-select"
              value={urgencyLevel}
              onChange={(e) => setUrgencyLevel(e.target.value)}
            >
              <option value="Critical">Critical (Immediate)</option>
              <option value="High">High (Urgent)</option>
              <option value="Medium">Medium (Non-life-threatening)</option>
            </select>
          </div>
        </div>

        {/* Location Landmark */}
        <div className="form-group">
          <label className="form-label">Your Current Location or Landmark *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. 2nd Floor, Apt 4B, Near Market Bridge"
            value={locationDesc}
            onChange={(e) => setLocationDesc(e.target.value)}
            required
          />
        </div>

        {/* Phone Number */}
        <div className="form-group">
          <label className="form-label">Contact Phone Number (Optional)</label>
          <input
            type="tel"
            className="form-input"
            placeholder="e.g. +91 98765 43210"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
          />
        </div>

        {/* Special Notes */}
        <div className="form-group">
          <label className="form-label">Additional Details (Optional)</label>
          <textarea
            className="form-textarea"
            rows={2}
            placeholder="Any specific medical condition, disability, or infant requirements..."
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={loading}>
            <Send size={15} />
            <span>{loading ? 'Submitting...' : 'Send Help Request'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
