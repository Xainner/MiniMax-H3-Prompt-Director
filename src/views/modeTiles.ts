import {
  ArrowLeftRight,
  ArrowRightToLine,
  FileText,
  Image as ImageIcon,
  Layers,
} from "lucide-react";
import { MODE_HINTS, MODE_LABELS } from "@/core/h3/roles";
import type { H3Mode } from "@/core/h3/types";
import omniImg from "@/assets/modes/omni.png";
import t2vaImg from "@/assets/modes/t2va.png";
import i2vaImg from "@/assets/modes/i2va.png";
import fl2vaImg from "@/assets/modes/fl2va.png";
import l2vaImg from "@/assets/modes/l2va.png";

export interface ModeTile {
  mode: H3Mode;
  code: string;
  label: string;
  hint: string;
  icon: typeof Layers;
  image: string;
  gradient: string;
}

/** The launcher roster: everything Director supports, one tile per H3 mode.
 * Shared by the launcher and the creation wizard's mode header. */
export const MODE_TILES: ModeTile[] = [
  {
    mode: "full-reference",
    code: "OMNI",
    label: MODE_LABELS["full-reference"],
    hint: MODE_HINTS["full-reference"],
    icon: Layers,
    image: omniImg,
    gradient: "from-primary/60 via-primary/30 to-chart-3/40",
  },
  {
    mode: "t2va",
    code: "T2VA",
    label: MODE_LABELS.t2va,
    hint: MODE_HINTS.t2va,
    icon: FileText,
    image: t2vaImg,
    gradient: "from-chart-3/50 via-chart-3/25 to-chart-2/35",
  },
  {
    mode: "i2va",
    code: "I2VA",
    label: MODE_LABELS.i2va,
    hint: MODE_HINTS.i2va,
    icon: ImageIcon,
    image: i2vaImg,
    gradient: "from-chart-2/50 via-chart-2/25 to-chart-5/35",
  },
  {
    mode: "fl2va",
    code: "FL2VA",
    label: MODE_LABELS.fl2va,
    hint: MODE_HINTS.fl2va,
    icon: ArrowLeftRight,
    image: fl2vaImg,
    gradient: "from-chart-2/50 via-chart-2/25 to-chart-1/40",
  },
  {
    mode: "l2va",
    code: "L2VA",
    label: MODE_LABELS.l2va,
    hint: MODE_HINTS.l2va,
    icon: ArrowRightToLine,
    image: l2vaImg,
    gradient: "from-chart-4/45 via-chart-4/20 to-chart-3/35",
  },
];
