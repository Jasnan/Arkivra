---
layout: "@/layouts/LegalLayout.astro"
title: "Privacy Policy - Arkivra"
description: "How the Arkivra website and self-hosted deployments handle data and privacy."
heading: "Privacy Policy"
---

- **Effective date:** June 20, 2026
- **Last updated:** June 20, 2026

> **Important**
>
> This policy covers the Arkivra project website and explains privacy boundaries for self-hosted Arkivra deployments. Independent operators of self-hosted instances are responsible for their own infrastructure, access controls, backups, security practices, AI provider configuration, and legal compliance.

## 1. Overview

Arkivra is an open-source document management system for self-hosted deployments.

### 1.1 What this policy covers

This policy covers:

1. The Arkivra project website.
2. Privacy and data boundaries for self-hosted Arkivra deployments.

### 1.2 What this policy does not control

Arkivra project maintainers do not operate independent self-hosted deployments. If you use an Arkivra instance run by another person or organization, that operator controls its infrastructure, data processing, retention, backups, provider configuration, and access policies.

## 2. The Arkivra Website

The Arkivra website is a public project website. Documentation is published separately at [docs.arkivra.app](https://docs.arkivra.app).

### 2.1 Server and security logs

When you visit the website, hosting infrastructure may process standard web server information such as:

- IP address
- Browser and device information
- Requested pages and URLs
- Referrer information
- Timestamps
- Security and operational logs

The website does not need access to your Arkivra documents.

### 2.2 Analytics and tracking

Arkivra does not use advertising trackers.

The website does not collect analytics data beyond what may be recorded in standard hosting and security logs required to operate and protect the website.

## 3. Self-Hosted Arkivra Deployments

Arkivra is designed so operators can run the software on infrastructure they control.

### 3.1 Telemetry

Arkivra does not include built-in product telemetry.

The software does not send document content, user information, usage data, or operational metrics to the project maintainers.

### 3.2 Document storage

Arkivra encrypts uploaded files and stored extracted assets at rest with `ARKIVRA_ENCRYPTION_KEYS`.

### 3.3 Processed document data

To support search, retrieval, and optional AI-assisted features, Arkivra stores processed document data separately from original files. Depending on configuration, this may include:

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

> **Warning**
>
> Arkivra is not designed as a zero-knowledge or end-to-end encrypted system.

## 4. AI Processing

AI features in Arkivra are optional.

### 4.1 Provider configuration

Arkivra uses provider settings configured by the deployment operator. Current provider support differs by feature. See the [AI provider documentation](https://docs.arkivra.app/guides/ai-providers/) for current runtime paths.

### 4.2 Local model providers

When using a local model provider, document processing and model context can remain within the infrastructure where Arkivra is deployed.

### 4.3 Remote or hosted model providers

If an operator points Arkivra at a remote or hosted model endpoint, Arkivra sends only the selected or retrieved context required for a request rather than entire documents by default. Depending on retrieval results, that context may contain portions of document content.

> **Warning**
>
> Remote or hosted model providers may log, retain, or process submitted data according to their own policies and configuration. Before using remote AI services with sensitive documents, review the privacy and data-handling terms of the selected provider.
