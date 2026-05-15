// js/api.js — All API calls go through /api/supabase (serverless, keys stay server-side)

const API_BASE = '/api/supabase';

function adminHeaders() {
  const token = sessionStorage.getItem('lucent_admin_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(action, params = {}, options = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const url = `${API_BASE}?${qs}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

// ── Public API ──
export const api = {
  getProperties: (filters = {}) => apiFetch('get-properties', filters),
  getProperty:   (slug) => apiFetch('get-property', { slug }),
  submitInquiry: (data) => apiFetch('submit-inquiry', {}, { method: 'POST', body: data }),

  admin: {
    getStats:           ()             => apiFetch('get-stats'),
    getInquiries:       (f = {})       => apiFetch('get-inquiries', f),
    updateInquiry:      (id, data)     => apiFetch('update-inquiry',      { id }, { method: 'PATCH',  body: data }),
    createProperty:     (data)         => apiFetch('create-property',     {},     { method: 'POST',   body: data }),
    updateProperty:     (id, data)     => apiFetch('update-property',     { id }, { method: 'PATCH',  body: data }),
    deleteProperty:     (id)           => apiFetch('delete-property',     { id }, { method: 'DELETE' }),
    getCloudinarySign:  ()             => apiFetch('cloudinary-sign'),
    // Timeline
    getTimeline:        (inquiry_id)   => apiFetch('get-timeline',        { inquiry_id }),
    addTimelineEvent:   (data)         => apiFetch('add-timeline-event',  {},     { method: 'POST',   body: data }),
    // Appointments
    getAppointments:    (f = {})       => apiFetch('get-appointments',    f),
    createAppointment:  (data)         => apiFetch('create-appointment',  {},     { method: 'POST',   body: data }),
    updateAppointment:  (id, data)     => apiFetch('update-appointment',  { id }, { method: 'PATCH',  body: data }),
    deleteAppointment:  (id)           => apiFetch('delete-appointment',  { id }, { method: 'DELETE' }),
  },
};

export const auth = {
  isLoggedIn: () => !!sessionStorage.getItem('lucent_admin_token'),
  login:  (pw) => sessionStorage.setItem('lucent_admin_token', pw),
  logout: ()   => { sessionStorage.removeItem('lucent_admin_token'); window.location.href = '/admin/index.html'; },
};

export async function uploadToCloudinary(file, onProgress) {
  const sign = await api.admin.getCloudinarySign();
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', sign.upload_preset);
  fd.append('timestamp', sign.timestamp);
  fd.append('signature', sign.signature);
  fd.append('api_key', sign.api_key);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${sign.cloud_name}/image/upload`);
    if (onProgress) xhr.upload.onprogress = e => onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const r = JSON.parse(xhr.responseText);
      r.secure_url ? resolve(r.secure_url) : reject(new Error(r.error?.message || 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(fd);
  });
}
