# CAP Theorem and Consistency Models

## CAP Theorem

The CAP theorem (Brewer, 2000; formally proved by Gilbert and Lynch, 2002) states that a distributed data store can provide at most two of three guarantees simultaneously: Consistency (every read receives the most recent write or an error), Availability (every request receives a non-error response, without guaranteeing it's the most recent write), and Partition tolerance (the system continues operating despite network partitions between nodes).

Since network partitions are unavoidable in distributed systems, the practical choice is between CP (consistent but may reject requests during partitions) and AP (available but may return stale data during partitions). This is a spectrum, not a binary — most real systems make nuanced trade-offs.

## PACELC Extension

Eric Brewer later clarified that CAP is about trade-offs during partitions. Daniel Abadi's PACELC theorem extends this: if there is a Partition, choose between Availability and Consistency; Else (normal operation), choose between Latency and Consistency. For example: DynamoDB is PA/EL (available during partitions, low latency normally), while Google Spanner is PC/EC (consistent always, accepts higher latency via TrueTime).

## Consistency Models

Strong consistency (linearizability): operations appear to execute atomically at some point between invocation and response. Every read sees the latest write. Implemented via consensus protocols (Paxos, Raft) or synchronized clocks (Spanner's TrueTime). Cost: higher latency, reduced availability during partitions.

Sequential consistency: operations from each client appear in the order issued, but operations from different clients may be interleaved arbitrarily. Weaker than linearizability — no real-time ordering guarantee.

Causal consistency: if operation A causally precedes operation B, all nodes see A before B. Concurrent operations may appear in different orders on different nodes. Practical for many applications — preserves "happens-before" relationships without the cost of strong consistency.

Eventual consistency: if no new writes occur, all replicas will eventually converge to the same value. No guarantees about how long convergence takes. DynamoDB, Cassandra (at low consistency levels), DNS, and most AP systems default to this.

## Real-World Choices

MongoDB: CP by default (writes acknowledged by majority), but reads from secondaries can return stale data. Tunable via read/write concern levels.

Cassandra: Tunable consistency per query. QUORUM reads/writes give strong consistency. ONE gives eventual consistency with lower latency. ANY gives maximum availability.

PostgreSQL with streaming replication: synchronous replication is CP (blocks writes until replica confirms), asynchronous is AP (replica may lag).

Redis Cluster: AP — uses asynchronous replication, so acknowledged writes can be lost if primary fails before replicating.

## Common Interview Mistakes

Saying "CAP means you can only pick two" without acknowledging that partition tolerance is not optional. Confusing consistency in CAP (linearizability) with consistency in ACID (maintaining invariants). Not recognizing that most systems operate on a consistency spectrum, not a binary choice. Failing to discuss PACELC or the latency/consistency trade-off during normal operation.
