import { useCallback, useEffect, useRef, useState } from "react";

import {
  hexToHsl,
  hslToHex,
  isHexColor,
  type HslColour,
} from "../utils/colour";

type HslUpdate = Partial<HslColour>;

const FALLBACK_COLOUR = "#171410";

function toHsl(value: string): HslColour {
  return hexToHsl(isHexColor(value) ? value : FALLBACK_COLOUR);
}

export function useIndependentHslColour(
  colour: string,
): [HslColour, (update: HslUpdate) => string] {
  const [hsl, setHsl] = useState<HslColour>(() => toHsl(colour));
  const hslRef = useRef(hsl);
  const generatedColourRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (colour === generatedColourRef.current) {
      generatedColourRef.current = undefined;
      return;
    }
    const next = toHsl(colour);
    hslRef.current = next;
    setHsl(next);
  }, [colour]);

  const updateHsl = useCallback((update: HslUpdate) => {
    const next = { ...hslRef.current, ...update };
    const nextColour = hslToHex(next.h, next.s, next.l);
    hslRef.current = next;
    generatedColourRef.current = nextColour;
    setHsl(next);
    return nextColour;
  }, []);

  return [hsl, updateHsl];
}
