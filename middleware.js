import { NextResponse } from 'next/server';
import { isDashboardOperatorUser } from './src/lib/adminSuperUser';
import { updateSession } from './src/lib/supabase/middleware';

const PROTECTED_PREFIX = '/admin/dashboard';
const LOGIN_PATH = '/admin/login';

function copyCookies(fromResponse, toResponse) {
  fromResponse.cookies.getAll().forEach((cookie) => {
    toResponse.cookies.set(cookie.name, cookie.value);
  });
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const { supabase, response } = await updateSession(request);
  const { data: { user } } = await supabase.auth.getUser();
  const isOperator = isDashboardOperatorUser(user);

  const isProtected = pathname === PROTECTED_PREFIX || pathname.startsWith(`${PROTECTED_PREFIX}/`);
  const isLogin = pathname === LOGIN_PATH;
  const isAdminApi = pathname.startsWith('/api/admin/');

  if (user && !isOperator && (isProtected || isAdminApi || isLogin)) {
    await supabase.auth.signOut();
    if (isAdminApi) {
      const denied = NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      copyCookies(response, denied);
      return denied;
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set('error', 'no-access');
    loginUrl.searchParams.delete('next');
    const redirect = NextResponse.redirect(loginUrl);
    copyCookies(response, redirect);
    return redirect;
  }

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
    '/admin/dashboard',
    '/admin/dashboard/:path*',
    '/admin/login',
    '/api/admin/:path*',
  ],
};
