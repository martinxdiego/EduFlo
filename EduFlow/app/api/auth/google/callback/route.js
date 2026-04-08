import { NextResponse } from 'next/server'

export async function GET(request) {
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')

  // Use Host header to build the correct origin (avoids 0.0.0.0 issue)
  const host = request.headers.get('host') || 'localhost:3000'
  const protocol = request.headers.get('x-forwarded-proto') || 'http'
  const origin = `${protocol}://${host}`

  if (error) {
    return NextResponse.redirect(`${origin}/?google_error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?google_error=no_code`)
  }

  // Redirect back to app with the authorization code
  return NextResponse.redirect(`${origin}/?google_code=${encodeURIComponent(code)}`)
}
