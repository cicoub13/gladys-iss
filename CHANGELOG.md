# Changelog

All notable changes to the ISS Overhead integration for Gladys Assistant.

## [Unreleased]

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
