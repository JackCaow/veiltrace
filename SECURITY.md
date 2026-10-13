# Security and privacy

VeilTrace is experimental and is not an authentication, access-control or DLP
boundary. Its CRC is publicly computable. Anyone can generate or replay a record.
Never use a detection alone to attribute misconduct to a person.

Keep identity mapping and authorization server-side. Use opaque random records,
expiry and a retention policy appropriate to your application. Namespace is
public, and renderer code contains no secret key. DOM injection can remove a mark.

Decode untrusted files in a bounded worker. The Node PNG adapter checks input size,
dimensions and container structure before decompression, rejects repeated IHDR,
and refuses interlaced PNG to avoid the dependency's unbounded Adam7 inflate path.
Palette entries are limited to a single legal PLTE with at most 256 entries;
transparency and gamma metadata lengths and ordering are checked as well.
Only its dimension-bounded non-interlaced decode path is used. These checks are
not a complete image-decoder security sandbox or a CPU/memory deadline.
The demo enforces size limits and sends no uploaded image to its static server.

Report sensitive vulnerabilities through the hosting platform's private security
reporting feature when enabled. Otherwise open an issue asking for a private
contact without posting exploit payloads or private images. No response-time or
security-support SLA is offered for this alpha.
