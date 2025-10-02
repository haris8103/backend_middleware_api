// Set of blocked IP addresses
const blockedIPs = new Set([
  '209.38.226.5',  // Initial blocked IP
  '2a03:b0c0:3:f0::73ba:4000'  // Blocked IPv6 address
]);

export function addBlockedIP(ip) {
  blockedIPs.add(ip);
}

export function removeBlockedIP(ip) {
  blockedIPs.delete(ip);
}

export function isIPBlocked(ip) {
  return blockedIPs.has(ip);
}

// Middleware to block IPs
export default async function ipBlocker(ctx, next) {
  const clientIP = ctx.request.ip;
  
  if (isIPBlocked(clientIP)) {
    ctx.status = 403;
    ctx.body = { error: 'Access denied' };
    // Log the blocked attempt
    ctx.app.emit('error', new Error(`Blocked request from IP: ${clientIP}`), ctx);
    return;
  }
  
  await next();
}
