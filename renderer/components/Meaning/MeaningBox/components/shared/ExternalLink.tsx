import React from 'react';

type ExternalLinkProps = {
  urlBase: string;
  displayText: string;
  query: string;
  style?: React.CSSProperties;
  className?: string;
};

/** Opens an external dictionary URL via the desktop shell. */
export const ExternalLink = ({
  urlBase,
  displayText,
  query,
  style = {},
  className = '',
}: ExternalLinkProps) => {
  const url = `${urlBase}${query}`;

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    window.miteiru.openExternal(url);
  };

  return (
    <a
      href={url}
      style={style}
      className={['url-bubble', className].filter(Boolean).join(' ')}
      onClick={handleClick}
    >
      {displayText}
    </a>
  );
};
