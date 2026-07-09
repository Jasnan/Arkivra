---
layout: "@/layouts/LegalLayout.astro"
title: "Terms - Arkivra"
description: "Project terms for Arkivra, the open-source document management system."
heading: "Project Terms"
---

- **Effective date:** June 20, 2026
- **Last updated:** June 20, 2026

## 1. Project Terms

Arkivra is open-source software released under the AGPL-3.0 license. You may use, copy, modify, and distribute Arkivra according to that license.

## 2. Open-Source Software

### 2.1 Source code

The Arkivra source code is available at [github.com/Jasnan/Arkivra](https://github.com/Jasnan/Arkivra).

### 2.2 Independent deployments

Self-hosted deployments are operated by the people or organizations that run them. The Arkivra project does not control independent deployments and is not responsible for their data processing, availability, backups, security posture, or legal compliance.

### 2.3 No hosted service

Arkivra does not currently offer a managed hosted service, paid subscription, or hosted document storage through this website.

## 3. No Warranty

> **Warning**
>
> Arkivra is provided as-is, without warranties of any kind. Review the code and configuration before production use, and maintain your own backups.

## 4. Security Responsibilities

### 4.1 Production deployments

For production deployments, keep PostgreSQL private, restrict server access, use strong secrets, and back up `ARKIVRA_ENCRYPTION_KEYS` separately.

### 4.2 Encrypted files and extracted data

Uploaded files and stored extracted assets are encrypted at rest with `ARKIVRA_ENCRYPTION_KEYS`. Extracted retrieval data is stored separately from original files in PostgreSQL for ingestion, search, and chat. Deployment choices determine how that database is secured.

### 4.3 Encryption key loss

> **Warning**
>
> Losing the active encryption key means losing access to encrypted stored files.

## 5. Contact

For project questions, contact the maintainer through [jasnan.xyz](https://jasnan.xyz) or use the [GitHub repository](https://github.com/Jasnan/Arkivra).
