import { publicSiteOrigin } from '@/lib/public-site'

export default function sitemap() {
  const origin = publicSiteOrigin()
  if (!origin || process.env.EDUFLOW_PUBLIC_LAUNCH !== 'true') return []
  // Legal pages remain drafts/noindex until their individual review is complete.
  return [{ url: origin, changeFrequency: 'monthly', priority: 1 }]
}
