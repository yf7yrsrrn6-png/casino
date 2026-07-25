import classic777 from './classic-777.webp'
import goldenPharaoh from './golden-pharaoh.webp'
import neonDiamonds from './neon-diamonds.webp'
import wildSafari from './wild-safari.webp'
import piratesGold from './pirates-gold.webp'
import fruitFiesta from './fruit-fiesta.webp'

/** Real rendered cover art per slot id, matched to each machine's theme colour. */
export const SLOT_COVERS: Record<string, string> = {
  'classic-777': classic777,
  'golden-pharaoh': goldenPharaoh,
  'neon-diamonds': neonDiamonds,
  'wild-safari': wildSafari,
  'pirates-gold': piratesGold,
  'fruit-fiesta': fruitFiesta,
}
