# ISS Overhead

> **Requires Gladys 5.1 or later.** The dashboard widget and the scene
> trigger/action this integration is made of ship with Gladys 5.1; on an
> earlier version the integration cannot be installed.

Predicts the next visible passes of the International Space Station over your
house, shows them on a dashboard widget, and can trigger a scene right before
one starts — perfect for "go look outside" automations.

## What it shows

The **ISS Passes** widget displays:

- a photo of the station, and how long until the next visible pass, with its
  maximum elevation;
- the next few passes, with their time, duration and the direction the ISS
  rises from;
- whether the ISS is visible tonight, and whether the orbital data used to
  compute passes is fresh.

A pass is only shown as visible when the ISS is above the horizon, your house
is in the dark, and the ISS itself is still lit by the sun — the same
conditions that make it a bright, fast-moving "star" in the evening or
early-morning sky.

## Automations

- **Trigger: "ISS pass starting"** — fires shortly before a visible pass
  begins. Optionally filter by the direction it rises from. Use it to turn on
  a "look up!" notification, or to switch off outdoor lights that would spoil
  the view.
- **Action: "Get next ISS pass"** — fetches the next predicted pass on demand,
  for scenes that want to announce it (e.g. a voice message) rather than react
  to it.

## Configuration

| Key               | Default | Description                                          |
| ----------------- | ------- | ---------------------------------------------------- |
| Minimum elevation | 10°     | Passes that never rise above this angle are ignored. |
| Prediction window | 5 days  | How far ahead passes are predicted (3, 5 or 7 days). |

The integration needs your house's location, granted automatically when you
install it (no address to type in).

## No API key needed

Orbital data (TLE) is fetched from [Celestrak](https://celestrak.org/), a free
public source — nothing to sign up for.
