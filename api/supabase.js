// api/supabase.js — Vercel serverless function
// All Supabase + Cloudinary secrets live here, never exposed to client

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;

// ── Body parser (Vercel doesn't auto-parse for all content types) ──
async function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    switch (action) {
      case 'get-properties':     return await getProperties(req, res);
      case 'get-property':       return await getProperty(req, res);
      case 'create-property':    return await createProperty(req, res);
      case 'update-property':    return await updateProperty(req, res);
      case 'delete-property':    return await deleteProperty(req, res);
      case 'submit-inquiry':     return await submitInquiry(req, res);
      case 'get-inquiries':      return await getInquiries(req, res);
      case 'update-inquiry':     return await updateInquiry(req, res);
      case 'get-stats':          return await getStats(req, res);
      case 'cloudinary-sign':    return await cloudinarySign(req, res);
      // Lead timeline
      case 'get-timeline':       return await getTimeline(req, res);
      case 'add-timeline-event': return await addTimelineEvent(req, res);
      // Appointments
      case 'get-appointments':   return await getAppointments(req, res);
      case 'create-appointment': return await createAppointment(req, res);
      case 'update-appointment': return await updateAppointment(req, res);
      case 'delete-appointment': return await deleteAppointment(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('[lucent]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Supabase fetch helper ──
async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

// ════════════════════════════════════════
//  PROPERTIES
// ════════════════════════════════════════
async function getProperties(req, res) {
  const { type, intent, min, max, sort, limit = 50, offset = 0, admin } = req.query;
  let qs = `select=*&limit=${limit}&offset=${offset}`;

  // Public users only see active + pending
  if (!admin) qs += `&status=in.(active,pending)`;

  if (type && type !== 'all') qs += `&type=eq.${encodeURIComponent(type)}`;
  if (intent && intent !== 'all') qs += `&intent=eq.${encodeURIComponent(intent)}`;
  if (min) qs += `&price=gte.${min}`;
  if (max) qs += `&price=lte.${max}`;

  if (sort === 'price-asc')  qs += `&order=price.asc`;
  else if (sort === 'price-desc') qs += `&order=price.desc`;
  else if (sort === 'area')  qs += `&order=area.desc.nullslast`;
  else                       qs += `&order=created_at.desc`;

  const data = await supabaseFetch(`properties?${qs}`);
  return res.json(data || []);
}

async function getProperty(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug required' });
  // Increment views
  supabaseFetch(`rpc/increment_views`, {
    method: 'POST',
    body: JSON.stringify({ property_slug: slug }),
  }).catch(() => {});
  const data = await supabaseFetch(`properties?slug=eq.${encodeURIComponent(slug)}&select=*`);
  if (!data?.length) return res.status(404).json({ error: 'Not found' });
  return res.json(data[0]);
}

async function createProperty(req, res) {
  requireAdmin(req);
  const body = await parseBody(req);
  if (!body.slug) body.slug = slugify((body.address || '') + '-' + (body.type || ''));
  const data = await supabaseFetch('properties', { method: 'POST', body: JSON.stringify(body) });
  return res.json(data);
}

async function updateProperty(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  const body = await parseBody(req);
  const data = await supabaseFetch(`properties?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  return res.json(data);
}

async function deleteProperty(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  await supabaseFetch(`properties?id=eq.${id}`, { method: 'DELETE' });
  return res.json({ ok: true });
}

// ════════════════════════════════════════
//  INQUIRIES
// ════════════════════════════════════════
async function submitInquiry(req, res) {
  const body = await parseBody(req);
  if (!body.first_name || !body.email) return res.status(400).json({ error: 'Name and email required' });
  const data = await supabaseFetch('inquiries', { method: 'POST', body: JSON.stringify(body) });
  return res.json(data);
}

async function getInquiries(req, res) {
  requireAdmin(req);
  const { status, limit = 100, property_slug } = req.query;
  let qs = `select=*&order=created_at.desc&limit=${limit}`;
  if (status && status !== 'all') qs += `&status=eq.${status}`;
  if (property_slug) qs += `&property_slug=eq.${encodeURIComponent(property_slug)}`;
  const data = await supabaseFetch(`inquiries?${qs}`);
  return res.json(data || []);
}

async function updateInquiry(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  const body = await parseBody(req);
  const data = await supabaseFetch(`inquiries?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  return res.json(data);
}

// ════════════════════════════════════════
//  STATS
// ════════════════════════════════════════
async function getStats(req, res) {
  requireAdmin(req);
  const [props, inquiries] = await Promise.all([
    supabaseFetch('properties?select=id,price,status,views,created_at'),
    supabaseFetch('inquiries?select=id,status,created_at'),
  ]);
  const safeProps = props || [];
  const safeInqs = inquiries || [];
  const active = safeProps.filter(p => p.status === 'active');
  const sold = safeProps.filter(p => p.status === 'sold');
  const totalRevenue = sold.reduce((s, p) => s + (p.price || 0), 0);
  const totalViews = safeProps.reduce((s, p) => s + (p.views || 0), 0);
  return res.json({
    active_listings: active.length,
    total_properties: safeProps.length,
    total_inquiries: safeInqs.length,
    new_inquiries: safeInqs.filter(i => i.status === 'new').length,
    sold_count: sold.length,
    total_revenue: totalRevenue,
    total_views: totalViews,
  });
}

// ════════════════════════════════════════
//  LEAD TIMELINE
// ════════════════════════════════════════
async function getTimeline(req, res) {
  requireAdmin(req);
  const { inquiry_id } = req.query;
  if (!inquiry_id) return res.status(400).json({ error: 'inquiry_id required' });
  const data = await supabaseFetch(`lead_timeline?inquiry_id=eq.${inquiry_id}&order=created_at.desc&select=*`);
  return res.json(data || []);
}

async function addTimelineEvent(req, res) {
  requireAdmin(req);
  const body = await parseBody(req);
  if (!body.inquiry_id || !body.event_type) return res.status(400).json({ error: 'inquiry_id and event_type required' });
  const data = await supabaseFetch('lead_timeline', { method: 'POST', body: JSON.stringify(body) });
  return res.json(data);
}

// ════════════════════════════════════════
//  APPOINTMENTS
// ════════════════════════════════════════
async function getAppointments(req, res) {
  requireAdmin(req);
  const { from, to, status, inquiry_id } = req.query;
  let qs = `select=*,inquiries(first_name,last_name,email,phone),properties(title,address,city)&order=scheduled_at.asc`;
  if (from) qs += `&scheduled_at=gte.${from}`;
  if (to)   qs += `&scheduled_at=lte.${to}`;
  if (status && status !== 'all') qs += `&status=eq.${status}`;
  if (inquiry_id) qs += `&inquiry_id=eq.${inquiry_id}`;
  const data = await supabaseFetch(`appointments?${qs}`);
  return res.json(data || []);
}

async function createAppointment(req, res) {
  requireAdmin(req);
  const body = await parseBody(req);
  if (!body.scheduled_at) return res.status(400).json({ error: 'scheduled_at required' });
  const data = await supabaseFetch('appointments', { method: 'POST', body: JSON.stringify(body) });
  // Auto-add timeline event
  if (data?.[0]?.inquiry_id) {
    supabaseFetch('lead_timeline', {
      method: 'POST',
      body: JSON.stringify({
        inquiry_id: data[0].inquiry_id,
        event_type: 'viewing_scheduled',
        note: `Viewing scheduled for ${new Date(body.scheduled_at).toLocaleString()}`,
      }),
    }).catch(() => {});
  }
  return res.json(data);
}

async function updateAppointment(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  const body = await parseBody(req);
  const data = await supabaseFetch(`appointments?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  return res.json(data);
}

async function deleteAppointment(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  await supabaseFetch(`appointments?id=eq.${id}`, { method: 'DELETE' });
  return res.json({ ok: true });
}

// ════════════════════════════════════════
//  CLOUDINARY
// ════════════════════════════════════════
async function cloudinarySign(req, res) {
  requireAdmin(req);
  const crypto = await import('crypto');
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = `timestamp=${timestamp}&upload_preset=${CLOUDINARY_PRESET}${process.env.CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  return res.json({
    signature, timestamp,
    cloud_name: CLOUDINARY_CLOUD,
    upload_preset: CLOUDINARY_PRESET,
    api_key: process.env.CLOUDINARY_API_KEY,
  });
}

// ════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════
function requireAdmin(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const secret = (process.env.ADMIN_SECRET || '').trim();
  if (!secret || token !== secret) throw new Error('Unauthorized');
}

function slugify(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
