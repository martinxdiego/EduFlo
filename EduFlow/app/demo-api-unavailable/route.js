const denied = () => Response.json({ error: 'Diese öffentliche Demo arbeitet ausschliesslich lokal. Cloud- und KI-Funktionen sind deaktiviert.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
export const GET = denied
export const POST = denied
export const PUT = denied
export const PATCH = denied
export const DELETE = denied
export const OPTIONS = denied
