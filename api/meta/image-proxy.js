const { crypto } = require('../../lib/meta-common');

function first(value) {
  return Array.isArray(value) ? value[0] : String(value || '');
}

function allowedImageUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = url.protocol === 'https:' && (
      host === 'facebook.com'
      || host.endsWith('.facebook.com')
      || host === 'fbcdn.net'
      || host.endsWith('.fbcdn.net')
      || host === 'cdninstagram.com'
      || host.endsWith('.cdninstagram.com')
      || host === 'fbsbx.com'
      || host.endsWith('.fbsbx.com')
    );
    return allowed ? url : null;
  } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const encoded = first(req.query.src);
  const signature = first(req.query.sig);
  const secret = process.env.META_APP_SECRET || '';
  if (!encoded || encoded.length > 12000 || !signature || !secret) return res.status(400).end('Geçersiz görsel isteği.');

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) return res.status(403).end('Görsel imzası geçersiz.');

  let source;
  try { source = Buffer.from(encoded, 'base64url').toString('utf8'); }
  catch (_) { return res.status(400).end('Görsel adresi okunamadı.'); }
  const sourceUrl = allowedImageUrl(source);
  if (!sourceUrl) return res.status(403).end('Bu görsel kaynağına izin verilmiyor.');

  try {
    const response = await fetch(sourceUrl.toString(), {
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*', 'User-Agent': 'Mozilla/5.0 RDGrupReport/1.0' },
      redirect: 'follow',
    });
    const finalUrl = allowedImageUrl(response.url || sourceUrl.toString());
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!response.ok || !finalUrl || !contentType.startsWith('image/')) return res.status(502).end('Meta görseli alınamadı.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 8 * 1024 * 1024) return res.status(413).end('Görsel çok büyük.');
    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length || body.length > 8 * 1024 * 1024) return res.status(413).end('Görsel boyutu uygun değil.');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
    return res.status(200).end(body);
  } catch (_) {
    return res.status(502).end('Meta görseli indirilemedi.');
  }
};
