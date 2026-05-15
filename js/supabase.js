// api/supabase.js — Vercel serverless function
// All Supabase + Cloudinary secrets live here, never exposed to client

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLOUDINARY_CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    switch (action) {
      case 'get-properties': return await getProperties(req, res);
      case 'get-property': return await getProperty(req, res);
      case 'create-property': return await createProperty(req, res);
      case 'update-property': return await updateProperty(req, res);
      case 'delete-property': return await deleteProperty(req, res);
      case 'submit-inquiry': return await submitInquiry(req, res);
      case 'get-inquiries': return await getInquiries(req, res);
      case 'update-inquiry': return await updateInquiry(req, res);
      case 'get-stats': return await getStats(req, res);
      case 'cloudinary-sign': return await cloudinarySign(req, res);
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

// ── helpers ──
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

// ── Properties ──
async function getProperties(req, res) {
  const { type, intent, min, max, sort, limit = 50, offset = 0 } = req.query;
  let qs = `select=*&limit=${limit}&offset=${offset}`;
  if (type && type !== 'all') qs += `&type=eq.${type}`;
  if (intent && intent !== 'all') qs += `&intent=eq.${intent}`;
  if (min) qs += `&price=gte.${min}`;
  if (max) qs += `&price=lte.${max}`;
  if (sort === 'price-asc') qs += `&order=price.asc`;
  else if (sort === 'price-desc') qs += `&order=price.desc`;
  else if (sort === 'area') qs += `&order=area.desc`;
  else qs += `&order=created_at.desc`;
  const data = await supabaseFetch(`properties?${qs}`);
  return res.json(data || []);
}

async function getProperty(req, res) {
  const { slug } = req.query;
  if (!slug) return res.status(400).json({ error: 'slug required' });
  const data = await supabaseFetch(`properties?slug=eq.${slug}&select=*`);
  if (!data || !data.length) return res.status(404).json({ error: 'Not found' });
  return res.json(data[0]);
}

async function createProperty(req, res) {
  requireAdmin(req);
  const body = req.body;
  if (!body.slug) body.slug = slugify(body.address + '-' + body.type);
  const data = await supabaseFetch('properties', { method: 'POST', body: JSON.stringify(body) });
  return res.json(data);
}

async function updateProperty(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  const data = await supabaseFetch(`properties?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(req.body) });
  return res.json(data);
}

async function deleteProperty(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  await supabaseFetch(`properties?id=eq.${id}`, { method: 'DELETE' });
  return res.json({ ok: true });
}

// ── Inquiries ──
async function submitInquiry(req, res) {
  const data = await supabaseFetch('inquiries', { method: 'POST', body: JSON.stringify(req.body) });
  return res.json(data);
}

async function getInquiries(req, res) {
  requireAdmin(req);
  const { status, limit = 100 } = req.query;
  let qs = `select=*&order=created_at.desc&limit=${limit}`;
  if (status && status !== 'all') qs += `&status=eq.${status}`;
  const data = await supabaseFetch(`inquiries?${qs}`);
  return res.json(data || []);
}

async function updateInquiry(req, res) {
  requireAdmin(req);
  const { id } = req.query;
  const data = await supabaseFetch(`inquiries?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(req.body) });
  return res.json(data);
}

// ── Stats (dashboard) ──
async function getStats(req, res) {
  requireAdmin(req);
  const [props, inquiries] = await Promise.all([
    supabaseFetch('properties?select=id,price,status,views,created_at'),
    supabaseFetch('inquiries?select=id,status,created_at'),
  ]);
  const active = props.filter(p => p.status === 'active');
  const sold = props.filter(p => p.status === 'sold');
  const totalRevenue = sold.reduce((s, p) => s + (p.price || 0), 0);
  return res.json({
    active_listings: active.length,
    total_properties: props.length,
    total_inquiries: inquiries.length,
    new_inquiries: inquiries.filter(i => i.status === 'new').length,
    sold_count: sold.length,
    total_revenue: totalRevenue,
  });
}

// ── Cloudinary signed upload ──
async function cloudinarySign(req, res) {
  requireAdmin(req);
  const crypto = await import('crypto');
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = `timestamp=${timestamp}&upload_preset=${CLOUDINARY_PRESET}${process.env.CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');
  return res.json({
    signature,
    timestamp,
    cloud_name: CLOUDINARY_CLOUD,
    upload_preset: CLOUDINARY_PRESET,
    api_key: process.env.CLOUDINARY_API_KEY,
  });
}

// ── Auth guard (simple admin token check) ──
function requireAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== process.env.ADMIN_SECRET) throw new Error('Unauthorized');
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
