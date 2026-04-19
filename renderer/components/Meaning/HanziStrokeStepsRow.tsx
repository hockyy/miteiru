import React, {useEffect, useMemo, useState} from "react";

type HanziStrokeStepsRowProps = {
  svgMarkup?: string;
  character?: string;
};

const GUIDE_LINE_OPACITY = 1;
const STROKE_COLORS = [
  "#b91c1c",
  "#be185d",
  "#c2410c",
  "#7e22ce",
  "#a16207",
  "#4338ca",
  "#15803d",
  "#1d4ed8",
  "#0f766e",
];
const STROKE_OUTLINE_COLOR = "#1f2937";
const STROKE_OUTLINE_WIDTH = 0.2;

function buildEightDirectionDottedGuideDataUrl(opacity: number): string {
  const guideSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <g stroke="rgba(239,68,68,${opacity})" stroke-width="1" stroke-linecap="round" stroke-dasharray="0.8 4">
        <line x1="50" y1="50" x2="50" y2="0" />
        <line x1="50" y1="50" x2="100" y2="0" />
        <line x1="50" y1="50" x2="100" y2="50" />
        <line x1="50" y1="50" x2="100" y2="100" />
        <line x1="50" y1="50" x2="50" y2="100" />
        <line x1="50" y1="50" x2="0" y2="100" />
        <line x1="50" y1="50" x2="0" y2="50" />
        <line x1="50" y1="50" x2="0" y2="0" />
      </g>
    </svg>
  `.trim();

  return `url("data:image/svg+xml,${encodeURIComponent(guideSvg)}")`;
}

function isMmahStrokeFillPath(path: SVGPathElement): boolean {
  if (path.closest("clipPath")) return false;
  if (path.getAttribute("clip-path")) return false;
  const id = path.getAttribute("id") || "";
  if (id.startsWith("make-me-a-hanzi-animation")) return false;
  const fill = path.getAttribute("fill");
  return Boolean(fill && fill !== "none");
}

function stripMmahAuxiliaryLayers(svg: SVGSVGElement): void {
  svg.querySelectorAll("style").forEach((styleElement) => styleElement.remove());
  svg.querySelectorAll("clipPath").forEach((clipPathElement) => clipPathElement.remove());
  svg.querySelectorAll("path").forEach((path) => {
    if (path.getAttribute("clip-path")) path.remove();
    const id = path.getAttribute("id") || "";
    if (id.startsWith("make-me-a-hanzi-animation")) path.remove();
  });

  const firstGroup = svg.firstElementChild;
  if (
    firstGroup?.tagName === "g" &&
    firstGroup.querySelector("line") &&
    !firstGroup.querySelector("path")
  ) {
    firstGroup.remove();
  }
}

function getStrokeColor(index: number): string {
  return STROKE_COLORS[index % STROKE_COLORS.length];
}

function finalizeStepSvg(svg: SVGSVGElement): void {
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}

function buildStepSvgs(svgMarkup: string): string[] {
  if (!svgMarkup.trim()) return [];
  if (typeof window === "undefined" || !window.DOMParser || !window.XMLSerializer) {
    return [];
  }

  try {
    const doc = new window.DOMParser().parseFromString(svgMarkup, "image/svg+xml");
    if (doc.querySelector("parsererror")) return [];

    const sourceSvg = doc.querySelector("svg");
    if (!sourceSvg) return [];

    const baseFills = Array.from(sourceSvg.querySelectorAll("path")).filter(isMmahStrokeFillPath);
    const strokeCount = baseFills.length;
    const serializer = new window.XMLSerializer();

    if (strokeCount === 0) {
      const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
      stripMmahAuxiliaryLayers(clone);
      finalizeStepSvg(clone);
      return [serializer.serializeToString(clone)];
    }

    const steps: string[] = [];
    for (let visibleCount = 1; visibleCount <= strokeCount; visibleCount += 1) {
      const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
      stripMmahAuxiliaryLayers(clone);

      const fillPaths = Array.from(clone.querySelectorAll("path")).filter(isMmahStrokeFillPath);
      fillPaths.forEach((path, index) => {
        if (index >= visibleCount) {
          path.remove();
          return;
        }
        path.setAttribute("fill", getStrokeColor(index));
        path.setAttribute("stroke", STROKE_OUTLINE_COLOR);
        path.setAttribute("stroke-width", String(STROKE_OUTLINE_WIDTH));
        path.setAttribute("stroke-linejoin", "round");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("vector-effect", "non-scaling-stroke");
      });

      finalizeStepSvg(clone);
      steps.push(serializer.serializeToString(clone));
    }

    return steps;
  } catch {
    return [];
  }
}

const HanziStrokeStepsRow = ({
  svgMarkup: svgMarkupProp = "",
  character = "",
}: HanziStrokeStepsRowProps) => {
  const [fetchedSvg, setFetchedSvg] = useState("");

  useEffect(() => {
    const hasInlineSvg = svgMarkupProp.includes("<svg");
    if (hasInlineSvg) {
      setFetchedSvg("");
      return;
    }

    const ch = character[0];
    if (!ch || typeof window === "undefined" || !window.ipc?.invoke) {
      setFetchedSvg("");
      return;
    }

    let cancelled = false;
    const filename = `${ch.charCodeAt(0)}.svg`;

    window.ipc.invoke("readHanziSVG", filename).then((value: string) => {
      if (!cancelled) {
        setFetchedSvg(typeof value === "string" ? value : "");
      }
    }).catch(() => {
      if (!cancelled) {
        setFetchedSvg("");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [character, svgMarkupProp]);

  const svgMarkup = svgMarkupProp.includes("<svg") ? svgMarkupProp : fetchedSvg;
  const stepSvgs = useMemo(() => buildStepSvgs(svgMarkup), [svgMarkup]);
  const dottedGuideBackgroundImage = useMemo(
    () => buildEightDirectionDottedGuideDataUrl(GUIDE_LINE_OPACITY),
    [],
  );

  if (!stepSvgs.length) return null;

  return (
    <div className="w-full max-w-full py-1">
      <div
        className="flex flex-row flex-wrap items-end justify-start gap-2 sm:gap-3"
        role="list"
        aria-label="Hanzi stroke order"
      >
        {stepSvgs.map((svgHtml, index) => (
          <div
            key={`${index}-${svgHtml.length}`}
            className="flex shrink-0 flex-col items-center gap-0.5"
            role="listitem"
          >
            <div
              className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm sm:h-[4.5rem] sm:w-[4.5rem]"
              style={{
                backgroundImage: dottedGuideBackgroundImage,
                backgroundRepeat: "no-repeat",
                backgroundSize: "100% 100%",
              }}
              aria-label={`Strokes 1-${index + 1}`}
            >
              <div
                className="relative z-[1] flex h-full w-full items-center justify-center p-0.5 [&>svg]:h-full [&>svg]:max-h-full [&>svg]:w-full [&>svg]:max-w-full"
                dangerouslySetInnerHTML={{__html: svgHtml}}
              />
            </div>
            <span className="text-[10px] leading-none text-gray-500 tabular-nums">{index + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HanziStrokeStepsRow;
