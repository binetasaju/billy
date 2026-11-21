// ---------------------------------------------------------------------------
// components/ui/QrCode.tsx — a QR code drawn with plain Views
//
// No native dependency (no react-native-svg), so it works without a rebuild.
// Each row is drawn as runs of dark modules, which keeps the view count low
// (a UPI link is ~29×29 modules → a few hundred Views).
// ---------------------------------------------------------------------------
import { memo, useMemo } from "react";
import { View } from "react-native";
import { qrRuns } from "@/utils/qrMatrix";

export const QrCode = memo(function QrCode({
  value,
  size = 220,
  color = "#000000",
  background = "#FFFFFF",
}: {
  value: string;
  /** Width and height in points, quiet zone included. */
  size?: number;
  color?: string;
  background?: string;
}) {
  const { count, rows } = useMemo(() => qrRuns(value), [value]);
  // 4-module quiet zone on every side, as scanners expect.
  const cell = size / (count + 8);
  const pad = cell * 4;

  return (
    <View
      style={{ width: size, height: size, backgroundColor: background, padding: pad }}
      accessibilityRole="image"
      accessibilityLabel="QR code"
    >
      {rows.map((runs, y) => (
        <View key={y} style={{ height: cell, flexDirection: "row" }}>
          {runs.map(([x, len]) => (
            <View
              key={x}
              style={{ position: "absolute", left: x * cell, width: len * cell + 0.5, height: cell + 0.5, backgroundColor: color }}
            />
          ))}
        </View>
      ))}
    </View>
  );
});
