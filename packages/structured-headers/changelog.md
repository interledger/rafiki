ChangeLog
=========

0.5.0 (2022-09-13)
------------------

* All the serializer functions are now exported. (@adrianhopebailie)
* Added an `isByteSequence` helper function (@adrianhopebailie)
* Bring all dependencies up to date.


0.4.1 (2021-06-09)
------------------

* Corrected the 'main' property in `package.json`.


0.4.0 (2021-05-15)
------------------

* Fully up to date with [RFC8941][5].
* This is a complete rewrite, all APIs have changed and return the structures
  that are recommended by the actual RFC document.
* Passing almost all tests from the [HTTP WG test suite][6]. See the readme
  for the exceptions.


0.3.0 (2019-10-03)
------------------

* Fully up to date with [draft-ietf-httpbis-header-structure-13][4].
* Parameterized Lists and List of Lists are gone, their feautures are merged
  into List and Dictionaries.
* Both lists and dictionaries now require an object such as
  `{value: x, parameters: y}`. This is a breaking change, but was required to
  support parameters correctly everywhere.
* Stricter float parsing.


0.2.0 (2019-04-27)
------------------

* Fully up to date with [draft-ietf-httpbis-header-structure-10][3].
* True and False are now encoded as `?1` and `?0`.
* Added serializing support.
* Integers with more than 15 digits now error as per the new draft.
* Updated all dependencies.


0.1.0 (2018-12-06)
------------------

* Fully up to date with [draft-ietf-httpbis-header-structure-09][2].
* Package renamed to 'structured-headers'.
* Conversion to typescript.
* The `parseBinary` function is renamed to `parseByteSequence`, to match the
  rename in draft-ietf-httpbis-header-structure-08.
* Support for Booleans.
* The `parseIdentifier` function is renamed to `parseToken`, to match the
  rename in draft-ietf-httpbis-header-structure-09.
* Renamed `parseParameterizedList` to `parseParamList`. It's shorter.

0.0.2 (2018-03-27)
------------------

* Added minified webpacked version.
* Added readme.
* Fixed a small bug in identifier parsing.
* 100% unittest coverage.

0.0.1 (2018-03-26)
------------------

* First version!
* Parses all of the [04 draft of the specification][1].

[1]: https://tools.ietf.org/html/draft-ietf-httpbis-header-structure-04
[2]: https://tools.ietf.org/html/draft-ietf-httpbis-header-structure-09
[3]: https://tools.ietf.org/html/draft-ietf-httpbis-header-structure-10
[4]: https://tools.ietf.org/html/draft-ietf-httpbis-header-structure-13
[5]: https://datatracker.ietf.org/doc/html/rfc8941
[6]: https://github.com/httpwg/structured-field-tests
