---
layout: ../layouts/MdPage.astro
title: Privacy
description: Privacy information for Arkivra, the open-source document management system.
---

## Privacy

- **Effective Date:** May 24, 2026
- **Last Updated:** May 24, 2026

Arkivra is open-source software. Self-hosting is fully supported, and this page describes the Arkivra website and project defaults.

Independent Arkivra operators are responsible for their own deployments, data processing, access controls, backups, model choices, and legal compliance.

### Website Data

The Arkivra website is a static marketing and project website. It may receive ordinary web server metadata such as IP address, user agent, requested URL, referrer, and timestamp through hosting infrastructure and security logs.

The website does not need access to your Arkivra documents.

### Telemetry

Arkivra does not include product telemetry and does not collect user information from your instance.

If you run Arkivra in your own infrastructure and use only local AI models, document content and model context do not need to leave that environment.

### Document Storage and Ingestion

Uploaded files are encrypted at rest by Arkivra.

During ingestion, Arkivra extracts retrieval data from documents so search and AI-assisted workflows can work. This data is stored separately from original files in PostgreSQL, along with metadata, embeddings, vectors, chat history, user accounts, vault membership, permissions, and background job data. Deployment choices determine how that database is secured.

Arkivra is not designed as a zero-knowledge or end-to-end encrypted vault.

### AI Processing

With local models, context stays inside the infrastructure where you run Arkivra.

If you configure cloud models, Arkivra sends only the retrieved context needed for the request to the configured provider. It does not send full documents as model context, but retrieved context may contain document content. The provider may log, retain, or process that data depending on its own privacy policy and configuration.

Review the privacy terms of any cloud model provider before using it with sensitive documents.

### Managed Hosting

Arkivra does not currently offer a managed hosted service. Managed hosting may be considered later if there is demand. If that happens, the privacy terms for the hosted service should be documented separately from self-hosted deployments.

### Contact

For project questions, open an issue at [github.com/Jasnan/Arkivra](https://github.com/Jasnan/Arkivra) or contact the maintainer through [jasnan.xyz](https://jasnan.xyz).
