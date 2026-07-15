import React from 'react';

type ExternalLinkProps = {
  urlBase: string;
  displayText: string;
  query: string;
  style?: React.CSSProperties;
  className?: string;
};

/** Opens an external dictionary URL via the Electron shell. */
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
    window.electronAPI.openExternal(url);
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
