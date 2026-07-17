// Vercel Edge Middleware — runs on Vercel's servers before any page is sent
// to the visitor's browser. The password check happens here, server-side,
// so it can't be bypassed by viewing page source or the JS bundle (unlike
// a password check written in the React app itself).
//
// Set SITE_PASSWORD as an environment variable in your Vercel project
// (Settings > Environment Variables) — NOT prefixed with VITE_, so it
// never gets bundled into client-side code.

export default function middleware(request) {
  const password = process.env.SITE_PASSWORD;

  // If no password is set, don't lock anyone out — just let requests through.
  if (!password) return;

  const auth = request.headers.get("authorization");

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const separatorIndex = decoded.indexOf(":");
      const suppliedPassword = decoded.slice(separatorIndex + 1);
      if (suppliedPassword === password) {
        return; // correct password — let the request through
      }
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Book of Guinless Records"',
    },
  });
}

export const config = {
  matcher: "/((?!favicon.ico).*)",
};
