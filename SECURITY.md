# Security

This project is an unofficial web wrapper. It does not collect credentials,
API keys, prompts, or conversations.

The optional Firefox session import copies only non-expired cookies for these
domains into the Electron profile:

- `chatgpt.com`
- `openai.com`
- `auth0.com`

Cookie values are not printed by the app. The temporary SQLite copy used for
reading Firefox cookies is deleted immediately after import.

Do not run builds from unknown sources. Prefer building locally from source or
downloading artifacts from a release you trust.

