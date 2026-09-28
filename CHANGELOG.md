# Changelog

All notable changes to the ISS Overhead integration for Gladys Assistant.

## [Unreleased]

## [0.3.1] - 2026-09-28

### Changed

- The widget shows the pass times in your local time instead of UTC, and the
  date format and directions in the language of your Gladys (e.g. "28/09
  19:49", "O" for west in French).

## [0.3.0] - 2026-09-28

### Added

- New scene variables `start_date` (e.g. "lundi 28 septembre") and
  `start_hour` (e.g. "19:49"), in your local time zone, ready to use in a
  notification or a voice message. Available on the "ISS pass starting"
  trigger and the "Get next ISS pass" action.
- New scene variable `direction_name`: the direction written out in full
  (e.g. "ouest", "nord-est") instead of a compass code.
- New "Scene language" setting (French by default): the language of the date,
  time and direction handed to scenes.
- New "Scene lead time" setting: how many minutes before a pass the
  "ISS pass starting" trigger fires (5 by default, up to 60).

### Changed

- The "ISS pass starting" trigger now fires 5 minutes before the pass by
  default, instead of 90 seconds.

### Removed

- The `start_time` scene variable (ISO date in UTC) is gone: scenes using it
  must switch to `start_date` and `start_hour`.

## [0.2.0] - 2026-09-23

### Fixed

- The integration retries on its own, with a growing delay, when it cannot
  start (Celestrak unreachable, house not located yet, Gladys still booting),
  instead of waiting for the next reconnection, possibly days later.
- The integration no longer stops when Gladys refuses its token at startup
  (e.g. Gladys still booting): it keeps trying to reconnect.
- A Celestrak request that hangs now gives up after 15 seconds instead of
  leaving the widget empty for several minutes.
- The orbital data cache can no longer be corrupted by a restart or a power
  loss while it is being written.
- An unexpected error is now logged before the integration restarts.

## [0.1.7] - 2026-09-23

### Fixed

- Updated the Sun position library; the visibility of the passes is checked
  against an independent computation.

### Security

- Smaller Docker image: the package managers are no longer shipped, and the
  image is scanned before it is published.

## [0.1.6] - 2026-09-22

### Changed

- The integration is listed under the "Environment" category of the catalog.

## [0.1.5] - 2026-09-22

### Added

- First release: predicts the visible ISS passes over your house, shows them
  on an "ISS Passes" dashboard widget with a photo of the station, and offers
  an "ISS pass starting" scene trigger and a "Get next ISS pass" scene action.
- The widget is translated into English and French.
- Requires Gladys 5.1.0 or later.
