import { useMemo, useState } from "react";
import { Group, Line, Rect, Text as KonvaText } from "react-konva";
import {
  buildDielinePresentation,
  DEFAULT_DIELINE_GUIDE_VISIBILITY,
  resolveDielineGuideStyle,
  screenSpaceValue,
  visibleDielinePresentationItems,
  type DielineGuideClass,
  type DielineGuideVisibility,
  type DielinePresentationItem,
} from "@/lib/configurator/dieline-presentation";
import type { SurfaceDieline } from "@/types/configurator";

type DielineOverlayProps = {
  dieline?: SurfaceDieline;
  scale: number;
  visible: boolean;
  visibility?: Readonly<Partial<DielineGuideVisibility>>;
  highlightedClass?: DielineGuideClass | null;
  onGuideHover?: (guideClass: DielineGuideClass | null) => void;
};

function itemAnchor(item: DielinePresentationItem): { x: number; y: number } {
  if (item.shape === "region") {
    return { x: item.region.x, y: item.region.y };
  }
  return { x: item.path.points[0] ?? 0, y: item.path.points[1] ?? 0 };
}

export function DielineOverlay({
  dieline,
  scale,
  visible,
  visibility,
  highlightedClass = null,
  onGuideHover,
}: DielineOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const items = useMemo(() => buildDielinePresentation(dieline), [dieline]);
  const visibleItems = useMemo(
    () => visibleDielinePresentationItems(items, visible, visibility),
    [items, visibility, visible],
  );
  if (!visibleItems.length) return null;

  const isVisible = (guideClass: DielineGuideClass) =>
    visibility?.[guideClass] ?? DEFAULT_DIELINE_GUIDE_VISIBILITY[guideClass];
  const startHover = (item: DielinePresentationItem) => {
    setHoveredId(item.id);
    onGuideHover?.(item.guideClass);
  };
  const stopHover = () => {
    setHoveredId(null);
    onGuideHover?.(null);
  };

  return (
    <Group>
      {visibleItems.map((item) => {
        if (!isVisible(item.guideClass)) return null;
        const highlighted = highlightedClass === item.guideClass || hoveredId === item.id;
        const style = resolveDielineGuideStyle(item.guideClass, scale, highlighted);
        const interaction = {
          listening: true,
          onMouseEnter: () => startHover(item),
          onMouseLeave: stopHover,
          onTap: () => startHover(item),
        };

        if (item.shape === "path") {
          return (
            <Line
              key={item.id}
              points={item.path.points}
              closed={item.path.closed}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              dash={style.dash}
              opacity={style.opacity}
              hitStrokeWidth={screenSpaceValue(12, scale)}
              lineCap={item.guideClass === "cut" ? "butt" : "round"}
              lineJoin={item.guideClass === "cut" ? "miter" : "round"}
              perfectDrawEnabled={false}
              {...interaction}
            />
          );
        }

        const region = item.region;
        const centerX = region.x + region.width / 2;
        const centerY = region.y + region.height / 2;
        const fontSize = screenSpaceValue(item.guideClass === "technical" ? 9 : 10, scale);
        return (
          <Group
            key={item.id}
            x={centerX}
            y={centerY}
            rotation={region.artworkOrientationDeg ?? 0}
            {...interaction}
          >
            <Rect
              x={-region.width / 2}
              y={-region.height / 2}
              width={region.width}
              height={region.height}
              fill={style.fill}
              opacity={style.fillOpacity}
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              dash={style.dash}
              hitStrokeWidth={screenSpaceValue(12, scale)}
            />
            <KonvaText
              x={-region.width / 2}
              y={-fontSize / 2}
              width={region.width}
              text={region.label}
              align="center"
              fontFamily="Arial, sans-serif"
              fontStyle="bold"
              fontSize={fontSize}
              fill={style.stroke}
              opacity={highlighted ? 0.95 : 0.68}
              listening={false}
            />
          </Group>
        );
      })}

      {visibleItems.map((item) => {
        if (hoveredId !== item.id || !isVisible(item.guideClass)) return null;
        const anchor = itemAnchor(item);
        const fontSize = screenSpaceValue(11, scale);
        const padding = screenSpaceValue(7, scale);
        const width = Math.max(
          screenSpaceValue(96, scale),
          item.label.length * fontSize * 0.58 + padding * 2,
        );
        const height = fontSize + padding * 1.6;
        return (
          <Group
            key={`tooltip-${item.id}`}
            x={anchor.x + screenSpaceValue(8, scale)}
            y={anchor.y + screenSpaceValue(8, scale)}
            listening={false}
          >
            <Rect
              width={width}
              height={height}
              cornerRadius={screenSpaceValue(5, scale)}
              fill="#111827"
              opacity={0.92}
              shadowColor="#000000"
              shadowBlur={screenSpaceValue(8, scale)}
              shadowOpacity={0.18}
            />
            <KonvaText
              x={padding}
              y={padding * 0.7}
              width={width - padding * 2}
              text={item.label}
              fontFamily="Arial, sans-serif"
              fontSize={fontSize}
              fill="#ffffff"
            />
          </Group>
        );
      })}
    </Group>
  );
}
