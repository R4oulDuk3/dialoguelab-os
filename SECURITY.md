# Security policy

## Reporting a vulnerability

Please do not publish exploitable security issues in a public issue. Use GitHub's private vulnerability reporting feature for this repository. If that feature is unavailable, contact the repository maintainer privately through the contact method listed on their GitHub profile.

Include the affected version, reproduction steps, expected impact, and any suggested mitigation. Do not include real API keys, private dialogue, voice samples, or other user data.

## Supported versions

Until the first stable release, security fixes are provided for the latest release only.

## Local-data model

Dialogue Lab stores projects, encrypted provider credentials, uploaded artwork, generated media, and renders on the user's machine. Cloud voice providers receive the text or audio needed to perform requested operations. Review [docs/PRIVACY.md](docs/PRIVACY.md) for the data boundary and safe disclosure guidance.
