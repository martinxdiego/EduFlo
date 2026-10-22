import { publicSiteOrigin } from '@/lib/public-site'

export default function robots() {
  const origin = publicSiteOrigin()
  const published = process.env.EDUFLOW_PUBLIC_LAUNCH === 'true' && origin
  if (!published) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/schueler', '/passwort-zuruecksetzen'] },
    sitemap: `${origin}/sitemap.xml`,
  }
}
