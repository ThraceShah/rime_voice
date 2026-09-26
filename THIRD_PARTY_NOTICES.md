# Third-party components

The root [GPL-3.0-only license](LICENSE) applies to Rime Voice's original application
code and documentation. It does not relicense the components below.

| Component | Files or build input | License |
| --- | --- | --- |
| `jsh_rime` 2.0.2 JavaScript glue and WASM package | `src/rime/vendor/jsh_rime.mjs`; WASM copied from the npm package during build | Apache-2.0 ([license](vendor/JSH_RIME_LICENSE.txt)) |
| `librime` engine | Included in the upstream WASM package | BSD-3-Clause ([license](vendor/LIBRIME_LICENSE.txt)) |
| 白霜拼音 `gaboolic/rime-frost` at `3ad2cb34e3c5763ba3f8da0a617fcaa221b355aa` | Dictionary source fetched by `scripts/prepare_dictionary.sh`; compiled `.bin` files remain local and are excluded from Git | GPL-3.0 ([license](vendor/RIME_FROST_LICENSE.txt), [source](https://github.com/gaboolic/rime-frost/tree/3ad2cb34e3c5763ba3f8da0a617fcaa221b355aa)) |
| `donstang/asr-server` test speech | `scripts/fixtures/english_test.wav` | BSD-style license ([license](scripts/fixtures/LICENSE.txt)) |

`npm run build` creates a local `dist/` bundle containing third-party engine and
dictionary assets. `dist/` is not part of this Git repository. Anyone who
redistributes a built bundle must preserve the third-party license notices and
comply with their license terms, including the GPL terms for the dictionary.
