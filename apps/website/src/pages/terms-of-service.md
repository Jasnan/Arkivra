---
layout: ../layouts/MdPage.astro
title: Terms
description: Terms for Arkivra, the open-source document management system.
---

## Terms

- **Effective Date:** May 24, 2026
- **Last Updated:** May 24, 2026

Arkivra is open-source software released under the AGPL-3.0 license. You may use, copy, modify, and distribute Arkivra according to that license.

### Open-Source Software

The Arkivra source code will be available when the public repository opens.

Self-hosted deployments are operated by the people or organizations that run them. The Arkivra project does not control independent deployments and is not responsible for their data processing, availability, backups, security posture, or legal compliance.

### Managed Service Status

Arkivra does not currently offer a managed cloud service or paid subscription plans through this website.

Managed hosting may be considered later if there is demand. Any future hosted service should have its own service terms and privacy terms. These terms currently apply to the open-source project website and software distribution.

### No Warranty

Arkivra is provided as-is, without warranties of any kind. Use it at your own risk, review the code and configuration before production use, and maintain your own backups.

### Security Responsibilities

For production deployments, keep PostgreSQL private, restrict server access, use strong secrets, and back up `ARKIVRA_ENCRYPTION_KEYS` separately.

Uploaded files are encrypted at rest. Extracted retrieval data is stored separately from original files in PostgreSQL for ingestion, search, and chat. Deployment choices determine how that database is secured.

Losing the active encryption key means losing access to encrypted stored files.

### Contact

For project questions before the public repository opens, contact the maintainer through [jasnan.xyz](https://jasnan.xyz).
