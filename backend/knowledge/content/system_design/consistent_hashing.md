# Consistent Hashing

## Core Concept

Consistent hashing maps both data keys and server nodes onto a fixed hash ring (typically 0 to 2^32-1). Each key is assigned to the first node encountered when walking clockwise from the key's position on the ring. When a node is added or removed, only the keys between the affected node and its predecessor need to be remapped — roughly K/N keys on average, where K is total keys and N is total nodes. This contrasts with traditional modular hashing (key % N) where adding or removing a node remaps nearly all keys.

## Virtual Nodes

Physical nodes are mapped to multiple positions on the ring using virtual nodes (vnodes). A single physical server might occupy 100-200 positions. This solves two problems: uneven key distribution when few physical nodes exist, and heterogeneous hardware where more powerful nodes should handle more keys. With vnodes, a node with 2x capacity simply gets 2x virtual nodes.

## Replication with Consistent Hashing

To replicate data, each key is stored on the N nodes found by continuing clockwise past the primary node. With virtual nodes, the system must skip vnodes belonging to the same physical node to ensure replicas land on distinct machines. Amazon's Dynamo uses a preference list — the first N distinct physical nodes on the ring.

## Real-World Implementations

Amazon DynamoDB uses consistent hashing with virtual nodes for partition assignment. Apache Cassandra uses a token ring where each node owns a range of tokens. Discord uses consistent hashing for routing messages to the correct guild server. Memcached clients use consistent hashing (via ketama algorithm) to distribute cache keys across a cluster without requiring coordination between cache servers.

## Trade-offs

Strengths: minimal disruption during scaling, no central directory needed, works well for peer-to-peer and distributed caches. Weaknesses: hotspot handling requires additional mechanisms (splitting hot ranges), rebalancing after node failure depends on ring structure, debugging key placement requires understanding the hash ring topology.

## When to Use

Consistent hashing is ideal for: distributed caches (Memcached, Redis Cluster), distributed databases (Cassandra, DynamoDB), content delivery networks (routing requests to edge servers), load balancers distributing connections across backends. It is less useful when: you need range queries (B-tree partitioning is better), data size is small enough for a single node, or you need strict ordering guarantees.
