# PlantPal privacy notice (draft for the owner)

> **Status: DRAFT.** Written from what the code does today. The owner must review it, add the operator's identity and contact, check it against the law that applies to them, and publish it before any public deployment (release gate 11).

- **Operator:** _owner to fill in_
- **Contact for privacy questions:** _owner to fill in_

## The short version

- Your garden lives on your device. You can use PlantPal fully without an account.
- No advertising, no third-party trackers, no analytics.
- Your exact location never leaves your device except, rounded, to the weather and nature data services listed below.
- AI features use your own Gemini key, from your device straight to Google. PlantPal never sees your key, your prompts or the answers.

## On your device

Gardens, plants, care, journal notes, photos (re-encoded so GPS and other metadata are removed), plans, nature visits, harvests and seed lots are stored in your browser's storage (IndexedDB). Settings › Data exports all of it as a zip and can delete everything on this device.

Your Gemini key, if you add one, is stored only on this device, encrypted with a browser key that cannot be exported, in a separate database that is never exported or synced.

## Data services your device contacts

To show weather, climate and nature nearby, your browser contacts these services directly, sending a location **rounded to about 5 km** (or a place name you search for): Open-Meteo, NASA POWER, GBIF, iNaturalist, Wikipedia, Wikidata and Wikimedia Commons. Each has its own privacy policy. They see your IP address, as any website does.

Background maps (corridor and community maps) load tiles from OpenFreeMap when you open a map.

## If you use AI features

When you send something to Gemini, the send preview shows exactly what goes. It goes from your device to Google under **your own Gemini API terms**; free and paid tiers treat data differently. PlantPal's servers are not involved.

## If you create an account (optional)

- **Sign-in:** a passkey. PlantPal stores its public key and the name you typed. There is no password and no email; no IP address is stored with your session.
- **Cookie:** one session cookie (HttpOnly, SameSite=Lax), used only to keep you signed in. No other cookies.
- **Sync:** the gardens you choose to back up are stored on PlantPal's server (Cloudflare D1) so your devices and the people you invite can see them. Photos are not synced yet; they stay on the device that took them.
- **Change history** is kept for 90 days so devices can catch up, then pruned.
- **Sharing:** people you invite see that garden. Plant-sitter links show only the spaces and dates you chose, and you can turn them off at any time.
- **Push notifications** (if you turn them on): your browser's push address is stored. Messages are encrypted so the push service cannot read them.

## The community (off unless the operator turns it on)

If enabled, your community profile holds a display name, an optional bio and a rough area (a hexagon of about 5 km², worked out on your device). Posts, events, listings and questions are visible to people in your area. Contact details are shown only to the other person in a swap, and only when you have both chosen to share them. Moderators can see reported content and keep an audit log of their decisions. See `docs/community-policy.md`.

## Corridor map

To look up mapped green space, PlantPal's server receives only the 5 km² hexagon id, asks OpenStreetMap's Overpass service about that area and caches the answer. Distances to your garden are worked out on your device.

## Deleting your data

- **On a device:** Settings › Data › delete everything on this device.
- **On the server:** self-service account deletion is **not built yet**. Until it is, the operator deletes an account on request. _Owner to describe how to ask, and how fast it is done._

## Your rights

Depending on where you live you may have rights to access, correct, export or delete your data and to object to processing. _Owner to add the legal basis, the rights that apply and how to exercise them._
