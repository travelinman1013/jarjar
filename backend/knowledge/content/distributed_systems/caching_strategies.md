# Distributed Caching Strategies

## Cache Patterns

### Cache-Aside (Lazy Loading)

Application checks cache first. On miss, reads from database, writes result to cache, returns to caller. Most common pattern. The application is responsible for cache population and invalidation. Works well with read-heavy workloads. Risk: cache stampede when a popular key expires and many concurrent requests hit the database simultaneously. Mitigation: use a mutex/lock so only one request populates the cache while others wait.

### Write-Through

Application writes to cache and database simultaneously (or cache writes to database). Ensures cache is always consistent with database. Higher write latency (two writes per operation). Useful when reads significantly outnumber writes and stale data is unacceptable.

### Write-Behind (Write-Back)

Application writes to cache only. Cache asynchronously flushes to database in batches. Lowest write latency. Risk: data loss if cache node fails before flushing. Mitigated with replication. Used by CPU caches, some distributed caches with durability requirements.

### Read-Through

Cache itself is responsible for loading data from the database on a miss. Application only interacts with the cache layer. Simplifies application code but couples cache to data source. Common in CDN architectures.

## Eviction Policies

LRU (Least Recently Used): evicts the entry that has not been accessed for the longest time. Most common default. Implemented with a hash map + doubly linked list for O(1) operations. Weakness: a full table scan can evict frequently used entries.

LFU (Least Frequently Used): evicts entries with the lowest access count. Better for workloads with stable hot keys. Weakness: frequency counts grow monotonically, so formerly popular keys linger. Modern variants (Window-TinyLFU, used in Caffeine/Java) combine frequency and recency.

TTL (Time-to-Live): entries expire after a fixed duration regardless of access patterns. Simple to implement and reason about. Often combined with LRU — expired entries are evicted first, then LRU kicks in.

## Cache Invalidation Strategies

Event-driven invalidation: database publishes change events (CDC/Change Data Capture, PostgreSQL LISTEN/NOTIFY, MySQL binlog), cache subscriber invalidates affected keys. Most consistent but requires event infrastructure.

TTL-based expiration: keys expire after a fixed time. Simplest approach. Introduces a staleness window equal to TTL. Good enough for many use cases (user profiles, product catalog).

Explicit invalidation: application code explicitly deletes or updates cache entries when the underlying data changes. Tight coupling between write path and cache. Prone to bugs when invalidation is missed.

## Distributed Cache Architectures

### Client-Side Partitioning (Memcached style)

Clients use consistent hashing to route keys to cache servers. No coordination between servers. Simple, fast, no single point of failure. Downside: adding/removing servers causes cache misses for remapped keys.

### Server-Side Partitioning (Redis Cluster)

Cache cluster manages its own partitioning via hash slots (16384 slots). Clients redirect to the correct shard. Supports automatic rebalancing and failover. More complex operationally.

### Replicated Cache (Hazelcast, Coherence)

Full copy of cache on every node. Reads are local (fastest possible). Writes must propagate to all nodes. Only viable for small datasets. Write amplification limits scalability.

## Cache Metrics

Hit rate: percentage of requests served from cache. Target 90%+ for most use cases. Below 80% suggests working set exceeds cache size or poor key design.

Miss rate: 1 - hit rate. High miss rates mean the cache is not effective — consider increasing size, adjusting TTL, or changing eviction policy.

Eviction rate: keys evicted per second. High eviction rate with low hit rate indicates cache is too small for the working set.

## Common Interview Discussion Points

How would you handle a cache stampede? (Mutex, request coalescing, pre-warming). What happens when a cache node fails? (Consistent hashing remaps keys to next node, temporary miss spike). How do you keep cache consistent with database? (Depends on tolerance for staleness — TTL, event-driven, or write-through). When should you NOT use a cache? (Write-heavy workloads, low read frequency, data that changes every request, when consistency is critical and TTL is unacceptable).
