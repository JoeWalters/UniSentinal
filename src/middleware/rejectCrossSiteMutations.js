'use strict';

// Reject state-changing requests that a browser did not send from this app.
//
// The API was reachable from any page the operator happened to visit: a CORS
// "simple" POST (no JSON content type, so no preflight) to
// http://<lan-ip>:3000/api/parental/devices/<mac>/unblock executes its side
// effect whether or not the attacking page can read the response. DNS rebinding
// gets there without knowing the address in advance.
//
// The UI is same-origin, so a mutating request is legitimate when either:
//   * the browser says it is same-origin   (`Sec-Fetch-Site: same-origin`), or
//   * it sends no `Origin` at all           (curl, scripts, the operator's cron)
// and is rejected when the browser reports `cross-site`, or when the `Origin`
// header names a different host than the one being addressed.
//
// GET/HEAD/OPTIONS are left alone: they cannot change state here, and blocking
// them would break the CSP report and any read-only tooling.

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hostOf(value) {
    if (!value) return null;
    try {
        return new URL(value).host.toLowerCase();
    } catch {
        // `Origin: null` (sandboxed iframe, file://) and anything unparseable.
        return null;
    }
}

function isCrossSite(req) {
    const fetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
    if (fetchSite === 'cross-site') return true;

    const origin = req.get('origin');
    if (!origin) return false; // not a browser-initiated cross-origin request

    const originHost = hostOf(origin);
    if (originHost === null) return true; // `Origin: null` is never this app

    // Compare against the host the client actually addressed (works behind a
    // proxy that rewrites Host but keeps it consistent with the UI's origin).
    const requestHost = String(req.get('host') || '').toLowerCase();
    return originHost !== requestHost;
}

function rejectCrossSiteMutations() {
    return function (req, res, next) {
        if (!MUTATING_METHODS.has(req.method)) return next();

        if (isCrossSite(req)) {
            req.log?.warn?.(`Rejected cross-site ${req.method} ${req.originalUrl}`);
            return res.status(403).json({
                error: 'Cross-site requests cannot change state',
                hint: 'Use the web UI, or send no Origin header (curl, scripts).'
            });
        }

        return next();
    };
}

module.exports = { rejectCrossSiteMutations, isCrossSite, MUTATING_METHODS };
