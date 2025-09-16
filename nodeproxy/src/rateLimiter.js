/**
 * Token-bucket rate limiter per client id.
 * client has 'tokens' up to maxTokens; they refill at refillPerSec.
 */
export class RateLimiter {
    constructor({ maxTokens = 60, refillPerSec = 1 } = {}) {
      this.max = maxTokens;
      this.refill = refillPerSec;
      this.buckets = new Map(); // id -> { tokens, last }
      this.stats = {
        limited: 0
      };
    }
  
    _refill(bucket, now) {
      const elapsed = (now - bucket.last) / 1000;
      const add = elapsed * this.refill;
      bucket.tokens = Math.min(this.max, bucket.tokens + add);
      bucket.last = now;
    }
  
    tryRemoveToken(id, n = 1) {
      const now = Date.now();
      let bucket = this.buckets.get(id);
      if (!bucket) {
        bucket = { tokens: this.max, last: now };
        this.buckets.set(id, bucket);
      }
      this._refill(bucket, now);
      if (bucket.tokens >= n) {
        bucket.tokens -= n;
        return { ok: true, remaining: Math.floor(bucket.tokens) };
      }
      this.stats.limited++;
      return { ok: false, remaining: Math.floor(bucket.tokens) };
    }
  
    snapshot() {
      return {
        buckets: this.buckets.size,
        limited: this.stats.limited,
        config: { maxTokens: this.max, refillPerSec: this.refill }
      };
    }
  }
  