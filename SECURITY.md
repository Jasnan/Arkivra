# Security Policy

Arkivra handles uploaded documents, extracted content, authentication, access control, encryption keys, provider credentials, and backups. Please report suspected vulnerabilities privately and avoid exposing user data while investigating them.

## Supported versions

Arkivra is currently in public beta. Security fixes are applied to the latest beta release and the current development line; older beta builds may not receive backports.

| Version                                  | Supported        |
| ---------------------------------------- | ---------------- |
| Latest `0.1.0-beta.x` release            | Yes              |
| Current `main` branch                    | Development only |
| Older prereleases and unversioned builds | No               |

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Jasnan/Arkivra/security/advisories/new) when it is available. This creates a private discussion with the maintainer.

If private reporting is unavailable, email [contact@arkivra.app](mailto:contact@arkivra.app) with the subject `Arkivra security report`. Do not open a public issue or discussion.

Include, where possible:

- the affected version, image tag, or commit;
- the affected component and deployment setup;
- reproduction steps or a minimal proof of concept;
- the expected impact and any known preconditions;
- suggested mitigations, if you have them.

Use synthetic files and accounts whenever possible. Do not send credentials, encryption keys, access tokens, private documents, extracted text, database dumps, or provider payloads unless the maintainer asks for a secure way to exchange a minimal sample.

## What to expect

The maintainer will acknowledge the report as soon as practical, assess its impact, and coordinate remediation and disclosure for validated issues. Response and fix times depend on severity, complexity, and maintainer availability; submitting a report does not guarantee a particular resolution or timeline.

Please allow reasonable time for investigation and a fix before public disclosure. Arkivra will credit reporters when requested and appropriate.

## Deployment responsibility

Arkivra is self-hosted software. Operators remain responsible for TLS termination, network exposure, host and database security, backups, access to deployment secrets, and the security of configured processors and AI providers. Review the [privacy and security guide](https://docs.arkivra.app/operations/privacy-and-security/) before storing sensitive documents.
