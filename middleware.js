import { NextResponse } from 'next/server';
import { updateSession } from './src/lib/supabase/middleware';

const PROTECTED_PREFIX = '/admin/dashboard';
const LOGIN_PATH = '/admin/login';

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const { supabase, response } = await updateSession(request);
  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`);
  const isLogin = pathname === LOGIN_PATH;
  const isAdminApi = pathname.startsWith('/api/admin/');

  if ((isProtected || isAdminApi) && !user) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLogin && user) {
    const nextPath = request.nextUrl.searchParams.get('next') || PROTECTED_PREFIX;
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/admin/dashboard/:path*',
    '/admin/login',
    '/api/admin/:path*',
  ],
};
