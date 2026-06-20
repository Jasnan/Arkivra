---
layout: ../layouts/MdPage.astro
title: Terms
description: Project terms for Arkivra, the open-source document management system.
---

## Project Terms

- **Effective Date:** June 20, 2026
- **Last Updated:** June 20, 2026

Arkivra is open-source software released under the AGPL-3.0 license. You may use, copy, modify, and distribute Arkivra according to that license.

### Open-Source Software

The Arkivra source code is available at [github.com/Jasnan/Arkivra](https://github.com/Jasnan/Arkivra).

Self-hosted deployments are operated by the people or organizations that run them. The Arkivra project does not control independent deployments and is not responsible for their data processing, availability, backups, security posture, or legal compliance.

Arkivra does not currently offer a managed hosted service, paid subscription, or hosted document storage through this website.

### No Warranty

Arkivra is provided as-is, without warranties of any kind. Review the code and configuration before production use, and maintain your own backups.

### Security Responsibilities

For production deployments, keep PostgreSQL private, restrict server access, use strong secrets, and back up `ARKIVRA_ENCRYPTION_KEYS` separately.

Uploaded files and stored extracted assets are encrypted at rest with `ARKIVRA_ENCRYPTION_KEYS`. Extracted retrieval data is stored separately from original files in PostgreSQL for ingestion, search, and chat. Deployment choices determine how that database is secured.

Losing the active encryption key means losing access to encrypted stored files.

### Contact

For project questions, contact the maintainer through [jasnan.xyz](https://jasnan.xyz) or use the GitHub repository.
