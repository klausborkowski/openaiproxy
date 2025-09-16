/**
 * Simple in-memory TTL cache with LRU eviction.
 * Stores: { value: {status, headers, body}, expiresAt, size, k, prev, next }
 */
export class TTLCache {
    constructor({ ttlMs = 60000, maxEntries = 500 } = {}) {
      this.ttlMs = ttlMs;
      this.maxEntries = maxEntries;
      this.map = new Map(); // key -> node
      this.head = null; // MRU
      this.tail = null; // LRU
      this.stats = {
        hits: 0,
        misses: 0,
        stores: 0,
        evictions: 0
      };
    }
  
    _attach(node) {
      node.prev = null;
      node.next = this.head;
      if (this.head) this.head.prev = node;
      this.head = node;
      if (!this.tail) this.tail = node;
    }
  
    _detach(node) {
      if (node.prev) node.prev.next = node.next; else this.head = node.next;
      if (node.next) node.next.prev = node.prev; else this.tail = node.prev;
      node.prev = node.next = null;
    }
  
    _moveToFront(node) {
      if (this.head === node) return;
      this._detach(node);
      this._attach(node);
    }
  
    _evictIfNeeded() {
      while (this.map.size > this.maxEntries && this.tail) {
        const node = this.tail;
        this._detach(node);
        this.map.delete(node.k);
        this.stats.evictions++;
      }
    }
  
    _isExpired(node) {
      return node.expiresAt <= Date.now();
    }
  
    get(k) {
      const node = this.map.get(k);
      if (!node) { this.stats.misses++; return null; }
      if (this._isExpired(node)) {
        this._detach(node);
        this.map.delete(k);
        this.stats.misses++;
        return null;
      }
      this._moveToFront(node);
      this.stats.hits++;
      return node.value;
    }
  
    set(k, value, ttlOverrideMs) {
      const ttl = typeof ttlOverrideMs === 'number' ? ttlOverrideMs : this.ttlMs;
      const existing = this.map.get(k);
      if (existing) {
        existing.value = value;
        existing.expiresAt = Date.now() + ttl;
        this._moveToFront(existing);
      } else {
        const node = { k, value, expiresAt: Date.now() + ttl, prev: null, next: null };
        this.map.set(k, node);
        this._attach(node);
        this._evictIfNeeded();
      }
      this.stats.stores++;
    }
  
    del(k) {
      const node = this.map.get(k);
      if (!node) return false;
      this._detach(node);
      return this.map.delete(k);
    }
  
    clear() {
      this.map.clear();
      this.head = this.tail = null;
    }
  
    snapshot() {
      return {
        size: this.map.size,
        ttlMs: this.ttlMs,
        maxEntries: this.maxEntries,
        ...this.stats
      };
    }
  }
  