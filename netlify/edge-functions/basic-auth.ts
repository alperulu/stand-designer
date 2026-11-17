// Sitenin tamamını HTTP Basic Auth ile korur (nginx auth_basic muadili).
// Kullanıcılar Netlify ortam değişkeninden okunur, repoda şifre yoktur:
//   AUTH_USERS = "kullanici1:sifre1,kullanici2:sifre2"
// Değişken tanımlı değilse site kapalı kalır (fail-closed).

const REALM = 'Stand Designer';

function parseUsers(raw: string | undefined): Map<string, string> {
  const users = new Map<string, string>();
  for (const entry of (raw ?? '').split(',')) {
    const i = entry.indexOf(':');
    if (i <= 0) continue;
    const user = entry.slice(0, i).trim();
    const pass = entry.slice(i + 1).trim();
    if (user && pass) users.set(user, pass);
  }
  return users;
}

// Uzunluk dışında zamanlama bilgisi sızdırmayan karşılaştırma.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeBasic(header: string | null): [string, string] | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const i = decoded.indexOf(':');
    return i < 0 ? null : [decoded.slice(0, i), decoded.slice(i + 1)];
  } catch {
    return null;
  }
}

function unauthorized(): Response {
  return new Response('Giriş gerekli.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const users = parseUsers(Netlify.env.get('AUTH_USERS'));
  if (users.size === 0) {
    return new Response('Erişim yapılandırılmamış (AUTH_USERS tanımlı değil).', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const creds = decodeBasic(request.headers.get('Authorization'));
  if (!creds) return unauthorized();

  const expected = users.get(creds[0]);
  if (expected === undefined || !safeEqual(creds[1], expected)) return unauthorized();

  return context.next();
};

declare const Netlify: { env: { get(name: string): string | undefined } };

export const config = { path: '/*' };
