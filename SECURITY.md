# Security and privacy

VeilTrace is experimental and is not an authentication, access-control or DLP
boundary. Its CRC is publicly computable. Anyone can generate or replay a record.
Never use a detection alone to attribute misconduct to a person.

Keep identity mapping and authorization server-side. Use opaque random records,
expiry and a retention policy appropriate to your application. Namespace is
public, and renderer code contains no secret key. DOM injection can remove a mark.

Decode untrusted files in a bounded worker. The PNG adapter checks input size and
dimensions, but these limits are not a complete image-decoder security sandbox.
The demo enforces size limits and sends no uploaded image to its static server.

Report sensitive vulnerabilities through the hosting platform's private security
reporting feature when enabled. Otherwise open an issue asking for a private
contact without posting exploit payloads or private images. No response-time or
security-support SLA is offered for this alpha.
