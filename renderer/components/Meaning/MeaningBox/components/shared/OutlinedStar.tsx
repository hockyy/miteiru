import React from 'react';
import { FaStar } from 'react-icons/fa';

type OutlinedStarProps = {
  color: string;
  size: number;
  outlineColor?: string;
  outlineWidth?: number;
};

/** SVG star with a dilated outline so it stays readable on any background. */
export const OutlinedStar = ({
  color,
  size,
  outlineColor = 'black',
  outlineWidth = 1,
}: OutlinedStarProps) => {
  const id = `star-outline-${color.replace('#', '')}`;

  return (
    <svg width={size} height={size}>
      <defs>
        <filter id={id}>
          <feMorphology
            in="SourceAlpha"
            result="expanded"
            operator="dilate"
            radius={outlineWidth}
          />
          <feFlood floodColor={outlineColor} />
          <feComposite in2="expanded" operator="in" />
          <feComposite in="SourceGraphic" />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>
        <FaStar color={color} size={size} />
      </g>
    </svg>
  );
};
