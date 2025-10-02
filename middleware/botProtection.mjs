import { RateLimiterMemory } from 'rate-limiter-flexible';
import useragent from 'express-useragent';
import logger from '../helpers/logger.mjs';

// Rate limiter configuration
const rateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per 60 seconds
});

// IP-based rate limiter for stricter limits on suspicious IPs
const suspiciousIPLimiter = new RateLimiterMemory({
  points: 20, // Lower number of requests
  duration: 60, // Per 60 seconds
});

// Known bot signatures
const knownBotPatterns = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /headless/i,
  /selenium/i,
  /puppet/i,
  /playwright/i,
  /axios/i,
  /postman/i,
  /insomnia/i,
];

// Suspicious behavior tracking
const suspiciousIPs = new Map();
const MAX_SUSPICIOUS_POINTS = 5;

function isSuspiciousUserAgent(ua) {
  // Check against known bot patterns
  if (knownBotPatterns.some(pattern => pattern.test(ua))) {
    return true;
  }

  // Check for missing or suspicious user agent properties
  const source = useragent.parse(ua);
  if (!source.browser || !source.version || !source.os) {
    return true;
  }

  return false;
}

function isSuspiciousHeaders(headers) {
  // Check for missing or suspicious headers commonly present in real browsers
  if (!headers.accept || !headers['accept-language']) {
    return true;
  }

  // Check for inconsistent header combinations
  if (headers['user-agent']?.includes('Mozilla') && !headers['accept-language']) {
    return true;
  }

  return false;
}

export default async function botProtection(ctx, next) {
  const ip = ctx.request.ip;
  const userAgent = ctx.request.headers['user-agent'] || '';
  
  try {
    await next();

    // Log every request with info level
    logger.log({
      type: 'REQUEST_LOG',
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      method: ctx.method,
      path: ctx.path,
      query: ctx.query,
      headers: ctx.request.headers,
      status: ctx.status,
      responseTime: Date.now() - ctx.state.requestStartTime
    });

    // Track suspicious behavior
    let suspiciousPoints = suspiciousIPs.get(ip) || 0;
    
    // Check for suspicious patterns
    if (isSuspiciousUserAgent(userAgent)) {
      suspiciousPoints += 2;
    }
    if (isSuspiciousHeaders(ctx.request.headers)) {
      suspiciousPoints += 1;
    }
    
    // Update suspicious points
    suspiciousIPs.set(ip, suspiciousPoints);

    // Apply stricter rate limiting for suspicious IPs
    if (suspiciousPoints >= MAX_SUSPICIOUS_POINTS) {
      await suspiciousIPLimiter.consume(ip);
      
      // Log suspicious activity with warning level
      logger.warn({
        type: 'SUSPICIOUS_ACTIVITY',
        timestamp: new Date().toISOString(),
        ip,
        userAgent,
        suspiciousPoints,
        headers: ctx.request.headers,
        url: ctx.request.url
      });
    } else {
      // Normal rate limiting for regular traffic
      await rateLimiter.consume(ip);
    }

    // Clean up old suspicious IP entries (after 1 hour)
    if (Math.random() < 0.1) { // 10% chance to run cleanup
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      suspiciousIPs.forEach((points, key) => {
        if (points.timestamp < oneHourAgo) {
          suspiciousIPs.delete(key);
        }
      });
    }
  } catch (error) {
    // Log rate limit errors with error level
    logger.error({
      type: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      error: error.message,
      headers: ctx.request.headers,
      url: ctx.request.url
    });

    ctx.status = 429;
    ctx.body = {
      error: 'Too Many Requests',
      message: 'Please try again later'
    };
  }
}
