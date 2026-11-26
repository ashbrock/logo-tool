/**
 * Overlay colours as literal values, since exported files can't read CSS variables. Every value is a
 * DESIGN.md §2 token, mapped as in DESIGN.md §8; tests/export.svg.test.ts checks them against
 * src/ui/tokens.css so the two can't drift.
 */
export type OverlayStyle = 'dark' | 'light';

export interface OverlayColours {
  readonly bg: string;
  readonly gridMinor: string;
  readonly gridMajor: string;
  readonly lattice: string;
  readonly radius: string;
  readonly cut: string;
  readonly axis: string;
  /** Mark colour on this overlay; null means the export colour. */
  readonly mark: string | null;
}

/** Token names behind each value, for the drift test. */
export const OVERLAY_TOKENS: Record<OverlayStyle, Record<keyof OverlayColours, string | null>> = {
  dark: { bg: '--canvas-bg', gridMinor: '--canvas-grid-minor', gridMajor: '--canvas-grid-major', lattice: '--canvas-lattice', radius: '--canvas-radius', cut: '--canvas-cut', axis: '--canvas-axis', mark: '--canvas-mark' },
  light: { bg: '--paper-bg', gridMinor: '--paper-grid-minor', gridMajor: '--paper-grid-major', lattice: '--paper-lattice', radius: '--paper-radius', cut: '--paper-radius', axis: '--paper-lattice', mark: null },
};

export const OVERLAY_PALETTE: Record<OverlayStyle, OverlayColours> = {
  dark: { bg: '#0c1012', gridMinor: '#162329', gridMajor: '#22404c', lattice: '#4f7d94', radius: '#6aa8c6', cut: '#7fc4e8', axis: '#3d6a7e', mark: '#e8e3d3' },
  light: { bg: '#ffffff', gridMinor: '#e6eff4', gridMajor: '#c4dbe7', lattice: '#7fa9bf', radius: '#3f87ad', cut: '#3f87ad', axis: '#7fa9bf', mark: null },
};

/** `--paper-bg`, for a white PNG background. */
export const PAPER_BG = '#ffffff';
