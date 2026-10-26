# Project instructions

- Write code, comments, documentation, logs and commit messages in English. Swedish only as an extra file next to the English one.
- Read README.md and docs/HISTORY.md before changing behavior. Keep `VERSION` as the single version source and add a history entry for meaningful changes.
- Label Studio never talks to a printer. Everything goes through the label-service API; the Studio server only forwards the allowed template, preview and job calls.
- Never submit a physical print as part of development or testing without the owner's explicit approval in chat. Use previews instead.
- The editor's drawing is an approximation; the label-service preview is the truth. Keep the template format exactly as label-service validates it.
- Keep the repository free of LAN addresses, hostnames, keys and secret locations; it is meant to become public. Deployment details live in the owner's notes.
- Run `npm run check` before committing.
