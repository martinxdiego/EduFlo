import { NextResponse } from 'next/server'

export async function GET(request) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const state = request.nextUrl.searchParams.get('state')

  const configuredOrigin = process.env.NEXT_PUBLIC_BASE_URL
  const origin = configuredOrigin ? new URL(configuredOrigin).origin : request.nextUrl.origin

  if (error) {
    return NextResponse.redirect(`${origin}/?google_error=${encodeURIComponent(error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/?google_error=no_code`)
  }

  // Redirect back to app with the authorization code
  return NextResponse.redirect(`${origin}/?google_code=${encodeURIComponent(code)}&google_state=${encodeURIComponent(state)}`)
}
