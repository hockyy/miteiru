import {createElement, Fragment, ReactNode} from 'react';
import parse, {DOMNode, domToReact, Element, HTMLReactParserOptions} from 'html-react-parser';

// Formatting that subtitle files and lyrics use. Anything else keeps only its text.
const ALLOWED_TAGS = new Set(['b', 'i', 'u', 's', 'em', 'strong', 'small', 'sub', 'sup', 'br', 'span', 'font', 'ruby', 'rb', 'rt', 'rp']);
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {font: ['color', 'face', 'size']};
// From a style attribute only a plain colour survives (no url(), expressions or layout).
const STYLE_COLOR = /(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))\s*(?:;|$)/i;

const styleColor = (style: string | undefined) => {
  const color = style?.match(STYLE_COLOR)?.[1];
  return color ? {style: {color}} : {};
};
// Elements whose content is code or a separate document, so not even their text is shown.
const DROPPED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math']);

const options: HTMLReactParserOptions = {
  replace(node) {
    if (!(node instanceof Element)) return undefined;
    if (DROPPED_TAGS.has(node.name)) return createElement(Fragment);

    const children = node.children.length ? domToReact(node.children as DOMNode[], options) : undefined;
    if (!ALLOWED_TAGS.has(node.name)) return createElement(Fragment, null, children);

    const allowedAttributes = ALLOWED_ATTRIBUTES[node.name] ?? [];
    const props = {
      ...Object.fromEntries(Object.entries(node.attribs).filter(([name]) => allowedAttributes.includes(name))),
      ...styleColor(node.attribs.style),
    };
    return createElement(node.name, props, children);
  }
};

/**
 * Renders subtitle or lyric text that may contain simple formatting (<i>, <font color>, <br>).
 * Subtitle files come from anywhere, so only formatting tags survive: an <iframe srcdoc> or
 * similar would otherwise run inside the app with access to the preload bridge.
 */
export const renderSubtitleHtml = (html: string): ReactNode => parse(html ?? '', options);
