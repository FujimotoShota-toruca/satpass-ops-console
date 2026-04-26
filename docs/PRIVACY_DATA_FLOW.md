# Privacy / Data Flow

SatPass Ops Console is designed as a front-end-only static web application.
The app does not include a backend server, database, login system, or telemetry collector.

## Data handled locally in the browser

The following data is processed in the user's browser:

- YAML files imported from the local PC
- YAML text written in the in-app editor
- TLE text written directly in YAML
- Ground-station coordinates written in YAML
- Doppler frequency settings written in YAML
- Locally uploaded map images
- Locally uploaded radar/skyline images
- Generated Doppler CSV ZIP files

Imported YAML and uploaded local images are not intentionally uploaded to GitHub, OpenAI, CelesTrak, or any other server by this app.
They are parsed by browser-side JavaScript and used for rendering and CSV generation.

## Local browser storage

The current configuration is persisted in `localStorage` so that the screen can be restored after reload.
This storage is local to the browser profile on the PC.
It may remain visible to another person using the same PC and same browser profile.

Use the in-app `Clear Local Config` button to remove saved SatPass Ops Console configuration keys from `localStorage`.
If the current configuration should be preserved before clearing, use `Export YAML` first.

## External network access

The app can still access external URLs in the following cases:

1. TLE update URLs
   - When `Fetch / Update TLE` is pressed, the browser sends GET requests to URLs listed in `tle_sources`, `satellites[].tle_url`, or generated from `catnr`.
   - For example, CelesTrak URLs are accessed directly from the browser.
   - The full YAML document is not sent as a request body.

2. Map background URLs
   - If `map.background_image_url` points to an external image, the browser loads that image.

3. Radar/skyline background URLs
   - If `radar.background_image_url` points to an external image, the browser loads that image.

4. GitHub repository link
   - Pressing the GitHub button opens the repository page in a new tab.

## Operational caution

Do not commit private operational settings to a public repository.
Keep non-public ground-station locations, frequencies, unpublished TLE lists, and mission-specific constraints outside public example YAML files.
For private operations, import those settings locally at runtime and clear local browser storage after use on shared PCs.
