# ADR-0004 — Realtime media is a separate plane from day one

**Status:** Accepted · **Date:** 2026-09-04

## Context

Meet needs WebRTC. ADR-0001 says start with a monolith and extract on evidence.
Media appears to contradict that.

## Decision

Split the media plane (SFU) from the API **immediately**. Room metadata,
scheduling and signalling stay in the monolith as ordinary stateless HTTP; only
the media path is separate.

## Rationale

This is not an exception to ADR-0001 — it is ADR-0001's trigger list applied
honestly. Media meets three triggers on day one:

| Trigger | How media meets it |
|---|---|
| Divergent scaling profile | Bandwidth- and CPU-bound per *participant-minute*, not per request. Its resource curve differs from an HTTP API by orders of magnitude. |
| Fault isolation | An SFU under load can saturate a node's network. Sharing that node with the API would take every product down. |
| Runtime mismatch | Efficient SFUs are C++/Rust/Go with kernel tuning and UDP port ranges. It does not belong in a Node process. |

Media is also **stateful** — participants must reach the same node — which breaks
the stateless-replica assumption the rest of the platform is built on.

## Consequences

**Positive**
- The media plane scales, deploys and fails independently.
- The API stays stateless, which keeps autoscaling and rolling deploys simple.
- Recording, transcoding and transcription attach to the media plane without
  touching the platform.

**Negative**
- A second runtime and deployment topology on day one.
- Signalling must route participants to the room's pinned SFU node
  (`MeetRoom.sfuRegion` exists for this).
- Sticky routing is required here and nowhere else — a deliberate, contained
  exception.

## The general principle

**Split by scaling profile, not by domain noun.** "Meet" is not one thing: its
metadata is an ordinary CRUD product and belongs in the monolith; its media is a
different kind of system entirely. Splitting the whole product would have moved
CRUD code out for no reason; splitting neither would have put a bandwidth-bound
stateful process inside a stateless API.
