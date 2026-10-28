import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useWebSocket } from '../context/WebSocketContext';
import { BackButton } from '../components/common/BackButton';
import { Modal } from '../components/common/Modal';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { MapPin, PlusCircle, Phone, Home, Trash2, Edit, RefreshCw, AlertTriangle, Navigation } from 'lucide-react';

export function ResourcesPage() {
  const { isAuthority } = useAuth();
  const { addToast } = useNotification();
  const { subscribe } = useWebSocket();
  const [resources, setResources] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState(null);

  // Dynamic response zone retrieval state
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesError, setZonesError] = useState(null);

  // Edit Capacity Modal State
  const [isCapacityModalOpen, setIsCapacityModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [newOccupancy, setNewOccupancy] = useState('');
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [capacityError, setCapacityError] = useState(null);

  // Add Resource Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    resource_type: 'Shelter',
    address: '',
    latitude: 25.6039,
    longitude: 85.1065,
    contact_phone: '',
    capacity_total: 100,
    capacity_occupied: 0,
    status: 'Open',
    response_zone_id: null
  });

  const loadEligibleZones = useCallback(async () => {
    if (!isAuthority) return;
    setZonesLoading(true);
    setZonesError(null);
    try {
      const zoneList = await api.getEligibleResponseZones();
      setZones(zoneList || []);
    } catch (err) {
      console.error('Failed to load eligible response zones:', err);
      setZonesError(err.message || 'Failed to retrieve eligible response zones from backend.');
    } finally {
      setZonesLoading(false);
    }
  }, [isAuthority]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setResourcesError(null);
    try {
      const promises = [api.getResources()];
      if (isAuthority) {
        promises.push(loadEligibleZones());
      }
      const [resList] = await Promise.all(promises);
      setResources(resList || []);
    } catch (err) {
      console.error('Failed to load resources:', err);
      setResourcesError(err.message || 'Failed to load emergency facilities.');
    } finally {
      setLoading(false);
    }
  }, [isAuthority, loadEligibleZones]);

  useEffect(() => {
    loadData();

    // Live WebSocket synchronization
    const unsubCreated = subscribe('RESOURCE_CREATED', () => loadData());
    const unsubUpdated = subscribe('RESOURCE_UPDATED', () => loadData());
    const unsubDeleted = subscribe('RESOURCE_DELETED', () => loadData());

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
    };
  }, [loadData, subscribe]);

  const handleOpenAddModal = () => {
    // Refresh zones whenever authority opens the Add Facility dialog
    loadEligibleZones();
    setIsAddModalOpen(true);
  };

  const handleCreateResource = async (e) => {
    e.preventDefault();
    if (!form.name || !form.address || !form.contact_phone) {
      addToast('Please complete all mandatory resource fields.', 'warning');
      return;
    }

    setModalLoading(true);
    try {
      await api.createResource({
        ...form,
        latitude: parseFloat(form.latitude) || 25.6039,
        longitude: parseFloat(form.longitude) || 85.1065,
        capacity_total: parseInt(form.capacity_total, 10) || 100,
        capacity_occupied: parseInt(form.capacity_occupied, 10) || 0,
        response_zone_id: form.response_zone_id ? parseInt(form.response_zone_id, 10) : null
      });
      setIsAddModalOpen(false);
      setForm({
        name: '',
        resource_type: 'Shelter',
        address: '',
        latitude: 25.6039,
        longitude: 85.1065,
        contact_phone: '',
        capacity_total: 100,
        capacity_occupied: 0,
        status: 'Open',
        response_zone_id: null
      });
      addToast(`Verified resource '${form.name}' added successfully.`, 'success');
      loadData();
    } catch (err) {
      addToast(err.message || 'Failed to add resource.', 'danger');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteResource = async (id) => {
    if (!window.confirm('Are you sure you want to remove this verified resource?')) return;
    try {
      await api.deleteResource(id);
      addToast('Resource removed.', 'info');
      loadData();
    } catch (err) {
      addToast(err.message || 'Delete failed.', 'danger');
    }
  };

  const handleOpenCapacityModal = (res) => {
    setEditingResource(res);
    setNewOccupancy(String(res.capacity_occupied ?? 0));
    setCapacityError(null);
    setIsCapacityModalOpen(true);
  };

  const handleCloseCapacityModal = () => {
    setIsCapacityModalOpen(false);
    setEditingResource(null);
    setCapacityError(null);
    setSavingCapacity(false);
  };

  const handleSaveCapacity = async (e) => {
    e.preventDefault();
    if (!editingResource) return;

    const rawVal = String(newOccupancy).trim();
    if (rawVal === '') {
      setCapacityError('Occupancy count is required.');
      return;
    }

    if (!/^\d+$/.test(rawVal)) {
      setCapacityError('Occupancy count must be a non-negative whole number (no decimals or symbols).');
      return;
    }

    const parsed = Number(rawVal);
    if (!Number.isInteger(parsed)) {
      setCapacityError('Occupancy count must be a valid whole number.');
      return;
    }

    if (parsed < 0) {
      setCapacityError('Occupancy count cannot be negative.');
      return;
    }

    if (parsed > editingResource.capacity_total) {
      setCapacityError(`Occupancy count cannot exceed total capacity of ${editingResource.capacity_total}.`);
      return;
    }

    // Unchanged check: avoid unnecessary duplicate updates
    if (parsed === editingResource.capacity_occupied) {
      addToast('Occupancy count unchanged. No update necessary.', 'info');
      handleCloseCapacityModal();
      return;
    }

    setSavingCapacity(true);
    setCapacityError(null);
    try {
      const updated = await api.updateResourceCapacity(editingResource.id, parsed);
      addToast(
        `Capacity for '${updated.name}' updated to ${updated.capacity_occupied} / ${updated.capacity_total} occupants (${updated.status.toUpperCase()}).`,
        'success'
      );
      handleCloseCapacityModal();
      loadData();
    } catch (err) {
      console.error('Failed to update capacity:', err);
      setCapacityError(err.message || 'Failed to update capacity.');
      addToast(err.message || 'Failed to update capacity.', 'danger');
    } finally {
      setSavingCapacity(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Loading emergency resources..." fullPage />;
  }

  return (
    <div className="resources-page">
      <BackButton fallbackPath="/" label="Back to Home" />

      {/* Header */}
      <div className="page-header-block" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Emergency Resources & Shelters</h1>
          <p className="page-subtitle">
            Emergency shelters, medical relief centers, and supply points mapped to disaster response zones
          </p>
        </div>

        {isAuthority && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAddModal}
            id="btn-add-resource-modal"
          >
            <PlusCircle size={16} />
            <span>Add Resource</span>
          </button>
        )}
      </div>

      {/* Error state */}
      {resourcesError && (
        <div style={{ padding: '1.25rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid var(--status-extreme)', margin: '1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertTriangle size={20} color="var(--status-extreme)" />
            <span style={{ color: 'var(--status-extreme)', fontSize: '0.9rem' }}>
              Failed to load emergency facilities: {resourcesError}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={loadData}
            style={{ borderColor: 'var(--status-extreme)', color: 'var(--status-extreme)' }}
          >
            <RefreshCw size={12} style={{ marginRight: 4 }} />
            Retry
          </button>
        </div>
      )}

      {/* Resources Cards */}
      {!resourcesError && resources.length === 0 ? (
        <EmptyState
          icon={<Home size={36} color="var(--status-stable)" />}
          title={isAuthority ? "No Resources Added" : "No Facilities in Your Zone"}
          description={
            isAuthority
              ? "No emergency facilities have been added yet."
              : "No verified emergency facilities are currently listed for your response zone."
          }
          actionText={isAuthority ? 'Add Resource' : null}
          onAction={isAuthority ? handleOpenAddModal : null}
        />
      ) : !resourcesError && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {resources.map((res) => (
            <div key={res.id} className="card card-hover">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: 4 }}>
                    <span className={`badge ${res.status?.toLowerCase() === 'open' ? 'badge-stable' : 'badge-extreme'}`} style={{ fontSize: '0.7rem' }} id={`badge-resource-status-${res.id}`}>
                      {res.status}
                    </span>
                    {res.response_zone_name ? (
                      <span className="badge" style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                        {res.response_zone_code ? `${res.response_zone_code}: ` : ''}{res.response_zone_name}
                      </span>
                    ) : (
                      <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--bg-card-subtle)', color: 'var(--text-muted)' }}>
                        Unassigned (Internal)
                      </span>
                    )}
                  </div>
                  <h3 className="card-item-title" style={{ margin: '4px 0 0 0' }}>{res.name}</h3>
                </div>
                {isAuthority && (
                  <button
                    type="button"
                    style={{ color: 'var(--text-muted)', padding: 6, background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                    onClick={() => handleDeleteResource(res.id)}
                    title="Delete resource"
                    aria-label={`Delete ${res.name}`}
                  >
                    <Trash2 size={16} color="var(--status-extreme)" />
                  </button>
                )}
              </div>

              <div className="card-item-meta" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: '0.5rem 0 1rem' }}>
                <div><strong className="meta-highlight">Category:</strong> {res.resource_type}</div>
                <div><MapPin size={13} style={{ display: 'inline', marginRight: 4, color: 'var(--color-terracotta)' }} /> {res.address}</div>
                <div id={`resource-capacity-display-${res.id}`}>
                  <strong className="meta-highlight">Current Capacity:</strong> {res.capacity_occupied ?? 0} / {res.capacity_total ?? 0} occupants
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                <a
                  href={`tel:${res.contact_phone}`}
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1, minWidth: '130px' }}
                >
                  <Phone size={14} color="var(--color-terracotta)" />
                  <span>Call ({res.contact_phone})</span>
                </a>
                {isAuthority && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    id={`btn-edit-capacity-${res.id}`}
                    onClick={() => handleOpenCapacityModal(res)}
                    style={{ borderColor: 'var(--color-terracotta)', color: 'var(--color-terracotta)', fontWeight: 600 }}
                    title="Edit occupied capacity"
                    aria-label={`Edit capacity for ${res.name}`}
                  >
                    <Edit size={14} />
                    <span>Edit Capacity</span>
                  </button>
                )}
                {res.latitude != null && res.longitude != null && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${res.latitude},${res.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    title="Open Navigation"
                    style={{ padding: '0 10px' }}
                  >
                    <Navigation size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add Emergency Facility Modal ──────────────────────────────────── */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Emergency Facility"
        size="lg"
        actions={
          <>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsAddModalOpen(false)}
              disabled={modalLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-facility-form"
              className="btn btn-primary"
              disabled={modalLoading}
              id="btn-save-facility-submit"
            >
              {modalLoading ? 'Saving...' : 'Save Facility'}
            </button>
          </>
        }
      >
        <form
          id="add-facility-form"
          onSubmit={handleCreateResource}
          style={{ display: 'flex', flexDirection: 'column', gap: '0' }}
        >
          {/* Section A — Facility Information */}
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
            A — Facility Information
          </p>

          <div className="form-group" style={{ marginBottom: '0.9rem' }}>
            <label className="form-label" htmlFor="resource-name-input">
              Facility Name <span style={{ color: 'var(--color-terracotta)' }}>*</span>
            </label>
            <input
              type="text"
              id="resource-name-input"
              className="form-input"
              placeholder="e.g. Civic Auditorium Relief Shelter"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '0.9rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="resource-type-select">
                Resource Type <span style={{ color: 'var(--color-terracotta)' }}>*</span>
              </label>
              <select
                id="resource-type-select"
                className="form-select"
                value={form.resource_type}
                onChange={(e) => setForm({ ...form, resource_type: e.target.value })}
              >
                <option value="Shelter">Evacuation Shelter</option>
                <option value="Hospital">Hospital / Medical Post</option>
                <option value="Relief Camp">Relief Camp</option>
                <option value="Food/Water Distribution">Food / Water Point</option>
                <option value="First Aid Post">First Aid Post</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="resource-status-select">Availability Status</label>
              <select
                id="resource-status-select"
                className="form-select"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="Open">Open (Active)</option>
                <option value="Full">Full (At Max Capacity)</option>
                <option value="En Route">En Route</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" htmlFor="resource-address-input">
              Street Address / Landmark <span style={{ color: 'var(--color-terracotta)' }}>*</span>
            </label>
            <input
              type="text"
              id="resource-address-input"
              className="form-input"
              placeholder="e.g. 45 East Riverway Blvd, Bailey Road"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>

          {/* Section B — Location Coordinates */}
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
            B — Location Coordinates
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="resource-lat-input">Latitude</label>
              <input
                type="number"
                step="any"
                id="resource-lat-input"
                className="form-input"
                placeholder="e.g. 25.6039"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="resource-lng-input">Longitude</label>
              <input
                type="number"
                step="any"
                id="resource-lng-input"
                className="form-input"
                placeholder="e.g. 85.1065"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              />
            </div>
          </div>

          {/* Section C — Capacity & Contact */}
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
            C — Capacity &amp; Contact
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '0.9rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="resource-capacity-total-input">
                Total Capacity <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(max occupants)</span>
              </label>
              <input
                type="number"
                id="resource-capacity-total-input"
                className="form-input"
                min={1}
                value={form.capacity_total}
                onChange={(e) => setForm({ ...form, capacity_total: e.target.value })}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="resource-capacity-occupied-input">
                Current Occupancy <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(current count)</span>
              </label>
              <input
                type="number"
                id="resource-capacity-occupied-input"
                className="form-input"
                min={0}
                value={form.capacity_occupied}
                onChange={(e) => setForm({ ...form, capacity_occupied: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" htmlFor="resource-phone-input">
              Emergency Helpline Number <span style={{ color: 'var(--color-terracotta)' }}>*</span>
            </label>
            <input
              type="tel"
              id="resource-phone-input"
              className="form-input"
              placeholder="e.g. +91 98765 43210"
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              required
            />
          </div>

          {/* Section D — Response Zone Assignment */}
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
            D — Response Zone Assignment
          </p>

          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <label className="form-label" htmlFor="assign-response-zone-select" style={{ margin: 0 }}>
                Assign to Response Zone <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>(optional)</span>
              </label>
              {zonesLoading && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <RefreshCw size={12} className="spin" /> Loading…
                </span>
              )}
            </div>

            {zonesError ? (
              <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '6px', border: '1px solid var(--status-extreme)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ color: 'var(--status-extreme)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} />
                  <span>Failed to load response zones: {zonesError}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                  onClick={loadEligibleZones}
                  disabled={zonesLoading}
                >
                  Retry
                </button>
              </div>
            ) : (
              <select
                id="assign-response-zone-select"
                className="form-select"
                value={form.response_zone_id || ''}
                onChange={(e) => setForm({ ...form, response_zone_id: e.target.value ? parseInt(e.target.value, 10) : null })}
                disabled={zonesLoading}
              >
                <option value="">— No specific zone (Unassigned / Not visible to citizens) —</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.display_label || `${z.name} (${z.code})`}
                    {z.warning_status ? ` — [${z.warning_status}${z.is_distributed ? ' • Distributed' : ''}]` : ''}
                  </option>
                ))}
              </select>
            )}

            {!zonesLoading && !zonesError && zones.length === 0 && (
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                No active response zones found. Facility will be saved as unassigned.
              </small>
            )}
            {!zonesLoading && !zonesError && zones.length > 0 && (
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'block' }}>
                Assigning a facility to a response zone makes it visible to citizens registered in that zone.
              </small>
            )}
          </div>
        </form>
      </Modal>

      {/* ── Edit Resource Capacity Modal ──────────────────────────────────── */}
      <Modal
        isOpen={isCapacityModalOpen}
        onClose={handleCloseCapacityModal}
        title="Edit Resource Capacity"
        actions={
          <>
            <button
              type="button"
              className="btn btn-outline"
              id="btn-cancel-capacity-edit"
              onClick={handleCloseCapacityModal}
              disabled={savingCapacity}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-capacity-form"
              className="btn btn-primary"
              id="btn-save-capacity-submit"
              disabled={savingCapacity}
            >
              {savingCapacity ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        {editingResource && (
          <form id="edit-capacity-form" onSubmit={handleSaveCapacity} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div style={{
              padding: '0.9rem 1.1rem',
              background: 'var(--bg-surface-subtle)',
              borderRadius: '8px',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem'
            }}>
              <div style={{ fontSize: '0.95rem' }}>
                <strong style={{ color: 'var(--color-espresso-dark)' }}>Resource:</strong>{' '}
                <span style={{ fontWeight: 700, color: 'var(--color-espresso-base)' }} id="modal-resource-name">{editingResource.name}</span>
              </div>
              <div style={{ fontSize: '0.86rem', color: 'var(--color-warm-brown)', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span>Total Capacity: <strong id="modal-total-capacity">{editingResource.capacity_total} occupants</strong></span>
                <span>Currently Occupied: <strong id="modal-current-occupancy">{editingResource.capacity_occupied ?? 0} occupants</strong></span>
                <span>
                  Current Status:{' '}
                  <span className={`badge ${editingResource.status?.toLowerCase() === 'open' ? 'badge-stable' : 'badge-extreme'}`} style={{ fontSize: '0.68rem', padding: '1px 8px' }}>
                    {editingResource.status}
                  </span>
                </span>
              </div>
            </div>

            {capacityError && (
              <div id="capacity-error-alert" style={{
                padding: '0.65rem 0.85rem',
                background: 'rgba(239, 68, 68, 0.08)',
                borderRadius: '6px',
                border: '1px solid var(--status-extreme)',
                fontSize: '0.84rem',
                color: 'var(--status-extreme)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                <span>{capacityError}</span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="input-edit-capacity-occupied">
                Updated Occupancy Count <span className="required-star">*</span>
              </label>
              <input
                type="number"
                id="input-edit-capacity-occupied"
                className="form-input"
                min={0}
                max={editingResource.capacity_total}
                step={1}
                value={newOccupancy}
                onChange={(e) => {
                  setNewOccupancy(e.target.value);
                  if (capacityError) setCapacityError(null);
                }}
                placeholder={`Enter 0 to ${editingResource.capacity_total}`}
                required
                autoFocus
              />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '5px', display: 'block', lineHeight: 1.45 }}>
                Enter a whole number between 0 and {editingResource.capacity_total}.
                {Number.isInteger(Number(newOccupancy)) && Number(newOccupancy) >= 0 && Number(newOccupancy) <= editingResource.capacity_total && (
                  <span style={{ marginLeft: 6 }}>
                    Resulting availability status will automatically be{' '}
                    <strong style={{ color: Number(newOccupancy) === editingResource.capacity_total ? 'var(--status-extreme)' : 'var(--status-stable)' }}>
                      {Number(newOccupancy) === editingResource.capacity_total ? 'CLOSED' : 'OPEN'}
                    </strong>.
                  </span>
                )}
              </small>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
