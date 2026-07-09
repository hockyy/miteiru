import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export interface SmoothCollapseProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'style'> {
  expanded: boolean;
  onChangeEnd?: (() => void) | null;
  collapsedHeight?: string;
  heightTransition?: string;
  allowOverflowWhenOpen?: boolean;
  eagerRender?: boolean;
  children: React.ReactNode;
}

function getTransitionTimeMs(heightTransition: string): number {
  const match = /(\d+(?:\.\d+)?|\.\d+)(m?s)\b/i.exec(heightTransition);
  if (!match) {
    throw new Error('Could not parse time from transition value');
  }
  return Number(match[1]) * (match[2].length === 1 ? 1000 : 1);
}

function visibleWhenClosed(
  collapsedHeight: string,
  eagerRender?: boolean,
): boolean {
  return Boolean(eagerRender) || parseFloat(collapsedHeight) !== 0;
}

export default function SmoothCollapse({
  expanded,
  onChangeEnd,
  collapsedHeight = '0',
  heightTransition = '.25s ease',
  allowOverflowWhenOpen = false,
  eagerRender = false,
  children,
  className,
  ...rest
}: SmoothCollapseProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const removeTransitionEndListener = useRef<() => void>(() => {});
  const prevExpandedRef = useRef(expanded);

  const [renderInner, setRenderInner] = useState(
    () => expanded || visibleWhenClosed(collapsedHeight, eagerRender),
  );
  const [closing, setClosing] = useState(false);
  const [fullyClosed, setFullyClosed] = useState(!expanded);
  const [height, setHeight] = useState(expanded ? 'auto' : collapsedHeight);

  const onNextTransitionEnd = useCallback(
    (el: HTMLElement, callback: () => void) => {
      removeTransitionEndListener.current();

      const listener = () => {
        removeTransitionEndListener.current();
        callback();
      };

      let timeout: ReturnType<typeof setTimeout>;

      removeTransitionEndListener.current = () => {
        removeTransitionEndListener.current = () => {};
        clearTimeout(timeout);
        el.removeEventListener('transitionend', listener);
      };

      el.addEventListener('transitionend', listener);
      const ms = getTransitionTimeMs(heightTransition) * 1.1 + 500;
      timeout = setTimeout(listener, ms);
    },
    [heightTransition],
  );

  useEffect(() => {
    return () => {
      removeTransitionEndListener.current();
    };
  }, []);

  useLayoutEffect(() => {
    const prevExpanded = prevExpandedRef.current;
    prevExpandedRef.current = expanded;

    if (!prevExpanded && expanded) {
      removeTransitionEndListener.current();

      const mainEl = mainRef.current;
      const innerEl = innerRef.current;
      if (!mainEl || !innerEl) {
        return;
      }

      const targetHeight = `${innerEl.clientHeight}px`;
      setHeight(targetHeight);

      onNextTransitionEnd(mainEl, () => {
        setHeight('auto');
        onChangeEnd?.();
      });
      return;
    }

    if (prevExpanded && !expanded) {
      removeTransitionEndListener.current();

      const innerEl = innerRef.current;
      if (!innerEl) {
        return;
      }

      const targetHeight = `${innerEl.clientHeight}px`;
      setHeight(targetHeight);

      const mainEl = mainRef.current;
      if (!mainEl) {
        return;
      }

      mainEl.clientHeight;
      setClosing(true);
      setHeight(collapsedHeight);

      onNextTransitionEnd(mainEl, () => {
        setClosing(false);
        setFullyClosed(true);
        onChangeEnd?.();
      });
    }
  }, [collapsedHeight, expanded, onChangeEnd, onNextTransitionEnd]);

  useLayoutEffect(() => {
    if (expanded && (closing || fullyClosed)) {
      setClosing(false);
      setFullyClosed(false);
      setRenderInner(true);
      return;
    }

    if (
      !expanded &&
      (closing || fullyClosed) &&
      height !== collapsedHeight
    ) {
      setHeight(collapsedHeight);
      setRenderInner(
        (current) =>
          current || visibleWhenClosed(collapsedHeight, eagerRender),
      );
    }
  }, [
    closing,
    collapsedHeight,
    eagerRender,
    expanded,
    fullyClosed,
    height,
  ]);

  const showWhenClosed = visibleWhenClosed(collapsedHeight, eagerRender);
  const overflowVisible =
    allowOverflowWhenOpen && height === 'auto' ? 'visible' : 'hidden';

  return (
    <div
      {...rest}
      ref={mainRef}
      className={className}
      style={{
        height,
        overflow: overflowVisible,
        display: fullyClosed && !showWhenClosed ? 'none' : undefined,
        transition: `height ${heightTransition}`,
      }}
    >
      {renderInner ? (
        <div ref={innerRef} style={{ overflow: overflowVisible }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
