---
layout: ../layouts/MdPage.astro
title: Privacy Policy
description: How the Arkivra website, self-hosted deployments, and future managed services handle data and privacy.
---
## Privacy

- **Effective Date:** May 24, 2026
- **Last Updated:** May 24, 2026

## Overview

Arkivra is an open-source document management system designed primarily for self-hosted deployments.

This privacy policy covers:

1. The Arkivra project website.
2. Self-hosted Arkivra deployments.
3. Future managed services, if they are ever offered.

Independent operators of self-hosted Arkivra instances are responsible for their own infrastructure, access controls, backups, security practices, AI provider configuration, and legal compliance.

## The Arkivra Website

The Arkivra website is a public project and documentation website.

When you visit the website, hosting infrastructure may process standard web server information such as:

- IP address
- Browser and device information
- Requested pages and URLs
- Referrer information
- Timestamps
- Security and operational logs

The website does not need access to your Arkivra documents.

### Analytics and Tracking

Arkivra does not use advertising trackers.

The website does not collect analytics data beyond what may be recorded in standard hosting and security logs required to operate and protect the website.

## Self-Hosted Arkivra Deployments

Arkivra is designed so that you can run the software on infrastructure you control.

### Telemetry

Arkivra does not include built-in product telemetry.

The software does not send document content, user information, usage data, or operational metrics to the project maintainers.

### Document Storage

Uploaded files are encrypted at rest by Arkivra.

To support search, retrieval, and optional AI-assisted features, Arkivra also stores processed document data separately from the original files. Depending on configuration, this may include:

- Extracted text
- Document metadata
- Structured document content
- Search indexes
- Embeddings and vector data
- Chat history
- User accounts
- Permissions and vault membership information
- Background job data

How this information is secured depends on the infrastructure and security practices of the deployment operator.

Arkivra is not designed as a zero-knowledge or end-to-end encrypted system.

### AI Processing

AI features in Arkivra are optional.

When using local models, document processing and model context can remain entirely within the infrastructure where Arkivra is deployed.

When using cloud-based AI providers, Arkivra sends only the retrieved context required for a request rather than entire documents by default. Depending on retrieval results, that context may contain portions of document content.

Cloud providers may log, retain, or process submitted data according to their own policies and configuration.

Before using cloud-based AI services with sensitive documents, review the privacy and data-handling terms of the selected provider.

## Future Managed Services

Arkivra does not currently provide a managed hosted service.

If a managed Arkivra service is offered in the future, it may require additional processing of account information, operational data, and hosted content to provide the service.

Any managed offering should be governed by separate privacy terms that clearly describe:

- What data is collected
- Why the data is processed
- How long data is retained
- Which third-party services are involved
- The rights available to users of the hosted service

Those terms would be published separately from this policy.
