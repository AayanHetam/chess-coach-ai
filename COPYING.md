# Copying Chess Masti AI

Chess Masti AI grew from [Chesskit](https://github.com/GuillaumeSD/Chesskit),
which grew from [lichess](https://github.com/lichess-org/lila). Any file in this
project that does not state otherwise and is not listed as an exception below is
covered by this notice.

Chess Masti AI is free software; you can redistribute and/or modify it under the
terms of the GNU Affero General Public License as published by the Free Software
Foundation; version 3 of the License.

See the LICENSE file for a copy of the _GNU Affero General Public License_.

Copyright (C) 2024-2026 Aayan Hetamsaria and the Chesskit and lichess authors.

> **The code is open source; not every bundled asset is.** Several piece sets
> and sounds listed below are NonCommercial, NoDerivatives, or plain freeware.
> Those terms are neither AGPL-compatible nor open source, which is exactly why
> they are carved out here — as upstream does. Redistribute the code freely;
> check this table before redistributing the assets.

## Engines

Every file under `public/engines/` is a Stockfish build conveyed to the
browser under the GNU GPL v3. The directory carries its own notice
(`public/engines/README.txt`) and the full license text
(`public/engines/COPYING.txt`); complete corresponding source lives in the
upstream repositories below and these exact files are redistributed in this
repository.

<!-- prettier-ignore -->
Files | Author(s) | License
--- | --- | ---
public/engines/stockfish-16, -16.1, -17 | [Stockfish contributors](https://github.com/official-stockfish/Stockfish); JS/WASM builds by [stockfish.js](https://github.com/nmrugg/stockfish.js) (Chess.com, LLC); NNUE nets published with the Stockfish releases | [GPLv3](https://www.gnu.org/licenses/gpl-3.0.txt)
public/engines/stockfish-11.js | [Multi-variant Stockfish](https://github.com/ddugovic/Stockfish) (Daniel Dugovic and contributors), compiled by Niklas Fiekas | [GPLv3](https://www.gnu.org/licenses/gpl-3.0.txt)

Server-side (never conveyed to the browser): coaching accuracy checks run
[Leela Chess Zero](https://github.com/LeelaChessZero/lc0) (GPLv3) and
[Maia](https://github.com/CSSLab/maia-chess) (GPLv3) as backend services.

## Exceptions (free)

<!-- prettier-ignore -->
Files | Author(s) | License
--- | --- | ---
public/piece/horsey | cham, michael1241 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/cburnett | [Colin M.L. Burnett](https://en.wikipedia.org/wiki/User:Cburnett) | [GPLv2+](https://www.gnu.org/licenses/gpl-2.0.txt)
public/piece/chessnut | [Alexis Luengas](https://github.com/LexLuengas) | [Apache 2.0](https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt)
public/piece/letter | [usolando](https://lichess.org/@/usolando) | AGPLv3+
public/piece/pirouetti | [pirouetti](https://lichess.org/@/pirouetti) | AGPLv3+
public/piece/merida | Armando Hernandez Marroquin | [GPLv2+](https://www.gnu.org/licenses/gpl-2.0.txt)
public/piece/shapes | [flugsio](https://github.com/flugsio/chess_shapes) | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
public/piece/pixel | therealqtpi | AGPLv3+
public/piece/rhosgfx | [RhosGFX](https://rhosgfx.itch.io/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
public/piece/california | [Jerry S.](https://sites.google.com/view/jerrychess/home) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/caliente | [avi](https://github.com/avi-0/caliente) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/maestro | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/fantasy | [Maurizio Monge](https://github.com/maurimo/chess-art) | [MIT](https://github.com/maurimo/chess-art/blob/main/LICENSE)
public/piece/spatial | [Maurizio Monge](https://github.com/maurimo/chess-art) | [MIT](https://github.com/maurimo/chess-art/blob/main/LICENSE)
public/piece/celtic | [Maurizio Monge](https://github.com/maurimo/chess-art) | [MIT](https://github.com/maurimo/chess-art/blob/main/LICENSE)
public/piece/fresca | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/cardinal | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/icpieces | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/gioco | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/tatiana | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/staunty | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/dubrovny | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/anarcandy | [caderek](https://github.com/caderek) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/kiwen-suwi | [neverRare](https://github.com/neverRare) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
public/piece/mpchess | [Maxime Chupin](https://github.com/chupinmaxime) | [GPL3v3+](https://www.gnu.org/licenses/quick-guide-gplv3.en.html)
public/piece/cooke | [fejfar](https://github.com/fejfar) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/monarchy | [slither77](https://github.com/slither77) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/piece/xkcd | [Randall Munroe](https://xkcd.com/about) | [CC BY-NC-SA 2.5](https://xkcd.com/license.html)
public/piece/firi | [James Faure](https://github.com/jfaure/Firi-pieceset) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
public/piece/chicago | [Benjamin Friedrich](https://github.com/benjfriedrich/chess-foundry-pack) | [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/)
public/piece/iowa | [Benjamin Friedrich](https://github.com/benjfriedrich/chess-foundry-pack) | [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/)
public/piece/oslo | [Benjamin Friedrich](https://github.com/benjfriedrich/chess-foundry-pack) | [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/)

## Exceptions (non-free)

<!-- prettier-ignore -->
Files | Author(s) | License
--- | --- | ---
public/piece/alpha | Eric Bentzen | "free for personal non commercial use" (see [zip](http://www.enpassant.dk/chess/downl/alpha.zip))
public/piece/chess7 | [Style-7](http://www.styleseven.com/) | "freeware"
public/piece/companion | David L. Brown | ["freeware"](http://www.enpassant.dk/chess/fonteng.htm#GC)
public/piece/leipzig | Armando Hernandez Marroquin | ["freeware"](http://www.enpassant.dk/chess/fonteng.htm#LEIPZIG)
public/piece/reillycraig | [Reilly Craig](https://instagram.com/fader_) |
public/piece/symmetric | [Arcticpenguins](https://github.com/lichess-org/lichobile/issues/215) |
public/sounds | [Lichess](https://github.com/lichess-org/lila) | [GNU AGPL v3](https://github.com/lichess-org/lila?tab=License-2-ov-file)
public/piece/riohacha | |
